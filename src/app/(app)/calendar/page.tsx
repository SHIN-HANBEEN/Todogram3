import { and, eq, gte, inArray, lt } from 'drizzle-orm'

import { db } from '@/db'
import { tasks, taskLabels, labels, users } from '@/db/schema'
import { requireUserId } from '@/lib/session'
import {
  firstDayOfMonthInZone,
  firstDayOfNextMonthInZone,
  getZonedYMD,
  todayDateKey,
} from '@/lib/calendar/month'
import { aggregateMonth } from '@/lib/calendar/aggregate'
import {
  getGoogleCalClientForUser,
  GoogleAuthRevokedError,
} from '@/lib/google-cal/client'
import { listCalendarEvents } from '@/lib/google-cal/events'
import {
  createEventCache,
  EVENT_CACHE_TTL_MS,
} from '@/lib/google-cal/cache'
import type { GoogleCalendarEvent } from '@/lib/google-cal/events'
import type { LabelId } from '@/components/todogram/labels'
import { CalendarRouteClient } from './calendar-route-client'

// ============================================================================
// /calendar 서버 페이지 — Phase 4 U1-E1
// ============================================================================
// - 역할: Screen A(월 그리드) + Screen B(하루 상세) 의 서버 조립자. 다음을 수행한다.
//     1) `requireUserId()` 로 세션 확인(실제 세션 가드는 middleware 가 이미 수행 —
//        여기서는 userId 만 얻는다).
//     2) users 테이블에서 timezone / googleAuthStatus 조회.
//     3) `?month=YYYY-MM` 쿼리를 파싱해 기준 월을 정함. 없으면 "오늘 기준 이번 달".
//     4) 해당 월 범위의 tasks 를 `(userId, dueAt ∈ [monthStart, monthEnd))` 로 조회.
//     5) 해당 tasks 의 task_labels + labels 를 조인해 `taskLabelMap: Map<taskId, labelId>`
//        와 `labelNameMap: Map<labelId(string), 표시명>` 을 구성. taskLabelMap 은
//        aggregator 의 라벨 해소용, labelNameMap 은 ledger LabelChip 텍스트용.
//     6) G3: 모듈-레벨 event cache 에 같은 (userId, monthStart, monthEnd) 범위가 있으면
//        재사용 — 5분 이내 월 네비게이션에서 Google API 재호출을 생략한다.
//     7) G4: `getGoogleCalClientForUser` + `listCalendarEvents` 를 try/catch 로 감싸
//        `GoogleAuthRevokedError` 를 catch 해 events: [] + showReauthBanner: true 로 대체.
//     8) `aggregateMonth` 로 cells 배열 생성. 초기 선택 dateKey / 월 라벨 / 월 네비
//        URL 3종을 계산해 `CalendarRouteClient` 에 props 로 전달.
// - 캐시 전략: 이 페이지는 Server Component 로 매번 실행되지만, tasks 는 DB,
//   events 는 G3 module-level cache 로 O(1) 재사용 → 월 네비게이션 클릭이 빠르게 반응.
// - 월 네비게이션은 URL 기반(`?month=YYYY-MM`). Next.js 가 searchParams 변경을 인지해
//   페이지를 다시 렌더하므로 클라이언트 월 상태가 불필요하다.
// ============================================================================

// ----------------------------------------------------------------------------
// G3: 모듈-레벨 이벤트 캐시 인스턴스.
// - Vercel 같은 서버리스에서는 콜드 스타트마다 비워지지만 그 경우에도 한 번만 API
//   가 다녀오면 복구되므로 수용 가능. TTL 은 설계 §8-3 과 동일한 5분.
// - 캐시 키는 (userId, timeMin, timeMax) — 사용자/월마다 독립 엔트리.
// ----------------------------------------------------------------------------
const eventCache = createEventCache({ ttlMs: EVENT_CACHE_TTL_MS })

/**
 * `?month=YYYY-MM` 쿼리를 정수 튜플로 파싱. 값이 유효하지 않으면 `null` 을 반환해
 * 호출자가 "오늘 기준 이번 달" 로 폴백하도록 한다.
 *
 * 유효성:
 *  - 정확히 `YYYY-MM` 포맷이어야 한다.
 *  - 월은 01~12 범위.
 *  - 연도는 1970~9999 범위(과거/미래 한계는 실용 수준으로 넉넉히).
 */
function parseMonthQuery(
  raw: string | undefined
): { year: number; month: number } | null {
  if (!raw) return null
  const match = /^(\d{4})-(\d{2})$/.exec(raw)
  if (!match) return null
  const year = Number.parseInt(match[1] ?? '', 10)
  const month = Number.parseInt(match[2] ?? '', 10)
  if (!Number.isInteger(year) || year < 1970 || year > 9999) return null
  if (!Number.isInteger(month) || month < 1 || month > 12) return null
  return { year, month }
}

/** (year, month) → "YYYY-MM" 쿼리 문자열. */
function toMonthQuery(year: number, month: number): string {
  const y = String(year).padStart(4, '0')
  const m = String(month).padStart(2, '0')
  return `${y}-${m}`
}

/** 한 달 뒤로 이동. 12월이면 연도 +1. */
function nextMonth(year: number, month: number): { year: number; month: number } {
  if (month === 12) return { year: year + 1, month: 1 }
  return { year, month: month + 1 }
}

/** 한 달 앞으로 이동. 1월이면 연도 -1. */
function prevMonth(year: number, month: number): { year: number; month: number } {
  if (month === 1) return { year: year - 1, month: 12 }
  return { year, month: month - 1 }
}

/** "2026년 4월" / "April 2026" 같은 월 라벨. Intl 로 로케일 반영. */
function formatMonthLabel(
  year: number,
  month: number,
  locale: 'ko' | 'en'
): string {
  /* Date.UTC(y, m-1, 1) 은 해당 월 UTC 1일 — 월/연 추출 용도로만 쓰므로
   * timezone 보정이 필요 없다. Intl 이 그대로 로케일 포맷으로 렌더한다. */
  const instant = new Date(Date.UTC(year, month - 1, 1, 12, 0, 0))
  if (locale === 'ko') {
    /* ko-KR 기본 포맷은 "2026년 4월" — 원하는 형태와 일치. */
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    }).format(instant)
  }
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(instant)
}

/**
 * Next.js 15 의 Server Component 페이지. `searchParams` 는 Promise 로 들어오므로
 * async 로 await 하여 비워낸 뒤 사용한다.
 */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const userId = await requireUserId()

  /* --- 1) 사용자 timezone / googleAuthStatus 조회 --- */
  const [user] = await db
    .select({
      timezone: users.timezone,
      googleAuthStatus: users.googleAuthStatus,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!user) {
    /* 세션 상에는 유효한 userId 가 있었는데 DB 에 없으면 계정이 삭제되었거나 DB 가
     * 초기화된 이례적 상태. 이 경우 서버가 빈 화면보다 명확한 에러를 던지도록 한다.
     * middleware 가 이미 세션을 보장하므로 실제 도달할 수 없는 경로에 가깝다. */
    throw new Error(`사용자를 찾을 수 없습니다: userId=${userId}`)
  }

  const timezone = user.timezone
  const locale = 'ko' as const

  /* --- 2) 기준 월 해소 --- */
  const params = await searchParams
  const parsed = parseMonthQuery(params?.month)
  const now = new Date()
  const nowYMD = getZonedYMD(now, timezone)
  const { year, month } = parsed ?? { year: nowYMD.year, month: nowYMD.month }

  const monthStart = firstDayOfMonthInZone(year, month, timezone)
  const monthEnd = firstDayOfNextMonthInZone(year, month, timezone)

  /* --- 3) 해당 월 범위의 tasks 조회 --- */
  const monthTasks = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        gte(tasks.dueAt, monthStart),
        lt(tasks.dueAt, monthEnd)
      )
    )

  /* --- 4) task_labels + labels 조인해 taskLabelMap / labelNameMap 구성 ---
   * v1 정책: task 는 0 또는 1 개의 라벨. 여러 개가 저장돼 있으면 첫 번째 한 건만 사용.
   * 네트워크 왕복을 한 번에 묶고 싶어 inArray 로 한 쿼리에 해결. */
  const taskLabelMap = new Map<number, LabelId>()
  const labelNameMap = new Map<string, string>()
  if (monthTasks.length > 0) {
    const taskIds = monthTasks.map(t => t.id)
    const rows = await db
      .select({
        taskId: taskLabels.taskId,
        labelId: labels.id,
        labelName: labels.name,
      })
      .from(taskLabels)
      .innerJoin(labels, eq(taskLabels.labelId, labels.id))
      .where(
        and(
          eq(labels.userId, userId),
          inArray(taskLabels.taskId, taskIds)
        )
      )
    for (const row of rows) {
      const labelIdStr = String(row.labelId)
      if (!taskLabelMap.has(row.taskId)) {
        /* 첫 번째 한 건만 — v1 단일 라벨 전제 */
        taskLabelMap.set(row.taskId, labelIdStr)
      }
      labelNameMap.set(labelIdStr, row.labelName)
    }
  }

  /* --- 5) Google events 조회 (G3 캐시 → G4 graceful degradation) --- */
  let events: GoogleCalendarEvent[] = []
  let showReauthBanner = user.googleAuthStatus !== 'active'

  if (user.googleAuthStatus === 'active') {
    const cached = eventCache.get(userId, monthStart, monthEnd)
    if (cached) {
      events = cached
    } else {
      try {
        const client = await getGoogleCalClientForUser(userId)
        const fetched = await listCalendarEvents(client, {
          timeMin: monthStart,
          timeMax: monthEnd,
        })
        events = fetched
        eventCache.set(userId, monthStart, monthEnd, fetched)
      } catch (err) {
        if (err instanceof GoogleAuthRevokedError) {
          /* G4: revoked 전이 후에는 task-only 로 페이지를 계속 렌더한다. 상단에
           * 재로그인 배너만 띄우고 events 는 빈 배열로 대체. 캐시도 클리어해
           * 재시도 시 stale 데이터를 돌려주지 않도록 한다. */
          eventCache.clear()
          events = []
          showReauthBanner = true
        } else {
          /* 5xx / 네트워크 장애 같은 일시 오류는 서버 로그에만 기록하고 task-only
           * 로 폴백. 사용자에게는 별도 배너를 띄우지 않는다 — 다음 리렌더에서
           * 회복 가능성이 높고, 매번 띄우면 Quiet Layer 원칙과 충돌. */
          console.error('[calendar] Google events fetch 실패:', err)
          events = []
        }
      }
    }
  }

  /* --- 6) aggregate 로 cells 생성 --- */
  const { cells } = aggregateMonth(
    {
      monthStart,
      monthEnd,
      tasks: monthTasks,
      events,
      taskLabelMap,
      timezone,
      locale,
    },
    { now }
  )

  /* --- 7) 초기 선택 dateKey: 오늘이 이 월에 들어있으면 오늘, 아니면 월 1일 --- */
  const currentMonthKey = toMonthQuery(year, month)
  const todayKey = todayDateKey(timezone, now)
  const todayMonthKey = toMonthQuery(nowYMD.year, nowYMD.month)
  const initialSelectedDateKey =
    todayMonthKey === currentMonthKey
      ? todayKey
      : (cells.find(c => c.inCurrentMonth)?.dateKey ?? todayKey)

  /* --- 8) 월 네비 URL 3종 --- */
  const prev = prevMonth(year, month)
  const next = nextMonth(year, month)
  const prevMonthHref = `/calendar?month=${toMonthQuery(prev.year, prev.month)}`
  const nextMonthHref = `/calendar?month=${toMonthQuery(next.year, next.month)}`
  /* 현재 월이 곧 오늘의 월이면 "오늘" 바로가기 버튼을 숨긴다(중복 탐색 방지). */
  const todayHref =
    todayMonthKey === currentMonthKey ? null : '/calendar'

  const monthLabel = formatMonthLabel(year, month, locale)

  return (
    <CalendarRouteClient
      cells={cells}
      year={year}
      month={month}
      timezone={timezone}
      locale={locale}
      weekStart="sunday"
      initialSelectedDateKey={initialSelectedDateKey}
      labelNameMap={labelNameMap}
      prevMonthHref={prevMonthHref}
      nextMonthHref={nextMonthHref}
      todayHref={todayHref}
      monthLabel={monthLabel}
      showReauthBanner={showReauthBanner}
    />
  )
}
