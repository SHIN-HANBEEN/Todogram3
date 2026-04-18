// ============================================================================
// Timezone 수집 헬퍼 — Phase 1 A4
// ============================================================================
// - 로그인 시 클라이언트(브라우저)의 IANA timezone 식별자를 `users.timezone` 에 최초 1회
//   저장하기 위한 공용 유틸. Phase 5 rollover cron 이 사용자별 "오늘 00:00" 을 해소할 때
//   이 값을 기준으로 동작한다(설계 §8-4).
// - 경로: 브라우저 → (쿠키로 OAuth 리다이렉트 왕복 통과) → NextAuth JWT 콜백 → DB upsert.
//   * 브라우저: `Intl.DateTimeFormat().resolvedOptions().timeZone` 을 `TZ_COOKIE_NAME` 쿠키에
//     5분 TTL 로 저장한다(로그인 리다이렉트 사이클을 넉넉히 커버).
//   * 서버(JWT 콜백): `cookies().get(TZ_COOKIE_NAME)` 으로 읽고 `isValidTimeZone` 으로 검증.
//     검증 실패 시 무시하고 DB default 'Asia/Seoul' 에 맡긴다.
//   * upsert: insert 경로의 `values.timezone` 에만 포함, `set` 에는 포함하지 않아 최초 1회만 반영.
//     재로그인 시에는 기존 값이 보존된다(요구사항 "최초 1회").
// - 왜 쿠키를 택했나:
//   * next-auth/react `signIn` 의 `authorizationParams` 는 OAuth provider 쪽으로 흘러가는
//     값이라 Google 이 JWT 콜백에 그대로 돌려준다는 보장이 없다.
//   * 별도 POST 엔드포인트(`/api/me/timezone`) 는 로그인 후 추가 왕복이 필요하고 "최초 1회"
//     판정을 서버에서 다시 해야 해서 오버엔지니어링.
//   * 쿠키는 브라우저가 자동으로 동일 출처 콜백에 실어 보내주므로 최소 움직임으로 목표 달성.
// ============================================================================

/**
 * Google OAuth 왕복 동안 브라우저가 서버로 TZ 를 전달할 쿠키 이름.
 * 짧고 앱 네임스페이스를 가진 접두사 `td_`(todogram) 로 충돌을 피한다.
 */
export const TZ_COOKIE_NAME = 'td_tz'

/**
 * 쿠키 TTL. Google OAuth 왕복은 보통 수 초~수십 초 내 완료되므로 5분이면 충분하고,
 * 혹시 남아도 짧은 시간 안에 자동 소멸해 다른 세션에 새어나갈 여지가 적다.
 */
export const TZ_COOKIE_MAX_AGE_SECONDS = 300

/**
 * 주어진 문자열이 현재 런타임이 해석 가능한 IANA timezone 식별자인지 확인.
 *
 * 1차 방어: 문자셋 화이트리스트. 쿠키 헤더 인젝션·스크립트 등 명백한 악의 입력을 즉시 차단.
 *   - 유효 TZ 식별자는 영문/숫자/언더스코어/슬래시/하이픈/플러스/콜론 만 포함.
 *   - 길이 상한 64자 (실제 IANA 식별자 최대는 40자 내외지만 여유).
 *
 * 2차 방어: `new Intl.DateTimeFormat({ timeZone })` 생성자가 RangeError 를 던지는지로 판정.
 *   - 이 경로가 사실상 "이 런타임이 이 TZ 를 실제로 쓸 수 있는가" 의 정답이다.
 *   - `Intl.supportedValuesOf('timeZone')` 는 canonical 목록만 반환해 `UTC` / `Etc/UTC` 같은
 *     정식 alias 를 놓치므로 프라이머리로 쓰지 않는다.
 *   - ICU 탑재 런타임(Node 18+, 모던 브라우저) 이면 전부 동작.
 */
export function isValidTimeZone(candidate: unknown): candidate is string {
  if (typeof candidate !== 'string') return false
  const trimmed = candidate.trim()
  if (trimmed.length === 0 || trimmed.length > 64) return false
  // 영문/숫자/언더스코어/슬래시/하이픈/플러스/콜론 만 허용.
  if (!/^[A-Za-z0-9_/+:\-]+$/.test(trimmed)) return false

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: trimmed }).format(new Date())
    return true
  } catch {
    return false
  }
}
