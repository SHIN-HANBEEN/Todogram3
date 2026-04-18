import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
// JWT 모듈 augmentation 을 위해 side-effect import 필요 — 값은 안 쓰지만 TS 에 모듈 존재를 알림.
import 'next-auth/jwt'

import { db } from '@/db'
import { users } from '@/db/schema'
import { env } from '@/env'
import { encrypt } from '@/lib/crypto'

// ============================================================================
// NextAuth v5 (Auth.js) 기본 설정 — Phase 1 A1
// ============================================================================
// - v1 Todogram 은 "Google 캘린더 읽기" 를 핵심 가치로 삼는다. 그래서 OAuth scope 에
//   `calendar.events.readonly` 를 함께 요청해 로그인 == 캘린더 권한 동의 흐름으로 묶는다.
// - Refresh token 을 반드시 받아야 cron 이나 백그라운드에서 access token 재발급이 가능하다.
//   Google 은 `access_type=offline` + `prompt=consent` 조합일 때만 refresh_token 을 내려주므로
//   authorization.params 로 두 값을 강제한다.
// - DB 암호화 저장(A2) / 미들웨어 보호(A3) / timezone 수집(A4) 은 각각의 후속 태스크가
//   별도로 담당한다. A1 은 Provider 연결 + JWT 에 토큰 전달까지만 책임진다.
// - Session 전략: JWT (v1 은 별도 Adapter 없이 Drizzle 수동 upsert. 설계 §8-2 참고).
// ============================================================================

// JWT 에 담길 커스텀 필드를 v5 의 선언 병합으로 타입까지 넓혀둔다.
// A2 에서 refresh_token 을 DB 에 암호화 저장하기 위해 jwt 콜백이 이 값들을 읽어 처리한다.
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
    /** 장기 refresh token — A2 에서 AES-256-GCM 으로 DB 에 암호화 저장 예정. */
    refresh_token?: string
    /** 에러 상태. 401/invalid_grant 등으로 refresh 실패 시 설정. */
    error?: 'RefreshTokenError'
  }
}

/**
 * Auth.js v5 설정 엔트리. `handlers` / `auth` / `signIn` / `signOut` 을 전부 export 한다.
 * - `handlers` → `app/api/auth/[...nextauth]/route.ts` 에서 GET/POST 로 재-export.
 * - `auth()` → Server Component / Route Handler / Server Action 에서 세션 확인.
 * - `signIn()` / `signOut()` → Client Component 에서 호출하거나 Server Action 으로 위임.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  // Drizzle Adapter 는 v1 범위에서 도입하지 않는다. users 레코드 upsert 는
  // A4(timezone) 에서 signIn 콜백 단일 지점에 모아둘 예정이라 JWT 세션 전략으로 간다.
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
          // (한 번 발급된 refresh_token 을 잃으면 재로그인 밖에 길이 없기 때문에
          //  v1 dogfooding 단계에서는 안전 쪽으로 기운다.)
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
     * 로그인 직후(account 존재) + 이후 요청 시마다 호출된다.
     * - A1 이 Google 이 준 토큰을 JWT 로 복사하는 흐름을 깔고,
     * - A2 가 그중 refresh_token 을 AES-256-GCM 으로 암호화해 users 테이블에 upsert 한다.
     *   이 시점이 Google 이 refresh_token 을 내려주는 유일한 순간이므로 반드시 여기서 저장한다.
     * - G1 / G4 (Phase 3) 가 만료 / revoked 전이를 이 콜백에 추가로 얹는다.
     */
    async jwt({ token, account, profile }) {
      if (account) {
        // 최초 로그인 직후 - Google 응답을 JWT 로 복사.
        // 이 시점이 refresh_token 을 받는 유일한 순간이므로 반드시 보존한다.
        if (account.access_token) token.access_token = account.access_token
        if (typeof account.expires_at === 'number')
          token.expires_at = account.expires_at
        if (account.refresh_token) token.refresh_token = account.refresh_token

        // A2 - refresh_token 을 DB (`users.google_refresh_token`) 에 암호화 저장.
        //  * 식별자: token.email (OAuth openid+email scope 로 항상 포함).
        //  * username: Google profile.name → token.name → email 순서로 fallback.
        //    users.username 이 NOT NULL 이라 비어 있으면 insert 가 실패하므로 반드시 값 보장.
        //  * ON CONFLICT (email) DO UPDATE — 재로그인 시에도 최신 refresh_token 으로 교체하고
        //    googleAuthStatus 는 'active' 로 재설정 (이전에 revoked 였다가 재동의한 경우 복구).
        //  * A4 가 나중에 timezone 수집을 추가할 예정이지만, 여기서는 NOT NULL DEFAULT 'Asia/Seoul'
        //    에 맡긴다. 기존 유저는 update 경로라 timezone 이 덮어써지지 않는다.
        if (account.refresh_token && token.email) {
          const encryptedRefreshToken = encrypt(account.refresh_token)
          const username =
            (profile?.name as string | undefined) ?? token.name ?? token.email
          await db
            .insert(users)
            .values({
              email: token.email,
              username,
              googleRefreshToken: encryptedRefreshToken,
              googleAuthStatus: 'active',
            })
            .onConflictDoUpdate({
              target: users.email,
              set: {
                username,
                googleRefreshToken: encryptedRefreshToken,
                googleAuthStatus: 'active',
              },
            })
        }
      }
      // TODO(G1): token.expires_at 이 만료되면 refresh_token 으로 재발급.
      // TODO(G4): refresh 응답이 invalid_grant 면 users.google_auth_status='revoked' 전이
      //           + token.error='RefreshTokenError' 설정.
      return token
    },

    /**
     * 세션 객체를 클라이언트에 내려주기 전 가공한다.
     * 보안상 access/refresh token 은 절대 세션에 포함하지 않는다(서버 측 JWT 에만 존재).
     * 다만 에러 플래그는 UI 가 재로그인 유도에 사용하므로 세션에도 노출한다.
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
})
