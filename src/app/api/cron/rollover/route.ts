import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'

import { env } from '@/env'

// ============================================================================
// Auto-rollover cron endpoint — Phase 5 R1
// ============================================================================
// - Vercel Cron(`vercel.json` 의 `/api/cron/rollover` 일정) 이 매일 UTC 00:05 에 GET 으로
//   호출한다. 외부 트래픽이 직접 여기를 때려도 안 되기 때문에
//   `Authorization: Bearer $CRON_SECRET` 로 프리엠프티브 인증 게이트를 건다.
// - 본 라우트는 "R1 = 인증 + 진입점" 까지만 담당한다. 실제 이월 로직(사용자 timezone 분해,
//   rollover_logs 중복 방지, FOR UPDATE SKIP LOCKED 등) 은 후속 태스크 R2/R3 에서
//   `src/lib/rollover.ts` 를 붙이면서 본 핸들러가 그 함수를 호출하도록 배선된다.
// - 외부 이벤트(Google Calendar) 는 절대 건드리지 않는다. Todogram 자체 태스크만 대상.
// - Runtime: Postgres 드라이버 + timingSafeEqual(Node `crypto`) 를 사용하므로 Edge 가 아닌
//   Node.js 런타임을 강제한다. 동시에 CDN/페이지 캐시가 타면 cron 결과가 고착되므로
//   `force-dynamic` 으로 매 호출 실제 실행을 보장한다.
// ============================================================================

// 이 라우트는 Edge 가 아닌 Node.js 에서만 안전하다 — AES/Postgres/timing-safe crypto 의존.
export const runtime = 'nodejs'
// Vercel 이 라우트 핸들러를 정적 최적화하지 못하도록 강제 동적 처리. cron 은 매 호출이
// 부수 효과(DB 업데이트) 를 수반하므로 어떤 캐싱도 개입해선 안 된다.
export const dynamic = 'force-dynamic'

// Bearer 접두. 헤더 파싱 시 대소문자 차이(RFC 7235 는 case-insensitive)까지 관용.
const BEARER_PREFIX = 'Bearer '

/**
 * 요청 토큰과 서버 비밀을 **상수 시간** 으로 비교한다.
 *
 * - 단순 `===` 비교는 문자열 앞쪽이 일치할수록 비교가 조금씩 더 오래 걸려 이론적으로
 *   "타이밍 공격" 의 힌트가 된다. 공개 엔드포인트에서 32자 이상 랜덤 토큰을 검증하므로
 *   실질적 위협은 미미하지만, 동일 프로젝트의 `lib/crypto.ts` 가 이미 defense-in-depth
 *   정책을 취하고 있어 일관성을 위해 timing-safe 비교를 사용한다.
 * - `timingSafeEqual` 은 두 버퍼 길이가 다르면 예외를 던지므로, 먼저 길이를 체크해
 *   조용히 false 로 거부한다.
 */
function matchesCronSecret(candidate: string, secret: string): boolean {
  const candidateBuf = Buffer.from(candidate, 'utf8')
  const secretBuf = Buffer.from(secret, 'utf8')
  if (candidateBuf.length !== secretBuf.length) return false
  return timingSafeEqual(candidateBuf, secretBuf)
}

/**
 * Vercel Cron 이 발행하는 GET 요청을 받아 인증을 검증하고 이월 프로시저를 호출한다.
 *
 * 반환 계약:
 *  - `401`: Authorization 헤더가 없거나 Bearer 스킴이 아니거나 비밀이 일치하지 않음.
 *    바디는 실패 이유를 드러내지 않는 최소 형식(`{ error: 'Unauthorized' }`) — 공격자에게
 *    정답 추론용 부가 정보를 주지 않는다.
 *  - `200`: 인증 성공. 본 단계(R1) 에서는 실제 이월 로직이 미구현이라
 *    `{ ok: true, rolledOver: 0, pending: 'R2' }` 로 "인증은 통과했고 이월 로직은 후속
 *    태스크에서 붙인다" 는 사실을 명시적으로 응답해 둔다. R2 가 랜딩되면 `rolledOver`
 *    숫자와 에러 요약이 채워지며 E2E 완료 기준이 만족된다.
 */
export async function GET(request: Request): Promise<Response> {
  const authHeader = request.headers.get('authorization')

  // 1) 헤더 자체 존재 + Bearer 스킴 확인. 두 조건 중 하나라도 실패하면 즉시 401.
  if (!authHeader || !authHeader.startsWith(BEARER_PREFIX)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2) 토큰 본체 추출. 앞뒤 공백을 trim 해서 복사/붙여넣기 실수로 실제 환경에서 셔미드는
  //    사태를 줄인다. 서버 쪽 secret 은 env.ts 에서 이미 길이 검증을 거쳤으므로 trim 대상 X.
  const token = authHeader.slice(BEARER_PREFIX.length).trim()
  if (!matchesCronSecret(token, env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 3) 인증 통과 → 실제 이월 작업을 수행할 자리. R2 에서 `runDailyRollover()` 등을 호출해
  //    결과(총 이월 수, 실패 user 요약)를 JSON 으로 응답하도록 확장한다. 지금은 진입점이
  //    살아있음을 확인할 수 있는 최소 응답만 돌려준다.
  return NextResponse.json({
    ok: true,
    rolledOver: 0,
    pending: 'R2',
  })
}
