import NextAuth from 'next-auth'
import { NextResponse } from 'next/server'

import { authConfig } from '@/lib/auth.config'

// ============================================================================
// 세션 미들웨어 + 보호 라우트 — Phase 1 A3
// ============================================================================
// - `/calendar`, `/list`, `/settings/*` 세 prefix 에 세션 없이 접근하면 `/login` 으로
//   리다이렉트한다. 로그인 성공 후 원래 가려던 경로로 복귀할 수 있도록 `callbackUrl` 쿼리에
//   원본 pathname+search 를 실어 보낸다.
// - NextAuth v5 의 Split Config 패턴(authjs.dev/guides/edge-compatibility) 을 따라,
//   Edge 에서 안전한 `authConfig` 만 import 한다. DB/crypto 를 건드리는 jwt 콜백이 포함된
//   `@/lib/auth` 는 절대 import 하지 않는다 — 그러면 Edge 번들에서 postgres 드라이버가
//   포함되어 런타임이 깨진다.
// - matcher 로 보호 경로만 한정해 필요하지 않은 요청에서는 미들웨어가 돌지 않도록 한다.
//   (API 라우트 / _next 정적 자산 / public 파일은 matcher 에서 제외되어 영향이 없다.)
// ============================================================================

// Edge Runtime 내에서 NextAuth 를 새로 인스턴스화. jwt 콜백이 없는 authConfig 만 쓰므로
// Node API 의존 없이 JWT 서명 검증만 수행된다.
const { auth } = NextAuth(authConfig)

/**
 * 미들웨어 본체. `auth(req)` 형태로 호출해 세션 존재 여부를 `req.auth` 로 노출한다.
 *  - 세션이 있으면 그대로 다음 단계로 통과.
 *  - 없으면 `/login?callbackUrl=...` 로 307 리다이렉트. 307 은 HTTP 메서드를 보존하므로
 *    추후 POST 로 보호 엔드포인트가 추가되어도 재요청 시 메서드가 유실되지 않는다.
 */
export default auth(req => {
  if (req.auth) return NextResponse.next()

  const { nextUrl } = req
  const loginUrl = new URL('/login', nextUrl.origin)
  // 로그인 후 복귀할 경로를 보존. `/login` 자체로 리다이렉트 루프가 생기지 않도록
  // matcher 가 로그인 페이지를 제외하고 있어 이 분기가 `/login` 에서 실행될 일은 없다.
  loginUrl.searchParams.set(
    'callbackUrl',
    nextUrl.pathname + (nextUrl.search || '')
  )
  return NextResponse.redirect(loginUrl)
})

/**
 * matcher 는 Next.js 미들웨어가 실행될 경로를 정적으로 지정한다.
 *  - `:path*` 는 "0개 이상 세그먼트" 이므로 `/calendar` 자체도 포함된다.
 *  - 여기에 없는 경로(예: `/`, `/login`, `/api/auth/*`) 는 미들웨어를 아예 호출하지 않아
 *    성능 오버헤드와 Edge Runtime 번들 부담을 최소화한다.
 */
export const config = {
  matcher: ['/calendar/:path*', '/list/:path*', '/settings/:path*'],
}
