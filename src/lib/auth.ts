import { eq } from 'drizzle-orm'
import NextAuth from 'next-auth'
import { cookies } from 'next/headers'

import { db } from '@/db'
import { users } from '@/db/schema'
import { authConfig } from '@/lib/auth.config'
import { encrypt } from '@/lib/crypto'
import { isValidTimeZone, TZ_COOKIE_NAME } from '@/lib/timezone'

// ============================================================================
// NextAuth v5 (Auth.js) 풀 설정 — Phase 1 A1/A2
// ============================================================================
// - Edge-safe 기본 설정은 `auth.config.ts` 에 있고, 여기서는 Node 전용(DB/crypto) 로직을
//   포함한 `jwt` 콜백만 덧붙여 전체 인스턴스를 만든다.
// - `src/middleware.ts` 는 절대 이 파일을 import 하지 않는다. middleware 는
//   `auth.config.ts` 를 직접 읽어 Edge Runtime 에서 동작한다.
// - Server Component / Route Handler / Server Action 에서 세션을 조회할 때는
//   이 파일이 export 하는 `auth()` 를 사용한다.
// ============================================================================

/**
 * Auth.js v5 설정 엔트리. `handlers` / `auth` / `signIn` / `signOut` 을 전부 export 한다.
 * - `handlers` → `app/api/auth/[...nextauth]/route.ts` 에서 GET/POST 로 재-export.
 * - `auth()` → Server Component / Route Handler / Server Action 에서 세션 확인.
 * - `signIn()` / `signOut()` → Client Component 에서 호출하거나 Server Action 으로 위임.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    /**
     * 로그인 직후(account 존재) + 이후 요청 시마다 호출된다.
     * - A1 이 Google 이 준 토큰을 JWT 로 복사하는 흐름을 깔고,
     * - A2 가 그중 refresh_token 을 AES-256-GCM 으로 암호화해 users 테이블에 upsert 한다.
     *   이 시점이 Google 이 refresh_token 을 내려주는 유일한 순간이므로 반드시 여기서 저장한다.
     * - G1 / G4 (Phase 3) 가 만료 / revoked 전이를 이 콜백에 추가로 얹는다.
     *
     * ⚠ 이 콜백은 DB(`postgres` 드라이버) + Node crypto 를 사용하므로 Node 런타임 전용.
     *    middleware 에서는 절대 실행되지 않도록 authConfig 에 두지 않고 여기에만 둔다.
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
        //
        // A4 - 클라이언트 timezone 을 "최초 1회" 저장.
        //  * 브라우저가 로그인 버튼 클릭 직전에 `td_tz` 쿠키(5분 TTL) 에 IANA TZ 를 심어둔다.
        //  * Google OAuth 왕복은 동일 출처 쿠키를 자동으로 따라오므로 이 콜백에서 바로 읽을 수 있다.
        //  * 검증 실패(누락/비정상) 시 값을 넘기지 않아 DB 의 NOT NULL DEFAULT 'Asia/Seoul' 에 맡긴다.
        //  * set 블록에는 timezone 을 포함하지 않아, 재로그인 시에는 기존 DB 값이 유지된다
        //    (요구사항 "최초 1회"). 유저가 TZ 를 바꾸고 싶다면 별도 Settings 화면을 통해 변경한다.
        if (account.refresh_token && token.email) {
          const encryptedRefreshToken = encrypt(account.refresh_token)
          const username =
            (profile?.name as string | undefined) ?? token.name ?? token.email

          // 쿠키에서 TZ 추출. next/headers 의 cookies() 는 route handler 컨텍스트에서 동작한다.
          // NextAuth v5 콜백은 `/api/auth/[...nextauth]` route handler 안에서 실행되므로 안전.
          // 읽기 후 삭제는 하지 않는다 — 어차피 max-age=300 으로 곧 만료되고, 삭제하려면
          // cookies() 의 mutable 경로(Server Action)가 아니면 불가능해 복잡성만 커진다.
          const cookieStore = await cookies()
          const rawTimezone = cookieStore.get(TZ_COOKIE_NAME)?.value
          const validatedTimezone = isValidTimeZone(rawTimezone)
            ? rawTimezone
            : undefined

          // Phase 2 - D1 — upsert 결과의 PK 를 JWT 에 보존해, 이후 Server Action 의
          // ownership 가드(`WHERE user_id = session.user.id`) 가 매 요청마다 DB 조회를 다시
          // 하지 않도록 한다. ON CONFLICT DO UPDATE 는 PostgreSQL 에서 충돌 시에도 RETURNING
          // 으로 갱신된 row 를 돌려주므로 신규/재로그인 모두 동일한 코드 경로로 id 확보.
          const [upserted] = await db
            .insert(users)
            .values({
              email: token.email,
              username,
              googleRefreshToken: encryptedRefreshToken,
              googleAuthStatus: 'active',
              // validatedTimezone 이 undefined 면 스키마의 DEFAULT 'Asia/Seoul' 이 적용된다.
              ...(validatedTimezone ? { timezone: validatedTimezone } : {}),
            })
            .onConflictDoUpdate({
              target: users.email,
              set: {
                username,
                googleRefreshToken: encryptedRefreshToken,
                googleAuthStatus: 'active',
                // timezone 은 의도적으로 set 에 포함하지 않는다 (최초 1회 정책).
              },
            })
            .returning({ id: users.id })

          if (upserted?.id) {
            token.userId = upserted.id
          }
        }
      }
      // Phase 2 - D1 안전망 — 코드 변경 이전에 발급된 세션은 token.userId 가 비어 있을 수
      // 있다. 그 경우 email 로 1회 조회해 채워둔다. 정상 경로(account 존재)는 위에서 이미 채웠으므로
      // 여기는 'stale JWT 한정 lazy backfill' 이며 매 요청 DB 조회를 발생시키지 않는다.
      if (!token.userId && typeof token.email === 'string' && token.email) {
        const existing = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, token.email))
          .limit(1)
        if (existing[0]?.id) {
          token.userId = existing[0].id
        }
      }
      // TODO(G1): token.expires_at 이 만료되면 refresh_token 으로 재발급.
      // TODO(G4): refresh 응답이 invalid_grant 면 users.google_auth_status='revoked' 전이
      //           + token.error='RefreshTokenError' 설정.
      return token
    },
  },
})
