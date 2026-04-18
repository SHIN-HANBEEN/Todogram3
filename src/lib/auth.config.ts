import type { NextAuthConfig } from 'next-auth'
import Google from 'next-auth/providers/google'
// JWT 모듈 augmentation 을 위해 side-effect import 필요 — 값은 안 쓰지만 TS 에 모듈 존재를 알림.
import 'next-auth/jwt'

import { env } from '@/env'

// ============================================================================
// NextAuth v5 (Auth.js) Edge-safe 기본 설정 — Phase 1 A3
// ============================================================================
// - 이 파일은 "Edge runtime 에서도 import 가능한" 최소 설정만 담는다.
//   * providers / secret / trustHost / session 전략 / pages / 타입 확장
// - Node 전용 API(Drizzle + postgres, Node crypto) 를 사용하는 jwt 콜백은
//   `auth.ts` 가 이 config 를 spread 로 확장하면서 추가한다.
// - 분리 이유: `src/middleware.ts` 는 Vercel Edge Runtime 에서 실행되므로
//   TCP 소켓 기반 DB 드라이버(`postgres` 패키지)가 로드되는 순간 번들이 깨진다.
//   공식 가이드(authjs.dev "edge-compatibility") 의 Split Config 패턴을 따른다.
// ============================================================================

// JWT 에 담길 커스텀 필드를 v5 의 선언 병합으로 타입까지 넓혀둔다.
// 원래 auth.ts 에 있던 선언을 여기로 옮겨서 middleware 경로도 동일 타입을 인식하게 한다.
declare module 'next-auth' {
  /** 세션 에러 채널 — Phase 3 G4 에서 'RefreshTokenError' 전이 시 UI 가 재로그인 유도. */
  interface Session {
    error?: 'RefreshTokenError'
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    /** Google Calendar API 호출용 단기 access token (기본 1시간). */
    access_token?: string
    /** access_token 만료 Unix(sec). Date.now()/1000 과 비교. */
    expires_at?: number
    /** 장기 refresh token — A2 에서 AES-256-GCM 으로 DB 에 암호화 저장. */
    refresh_token?: string
    /** 에러 상태. 401/invalid_grant 등으로 refresh 실패 시 설정. */
    error?: 'RefreshTokenError'
  }
}

/**
 * Edge-safe 기본 Auth.js 설정.
 *
 * `satisfies NextAuthConfig` 로 타입만 강제하고, `authConfig.callbacks` 에는
 * DB 접근이 없는 session 콜백만 둔다. jwt 콜백(DB upsert 포함)은 `auth.ts` 가
 * 이 객체를 spread 로 합치면서 덮어쓴다.
 */
export const authConfig = {
  // Drizzle Adapter 는 v1 범위에서 도입하지 않는다. A4(timezone) 도 signIn 콜백이 아니라
  // auth.ts 의 jwt 콜백에 모아둘 예정이라 JWT 세션 전략으로 간다.
  session: { strategy: 'jwt' },

  // Auth.js v5 는 AUTH_SECRET 을 우선 읽지만, 본 프로젝트는 F4 env.ts 로 NEXTAUTH_SECRET 을
  // 검증하므로 명시적으로 전달해 "검증된 env 만 사용" 규칙을 유지한다.
  secret: env.NEXTAUTH_SECRET,

  // 서버리스/프리뷰 배포에서도 호스트 검증을 통과시키는 보편 스위치. Vercel 자동 감지 외에도
  // Supabase/로컬 등 다양한 환경을 대비해 true 로 둔다(토큰 서명은 secret 으로 이미 보호).
  trustHost: true,

  providers: [
    Google({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          // Google 은 refresh_token 을 "offline + consent" 조합일 때만 발급한다.
          access_type: 'offline',
          // 이미 동의한 사용자에게도 refresh_token 재발급을 보장하기 위해 강제 consent.
          prompt: 'consent',
          response_type: 'code',
          // openid / email / profile = 기본 프로필 식별자.
          // calendar.events.readonly = v1 Google Cal 읽기 전용 (쓰기 토글은 v1.5로 이월).
          scope:
            'openid email profile https://www.googleapis.com/auth/calendar.events.readonly',
        },
      },
    }),
  ],

  callbacks: {
    /**
     * 세션 객체를 클라이언트에 내려주기 전 가공한다.
     * 보안상 access/refresh token 은 절대 세션에 포함하지 않는다(서버 측 JWT 에만 존재).
     * 다만 에러 플래그는 UI 가 재로그인 유도에 사용하므로 세션에도 노출한다.
     *
     * 이 콜백은 순수 함수(DB/crypto 미사용) 이므로 Edge Runtime 에서도 안전하게 실행된다.
     */
    async session({ session, token }) {
      session.error = token.error
      return session
    },
  },

  pages: {
    // 자체 Quiet Lamp 로그인 화면을 유지한다 (A0 에서 이미 구현).
    // 에러 발생 시에도 동일 화면에서 ?error= 쿼리로 메시지를 표시.
    signIn: '/login',
    error: '/login',
  },
} satisfies NextAuthConfig
