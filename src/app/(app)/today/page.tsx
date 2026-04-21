import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm'

import { db } from '@/db'
import { labels, taskLabels, tasks, users } from '@/db/schema'
import { requireUserId } from '@/lib/session'
import {
  getZonedYMD,
  startOfDayInZone,
} from '@/lib/calendar/month'
import {
  getGoogleCalClientForUser,
  GoogleAuthRevokedError,
} from '@/lib/google-cal/client'
import { listCalendarEvents } from '@/lib/google-cal/events'
import type { GoogleCalendarEvent } from '@/lib/google-cal/events'
import { hexToLabelColor } from '@/components/todogram/labels'

import {
  TodayRouteClient,
  type TodayRouteLabel,
  type TodayRouteStreamItem,
} from './today-route-client'

// ============================================================================
// /today 서버 페이지 — Phase 4 U1 (Today View) + Phase 6 P3 연계 SSR 조립자
// ============================================================================
// - 역할: Today View 의 서버 데이터 조립자. 다음을 수행한다.
//     1) `requireUserId()` 로 세션 확인 (middleware 가 실제 가드, 여기서는 userId 취득용).
//     2) users 테이블에서 timezone / googleAuthStatus 조회.
//     3) 사용자 timezone 기준 오늘 00:00 ~ +7일 00:00 범위의 태스크를 한 번에 조회
//        (Today / Tomorrow / This Week 세 스코프 모두 이 범위 안에서 파생).
//     4) 해당 태스크의 task_labels + labels 를 조인해 label id/name/color 를 매핑.
//     5) 같은 범위의 Google Calendar 이벤트를 조회 (단, googleAuthStatus='active' 인
//        경우만. revoked/expired 또는 일시 오류 시 task-only 로 graceful degrade).
//     6) tasks + events 를 TodayRouteStreamItem[] 로 정규화(UTC epoch ms 기준 startMs 동반)
//        해 클라이언트에 주입. 클라이언트가 scope(today/tomorrow/week) 에 따라 필터링.
//
// - 캐싱 정책: Server Component 는 매 요청 실행되지만 tasks 는 DB 쿼리 1회,
//   events 는 Google API 요청 1회(7일 범위) 로 가볍다. calendar/page.tsx 처럼
//   모듈 레벨 이벤트 캐시를 두지 않는 이유: 일주일 범위는 월 범위보다 자주 갱신되고
//   (이월/신규 태스크), 사용자가 /today 를 자주 새로고침해도 200ms 내외로 응답.
//   v1.5 부터 Google events 가 반복 호출 병목이 되면 캐시 도입 고려.
//
// - v1 스코프:
//     · 'today'    : [todayStart, todayStart + 1d)
//     · 'tomorrow' : [todayStart + 1d, todayStart + 2d)
//     · 'week'     : [todayStart, todayStart + 7d)  ← 쿼리 범위가 이것과 동일
//   'week' 는 "오늘부터 이후 7일" 이며 "이번 주(일~토)" 가 아니다. 이는 approved.json
//   today-view-20260417 의 spec 이다. 추후 주 단위 뷰가 필요해지면 별도 scope 추가.
// ============================================================================

export default async function TodayPage() {
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
    /* middleware 가 세션을 보장하므로 여기에 도달하면 DB 상태 이상 — 명시적 실패. */
    throw new Error(`사용자를 찾을 수 없습니다: userId=${userId}`)
  }

  const timezone = user.timezone
  const locale = 'ko' as const

  /* --- 2) 조회 범위 계산 (오늘 00:00 ~ +7일 00:00, 사용자 timezone 기준) ---
   * 'today'/'tomorrow'/'week' 세 탭이 모두 이 범위에서 나오므로 한 번만 쿼리한다. */
  const now = new Date()
  const { year, month, day } = getZonedYMD(now, timezone)
  const rangeStart = startOfDayInZone(year, month, day, timezone)
  const rangeEnd = new Date(rangeStart.getTime() + 7 * 24 * 60 * 60 * 1000)

  /* 'today' / 'tomorrow' 탭 경계 — 클라이언트 필터 기준. */
  const todayStartMs = rangeStart.getTime()
  const tomorrowStartMs = todayStartMs + 24 * 60 * 60 * 1000
  const weekEndMs = rangeEnd.getTime()

  /* --- 3) 범위 내 사용자 태스크 조회 ---
   * dueAt 이 NULL 인 '언젠가' 태스크는 여기서 제외 (Today View 는 시간축 기반).
   * 정렬은 dueAt ASC → id ASC (같은 시각의 타이브레이커). */
  const rangeTasks = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        gte(tasks.dueAt, rangeStart),
        lt(tasks.dueAt, rangeEnd),
      ),
    )
    .orderBy(asc(tasks.dueAt), asc(tasks.id))

  /* --- 4) labels 전량 (filter rail 에 노출) + task_labels 조인 --- */
  const userLabelRows = await db
    .select()
    .from(labels)
    .where(eq(labels.userId, userId))
    .orderBy(asc(labels.position), asc(labels.id))

  /* 태스크당 첫 번째 라벨 1개만 취한다 (v1 단일 라벨 정책). ownership 이중 가드. */
  const taskLabelMap = new Map<number, { labelId: string; name: string }>()
  /* labelId → LabelChipColor slug 빠른 조회 (TodayStreamItem.labelColor 주입용). */
  const labelColorBySlug = new Map<string, ReturnType<typeof hexToLabelColor>>()
  for (const l of userLabelRows) {
    labelColorBySlug.set(String(l.id), hexToLabelColor(l.color))
  }

  if (rangeTasks.length > 0) {
    const taskIds = rangeTasks.map(t => t.id)
    const joined = await db
      .select({
        taskId: taskLabels.taskId,
        labelId: labels.id,
        labelName: labels.name,
      })
      .from(taskLabels)
      .innerJoin(labels, eq(taskLabels.labelId, labels.id))
      .where(
        and(eq(labels.userId, userId), inArray(taskLabels.taskId, taskIds)),
      )
    for (const row of joined) {
      if (!taskLabelMap.has(row.taskId)) {
        taskLabelMap.set(row.taskId, {
          labelId: String(row.labelId),
          name: row.labelName,
        })
      }
    }
  }

  /* --- 5) Google events 조회 (graceful degradation) --- */
  let events: GoogleCalendarEvent[] = []
  let showReauthBanner = user.googleAuthStatus !== 'active'

  if (user.googleAuthStatus === 'active') {
    try {
      const client = await getGoogleCalClientForUser(userId)
      events = await listCalendarEvents(client, {
        timeMin: rangeStart,
        timeMax: rangeEnd,
      })
    } catch (err) {
      if (err instanceof GoogleAuthRevokedError) {
        /* 401 invalid_grant → revoked 전이 후 task-only 로 폴백 + 배너 노출. */
        events = []
        showReauthBanner = true
      } else {
        /* 5xx/네트워크 장애 — 배너 없이 task-only. 로그만 남기고 다음 렌더에서 회복. */
        console.error('[today] Google events fetch 실패:', err)
        events = []
      }
    }
  }

  /* --- 6) TodayRouteStreamItem 배열 정규화 --- */
  /* 내부 태스크 → stream item */
  const taskItems: TodayRouteStreamItem[] = rangeTasks.map(task => {
    const dueAt = task.dueAt instanceof Date ? task.dueAt : new Date(task.dueAt as unknown as string)
    const startMs = dueAt.getTime()
    const label = taskLabelMap.get(task.id)
    const labelId = label?.labelId ?? ''
    const labelText = label?.name ?? (locale === 'ko' ? '라벨 없음' : 'No label')
    const labelColor = label ? labelColorBySlug.get(label.labelId) : undefined
    return {
      id: `task-${task.id}`,
      taskId: task.id,
      kind: 'mine',
      startMs,
      time: formatTime(dueAt, timezone),
      title: task.title,
      label: labelId || 'none',
      labelText,
      labelColor,
      completed: task.status === 'done',
      note: task.location ?? undefined,
    }
  })

  /* 외부 Google 이벤트 → stream item. all-day(date) 는 startMs = 그 날 00:00 으로
   * 변환하고 time 표기는 '종일' 로. */
  const eventItems: TodayRouteStreamItem[] = []
  for (const ev of events) {
    const startInfo = extractEventStart(ev, timezone)
    if (!startInfo) continue
    /* cancelled 이벤트는 제외 — Google 이 expanded 응답에서도 status='cancelled' 를 보낼 수 있음. */
    if (ev.status === 'cancelled') continue

    eventItems.push({
      id: `event-${ev.id}`,
      kind: 'ext',
      startMs: startInfo.startMs,
      time: startInfo.timeText,
      title: ev.summary ?? (locale === 'ko' ? '제목 없음' : 'Untitled'),
      label: 'calendar',
      labelText: locale === 'ko' ? '캘린더' : 'Calendar',
      completed: false,
      note: ev.location ?? undefined,
    })
  }

  /* 합치고 시간순 정렬. 같은 시각이면 내부 태스크가 먼저. */
  const allItems: TodayRouteStreamItem[] = [...taskItems, ...eventItems].sort(
    (a, b) => {
      if (a.startMs !== b.startMs) return a.startMs - b.startMs
      if (a.kind !== b.kind) return a.kind === 'mine' ? -1 : 1
      return a.id.localeCompare(b.id)
    },
  )

  /* --- 7) userLabels → TodayRouteLabel (FilterRail 용) --- */
  const userLabelsForView: TodayRouteLabel[] = userLabelRows.map(l => ({
    id: String(l.id),
    name: l.name,
    color: hexToLabelColor(l.color),
  }))

  /* TaskFormSheet 의 availableLabels 도 같은 형태 재사용 가능(id/name/color). */

  return (
    <TodayRouteClient
      initialItems={allItems}
      userLabels={userLabelsForView}
      todayStartMs={todayStartMs}
      tomorrowStartMs={tomorrowStartMs}
      weekEndMs={weekEndMs}
      timezone={timezone}
      locale={locale}
      showReauthBanner={showReauthBanner}
    />
  )
}

// ----------------------------------------------------------------------------
// 내부 유틸 — 서버 전용, 클라이언트로 넘지 않는다.
// ----------------------------------------------------------------------------

/**
 * Date 를 사용자 timezone 기준 "HH:mm" 문자열로 포맷.
 * Intl.DateTimeFormat 의 hourCycle='h23' 으로 0~23시 고정 (한국 관습 + Quiet Layer 의
 * 정보성 표기에 맞춤).
 */
function formatTime(instant: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant)
  const hour = parts.find(p => p.type === 'hour')?.value ?? '00'
  const minute = parts.find(p => p.type === 'minute')?.value ?? '00'
  return `${hour}:${minute}`
}

/**
 * Google 이벤트의 시작 시각을 `{ startMs, timeText }` 로 추출.
 *
 * - `start.dateTime` (RFC3339): 해당 timezone 기준 "HH:mm" 포맷.
 * - `start.date` (YYYY-MM-DD all-day): 해당 날짜의 사용자 timezone 자정 UTC ms +
 *   timeText='종일'. all-day 이벤트는 정확한 시각이 없어 정렬은 날짜 기준이면 충분.
 * - 둘 다 없으면 null — 호출자가 skip.
 */
function extractEventStart(
  ev: GoogleCalendarEvent,
  timezone: string,
): { startMs: number; timeText: string } | null {
  const start = ev.start
  if (!start) return null
  if (start.dateTime) {
    const d = new Date(start.dateTime)
    if (Number.isNaN(d.getTime())) return null
    return { startMs: d.getTime(), timeText: formatTime(d, timezone) }
  }
  if (start.date) {
    /* 'YYYY-MM-DD' 를 사용자 timezone 자정 UTC 로 해석. */
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(start.date)
    if (!match) return null
    const y = Number.parseInt(match[1] ?? '', 10)
    const m = Number.parseInt(match[2] ?? '', 10)
    const day = Number.parseInt(match[3] ?? '', 10)
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(day)) {
      return null
    }
    const midnight = startOfDayInZone(y, m, day, timezone)
    return { startMs: midnight.getTime(), timeText: '종일' }
  }
  return null
}
