import type {
  AggregateMonthInput,
  CalendarDay,
  CalendarGridCell,
  CalendarItem,
  CalendarMonth,
  TaskStatus,
} from './types'
import { DEFAULT_FALLBACK_LABEL } from './types'
import type { GoogleCalendarEvent } from '@/lib/google-cal/events'
import type { Task } from '@/db/schema'
import { CALENDAR_LABEL_ID, type LabelId } from '@/components/todogram/labels'
import {
  buildMonthGridDates,
  toDateKey,
  todayDateKey,
  type WeekStart,
} from './month'

// ============================================================================
// Calendar 월 aggregator (Phase 4 - U1)
// ============================================================================
// - 역할: DB tasks + Google Calendar events 를 "하루 단위" 로 묶고 시간순 정렬.
//   결과를 `Map<dateKey, CalendarDay>` 로 반환해 Screen A 셀 / Screen B ledger
//   모두가 O(1) 조회로 해당 날짜의 아이템을 꺼낼 수 있도록 한다.
// - 입력은 이미 "해당 월 범위" 로 서버가 걸러 들어오는 것을 전제한다. 이 함수는
//   추가 필터링/네트워크 호출을 하지 않는다(순수 함수, 테스트 용이).
// - 외부 이벤트는 `clickDisabled: true` + `labelId: CALENDAR_LABEL_ID` 로 고정.
//   DESIGN.md + approved.json 룰: 사용자가 임의 편집/상세 진입 불가.
// - 정렬 규칙: 종일(all-day) 먼저 → 시간 지정 이벤트는 startAt 오름차순 → 같은
//   시각이면 task 우선(사용자 본인의 의도가 먼저 렌더되도록). 동시각 event 간
//   에는 id 사전순으로 tie-breaker.
// ============================================================================

export interface AggregateMonthOptions {
  /** 월 그리드를 일요일 시작으로 할지(기본) 월요일 시작으로 할지. */
  weekStart?: WeekStart
  /** 현재 시각(테스트 주입용). */
  now?: Date
}

/**
 * 월 범위 집계 결과 + 7×N 그리드 셀 배열을 함께 반환.
 *
 * 반환 구조를 하나로 묶는 이유:
 *  - Screen A 는 `cells` 만 순회하면 렌더가 끝난다 — 7개씩 쪼개 주 단위로 출력.
 *  - Screen B 는 `month.byDate.get(dateKey)` 로 선택된 날짜의 ledger 를 꺼낸다.
 *  - `month.totalStatusCount` 는 상단 요약에 사용 가능.
 */
export interface AggregatedMonth {
  month: CalendarMonth
  cells: CalendarGridCell[]
}

export function aggregateMonth(
  input: AggregateMonthInput,
  options: AggregateMonthOptions = {}
): AggregatedMonth {
  const { tasks, events, taskLabelMap, timezone, monthStart, monthEnd } = input
  const locale = input.locale ?? 'ko'
  const now = options.now ?? new Date()
  const weekStart = options.weekStart ?? 'sunday'

  // 1) task 아이템 생성.
  const taskItems: CalendarItem[] = tasks
    .filter(task => task.dueAt !== null && task.dueAt !== undefined)
    .map(task => {
      const dueAt = task.dueAt as Date
      const labelId = resolveTaskLabelId(task, taskLabelMap)
      return {
        id: `task-${task.id}`,
        originalId: task.id,
        kind: 'task' as const,
        title: task.title,
        labelId,
        timeLabel: formatTimeLabel(dueAt, timezone, locale, /* isAllDay */ false),
        startAt: dueAt,
        endAt: null,
        isAllDay: false,
        status: (task.status as TaskStatus) ?? 'pending',
        note: task.location ?? task.notes ?? undefined,
        clickDisabled: false,
      }
    })

  // 2) event 아이템 생성 — 이벤트 ID 가 비어있거나 status='cancelled' 는 제외.
  const eventItems: CalendarItem[] = events
    .filter(e => e.id && e.status !== 'cancelled')
    .map(e => toCalendarItemFromEvent(e, timezone, locale))

  // 3) 날짜 키로 그룹핑.
  const byDate = new Map<string, CalendarDay>()
  const totalStatusCount = { pending: 0, in_progress: 0, done: 0 }

  const addItem = (item: CalendarItem, dateKey: string) => {
    let day = byDate.get(dateKey)
    if (!day) {
      day = {
        dateKey,
        // Date 는 그날의 자정 UTC instant 를 저장 — ISO 직렬화 시 일관.
        date: parseDateKeyToUtcMidnight(dateKey),
        items: [],
        statusCount: { pending: 0, in_progress: 0, done: 0 },
      }
      byDate.set(dateKey, day)
    }
    day.items.push(item)
    if (item.kind === 'task' && item.status) {
      day.statusCount[item.status] += 1
      totalStatusCount[item.status] += 1
    }
  }

  for (const item of taskItems) {
    // task 는 단일 시점(`dueAt`) 이므로 그 날짜 하나에만 귀속.
    addItem(item, toDateKey(item.startAt, timezone))
  }

  for (const item of eventItems) {
    // 종일(multi-day) 이벤트는 시작~끝 모든 날짜에 복제 삽입.
    // 이벤트의 `endAt` 은 exclusive 이므로(Google 표준) "< endAt" 으로 루프 종료.
    if (!item.isAllDay || !item.endAt) {
      addItem(item, toDateKey(item.startAt, timezone))
      continue
    }

    // 종일 루프: 하루씩 증가.
    const startKey = toDateKey(item.startAt, timezone)
    const endKey = toDateKey(item.endAt, timezone)
    // 단일 종일이면 startKey === endKey 이상으로 한 번만 삽입.
    // 단일 종일은 Google 에서 `start.date = 2026-04-18`, `end.date = 2026-04-19` 로 오므로
    // endKey 는 실제로는 하루 뒤 — exclusive 로 간주.
    let cursor = new Date(item.startAt.getTime())
    let cursorKey = startKey
    let safety = 0
    while (cursorKey !== endKey) {
      addItem({ ...item, id: `${item.id}@${cursorKey}` }, cursorKey)
      cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
      cursorKey = toDateKey(cursor, timezone)
      safety += 1
      if (safety > 366) {
        // 1년 넘는 종일 이벤트는 비현실적 — 무한 루프 안전망.
        break
      }
    }
  }

  // 4) 각 날짜의 items 를 시간순 정렬.
  for (const day of byDate.values()) {
    day.items.sort(compareCalendarItem)
  }

  // 5) 7×N 그리드 셀 구성.
  const todayKey = todayDateKey(timezone, now)
  const gridDates = buildMonthGridDates(
    monthStart.getUTCFullYear() === monthEnd.getUTCFullYear() &&
      monthStart.getUTCMonth() === monthEnd.getUTCMonth() - 1
      ? // 일반 케이스 (같은 해의 인접 월) — 아래 else 와 동일한 결과지만 가독성 유지.
        monthStart.getUTCFullYear()
      : monthStart.getUTCFullYear(),
    // getUTCMonth 는 0-indexed — +1 로 정규화.
    monthStart.getUTCMonth() + 1,
    timezone,
    weekStart
  )

  // UTC 기준으로 month/year 를 뽑으면 timezone 쪽에서 한 달 밀릴 수 있다(사용자 timezone 이
  // UTC 보다 뒤면 monthStart 의 getUTCMonth 가 기대한 월과 다를 수 있음). 보정 — monthStart 는
  // 이미 "timezone 기준 그 달의 1일 00:00" 이므로 timezone 기준 YMD 를 재추출한다.
  // buildMonthGridDates 호출 자체는 이미 timezone 인자를 받고 있어 month 만 맞춰주면 OK.

  const cells: CalendarGridCell[] = gridDates.map(date => {
    const dateKey = toDateKey(date, timezone)
    const day = byDate.get(dateKey)
    const inCurrentMonth =
      date.getTime() >= monthStart.getTime() && date.getTime() < monthEnd.getTime()
    return {
      dateKey,
      date,
      inCurrentMonth,
      isToday: dateKey === todayKey,
      day,
    }
  })

  const month: CalendarMonth = {
    monthStart,
    monthEnd,
    byDate,
    totalStatusCount,
  }

  return { month, cells }
}

// ============================================================================
// 내부 유틸
// ============================================================================

/**
 * tasks 행과 taskLabelMap 을 받아 최종 LabelId 를 해소.
 * 매핑이 없으면 DEFAULT_FALLBACK_LABEL (personal/plum) 로 폴백 — 런타임 깨짐 방지.
 */
function resolveTaskLabelId(
  task: Task,
  labelMap: Map<number, LabelId> | undefined
): LabelId {
  if (!labelMap) return DEFAULT_FALLBACK_LABEL
  return labelMap.get(task.id) ?? DEFAULT_FALLBACK_LABEL
}

/**
 * Google Calendar 이벤트를 CalendarItem 으로 정규화.
 * - 시간 지정 이벤트: start.dateTime / end.dateTime 파싱.
 * - 종일 이벤트: start.date / end.date 를 로컬 자정으로 간주 (exclusive end).
 * - 제목이 빈 경우 "(제목 없음)" / "(Untitled)" 로 폴백.
 */
function toCalendarItemFromEvent(
  event: GoogleCalendarEvent,
  timezone: string,
  locale: 'ko' | 'en'
): CalendarItem {
  const { startAt, endAt, isAllDay } = extractEventInterval(event)
  const fallbackTitle = locale === 'ko' ? '(제목 없음)' : '(Untitled)'
  return {
    id: `event-${event.id}`,
    originalId: event.id,
    kind: 'event',
    title: event.summary?.trim() || fallbackTitle,
    labelId: CALENDAR_LABEL_ID,
    timeLabel: formatTimeLabel(startAt, timezone, locale, isAllDay),
    startAt,
    endAt,
    isAllDay,
    status: undefined,
    note: event.location ?? undefined,
    clickDisabled: true,
  }
}

interface EventInterval {
  startAt: Date
  endAt: Date | null
  isAllDay: boolean
}

/**
 * Google 이벤트의 start/end 필드(둘 중 하나만 설정될 수도 있는 union) 를 정규화.
 * - dateTime 이 있으면 시간 지정, ISO 파싱.
 * - date 만 있으면 종일, 로컬 자정으로 간주.
 * - 둘 다 없으면 에러 대신 now() 폴백 — 실제로 정상 Google 응답에서는 발생하지 않는 경로지만
 *   aggregator 가 throw 하면 월 전체가 비어버리는 것보다 나쁘다.
 */
function extractEventInterval(event: GoogleCalendarEvent): EventInterval {
  const startISO = event.start?.dateTime ?? event.start?.date
  const endISO = event.end?.dateTime ?? event.end?.date
  const isAllDay = !event.start?.dateTime

  const startAt = startISO ? new Date(startISO) : new Date()
  const endAt = endISO ? new Date(endISO) : null

  return { startAt, endAt, isAllDay }
}

/**
 * 시간 문자열 포맷. 종일은 로케일 기준 "종일"/"All day", 아니면 HH:mm (24h).
 * 로컬 표기는 `Intl.DateTimeFormat` 을 사용 — timezone 이 반영된 HH:mm 문자열.
 */
function formatTimeLabel(
  instant: Date,
  timezone: string,
  locale: 'ko' | 'en',
  isAllDay: boolean
): string {
  if (isAllDay) return locale === 'ko' ? '종일' : 'All day'
  return new Intl.DateTimeFormat(locale === 'ko' ? 'ko-KR' : 'en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(instant)
}

/**
 * CalendarItem 정렬 비교자.
 *  1) 종일 먼저(isAllDay=true 가 앞)
 *  2) startAt 오름차순
 *  3) task 먼저, event 뒤
 *  4) id 사전순 (tie-breaker, 안정 정렬 근사)
 */
function compareCalendarItem(a: CalendarItem, b: CalendarItem): number {
  if (a.isAllDay !== b.isAllDay) return a.isAllDay ? -1 : 1
  const t = a.startAt.getTime() - b.startAt.getTime()
  if (t !== 0) return t
  if (a.kind !== b.kind) return a.kind === 'task' ? -1 : 1
  return a.id.localeCompare(b.id)
}

/**
 * `YYYY-MM-DD` 를 UTC 자정 Date 로 복원. CalendarDay.date 는 맵 키와 1:1 대응이 중요하므로
 * timezone 미반영 UTC 자정으로 충분 (렌더러는 dateKey 로만 날짜를 표시).
 */
function parseDateKeyToUtcMidnight(dateKey: string): Date {
  const [yStr, mStr, dStr] = dateKey.split('-')
  const y = Number.parseInt(yStr, 10)
  const m = Number.parseInt(mStr, 10)
  const d = Number.parseInt(dStr, 10)
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0))
}
