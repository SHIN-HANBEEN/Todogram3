import { describe, expect, it, vi } from 'vitest'

// ============================================================================
// google-cal/events.ts 테스트 (Phase 3 - G2)
// ============================================================================
// - 검증 대상: primary 캘린더의 events.list 엔드포인트를 호출하고 pageToken 루프로
//   전체 이벤트를 수집하는 `listCalendarEvents` 함수.
//   (1) `timeMin` / `timeMax` 를 RFC3339 포맷으로 쿼리에 실어 뷰 범위만 요청해야 한다.
//   (2) `singleEvents=true` 를 고정해 서버 측에서 반복 이벤트를 전개(expand)받는다.
//   (3) `maxResults=250` 을 고정해 페이지당 최대 개수를 명시한다.
//   (4) `pageToken` 루프로 `nextPageToken` 이 있는 한 계속 요청해 250+ 이벤트도 누락 없이 수집.
//   (5) 응답의 `items` 배열을 페이지 순서대로 이어 붙여 단일 배열로 반환.
//   (6) 200 이 아닌 응답은 명확한 에러로 throw (상위가 GoogleAuthRevokedError 처리와 분리되도록).
// - Google API 는 직접 건드리지 않고 G1 의 `GoogleCalClient.fetch` 인터페이스만 mocking.
//   => G1 이 이미 검증한 refresh/retry/revoked 경로는 여기서 재검증하지 않는다.
// ============================================================================

import type { GoogleCalClient } from '@/lib/google-cal/client'

// Google Calendar API 기본 엔드포인트. 테스트에서 URL 파싱에 사용.
const EVENTS_ENDPOINT_PREFIX =
  'https://www.googleapis.com/calendar/v3/calendars/primary/events'

// 표준 events.list JSON 응답 (필요한 필드만). status 200 고정.
function makeEventsResponse(body: {
  items: unknown[]
  nextPageToken?: string
}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

// 에러 응답 — status 코드와 본문을 받아 그대로 반환.
function makeErrorResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

// URL 에서 쿼리 파라미터만 꺼내 Record 로 반환 (테스트 어설션 편의).
function parseQuery(url: string): Record<string, string> {
  const parsed = new URL(url)
  return Object.fromEntries(parsed.searchParams.entries())
}

// 테스트용 GoogleCalClient 팩토리. 내부에서 vi.fn 기반 fetch 를 주입받아
// 호출 시퀀스 + URL + init 을 추적한다.
function createMockClient(
  handler: (url: string, init?: RequestInit) => Promise<Response> | Response
): {
  client: GoogleCalClient
  fetch: ReturnType<typeof vi.fn>
} {
  const fetch = vi.fn(
    async (url: string, init?: RequestInit) => await handler(url, init)
  )
  return {
    client: { fetch: fetch as unknown as GoogleCalClient['fetch'] },
    fetch,
  }
}

describe('listCalendarEvents — 기본 요청 포맷', () => {
  it('primary 캘린더 events 엔드포인트로 timeMin/timeMax/singleEvents/maxResults 를 실어 보낸다', async () => {
    const { listCalendarEvents } = await import('@/lib/google-cal/events')
    const timeMin = new Date('2026-04-01T00:00:00.000Z')
    const timeMax = new Date('2026-05-01T00:00:00.000Z')

    const { client, fetch } = createMockClient(async () =>
      makeEventsResponse({ items: [] })
    )

    await listCalendarEvents(client, { timeMin, timeMax })

    expect(fetch).toHaveBeenCalledTimes(1)
    const [calledUrl] = fetch.mock.calls[0]
    // primary 캘린더 엔드포인트여야 한다. 전체 캘린더 루트는 금지(설계 §8-3).
    expect(calledUrl.startsWith(EVENTS_ENDPOINT_PREFIX)).toBe(true)

    const q = parseQuery(calledUrl as string)
    // RFC3339 포맷 — Date.prototype.toISOString 이 동일 포맷을 생성한다.
    expect(q.timeMin).toBe('2026-04-01T00:00:00.000Z')
    expect(q.timeMax).toBe('2026-05-01T00:00:00.000Z')
    // 반복 이벤트는 서버에서 전개. 클라이언트가 수동 expand 하지 않는다.
    expect(q.singleEvents).toBe('true')
    // 페이지당 최대치 명시. Google 기본값(250)과 동일하지만 명시해서 회귀 방지.
    expect(q.maxResults).toBe('250')
    // 첫 호출에는 pageToken 이 없어야 한다.
    expect(q.pageToken).toBeUndefined()
  })

  it('GET 요청이며 Authorization 같은 헤더는 건드리지 않는다 (G1 클라이언트가 책임짐)', async () => {
    const { listCalendarEvents } = await import('@/lib/google-cal/events')
    const { client, fetch } = createMockClient(async () =>
      makeEventsResponse({ items: [] })
    )

    await listCalendarEvents(client, {
      timeMin: new Date('2026-04-01T00:00:00.000Z'),
      timeMax: new Date('2026-05-01T00:00:00.000Z'),
    })

    const init = fetch.mock.calls[0][1] as RequestInit | undefined
    // method 는 생략(GET 기본) 또는 명시 GET. 어느 쪽이든 POST/PUT/DELETE 가 아니어야 한다.
    expect([undefined, 'GET']).toContain(init?.method)
    // body 가 있어서는 안 된다.
    expect(init?.body).toBeUndefined()
  })
})

describe('listCalendarEvents — 단일 페이지 응답', () => {
  it('nextPageToken 이 없으면 한 번만 호출하고 items 를 그대로 반환한다', async () => {
    const { listCalendarEvents } = await import('@/lib/google-cal/events')
    const items = [
      { id: 'ev-1', summary: '회의' },
      { id: 'ev-2', summary: '점심' },
    ]
    const { client, fetch } = createMockClient(async () =>
      makeEventsResponse({ items })
    )

    const result = await listCalendarEvents(client, {
      timeMin: new Date('2026-04-01T00:00:00.000Z'),
      timeMax: new Date('2026-05-01T00:00:00.000Z'),
    })

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(result).toEqual(items)
  })

  it('items 가 빈 배열이어도 정상적으로 빈 배열을 반환한다', async () => {
    const { listCalendarEvents } = await import('@/lib/google-cal/events')
    const { client } = createMockClient(async () =>
      makeEventsResponse({ items: [] })
    )

    const result = await listCalendarEvents(client, {
      timeMin: new Date('2026-04-01T00:00:00.000Z'),
      timeMax: new Date('2026-05-01T00:00:00.000Z'),
    })

    expect(result).toEqual([])
  })
})

describe('listCalendarEvents — 페이지네이션 루프', () => {
  it('nextPageToken 이 있으면 pageToken 을 실어 재호출하고 모든 페이지 items 를 이어 붙인다', async () => {
    const { listCalendarEvents } = await import('@/lib/google-cal/events')

    // 3페이지 분량 시나리오: page1(token=abc) → page2(token=def) → page3(없음)
    const page1 = [{ id: 'a1' }, { id: 'a2' }]
    const page2 = [{ id: 'b1' }, { id: 'b2' }, { id: 'b3' }]
    const page3 = [{ id: 'c1' }]

    const { client, fetch } = createMockClient(async url => {
      const q = parseQuery(url)
      if (!q.pageToken)
        return makeEventsResponse({ items: page1, nextPageToken: 'abc' })
      if (q.pageToken === 'abc')
        return makeEventsResponse({ items: page2, nextPageToken: 'def' })
      if (q.pageToken === 'def') return makeEventsResponse({ items: page3 })
      throw new Error(`예상치 못한 pageToken: ${q.pageToken}`)
    })

    const result = await listCalendarEvents(client, {
      timeMin: new Date('2026-04-01T00:00:00.000Z'),
      timeMax: new Date('2026-05-01T00:00:00.000Z'),
    })

    // 총 3번 호출 + 페이지 순서대로 이어 붙임.
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(result).toEqual([...page1, ...page2, ...page3])

    // 2/3 번째 호출에는 pageToken 이 정확히 실려야 한다.
    const q2 = parseQuery(fetch.mock.calls[1][0] as string)
    const q3 = parseQuery(fetch.mock.calls[2][0] as string)
    expect(q2.pageToken).toBe('abc')
    expect(q3.pageToken).toBe('def')
  })

  it('페이지네이션 루프에서도 timeMin/timeMax/singleEvents/maxResults 는 매 호출 동일하게 유지한다', async () => {
    const { listCalendarEvents } = await import('@/lib/google-cal/events')

    const { client, fetch } = createMockClient(async url => {
      const q = parseQuery(url)
      if (!q.pageToken)
        return makeEventsResponse({ items: [{ id: 'x' }], nextPageToken: 't1' })
      return makeEventsResponse({ items: [{ id: 'y' }] })
    })

    await listCalendarEvents(client, {
      timeMin: new Date('2026-04-01T00:00:00.000Z'),
      timeMax: new Date('2026-05-01T00:00:00.000Z'),
    })

    // 두 번째 호출에도 범위 파라미터가 전부 실려 있어야 한다.
    const q2 = parseQuery(fetch.mock.calls[1][0] as string)
    expect(q2.timeMin).toBe('2026-04-01T00:00:00.000Z')
    expect(q2.timeMax).toBe('2026-05-01T00:00:00.000Z')
    expect(q2.singleEvents).toBe('true')
    expect(q2.maxResults).toBe('250')
    expect(q2.pageToken).toBe('t1')
  })

  it('무한 루프 방지 — pageToken 이 이전과 동일하면 에러를 throw 한다', async () => {
    const { listCalendarEvents } = await import('@/lib/google-cal/events')

    // 서버가 같은 pageToken 을 계속 돌려주는 병리적 케이스.
    const { client } = createMockClient(async () =>
      makeEventsResponse({ items: [{ id: 'loop' }], nextPageToken: 'same' })
    )

    await expect(
      listCalendarEvents(client, {
        timeMin: new Date('2026-04-01T00:00:00.000Z'),
        timeMax: new Date('2026-05-01T00:00:00.000Z'),
      })
    ).rejects.toThrow(/pageToken/i)
  })
})

describe('listCalendarEvents — 에러 경로', () => {
  it('200 이 아닌 응답(예: 500) 은 status 를 포함한 에러를 throw 한다', async () => {
    const { listCalendarEvents } = await import('@/lib/google-cal/events')

    const { client } = createMockClient(async () =>
      makeErrorResponse(500, { error: { code: 500, message: 'backend' } })
    )

    await expect(
      listCalendarEvents(client, {
        timeMin: new Date('2026-04-01T00:00:00.000Z'),
        timeMax: new Date('2026-05-01T00:00:00.000Z'),
      })
    ).rejects.toThrow(/500/)
  })

  it('403 같은 권한 거절도 status 를 포함해 throw 한다 (revoked 와 구분 위해 Generic Error)', async () => {
    const { listCalendarEvents } = await import('@/lib/google-cal/events')

    const { client } = createMockClient(async () =>
      makeErrorResponse(403, { error: { code: 403, message: 'forbidden' } })
    )

    await expect(
      listCalendarEvents(client, {
        timeMin: new Date('2026-04-01T00:00:00.000Z'),
        timeMax: new Date('2026-05-01T00:00:00.000Z'),
      })
    ).rejects.toThrow(/403/)
  })

  it('client.fetch 자체가 throw (예: GoogleAuthRevokedError) 하면 그대로 전파한다', async () => {
    const { listCalendarEvents } = await import('@/lib/google-cal/events')
    const { GoogleAuthRevokedError } = await import('@/lib/google-cal/client')

    const { client } = createMockClient(async () => {
      throw new GoogleAuthRevokedError()
    })

    await expect(
      listCalendarEvents(client, {
        timeMin: new Date('2026-04-01T00:00:00.000Z'),
        timeMax: new Date('2026-05-01T00:00:00.000Z'),
      })
    ).rejects.toBeInstanceOf(GoogleAuthRevokedError)
  })

  it('timeMin 이 timeMax 보다 늦으면 Google 호출 전에 바로 throw 한다 (방어적 가드)', async () => {
    const { listCalendarEvents } = await import('@/lib/google-cal/events')
    const { client, fetch } = createMockClient(async () =>
      makeEventsResponse({ items: [] })
    )

    await expect(
      listCalendarEvents(client, {
        timeMin: new Date('2026-05-01T00:00:00.000Z'),
        timeMax: new Date('2026-04-01T00:00:00.000Z'),
      })
    ).rejects.toThrow(/timeMin.*timeMax|범위/i)

    // 네트워크까지 가지 않아야 한다.
    expect(fetch).not.toHaveBeenCalled()
  })
})
