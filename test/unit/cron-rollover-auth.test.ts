import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { GET } from '@/app/api/cron/rollover/route'

// ============================================================================
// /api/cron/rollover 인증 가드 단위 테스트 — Phase 5 R1
// ============================================================================
// - 이월 로직 본체(R2/R3)는 아직 없지만, 인증 게이트는 지금 깨지지 않도록 고정한다.
//   Vercel Cron 외 누구도 이 엔드포인트를 호출할 수 없어야 하므로, 네 가지 계약을 검증:
//     1) Authorization 헤더 자체가 없으면 401
//     2) Bearer 스킴이 아닌 경우(Basic 등) 401
//     3) Bearer 로 시작하지만 토큰이 다르면 401
//     4) 올바른 토큰이면 200 + `{ ok: true, pending: 'R2' }` (R2 에서 실제 이월 수 채움)
// - 테스트는 `env` 가 `SKIP_ENV_VALIDATION=1` 모드에서 `process.env` 를 그대로 노출하는
//   vitest 설정(F4)에 기댄다. 덕분에 beforeAll 에서 `CRON_SECRET` 을 주입하면 route
//   핸들러가 읽는 `env.CRON_SECRET` 도 같은 값을 반환한다.
// ============================================================================

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
  })

  it('Bearer 가 아닌 스킴(Basic 등)은 401 을 반환한다', async () => {
    const response = await GET(makeRequest('Basic dXNlcjpwYXNz'))
    expect(response.status).toBe(401)
  })

  it('Bearer 스킴이지만 토큰이 다르면 401 을 반환한다', async () => {
    const response = await GET(makeRequest('Bearer this-is-not-the-secret'))
    expect(response.status).toBe(401)
  })

  it('올바른 Bearer 토큰이면 200 을 반환하고 R2 pending 을 명시한다', async () => {
    const response = await GET(makeRequest(`Bearer ${TEST_CRON_SECRET}`))
    expect(response.status).toBe(200)
    // R2 이월 로직이 붙기 전까지는 rolledOver=0 + pending='R2' 계약을 유지.
    // R2 랜딩 시 이 테스트가 바로 실패하여 계약 업데이트를 강제하게 된다.
    await expect(response.json()).resolves.toEqual({
      ok: true,
      rolledOver: 0,
      pending: 'R2',
    })
  })

  it('토큰 앞뒤 공백은 trim 되어 정상 통과한다(복사-붙여넣기 허용)', async () => {
    const response = await GET(makeRequest(`Bearer   ${TEST_CRON_SECRET}   `))
    expect(response.status).toBe(200)
  })
})
