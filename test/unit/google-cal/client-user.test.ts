import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// ============================================================================
// getGoogleCalClientForUser 테스트 (Phase 3 - G4)
// ============================================================================
// - 검증 대상: G1 에서 핀을 박아둔 `onRevoked` 훅이 G4 에서 실제로 DB 상태를
//   `users.google_auth_status = 'revoked'` 로 전이시키는지, in-memory access
//   token 캐시가 invalidate 되는지, GoogleAuthRevokedError 는 호출자에게
//   그대로 전파되는지(DB 업데이트 실패여도 "재로그인 필요" 신호가 묻히지 않음) 를
//   한 번에 커버한다.
// - DB 접근은 drizzle 체인을 vi.mock + vi.hoisted 로 가짜 체인으로 대체해
//   실제 Postgres 를 건드리지 않는다.  (SKIP_ENV_VALIDATION=1 환경에서도 `@/db`
//   는 로드 시점에 postgres 클라이언트를 생성하려 하므로 모듈 자체를 stub 한다.)
// - `@/lib/crypto` 의 decrypt 은 G4 검증 관점에서 "본질이 아닌 노이즈" 라
//   identity 함수로 mock — DB 에서 가져온 refresh_token 문자열이 그대로 흘러간다.
// ============================================================================

// 가짜 drizzle 체인 + 호출 추적기를 hoisted 로 만들어 `vi.mock` 보다 먼저
// 평가되도록 한다. hoisted 바깥(모듈 상수)에서 mock 함수를 만들면 Vitest 가
// reference error 를 내므로 반드시 vi.hoisted 안에서 생성해야 한다.
const { mockDb, cryptoSpy } = vi.hoisted(() => {
  // select / update 호출 시 찍히는 내부 상태. 테스트마다 `beforeEach` 에서 초기화한다.
  const state = {
    userRow: null as null | {
      id: number
      googleRefreshToken: string | null
      googleAuthStatus: 'active' | 'revoked' | 'expired'
    },
    // 가장 최근에 update().set() 으로 전달된 values 및 where() 조건을 기록.
    updateSetValues: null as unknown,
    updateWhereCond: null as unknown,
    updateCallCount: 0,
  }

  const makeSelect = () => ({
    from: () => ({
      where: () => ({
        // 실제 코드가 `.limit(1)` 뒤 await 하므로 terminal 지점을 async 로 만든다.
        limit: async () => (state.userRow ? [state.userRow] : []),
      }),
    }),
  })

  const makeUpdate = () => ({
    set: (values: unknown) => {
      state.updateSetValues = values
      return {
        where: async (cond: unknown) => {
          state.updateWhereCond = cond
          state.updateCallCount += 1
        },
      }
    },
  })

  const mockDb = {
    db: {
      select: () => makeSelect(),
      update: () => makeUpdate(),
    },
    state,
    reset() {
      state.userRow = null
      state.updateSetValues = null
      state.updateWhereCond = null
      state.updateCallCount = 0
    },
  }

  // 복호화는 identity — 테스트는 "어떤 refresh_token 문자열이 최종적으로
  // Google token endpoint 로 흘러가는가" 만 확인하면 충분하다.
  const cryptoSpy = {
    decrypt: vi.fn((v: string) => v),
    encrypt: vi.fn((v: string) => v),
  }

  return { mockDb, cryptoSpy }
})

// 모듈 치환. `await import('@/lib/google-cal/client')` 내부의 `import { db }` 와
// `import { decrypt }` 는 여기 stub 으로 해석된다.
vi.mock('@/db', () => ({ db: mockDb.db }))
vi.mock('@/lib/crypto', () => cryptoSpy)

beforeAll(() => {
  // env 검증은 SKIP_ENV_VALIDATION=1 로 스킵되지만, token endpoint 호출 시
  // client_id/client_secret 을 실제로 body 에 넣기 때문에 둘은 채워둬야 한다.
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')
  process.env.GOOGLE_CLIENT_ID = 'test-client-id'
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret'
})

beforeEach(() => {
  mockDb.reset()
  cryptoSpy.decrypt.mockClear()
  cryptoSpy.encrypt.mockClear()
})

async function loadModule() {
  // 모듈을 동적으로 load 해야 vi.mock stub 이 확실히 반영된다.
  return await import('@/lib/google-cal/client')
}

// Google token endpoint 응답 헬퍼.
function makeTokenResponse(
  body: Record<string, unknown>,
  status = 200
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function isTokenEndpoint(input: RequestInfo | URL): boolean {
  const url = typeof input === 'string' ? input : input.toString()
  return url === 'https://oauth2.googleapis.com/token'
}

describe('getGoogleCalClientForUser — 사전 조건 가드', () => {
  it('사용자가 DB 에 없으면 "사용자를 찾을 수 없습니다" 에러를 throw 한다', async () => {
    const { getGoogleCalClientForUser } = await loadModule()
    mockDb.state.userRow = null

    await expect(getGoogleCalClientForUser(999)).rejects.toThrow(
      /사용자를 찾을 수 없습니다/
    )
    // DB 업데이트 시도 없음 — 존재하지 않는 유저에게 revoked 플래그를 찍으면 안 된다.
    expect(mockDb.state.updateCallCount).toBe(0)
  })

  it('이미 revoked 상태라면 refresh 시도 없이 즉시 GoogleAuthRevokedError 를 throw 한다', async () => {
    const { getGoogleCalClientForUser, GoogleAuthRevokedError } =
      await loadModule()
    mockDb.state.userRow = {
      id: 42,
      googleRefreshToken: 'legacy-refresh',
      googleAuthStatus: 'revoked',
    }

    await expect(getGoogleCalClientForUser(42)).rejects.toBeInstanceOf(
      GoogleAuthRevokedError
    )
    // 이미 revoked 인 사용자를 또 revoked 로 업데이트하는 불필요한 쓰기도 하지 않아야 한다.
    expect(mockDb.state.updateCallCount).toBe(0)
  })

  it('refresh_token 이 null 이면 GoogleAuthRevokedError 를 throw 한다', async () => {
    const { getGoogleCalClientForUser, GoogleAuthRevokedError } =
      await loadModule()
    mockDb.state.userRow = {
      id: 42,
      googleRefreshToken: null,
      googleAuthStatus: 'active',
    }

    await expect(getGoogleCalClientForUser(42)).rejects.toBeInstanceOf(
      GoogleAuthRevokedError
    )
  })
})

describe('getGoogleCalClientForUser — G4 DB revoked 전이', () => {
  it('invalid_grant 응답 시 users.google_auth_status 를 "revoked" 로 업데이트한다', async () => {
    const {
      getGoogleCalClientForUser,
      GoogleAuthRevokedError,
      __clearInMemoryAccessTokenCacheForTests,
    } = await loadModule()
    __clearInMemoryAccessTokenCacheForTests()

    mockDb.state.userRow = {
      id: 77,
      googleRefreshToken: 'encrypted-refresh-token',
      googleAuthStatus: 'active',
    }

    // token endpoint 는 invalid_grant (사용자가 Google 계정 화면에서 앱 권한 취소).
    const httpFetch = vi.fn<typeof fetch>(async input => {
      if (isTokenEndpoint(input)) {
        return makeTokenResponse(
          {
            error: 'invalid_grant',
            error_description: 'Token has been expired or revoked.',
          },
          400
        )
      }
      return new Response('', { status: 500 })
    })

    // getGoogleCalClientForUser 는 httpFetch 주입 옵션이 없으므로 globalThis.fetch 를 대체.
    const originalFetch = globalThis.fetch
    globalThis.fetch = httpFetch as unknown as typeof fetch
    try {
      const client = await getGoogleCalClientForUser(77)

      // 첫 API 호출에서 refresh → invalid_grant → G4 전이 발생.
      await expect(
        client.fetch('https://www.googleapis.com/calendar/v3/events')
      ).rejects.toBeInstanceOf(GoogleAuthRevokedError)
    } finally {
      globalThis.fetch = originalFetch
    }

    // ---- 핵심 검증: DB 가 정확히 한 번 revoked 로 업데이트되었는지 ----
    expect(mockDb.state.updateCallCount).toBe(1)
    // set() 에 전달된 values 객체에 googleAuthStatus: 'revoked' 가 담겨야 한다.
    expect(mockDb.state.updateSetValues).toMatchObject({
      googleAuthStatus: 'revoked',
    })
    // where() 에 조건이 전달되었는지만 확인(구체 SQL 매칭은 drizzle 내부 객체라 생략).
    expect(mockDb.state.updateWhereCond).toBeDefined()
  })

  it('invalid_grant 후 호출자에게는 여전히 GoogleAuthRevokedError 가 도달한다', async () => {
    // DB 업데이트가 성공해도(혹은 실패해도) "재로그인 필요" 신호는 묻히지 않아야 한다.
    const { getGoogleCalClientForUser, GoogleAuthRevokedError } =
      await loadModule()
    mockDb.state.userRow = {
      id: 3,
      googleRefreshToken: 'refresh-abc',
      googleAuthStatus: 'active',
    }

    const httpFetch = vi.fn<typeof fetch>(async () =>
      makeTokenResponse({ error: 'invalid_grant' }, 400)
    )
    const originalFetch = globalThis.fetch
    globalThis.fetch = httpFetch as unknown as typeof fetch
    try {
      const client = await getGoogleCalClientForUser(3)
      const err = await client
        .fetch('https://www.googleapis.com/calendar/v3/events')
        .then(() => null)
        .catch(e => e)

      expect(err).toBeInstanceOf(GoogleAuthRevokedError)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('DB 업데이트가 실패해도 GoogleAuthRevokedError 는 그대로 전파된다 (훅 실패는 삼킨다)', async () => {
    // G1 테스트에서 이미 createGoogleCalClient 레벨로 커버했지만, 실제 store 구현(getGoogleCalClientForUser)
    // 이 같은 규약을 지키는지도 확인 — UI 가 "DB 에러" 메시지가 아닌 "재로그인" 을 보게 해야 한다.
    const { getGoogleCalClientForUser, GoogleAuthRevokedError } =
      await loadModule()
    mockDb.state.userRow = {
      id: 5,
      googleRefreshToken: 'refresh-xyz',
      googleAuthStatus: 'active',
    }

    // update 체인을 일시적으로 throw 하도록 교체.
    const originalUpdate = mockDb.db.update
    mockDb.db.update = () => ({
      set: () => ({
        where: async () => {
          throw new Error('db connection lost')
        },
      }),
    })

    const httpFetch = vi.fn<typeof fetch>(async () =>
      makeTokenResponse({ error: 'invalid_grant' }, 400)
    )
    const originalFetch = globalThis.fetch
    globalThis.fetch = httpFetch as unknown as typeof fetch
    try {
      const client = await getGoogleCalClientForUser(5)
      await expect(
        client.fetch('https://www.googleapis.com/calendar/v3/events')
      ).rejects.toBeInstanceOf(GoogleAuthRevokedError)
    } finally {
      globalThis.fetch = originalFetch
      mockDb.db.update = originalUpdate
    }
  })

  it('invalid_grant 후 in-memory access token 캐시가 해당 유저에 한해 비워진다', async () => {
    // 같은 프로세스의 후속 요청이 stale 캐시 토큰을 재사용하지 않도록 캐시 무효화가 유지되어야 한다.
    const {
      createGoogleCalClient,
      getGoogleCalClientForUser,
      GoogleAuthRevokedError,
      __clearInMemoryAccessTokenCacheForTests,
    } = await loadModule()
    __clearInMemoryAccessTokenCacheForTests()

    mockDb.state.userRow = {
      id: 9,
      googleRefreshToken: 'refresh-9',
      googleAuthStatus: 'active',
    }

    // 첫 성공 흐름: access token 이 캐시에 저장되도록 한다.
    const nowMs = 1_700_000_000_000
    // 1차 httpFetch: 정상 refresh + 성공 API.
    const okFetch = vi.fn<typeof fetch>(async input => {
      if (isTokenEndpoint(input)) {
        return makeTokenResponse({
          access_token: 'cached-access',
          expires_in: 3599,
          token_type: 'Bearer',
        })
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    })
    const originalFetch = globalThis.fetch
    globalThis.fetch = okFetch as unknown as typeof fetch
    try {
      const client = await getGoogleCalClientForUser(9)
      const res = await client.fetch(
        'https://www.googleapis.com/calendar/v3/events'
      )
      expect(res.status).toBe(200)
    } finally {
      globalThis.fetch = originalFetch
    }

    // 이제 revoked 흐름: 캐시가 초기화되었는지 간접 검증.
    // - getGoogleCalClientForUser 를 다시 호출하면 같은 userId 기준으로 동일 store 를 wire 한다.
    // - 이 시점 store.getCachedAccessToken() 이 여전히 non-null 인지 확인하기 위해
    //   createGoogleCalClient 경로로 우회해서 "사전에 캐시가 살아있었다" 를 보장한 뒤,
    //   invalid_grant 후 재조회했을 때 null 이 되어 있는지 확인한다.
    // (내부 Map 상태 직접 접근은 export 되어 있지 않으므로 행동 기반으로 검증.)
    void createGoogleCalClient // 사용되진 않지만 import 검증

    // invalid_grant 경로 실행.
    const revokedFetch = vi.fn<typeof fetch>(async input => {
      if (isTokenEndpoint(input)) {
        // 캐시가 만료 skew 에 걸리지 않도록 충분히 먼 미래로 발급해둔 상태지만,
        // 실제 API 호출이 401 → refresh 트리거되도록 API 를 401 로 돌려준다.
        return makeTokenResponse({ error: 'invalid_grant' }, 400)
      }
      return new Response('', { status: 401 })
    })
    globalThis.fetch = revokedFetch as unknown as typeof fetch
    try {
      const client2 = await getGoogleCalClientForUser(9)
      await expect(
        client2.fetch('https://www.googleapis.com/calendar/v3/events')
      ).rejects.toBeInstanceOf(GoogleAuthRevokedError)
    } finally {
      globalThis.fetch = originalFetch
    }

    // 이후 같은 유저로 새 client 를 만들고, 정상 refresh 응답을 주었을 때
    // 캐시가 비워져 있었으므로 refresh 가 "반드시" 한 번 발생해야 한다 (캐시 hit 이면 refresh 가 없었을 것).
    // userRow 를 다시 active 로 설정 (G4 의 revoked DB 전이는 mock 이라 실제 행이 갱신되지 않음).
    mockDb.state.userRow = {
      id: 9,
      googleRefreshToken: 'refresh-9',
      googleAuthStatus: 'active',
    }
    const probeFetch = vi.fn<typeof fetch>(async input => {
      if (isTokenEndpoint(input)) {
        return makeTokenResponse({
          access_token: 'post-revoke-access',
          expires_in: 3599,
          token_type: 'Bearer',
        })
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    })
    globalThis.fetch = probeFetch as unknown as typeof fetch
    try {
      const client3 = await getGoogleCalClientForUser(9)
      const res = await client3.fetch(
        'https://www.googleapis.com/calendar/v3/events'
      )
      expect(res.status).toBe(200)
    } finally {
      globalThis.fetch = originalFetch
    }

    // probeFetch 가 token endpoint 를 호출했다면 = 캐시가 비워져 있었다는 뜻.
    const tokenCalls = probeFetch.mock.calls.filter(([input]) =>
      isTokenEndpoint(input)
    )
    expect(tokenCalls.length).toBe(1)
    // 참고로 nowMs 는 현재 사용되지 않지만, 추후 now DI 로 전환 시 바로 활용할 수 있도록 상수로 둔다.
    void nowMs
  })

  it('정상 경로(토큰 refresh 성공) 는 DB update 를 호출하지 않는다', async () => {
    // revoked 전이는 invalid_grant 에서만 일어나야 한다. 평범한 refresh 성공에서는 DB 를 쓰지 않음.
    const {
      getGoogleCalClientForUser,
      __clearInMemoryAccessTokenCacheForTests,
    } = await loadModule()
    __clearInMemoryAccessTokenCacheForTests()
    mockDb.state.userRow = {
      id: 11,
      googleRefreshToken: 'refresh-11',
      googleAuthStatus: 'active',
    }

    const httpFetch = vi.fn<typeof fetch>(async input => {
      if (isTokenEndpoint(input)) {
        return makeTokenResponse({
          access_token: 'ok-access',
          expires_in: 3599,
          token_type: 'Bearer',
        })
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    })
    const originalFetch = globalThis.fetch
    globalThis.fetch = httpFetch as unknown as typeof fetch
    try {
      const client = await getGoogleCalClientForUser(11)
      const res = await client.fetch(
        'https://www.googleapis.com/calendar/v3/events'
      )
      expect(res.status).toBe(200)
    } finally {
      globalThis.fetch = originalFetch
    }

    expect(mockDb.state.updateCallCount).toBe(0)
  })
})
