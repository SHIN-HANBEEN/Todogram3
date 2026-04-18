import type { GoogleCalendarEvent } from '@/lib/google-cal/events'

// ============================================================================
// Google Calendar events 캐시 + debounce (Phase 3 - G3)
// ============================================================================
// - 역할:
//     1) `createEventCache` — in-memory LRU + TTL 캐시. 월 네비게이션 시 같은
//        (userId, timeMin, timeMax) 범위를 5분 이내 재방문하면 Google API 를 다시
//        호출하지 않도록 한다. 설계 §8-3 백그라운드 refresh 주기(5분) 와 동일 TTL.
//     2) `createDebouncedFetcher` — 월 네비게이션을 빠르게 연속할 때(예: →→→)
//        마지막 목적지 한 번만 실제로 가져오도록 load 호출을 지연 + coalescing.
//     3) `buildEventCacheKey` — (userId, timeMin, timeMax) 를 안정적으로 문자열화.
// - G1/G2 와의 관심사 분리:
//     * 인증/토큰 refresh/401 재시도/revoked 는 G1 (`client.ts`) 가 담당.
//     * URL 조립/페이지네이션/응답 병합은 G2 (`events.ts`) 가 담당.
//     * G3 는 "네트워크는 이미 끝났다고 가정하고" 그 앞단에서 캐시 + 디바운스만 얹는다.
// - 서버리스 환경(Vercel) 제약: 이 모듈은 모듈-레벨 Map 만 사용하므로 콜드 스타트마다
//   비워진다. 허용 범위 — 캐시 손실은 1회 추가 fetch 비용일 뿐이고, 동일 프로세스
//   안에서 같은 사용자가 월 네비게이션을 반복하는 게 대표 시나리오라 이 정도로 충분.
// ============================================================================

// ----------------------------------------------------------------------------
// 상수 (설계 수치가 실수로 흔들리지 않도록 한 곳에 모아둔다)
// ----------------------------------------------------------------------------

/** 이벤트 캐시의 기본 TTL. 설계 §8-3 백그라운드 refresh 주기 = 5분. */
export const EVENT_CACHE_TTL_MS = 5 * 60 * 1000

/**
 * 이벤트 캐시의 기본 최대 엔트리 수.
 * 월 네비게이션 1인 사용자 기준: 전/다음 몇 달 + 오늘/주간 뷰 등 32 정도면
 * 현실적으로 축출이 거의 일어나지 않는다. 1인 dogfooding 이 끝나고 멀티 사용자
 * 로 확장할 때 이 값을 늘리거나 per-user sub-map 구조로 진화시킬 수 있다.
 */
export const EVENT_CACHE_DEFAULT_MAX_ENTRIES = 32

/** 월 네비게이션 debounce 기본 지연 시간. 설계 §8-3 = 300ms. */
export const EVENT_DEBOUNCE_DEFAULT_MS = 300

// ----------------------------------------------------------------------------
// 캐시 키 직렬화
// ----------------------------------------------------------------------------

/**
 * (userId, timeMin, timeMax) 튜플을 캐시 키 문자열로 직렬화한다.
 * - `toISOString()` 은 항상 UTC 기반 확장 포맷(`YYYY-MM-DDTHH:mm:ss.sssZ`) 을 생성해
 *   시계/로케일에 독립적이다. 같은 순간을 가리키는 Date 는 동일 문자열이 된다.
 * - 콜론 구분자는 ISO 문자열 내부 콜론과 섞여 있어 보이지만, 필드 수가 3 으로
 *   고정이고 재파싱이 필요 없는 해시 용도라 문제되지 않는다.
 */
export function buildEventCacheKey(
  userId: number,
  timeMin: Date,
  timeMax: Date
): string {
  return `${userId}:${timeMin.toISOString()}:${timeMax.toISOString()}`
}

// ----------------------------------------------------------------------------
// LRU + TTL 이벤트 캐시
// ----------------------------------------------------------------------------

export interface EventCacheOptions {
  /** 엔트리 유효 시간(ms). 기본값은 `EVENT_CACHE_TTL_MS`. */
  ttlMs?: number
  /** 이 수를 초과하면 가장 오래 접근되지 않은 엔트리를 축출. 기본값 32. */
  maxEntries?: number
  /** 현재 시각 (ms) 소스. 기본값은 `Date.now`. 테스트에서 고정 시각 주입. */
  now?: () => number
}

export interface EventCache {
  /** 캐시된 이벤트 배열 반환. 없거나 TTL 경과면 null. 접근 시 recency 갱신. */
  get(
    userId: number,
    timeMin: Date,
    timeMax: Date
  ): GoogleCalendarEvent[] | null
  /** 이벤트 배열을 저장 (upsert). 기존 키 덮어쓸 때도 recency 갱신. */
  set(
    userId: number,
    timeMin: Date,
    timeMax: Date,
    events: readonly GoogleCalendarEvent[]
  ): void
  /** 전체 비움. 로그아웃 / revoked 전이 시 호출. */
  clear(): void
  /** 현재 보관 중인 엔트리 수. */
  readonly size: number
}

interface CacheEntry {
  events: readonly GoogleCalendarEvent[]
  expiresAt: number
}

/**
 * LRU + TTL 이벤트 캐시 팩토리.
 *
 * LRU 구현 세부사항:
 * - `Map` 의 iteration order 가 삽입 순서와 일치한다는 언어 사양(ECMAScript)을
 *   이용해 가장 오래된 엔트리를 O(1) 로 축출한다.
 * - `get` 적중 시 해당 키를 `delete` → `set` 재삽입해 "가장 최근" 위치로 옮긴다.
 * - `set` 시에도 기존 키가 있으면 먼저 `delete` 해서 덮어쓴 엔트리가 "가장 최근" 이 되도록.
 *
 * TTL:
 * - lazy 만료 — 별도 타이머를 돌리지 않고, `get` 호출 시 `now >= expiresAt` 이면
 *   해당 엔트리를 제거하고 null 반환. 서버리스 환경에서 메모리 누수가 누적되지 않도록.
 */
export function createEventCache(options: EventCacheOptions = {}): EventCache {
  const ttlMs = options.ttlMs ?? EVENT_CACHE_TTL_MS
  const maxEntries = options.maxEntries ?? EVENT_CACHE_DEFAULT_MAX_ENTRIES
  const now = options.now ?? (() => Date.now())

  // Map<키, 엔트리> — iteration order 가 recency 순서.
  const store = new Map<string, CacheEntry>()

  return {
    get(userId, timeMin, timeMax) {
      const key = buildEventCacheKey(userId, timeMin, timeMax)
      const entry = store.get(key)
      if (!entry) return null
      if (now() >= entry.expiresAt) {
        // 만료된 엔트리는 즉시 제거. 다음 set 때 축출 경쟁에 섞이지 않게.
        store.delete(key)
        return null
      }
      // recency 갱신 — 삭제 후 재삽입하면 Map iteration 상 가장 뒤(= 최근)가 된다.
      store.delete(key)
      store.set(key, entry)
      return [...entry.events]
    },

    set(userId, timeMin, timeMax, events) {
      const key = buildEventCacheKey(userId, timeMin, timeMax)
      // 기존 키가 있으면 먼저 제거해 순서를 맨 뒤로 재설정.
      if (store.has(key)) {
        store.delete(key)
      }
      // 방어적 복사 — 호출자가 원본을 mutate 해도 캐시가 오염되지 않도록.
      store.set(key, {
        events: [...events],
        expiresAt: now() + ttlMs,
      })
      // 용량 초과 시 가장 오래된 엔트리(iterator 의 첫 원소) 를 축출.
      while (store.size > maxEntries) {
        const oldest = store.keys().next().value
        if (oldest === undefined) break
        store.delete(oldest)
      }
    },

    clear() {
      store.clear()
    },

    get size() {
      return store.size
    },
  }
}

// ----------------------------------------------------------------------------
// Debounced fetcher
// ----------------------------------------------------------------------------

export interface DebouncedFetcherOptions {
  /** 지연 시간(ms). 기본값은 `EVENT_DEBOUNCE_DEFAULT_MS`(= 300ms). */
  delayMs?: number
  /** setTimeout 주입. 기본값은 전역 setTimeout. 테스트에서 controlled timer 주입. */
  setTimeoutFn?: typeof setTimeout
  /** clearTimeout 주입. 기본값은 전역 clearTimeout. */
  clearTimeoutFn?: typeof clearTimeout
}

/** 아직 resolve 되지 않은 대기 중인 호출자들의 resolve/reject 쌍. */
interface Pending<T> {
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

/**
 * "전역(= 인스턴스 전체) debounce" 래퍼 팩토리.
 *
 * 의미론:
 * - 인스턴스를 생성하고 반환된 `fetch(load)` 함수를 여러 번 호출할 수 있다.
 * - `delayMs` 이내 연속 호출되면 **오직 마지막 load 만** 실제로 실행된다.
 *   이전 호출들의 load 는 호출조차 되지 않는다.
 * - 대기 중이던 모든 promise 는 마지막 load 의 결과(또는 에러) 로 동일하게
 *   resolve/reject 된다 — 호출자가 superseded 에러를 따로 다루지 않아도 된다.
 *   (월 네비게이션 UX: 최종 month 의 데이터만 화면에 반영되면 충분.)
 *
 * 사용 예:
 * ```ts
 * const debounced = createDebouncedFetcher<Event[]>()
 * // 컴포넌트의 useEffect 안에서:
 * const events = await debounced(() =>
 *   listCalendarEvents(client, { timeMin, timeMax })
 * )
 * ```
 */
export function createDebouncedFetcher<T>(
  options: DebouncedFetcherOptions = {}
): (load: () => Promise<T>) => Promise<T> {
  const delayMs = options.delayMs ?? EVENT_DEBOUNCE_DEFAULT_MS
  const setTimeoutFn = options.setTimeoutFn ?? setTimeout
  const clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout

  // 현재 대기 중인 타이머 핸들. 새 호출이 들어오면 clear 후 재설치한다.
  let timer: ReturnType<typeof setTimeout> | null = null
  // 가장 최근에 요청된 load. 타이머 fire 시 이 함수를 실행한다.
  let latestLoad: (() => Promise<T>) | null = null
  // 타이머가 fire 되기 전에 쌓인 모든 호출자의 resolve/reject 집합.
  let pending: Pending<T>[] = []

  return (load: () => Promise<T>): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      latestLoad = load
      pending.push({ resolve, reject })

      // 이전 사이클 타이머가 살아있으면 먼저 정리.
      if (timer !== null) {
        clearTimeoutFn(timer)
      }

      timer = setTimeoutFn(() => {
        // 타이머가 fire 되는 순간의 상태를 스냅샷 — 이후 새 호출이 들어와도
        // 이번 실행은 현재 스냅샷 기준으로 완결된다.
        const runLoad = latestLoad
        const waiters = pending
        timer = null
        latestLoad = null
        pending = []

        // runLoad 는 논리적으로 null 일 수 없지만(반드시 한 번 이상 set 됨) 타입
        // 안전을 위해 방어 분기. 실제 경로에서는 발생하지 않음.
        if (!runLoad) {
          for (const w of waiters) w.reject(new Error('debounce: load missing'))
          return
        }

        // async 함수가 동기적으로 throw 하는 경우까지 잡기 위해 try/catch.
        let invocation: Promise<T>
        try {
          invocation = runLoad()
        } catch (err) {
          for (const w of waiters) w.reject(err)
          return
        }

        invocation.then(
          value => {
            for (const w of waiters) w.resolve(value)
          },
          err => {
            for (const w of waiters) w.reject(err)
          }
        )
      }, delayMs)
    })
  }
}
