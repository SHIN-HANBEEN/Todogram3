import { beforeAll, describe, expect, it, vi } from 'vitest'

// ============================================================================
// google-cal/client.ts 테스트 (Phase 3 - G1)
// ============================================================================
// - 검증 대상: Google Calendar API 호출을 감싸는 fetch 래퍼.
//   (1) 만료되지 않은 access_token 이 캐시되어 있으면 그대로 사용한다.
//   (2) 캐시에 없거나 만료(or skew 임박)면 refresh_token 으로 새 access_token 을 받아 사용한다.
//   (3) 호출 결과가 401 이면 한 번만 refresh 를 재시도한다 (토큰이 "지금 막 revoke" 된 경우 대비).
//   (4) refresh 응답이 `invalid_grant` 면 GoogleAuthRevokedError 를 throw 하고
//       tokenStore.onRevoked() 훅을 호출한다 (Phase 3 - G4 가 여기 얹힌다).
//   (5) 성공적으로 받은 access_token 은 tokenStore.saveAccessToken() 으로 캐시에 위임된다.
// - 외부 HTTP 호출은 전부 `httpFetch` 의존성 주입으로 차단 — 실제 Google 서버는 건드리지 않는다.
// ============================================================================

// env 모듈은 SKIP_ENV_VALIDATION=1 덕분에 process.env 를 그대로 참조한다. 테스트 모듈 로드 전에
// Google client credentials 만 채워두면 client.ts 가 그 값으로 token endpoint POST body 를 만든다.
beforeAll(() => {
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')
  process.env.GOOGLE_CLIENT_ID = 'test-client-id'
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret'
})

// 지연 import — env 를 채운 뒤 모듈을 평가. client.ts 가 ENCRYPTION_KEY 등을 call-time 에 읽긴 하지만
// 명시적으로 lazy import 하여 순서를 자명하게 드러낸다.
async function loadModule() {
  return await import('@/lib/google-cal/client')
}

// 표준 token endpoint JSON 응답 (Google RFC6749 준수).
function makeTokenResponse(
  body: Record<string, unknown>,
  status = 200
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

// Calendar API 호출 성공 응답 (content 상관없이 200 이면 충분).
function makeApiResponse(status = 200): Response {
  return new Response(JSON.stringify({ ok: true, status }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

// URL 이 Google token endpoint 로 향하는지 확인 (절대 URL / URL 객체 둘 다 수용).
function isTokenEndpoint(input: RequestInfo | URL): boolean {
  const url = typeof input === 'string' ? input : input.toString()
  return url === 'https://oauth2.googleapis.com/token'
}

// 테스트용 TokenStore 목. 내부에 현재 access_token 캐시를 유지해 saveAccessToken 호출 후
// 다음 getCachedAccessToken 이 최신 값을 반환하는 동작도 자연스럽게 재현.
function createMockStore(initial?: {
  cachedAccess?: { token: string; expiresAt: number } | null
  refreshToken?: string
}) {
  let cached = initial?.cachedAccess ?? null
  const refreshToken = initial?.refreshToken ?? 'refresh-token-abc'
  const calls = {
    getCachedAccessToken: vi.fn(() => cached),
    loadRefreshToken: vi.fn(async () => refreshToken),
    saveAccessToken: vi.fn(
      async (tokens: { token: string; expiresAt: number }) => {
        cached = tokens
      }
    ),
    onRevoked: vi.fn(async () => {}),
  }
  return calls
}

describe('createGoogleCalClient — access token 캐시 경로', () => {
  it('만료되지 않은 캐시된 access_token 이 있으면 refresh 없이 바로 사용한다', async () => {
    const { createGoogleCalClient } = await loadModule()
    // now 기준 600초 뒤 만료 (skew 60초 여유 훨씬 초과).
    const now = Date.now()
    const store = createMockStore({
      cachedAccess: {
        token: 'cached-access',
        expiresAt: Math.floor(now / 1000) + 600,
      },
    })
    const httpFetch = vi.fn<typeof fetch>(async () => makeApiResponse())

    const client = createGoogleCalClient({
      store,
      httpFetch,
      now: () => now,
    })

    const res = await client.fetch(
      'https://www.googleapis.com/calendar/v3/events'
    )

    expect(res.status).toBe(200)
    // token endpoint 는 한 번도 건드리지 않아야 한다.
    expect(httpFetch).toHaveBeenCalledTimes(1)
    const [calledUrl, calledInit] = httpFetch.mock.calls[0]
    expect(isTokenEndpoint(calledUrl)).toBe(false)
    // Authorization 헤더에 cached token 이 실려야 한다.
    const headers = new Headers(calledInit?.headers)
    expect(headers.get('authorization')).toBe('Bearer cached-access')
    // 캐시 적중이므로 refresh 호출 없음.
    expect(store.loadRefreshToken).not.toHaveBeenCalled()
    expect(store.saveAccessToken).not.toHaveBeenCalled()
  })

  it('캐시가 비어 있으면 refresh 를 선제적으로 실행해 새 토큰을 받는다', async () => {
    const { createGoogleCalClient } = await loadModule()
    const now = Date.now()
    const store = createMockStore({ cachedAccess: null })

    const httpFetch = vi.fn<typeof fetch>(async input => {
      if (isTokenEndpoint(input)) {
        return makeTokenResponse({
          access_token: 'fresh-access',
          expires_in: 3599,
          token_type: 'Bearer',
          scope: 'https://www.googleapis.com/auth/calendar.events.readonly',
        })
      }
      return makeApiResponse()
    })

    const client = createGoogleCalClient({
      store,
      httpFetch,
      now: () => now,
    })

    const res = await client.fetch(
      'https://www.googleapis.com/calendar/v3/events'
    )

    expect(res.status).toBe(200)
    // token endpoint + 실제 API 호출 = 총 2회.
    expect(httpFetch).toHaveBeenCalledTimes(2)
    expect(isTokenEndpoint(httpFetch.mock.calls[0][0])).toBe(true)
    expect(isTokenEndpoint(httpFetch.mock.calls[1][0])).toBe(false)

    // 새 access_token 이 캐시에 저장되어야 한다.
    expect(store.saveAccessToken).toHaveBeenCalledTimes(1)
    const persisted = store.saveAccessToken.mock.calls[0][0]
    expect(persisted.token).toBe('fresh-access')
    // expiresAt 은 `now(ms)/1000 + expires_in` 의 근사값.
    expect(persisted.expiresAt).toBeGreaterThan(Math.floor(now / 1000) + 3000)

    // 실제 API 요청에는 새 토큰이 실려야 한다.
    const apiInit = httpFetch.mock.calls[1][1]
    const apiHeaders = new Headers(apiInit?.headers)
    expect(apiHeaders.get('authorization')).toBe('Bearer fresh-access')
  })

  it('만료 임박(skew 이내)한 캐시는 사용하지 않고 refresh 한다', async () => {
    const { createGoogleCalClient } = await loadModule()
    const now = Date.now()
    // 30초 뒤 만료 → SKEW(60초) 이내이므로 실질 만료 취급되어야 한다.
    const store = createMockStore({
      cachedAccess: {
        token: 'almost-expired',
        expiresAt: Math.floor(now / 1000) + 30,
      },
    })

    const httpFetch = vi.fn<typeof fetch>(async input => {
      if (isTokenEndpoint(input)) {
        return makeTokenResponse({
          access_token: 'refreshed-access',
          expires_in: 3599,
          token_type: 'Bearer',
        })
      }
      return makeApiResponse()
    })

    const client = createGoogleCalClient({
      store,
      httpFetch,
      now: () => now,
    })

    await client.fetch('https://www.googleapis.com/calendar/v3/events')

    // refresh 가 실행되어야 한다.
    expect(store.loadRefreshToken).toHaveBeenCalledTimes(1)
    expect(store.saveAccessToken).toHaveBeenCalledTimes(1)
    expect(store.saveAccessToken.mock.calls[0][0].token).toBe(
      'refreshed-access'
    )
  })
})

describe('createGoogleCalClient — 401 retry 경로', () => {
  it('첫 응답이 401 이면 refresh 후 한 번만 재시도한다', async () => {
    const { createGoogleCalClient } = await loadModule()
    const now = Date.now()
    const store = createMockStore({
      // 캐시는 유효 — 그래서 첫 호출은 cached token 으로 간다.
      cachedAccess: {
        token: 'stale-but-not-expired',
        expiresAt: Math.floor(now / 1000) + 600,
      },
    })

    const httpFetch = vi
      .fn<typeof fetch>()
      // 1차: API 가 401 (토큰이 서버 측에서 막 revoke 된 상황)
      .mockImplementationOnce(async () => makeApiResponse(401))
      // 2차: token endpoint refresh → 성공
      .mockImplementationOnce(async input => {
        if (!isTokenEndpoint(input)) throw new Error('expected token endpoint')
        return makeTokenResponse({
          access_token: 'retry-access',
          expires_in: 3599,
          token_type: 'Bearer',
        })
      })
      // 3차: API 재시도 → 200
      .mockImplementationOnce(async () => makeApiResponse(200))

    const client = createGoogleCalClient({
      store,
      httpFetch,
      now: () => now,
    })

    const res = await client.fetch(
      'https://www.googleapis.com/calendar/v3/events'
    )

    expect(res.status).toBe(200)
    expect(httpFetch).toHaveBeenCalledTimes(3)
    // 1차 호출은 stale token.
    expect(
      new Headers(httpFetch.mock.calls[0][1]?.headers).get('authorization')
    ).toBe('Bearer stale-but-not-expired')
    // 2차는 token endpoint.
    expect(isTokenEndpoint(httpFetch.mock.calls[1][0])).toBe(true)
    // 3차 재시도는 새 토큰.
    expect(
      new Headers(httpFetch.mock.calls[2][1]?.headers).get('authorization')
    ).toBe('Bearer retry-access')
    expect(store.saveAccessToken).toHaveBeenCalledTimes(1)
  })

  it('재시도 후에도 401 이면 그대로 401 응답을 반환한다 (무한 루프 방지)', async () => {
    const { createGoogleCalClient } = await loadModule()
    const now = Date.now()
    const store = createMockStore({
      cachedAccess: {
        token: 'cached',
        expiresAt: Math.floor(now / 1000) + 600,
      },
    })
    const httpFetch = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(async () => makeApiResponse(401))
      .mockImplementationOnce(async () =>
        makeTokenResponse({
          access_token: 'new',
          expires_in: 3599,
          token_type: 'Bearer',
        })
      )
      .mockImplementationOnce(async () => makeApiResponse(401))

    const client = createGoogleCalClient({
      store,
      httpFetch,
      now: () => now,
    })

    const res = await client.fetch(
      'https://www.googleapis.com/calendar/v3/events'
    )

    expect(res.status).toBe(401)
    expect(httpFetch).toHaveBeenCalledTimes(3)
  })

  it('401 이 아닌 에러(500 등)는 재시도하지 않고 그대로 반환한다', async () => {
    const { createGoogleCalClient } = await loadModule()
    const now = Date.now()
    const store = createMockStore({
      cachedAccess: {
        token: 'cached',
        expiresAt: Math.floor(now / 1000) + 600,
      },
    })
    const httpFetch = vi.fn<typeof fetch>(async () => makeApiResponse(500))

    const client = createGoogleCalClient({
      store,
      httpFetch,
      now: () => now,
    })

    const res = await client.fetch(
      'https://www.googleapis.com/calendar/v3/events'
    )

    expect(res.status).toBe(500)
    // refresh 시도 없음.
    expect(httpFetch).toHaveBeenCalledTimes(1)
    expect(store.loadRefreshToken).not.toHaveBeenCalled()
  })
})

describe('createGoogleCalClient — refresh 실패 경로 (G4 훅)', () => {
  it('refresh 응답이 invalid_grant 면 GoogleAuthRevokedError 를 throw 하고 onRevoked 를 호출한다', async () => {
    const { createGoogleCalClient, GoogleAuthRevokedError } = await loadModule()
    const now = Date.now()
    const store = createMockStore({ cachedAccess: null })

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
      return makeApiResponse()
    })

    const client = createGoogleCalClient({
      store,
      httpFetch,
      now: () => now,
    })

    await expect(
      client.fetch('https://www.googleapis.com/calendar/v3/events')
    ).rejects.toBeInstanceOf(GoogleAuthRevokedError)

    expect(store.onRevoked).toHaveBeenCalledTimes(1)
    // 실제 API 는 호출되지 않아야 한다.
    const apiCalls = httpFetch.mock.calls.filter(
      ([input]) => !isTokenEndpoint(input)
    )
    expect(apiCalls).toHaveLength(0)
  })

  it('refresh 응답이 5xx/네트워크 에러면 재시도 없이 그대로 에러를 전파한다 (G4 훅은 호출 안 함)', async () => {
    const { createGoogleCalClient, GoogleAuthRevokedError } = await loadModule()
    const now = Date.now()
    const store = createMockStore({ cachedAccess: null })

    const httpFetch = vi.fn<typeof fetch>(async input => {
      if (isTokenEndpoint(input)) {
        return makeTokenResponse({ error: 'backend_error' }, 500)
      }
      return makeApiResponse()
    })

    const client = createGoogleCalClient({
      store,
      httpFetch,
      now: () => now,
    })

    const err = await client
      .fetch('https://www.googleapis.com/calendar/v3/events')
      .then(() => null)
      .catch(e => e)

    // 일시적 Google 장애는 revoked 로 잘못 전이시키면 안 된다.
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(GoogleAuthRevokedError)
    expect(store.onRevoked).not.toHaveBeenCalled()
  })
})

describe('createGoogleCalClient — token endpoint 요청 포맷', () => {
  it('refresh POST body 에 client_id/client_secret/refresh_token/grant_type 이 정확히 실린다', async () => {
    const { createGoogleCalClient } = await loadModule()
    const now = Date.now()
    const store = createMockStore({
      cachedAccess: null,
      refreshToken: 'stored-refresh-token',
    })

    const httpFetch = vi.fn<typeof fetch>(async input => {
      if (isTokenEndpoint(input)) {
        return makeTokenResponse({
          access_token: 'whatever',
          expires_in: 3599,
          token_type: 'Bearer',
        })
      }
      return makeApiResponse()
    })

    const client = createGoogleCalClient({
      store,
      httpFetch,
      now: () => now,
    })

    await client.fetch('https://www.googleapis.com/calendar/v3/events')

    const tokenCall = httpFetch.mock.calls.find(([input]) =>
      isTokenEndpoint(input)
    )
    expect(tokenCall).toBeDefined()
    const init = tokenCall![1]
    expect(init?.method).toBe('POST')

    // Content-Type 은 form-urlencoded. Google OAuth 2.0 token endpoint 표준 포맷.
    const headers = new Headers(init?.headers)
    expect(headers.get('content-type')).toBe(
      'application/x-www-form-urlencoded'
    )

    // body 는 URLSearchParams 문자열. 각 필드 일치 여부 검증.
    const bodyStr = typeof init?.body === 'string' ? init.body : ''
    const params = new URLSearchParams(bodyStr)
    expect(params.get('client_id')).toBe('test-client-id')
    expect(params.get('client_secret')).toBe('test-client-secret')
    expect(params.get('refresh_token')).toBe('stored-refresh-token')
    expect(params.get('grant_type')).toBe('refresh_token')
  })
})
