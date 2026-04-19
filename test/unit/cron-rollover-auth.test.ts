import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// ============================================================================
// /api/cron/rollover 인증 가드 단위 테스트 — Phase 5 R1 + R2
// ============================================================================
// - 이월 로직 본체(R2)는 별도 모듈(`@/lib/rollover`)에 있고, 여기서는 "라우트 핸들러가
//   인증 후 해당 모듈을 올바르게 호출·포장해 응답하는가" 만 본다. DB 는 절대 건드리지 않는다.
// - `runDailyRollover` 는 vitest 의 `vi.mock` 으로 스텁하여 라우트-모듈 계약을 고정한다.
//   실제 timezone/격리 로직은 `rollover-timezone.test.ts` 와 `rollover-isolation.test.ts`
//   에서 단위로 검증한다.
// - 네 가지 인증 계약을 유지한다:
//     1) Authorization 헤더 부재 → 401
//     2) Bearer 스킴이 아닌 경우(Basic 등) → 401
//     3) Bearer 토큰이 다르면 → 401
//     4) 올바른 토큰이면 → 200 + `runDailyRollover` 결과 포장
// - 테스트는 `env` 가 `SKIP_ENV_VALIDATION=1` 모드에서 `process.env` 를 그대로 노출하는
//   vitest 설정(F4)에 기댄다.
// ============================================================================

// mock 은 route 를 import 하기 전에 반드시 선언되어야 vi.mock 호이스팅이 먹는다.
vi.mock('@/lib/rollover', () => ({
  // 기본 스텁: 이월 0건·실패 0건. 각 테스트에서 `vi.mocked(...).mockResolvedValueOnce` 로 덮어쓴다.
  runDailyRollover: vi.fn(async () => ({
    rolledOver: 0,
    failed: 0,
    failures: [],
  })),
}))

import { GET } from '@/app/api/cron/rollover/route'
import { runDailyRollover } from '@/lib/rollover'

// 실제 프로덕션 시크릿과 무관한 더미. 32자 이상이어야 env 검증(비스킵 모드)도 통과.
const TEST_CRON_SECRET = 'test-only-cron-secret-'.padEnd(40, 'x')
// 테스트 시작 전 process.env 에 존재할 수도 있는 값 보존 → 테스트 종료 후 복구.
let originalCronSecret: string | undefined

beforeAll(() => {
  originalCronSecret = process.env.CRON_SECRET
  process.env.CRON_SECRET = TEST_CRON_SECRET
})

afterAll(() => {
  // 다른 테스트가 진짜 env 를 기대할 수 있으니 원복. undefined 였다면 키 자체를 제거.
  if (originalCronSecret === undefined) {
    delete process.env.CRON_SECRET
  } else {
    process.env.CRON_SECRET = originalCronSecret
  }
})

// 테스트 편의 헬퍼: 지정한 Authorization 값(없으면 undefined)으로 fake Request 생성.
function makeRequest(authorization?: string): Request {
  const headers = new Headers()
  if (authorization !== undefined) {
    headers.set('authorization', authorization)
  }
  return new Request('http://localhost/api/cron/rollover', {
    method: 'GET',
    headers,
  })
}

describe('/api/cron/rollover GET 인증 가드 (R1)', () => {
  it('Authorization 헤더가 없으면 401 을 반환한다', async () => {
    const response = await GET(makeRequest())
    expect(response.status).toBe(401)
    // 실패 이유를 외부에 흘리지 않도록 바디는 최소 형식 고정.
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
    // 인증 실패 시 이월 본체는 절대 호출되면 안 된다.
    expect(runDailyRollover).not.toHaveBeenCalled()
  })

  it('Bearer 가 아닌 스킴(Basic 등)은 401 을 반환한다', async () => {
    const response = await GET(makeRequest('Basic dXNlcjpwYXNz'))
    expect(response.status).toBe(401)
  })

  it('Bearer 스킴이지만 토큰이 다르면 401 을 반환한다', async () => {
    const response = await GET(makeRequest('Bearer this-is-not-the-secret'))
    expect(response.status).toBe(401)
  })
})

describe('/api/cron/rollover GET 이월 본체 호출 계약 (R2)', () => {
  it('올바른 Bearer 토큰이면 runDailyRollover 결과를 그대로 포장해 200 으로 반환한다', async () => {
    // 이 테스트에서만 특정 결과를 흉내낸다 — 실제 숫자는 의미 없고, 포장 형식이 검증 대상.
    vi.mocked(runDailyRollover).mockResolvedValueOnce({
      rolledOver: 3,
      failed: 1,
      failures: [{ userId: 42, error: 'simulated failure' }],
    })

    const response = await GET(makeRequest(`Bearer ${TEST_CRON_SECRET}`))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      rolledOver: 3,
      failed: 1,
      failures: [{ userId: 42, error: 'simulated failure' }],
    })
    expect(runDailyRollover).toHaveBeenCalledTimes(1)
  })

  it('토큰 앞뒤 공백은 trim 되어 정상 통과한다(복사-붙여넣기 허용)', async () => {
    const response = await GET(makeRequest(`Bearer   ${TEST_CRON_SECRET}   `))
    expect(response.status).toBe(200)
  })

  it('이월 본체가 예외를 던지면 500 + 최소 에러 바디로 응답한다', async () => {
    vi.mocked(runDailyRollover).mockRejectedValueOnce(new Error('boom'))

    // 콘솔에 의도된 에러 로그가 찍히므로 테스트 출력을 오염시키지 않도록 잠깐 무음 처리.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = await GET(makeRequest(`Bearer ${TEST_CRON_SECRET}`))
    spy.mockRestore()

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'RolloverFailed',
    })
  })
})
