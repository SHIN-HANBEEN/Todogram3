import { describe, expect, it, vi } from 'vitest'

// ============================================================================
// google-cal/cache.ts 테스트 (Phase 3 - G3)
// ============================================================================
// - 검증 대상:
//   (1) `buildEventCacheKey(userId, timeMin, timeMax)` — 안정적인 캐시 키 직렬화
//   (2) `createEventCache({ ttlMs, maxEntries, now })` — LRU + TTL 이벤트 캐시
//       * 키는 (userId, timeMin, timeMax) 튜플로 식별
//       * TTL(기본 5분) 경과한 엔트리는 `get` 에서 null 반환 + lazy 제거
//       * LRU: maxEntries 초과 시 가장 오래된 접근 엔트리를 축출
//       * `get` 접근은 "최근 사용" 으로 recency 를 갱신
//   (3) `createDebouncedFetcher({ delayMs, setTimeoutFn, clearTimeoutFn })`
//       — delayMs(기본 300ms) 이내에 연속 호출되면 오직 마지막 load 만 실행된다.
//       — 모든 대기 중인 promise 는 동일한 최종 결과(또는 에러)로 resolve/reject.
//       — setTimeout/clearTimeout 은 DI 로 받아서 fake timer 의존 없이 단위 테스트.
//   (4) 상수 노출: `EVENT_CACHE_TTL_MS`, `EVENT_DEBOUNCE_DEFAULT_MS`,
//       `EVENT_CACHE_DEFAULT_MAX_ENTRIES` — 설계 §8-3 수치가 회귀하지 않도록 락.
// - 네트워크 / Google API 는 전혀 건드리지 않는다. G1/G2 가 검증한 경로는 재검증하지 않는다.
// ============================================================================

import type { GoogleCalendarEvent } from '@/lib/google-cal/events'

// G3 모듈은 아직 존재하지 않으므로 lazy import 로 RED → GREEN 전이가 명확히 드러나게 한다.
async function loadModule() {
  return await import('@/lib/google-cal/cache')
}

/** 간단한 이벤트 픽스처 팩토리 — id 만 달라도 동일성 비교에는 충분. */
function makeEvent(id: string): GoogleCalendarEvent {
  return { id, summary: `event-${id}` }
}

// ----------------------------------------------------------------------------
// (1) buildEventCacheKey — 안정적 직렬화
// ----------------------------------------------------------------------------
describe('buildEventCacheKey', () => {
  it('userId / timeMin / timeMax 를 콜론 구분자로 단일 문자열로 직렬화한다', async () => {
    const { buildEventCacheKey } = await loadModule()
    const key = buildEventCacheKey(
      42,
      new Date('2026-04-01T00:00:00.000Z'),
      new Date('2026-05-01T00:00:00.000Z')
    )
    // ISO 8601 (`toISOString`) 기반이라 시계 환경과 무관하게 재현 가능.
    expect(key).toBe('42:2026-04-01T00:00:00.000Z:2026-05-01T00:00:00.000Z')
  })

  it('동일한 입력에 대해 동일한 키를 반환한다 (캐시 적중 보장)', async () => {
    const { buildEventCacheKey } = await loadModule()
    const a = buildEventCacheKey(
      1,
      new Date('2026-04-01T00:00:00.000Z'),
      new Date('2026-05-01T00:00:00.000Z')
    )
    const b = buildEventCacheKey(
      1,
      new Date('2026-04-01T00:00:00.000Z'),
      new Date('2026-05-01T00:00:00.000Z')
    )
    expect(a).toBe(b)
  })

  it('userId 가 다르면 서로 다른 키를 반환한다 (사용자 격리)', async () => {
    const { buildEventCacheKey } = await loadModule()
    const a = buildEventCacheKey(
      1,
      new Date('2026-04-01T00:00:00.000Z'),
      new Date('2026-05-01T00:00:00.000Z')
    )
    const b = buildEventCacheKey(
      2,
      new Date('2026-04-01T00:00:00.000Z'),
      new Date('2026-05-01T00:00:00.000Z')
    )
    expect(a).not.toBe(b)
  })

  it('범위가 조금이라도 다르면 서로 다른 키를 반환한다', async () => {
    const { buildEventCacheKey } = await loadModule()
    const a = buildEventCacheKey(
      1,
      new Date('2026-04-01T00:00:00.000Z'),
      new Date('2026-05-01T00:00:00.000Z')
    )
    const b = buildEventCacheKey(
      1,
      new Date('2026-04-01T00:00:00.000Z'),
      new Date('2026-05-02T00:00:00.000Z')
    )
    expect(a).not.toBe(b)
  })
})

// ----------------------------------------------------------------------------
// (2) createEventCache — 기본 동작
// ----------------------------------------------------------------------------
describe('createEventCache — 기본 동작', () => {
  it('존재하지 않는 키는 null 을 반환한다', async () => {
    const { createEventCache } = await loadModule()
    const cache = createEventCache()
    expect(
      cache.get(
        1,
        new Date('2026-04-01T00:00:00.000Z'),
        new Date('2026-05-01T00:00:00.000Z')
      )
    ).toBeNull()
  })

  it('set 후 같은 키로 get 하면 저장된 이벤트 배열을 그대로 돌려준다', async () => {
    const { createEventCache } = await loadModule()
    const cache = createEventCache()
    const timeMin = new Date('2026-04-01T00:00:00.000Z')
    const timeMax = new Date('2026-05-01T00:00:00.000Z')
    const events = [makeEvent('a'), makeEvent('b')]

    cache.set(1, timeMin, timeMax, events)
    expect(cache.get(1, timeMin, timeMax)).toEqual(events)
  })

  it('다른 userId 끼리는 격리된다 (A 의 캐시를 B 가 볼 수 없다)', async () => {
    const { createEventCache } = await loadModule()
    const cache = createEventCache()
    const timeMin = new Date('2026-04-01T00:00:00.000Z')
    const timeMax = new Date('2026-05-01T00:00:00.000Z')

    cache.set(1, timeMin, timeMax, [makeEvent('user1')])
    cache.set(2, timeMin, timeMax, [makeEvent('user2')])

    expect(cache.get(1, timeMin, timeMax)).toEqual([makeEvent('user1')])
    expect(cache.get(2, timeMin, timeMax)).toEqual([makeEvent('user2')])
  })

  it('같은 키로 다시 set 하면 최신 값이 유지된다', async () => {
    const { createEventCache } = await loadModule()
    const cache = createEventCache()
    const timeMin = new Date('2026-04-01T00:00:00.000Z')
    const timeMax = new Date('2026-05-01T00:00:00.000Z')

    cache.set(1, timeMin, timeMax, [makeEvent('old')])
    cache.set(1, timeMin, timeMax, [makeEvent('new')])

    expect(cache.get(1, timeMin, timeMax)).toEqual([makeEvent('new')])
  })

  it('size 는 현재 엔트리 개수를 반영하고 clear() 로 0 이 된다', async () => {
    const { createEventCache } = await loadModule()
    const cache = createEventCache()
    const range = [
      new Date('2026-04-01T00:00:00.000Z'),
      new Date('2026-05-01T00:00:00.000Z'),
    ] as const

    expect(cache.size).toBe(0)
    cache.set(1, range[0], range[1], [makeEvent('a')])
    cache.set(2, range[0], range[1], [makeEvent('b')])
    expect(cache.size).toBe(2)

    cache.clear()
    expect(cache.size).toBe(0)
    expect(cache.get(1, range[0], range[1])).toBeNull()
  })
})

// ----------------------------------------------------------------------------
// (2b) createEventCache — TTL 만료
// ----------------------------------------------------------------------------
describe('createEventCache — TTL 만료', () => {
  it('ttlMs 가 경과하면 get 이 null 을 반환한다 (lazy 만료)', async () => {
    const { createEventCache } = await loadModule()
    // 시간을 완전히 제어하기 위해 now 주입.
    let currentMs = 1_000_000_000_000
    const cache = createEventCache({ ttlMs: 1000, now: () => currentMs })
    const range = [
      new Date('2026-04-01T00:00:00.000Z'),
      new Date('2026-05-01T00:00:00.000Z'),
    ] as const

    cache.set(1, range[0], range[1], [makeEvent('a')])
    // 정확히 TTL 경계까지는 유효.
    currentMs += 999
    expect(cache.get(1, range[0], range[1])).toEqual([makeEvent('a')])

    // TTL 초과 → null 로 전이.
    currentMs += 2
    expect(cache.get(1, range[0], range[1])).toBeNull()
  })

  it('만료된 엔트리는 lazy 제거된다 (size 감소)', async () => {
    const { createEventCache } = await loadModule()
    let currentMs = 0
    const cache = createEventCache({ ttlMs: 100, now: () => currentMs })
    const range = [
      new Date('2026-04-01T00:00:00.000Z'),
      new Date('2026-05-01T00:00:00.000Z'),
    ] as const

    cache.set(1, range[0], range[1], [makeEvent('x')])
    expect(cache.size).toBe(1)

    currentMs += 500
    // 만료된 키를 get 한 이후에는 엔트리가 정리되어 size 가 0 이 되어야 한다.
    cache.get(1, range[0], range[1])
    expect(cache.size).toBe(0)
  })

  it('기본 TTL 은 5분(= EVENT_CACHE_TTL_MS) 이다', async () => {
    const { EVENT_CACHE_TTL_MS } = await loadModule()
    // 설계 §8-3 백그라운드 refresh 주기 5분 과 정확히 일치해야 한다.
    expect(EVENT_CACHE_TTL_MS).toBe(5 * 60 * 1000)
  })
})

// ----------------------------------------------------------------------------
// (2c) createEventCache — LRU 축출
// ----------------------------------------------------------------------------
describe('createEventCache — LRU 축출', () => {
  it('maxEntries 초과 시 가장 오래된 엔트리가 축출된다', async () => {
    const { createEventCache } = await loadModule()
    const cache = createEventCache({ maxEntries: 2 })
    const timeMin = new Date('2026-04-01T00:00:00.000Z')
    const timeMax = new Date('2026-05-01T00:00:00.000Z')

    cache.set(1, timeMin, timeMax, [makeEvent('u1')])
    cache.set(2, timeMin, timeMax, [makeEvent('u2')])
    cache.set(3, timeMin, timeMax, [makeEvent('u3')])

    // 1 이 축출되고 2,3 만 남는다.
    expect(cache.get(1, timeMin, timeMax)).toBeNull()
    expect(cache.get(2, timeMin, timeMax)).toEqual([makeEvent('u2')])
    expect(cache.get(3, timeMin, timeMax)).toEqual([makeEvent('u3')])
    expect(cache.size).toBe(2)
  })

  it('get 으로 접근한 키는 "최근 사용" 으로 갱신되어 축출되지 않는다', async () => {
    const { createEventCache } = await loadModule()
    const cache = createEventCache({ maxEntries: 2 })
    const timeMin = new Date('2026-04-01T00:00:00.000Z')
    const timeMax = new Date('2026-05-01T00:00:00.000Z')

    cache.set(1, timeMin, timeMax, [makeEvent('u1')])
    cache.set(2, timeMin, timeMax, [makeEvent('u2')])
    // 1 을 get 해 recency 를 갱신 → 2 가 가장 오래된 엔트리가 된다.
    expect(cache.get(1, timeMin, timeMax)).toEqual([makeEvent('u1')])

    cache.set(3, timeMin, timeMax, [makeEvent('u3')])
    // 이제 2 가 축출되고 1/3 이 남는다.
    expect(cache.get(1, timeMin, timeMax)).toEqual([makeEvent('u1')])
    expect(cache.get(2, timeMin, timeMax)).toBeNull()
    expect(cache.get(3, timeMin, timeMax)).toEqual([makeEvent('u3')])
  })

  it('동일 키로 set 하면 recency 가 갱신된다 (업서트도 축출 우선순위를 리셋)', async () => {
    const { createEventCache } = await loadModule()
    const cache = createEventCache({ maxEntries: 2 })
    const timeMin = new Date('2026-04-01T00:00:00.000Z')
    const timeMax = new Date('2026-05-01T00:00:00.000Z')

    cache.set(1, timeMin, timeMax, [makeEvent('u1-old')])
    cache.set(2, timeMin, timeMax, [makeEvent('u2')])
    // 1 을 최신 값으로 덮어씀 → 1 이 가장 최근.
    cache.set(1, timeMin, timeMax, [makeEvent('u1-new')])
    cache.set(3, timeMin, timeMax, [makeEvent('u3')])

    // 2 가 가장 오래된 엔트리라 축출된다.
    expect(cache.get(2, timeMin, timeMax)).toBeNull()
    expect(cache.get(1, timeMin, timeMax)).toEqual([makeEvent('u1-new')])
    expect(cache.get(3, timeMin, timeMax)).toEqual([makeEvent('u3')])
  })
})

// ----------------------------------------------------------------------------
// (3) createDebouncedFetcher
// ----------------------------------------------------------------------------

/**
 * 제어 가능한 fake timer 쌍. Vitest 의 글로벌 fake timer 대신 명시적으로 주입해
 * 테스트 동시 실행 / 격리성 / 디버깅 친화성을 확보한다.
 */
function createControlledTimers() {
  let nextId = 1
  const pending = new Map<number, () => void>()

  const setTimeoutFn = ((cb: () => void) => {
    const id = nextId++
    pending.set(id, cb)
    return id as unknown as ReturnType<typeof setTimeout>
  }) as unknown as typeof setTimeout

  const clearTimeoutFn = ((id: ReturnType<typeof setTimeout>) => {
    pending.delete(id as unknown as number)
  }) as unknown as typeof clearTimeout

  return {
    setTimeoutFn,
    clearTimeoutFn,
    /** 현재 대기 중인 타이머 수. */
    pendingCount: () => pending.size,
    /** 가장 최근에 등록된 타이머 콜백을 실행. (debounce 의미론상 항상 "최신 1개" 만 존재해야 정상.) */
    flushLatest: () => {
      const keys = [...pending.keys()]
      const lastId = keys[keys.length - 1]
      if (lastId === undefined) return
      const cb = pending.get(lastId)
      pending.delete(lastId)
      cb?.()
    },
  }
}

describe('createDebouncedFetcher — 기본 동작', () => {
  it('단일 호출은 delayMs 뒤 load 를 실행하고 그 결과로 resolve 된다', async () => {
    const { createDebouncedFetcher } = await loadModule()
    const timers = createControlledTimers()
    const load = vi.fn(async () => 'result-1')

    const debounced = createDebouncedFetcher<string>({
      delayMs: 300,
      setTimeoutFn: timers.setTimeoutFn,
      clearTimeoutFn: timers.clearTimeoutFn,
    })

    const promise = debounced(load)
    // 아직 타이머가 fire 되지 않았으므로 load 는 호출되지 않는다.
    expect(load).not.toHaveBeenCalled()
    expect(timers.pendingCount()).toBe(1)

    // 타이머 fire → load 실행 → promise resolve.
    timers.flushLatest()
    await expect(promise).resolves.toBe('result-1')
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('load 가 reject 하면 반환 promise 도 동일한 에러로 reject 된다', async () => {
    const { createDebouncedFetcher } = await loadModule()
    const timers = createControlledTimers()
    const boom = new Error('boom')
    const load = vi.fn(async () => {
      throw boom
    })

    const debounced = createDebouncedFetcher<string>({
      delayMs: 300,
      setTimeoutFn: timers.setTimeoutFn,
      clearTimeoutFn: timers.clearTimeoutFn,
    })

    const promise = debounced(load)
    timers.flushLatest()
    await expect(promise).rejects.toBe(boom)
  })
})

describe('createDebouncedFetcher — coalescing 의미론', () => {
  it('delayMs 이내 연속 호출은 오직 마지막 load 만 실행한다', async () => {
    const { createDebouncedFetcher } = await loadModule()
    const timers = createControlledTimers()
    const loadA = vi.fn(async () => 'A')
    const loadB = vi.fn(async () => 'B')
    const loadC = vi.fn(async () => 'C')

    const debounced = createDebouncedFetcher<string>({
      delayMs: 300,
      setTimeoutFn: timers.setTimeoutFn,
      clearTimeoutFn: timers.clearTimeoutFn,
    })

    // 3번 연속 호출 — 마지막 loadC 만 실제로 실행되어야 한다.
    const p1 = debounced(loadA)
    const p2 = debounced(loadB)
    const p3 = debounced(loadC)
    expect(timers.pendingCount()).toBe(1) // 이전 타이머는 clear, 최신만 대기.

    timers.flushLatest()

    const [r1, r2, r3] = await Promise.all([p1, p2, p3])
    expect(r1).toBe('C')
    expect(r2).toBe('C')
    expect(r3).toBe('C')

    expect(loadA).not.toHaveBeenCalled()
    expect(loadB).not.toHaveBeenCalled()
    expect(loadC).toHaveBeenCalledTimes(1)
  })

  it('마지막 load 가 reject 하면 대기 중 모든 promise 가 동일 에러로 reject 된다', async () => {
    const { createDebouncedFetcher } = await loadModule()
    const timers = createControlledTimers()
    const boom = new Error('latest failed')
    const loadA = vi.fn(async () => 'A')
    const loadB = vi.fn(async () => {
      throw boom
    })

    const debounced = createDebouncedFetcher<string>({
      delayMs: 300,
      setTimeoutFn: timers.setTimeoutFn,
      clearTimeoutFn: timers.clearTimeoutFn,
    })

    const p1 = debounced(loadA)
    const p2 = debounced(loadB)

    timers.flushLatest()
    // p1/p2 모두 동일한 (latest load 의) rejection 을 받는다.
    await expect(p1).rejects.toBe(boom)
    await expect(p2).rejects.toBe(boom)
    // 이전 load 는 실행 자체가 없었어야 한다.
    expect(loadA).not.toHaveBeenCalled()
  })

  it('타이머 fire 이후의 새 호출은 별개의 debounce 사이클을 시작한다', async () => {
    const { createDebouncedFetcher } = await loadModule()
    const timers = createControlledTimers()

    const debounced = createDebouncedFetcher<number>({
      delayMs: 300,
      setTimeoutFn: timers.setTimeoutFn,
      clearTimeoutFn: timers.clearTimeoutFn,
    })

    const load1 = vi.fn(async () => 1)
    const p1 = debounced(load1)
    timers.flushLatest()
    await expect(p1).resolves.toBe(1)

    // 두 번째 사이클 — 첫 번째와 독립적이어야 한다.
    const load2 = vi.fn(async () => 2)
    const p2 = debounced(load2)
    expect(timers.pendingCount()).toBe(1)
    timers.flushLatest()
    await expect(p2).resolves.toBe(2)

    expect(load1).toHaveBeenCalledTimes(1)
    expect(load2).toHaveBeenCalledTimes(1)
  })
})

describe('createDebouncedFetcher — 타이머 정리', () => {
  it('새 호출은 이전 타이머를 clearTimeoutFn 으로 정리한다 (리소스 누수 방지)', async () => {
    const { createDebouncedFetcher } = await loadModule()
    const realTimers = createControlledTimers()
    const clearSpy = vi.fn(realTimers.clearTimeoutFn)

    const debounced = createDebouncedFetcher<string>({
      delayMs: 300,
      setTimeoutFn: realTimers.setTimeoutFn,
      clearTimeoutFn: clearSpy as unknown as typeof clearTimeout,
    })

    debounced(async () => 'a')
    debounced(async () => 'b')
    debounced(async () => 'c')

    // 첫 호출 시에는 clear 할 타이머가 없으므로 clearSpy 는 호출되지 않는다.
    // 2,3 번째 호출에서 정확히 2번 clearTimeout 이 호출되어야 한다.
    expect(clearSpy).toHaveBeenCalledTimes(2)
    // 최종적으로 대기 중인 타이머는 정확히 1개(최신 c 용).
    expect(realTimers.pendingCount()).toBe(1)
  })
})

// ----------------------------------------------------------------------------
// (4) 상수 노출
// ----------------------------------------------------------------------------
describe('노출된 상수', () => {
  it('EVENT_DEBOUNCE_DEFAULT_MS 는 설계 §8-3 의 300ms 와 일치한다', async () => {
    const { EVENT_DEBOUNCE_DEFAULT_MS } = await loadModule()
    expect(EVENT_DEBOUNCE_DEFAULT_MS).toBe(300)
  })

  it('EVENT_CACHE_DEFAULT_MAX_ENTRIES 는 양의 정수이며 단일 사용자 월 네비게이션 용도에 충분하다', async () => {
    const { EVENT_CACHE_DEFAULT_MAX_ENTRIES } = await loadModule()
    expect(Number.isInteger(EVENT_CACHE_DEFAULT_MAX_ENTRIES)).toBe(true)
    expect(EVENT_CACHE_DEFAULT_MAX_ENTRIES).toBeGreaterThanOrEqual(8)
  })
})
