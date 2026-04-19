import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'

import { env } from '@/env'
import { runDailyRollover } from '@/lib/rollover'

// ============================================================================
// Auto-rollover cron endpoint — Phase 5 R1 + R2
// ============================================================================
// - Vercel Cron(`vercel.json` 의 `/api/cron/rollover` 일정) 이 매일 UTC 00:05 에 GET 으로
//   호출한다. 외부 트래픽이 직접 여기를 때려도 안 되기 때문에
//   `Authorization: Bearer $CRON_SECRET` 로 프리엠프티브 인증 게이트를 건다.
// - R1: 인증 가드 + 진입점 구성.
// - R2: `src/lib/rollover.ts` 의 `runDailyRollover()` 호출. 사용자별 timezone 해소와
//       Promise.allSettled 기반 격리 실행을 본체 모듈에 위임한다.
//       응답에는 이월 수/실패 수/실패 요약이 담겨 Vercel Logs 에서 관측 가능해진다.
// - R3: `runDailyRollover` 내부가 트랜잭션 + `FOR UPDATE SKIP LOCKED` + `rollover_logs`
//       `ON CONFLICT DO NOTHING` 으로 멱등화됨. 같은 UTC 날짜에 cron 이 두 번 깨더라도
//       두 번째 호출은 `rolledOver=0` 로 수렴한다 — 라우트 관점에서는 계약 변화 없음.
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
 *  - `200`: 인증 성공. `runDailyRollover()` 결과를 그대로 JSON 으로 돌려준다.
 *    * `rolledOver`: 이월된 태스크 총 개수.
 *    * `failed`:     실패한 사용자 수 (0 이면 모두 성공).
 *    * `failures`:   실패 사용자 목록 (`{ userId, error }`). 없으면 빈 배열.
 *    Vercel Cron 은 200 응답을 "정상 완료" 로 간주하고 재시도하지 않는다. 부분 실패를
 *    Vercel 재시도가 아닌 우리 로그/다음 cron 주기로 흡수하는 편이 안전하므로 200 을 유지한다.
 *  - `500`: 사용자 목록 로드 자체 등 완전한 사전 단계 실패(예: DB 연결 자체 불가). 이 경우엔
 *    재시도 가치가 있으므로 5xx 로 돌려준다. 상세 메시지는 숨기고 서버 로그에 남긴다.
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

  // 3) 인증 통과 → 실제 이월 본체 호출. `runDailyRollover` 내부에서 사용자별로
  //    `Promise.allSettled` 를 돌리므로 한 유저의 에러가 전체를 망가뜨리지 않는다.
  //    그래도 "사전 단계(사용자 목록 로드 등)" 레벨의 예외는 바깥 try/catch 로 감싸
  //    500 로 떨어뜨린다 — 이 상황은 Vercel Cron 재시도 대상이 될 가치가 있다.
  try {
    const result = await runDailyRollover()
    return NextResponse.json({
      ok: true,
      rolledOver: result.rolledOver,
      failed: result.failed,
      failures: result.failures,
    })
  } catch (error) {
    // 서버 로그에는 상세 스택을 남기되, 응답 바디에는 내부 구조를 노출하지 않는다.
    console.error('[cron:rollover] 이월 본체 실행 중 치명적 예외', error)
    return NextResponse.json(
      { ok: false, error: 'RolloverFailed' },
      { status: 500 }
    )
  }
}
