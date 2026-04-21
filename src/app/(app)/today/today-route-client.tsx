'use client'

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react'

import { toggleTaskStatus } from '@/actions/tasks'
import type { LabelChipColor } from '@/components/todogram/label-chip'
import {
  FILTER_ALL,
  type FilterValue,
  type LabelId,
} from '@/components/todogram/labels'
import type { TodayHeaderScope } from '@/components/todogram/today-header'
import type { TodayRowKind, TodayStreamItem } from '@/components/todogram/today-row'
import { TodayView } from '@/components/todogram/today-view'
import type { FilterableLabel } from '@/components/todogram/filter-rail'
import {
  TaskFormSheet,
  type TaskFormLabelOption,
} from '@/components/task-form/task-form-sheet'

/* --------------------------------------------------------------------------
 * TodayRouteClient — /today 라우트 전용 클라이언트 래퍼 (Phase 4 U1 + P3 연계)
 *
 * 책임:
 *   1) scope(today/tomorrow/week) 상태 관리 → server 가 준 startMs 기준으로
 *      allItems 를 필터.
 *   2) activeFilter(FilterValue) 상태 관리 → TodayView 내부 matchesFilter 로 전달.
 *   3) 내부 태스크 체크박스 토글 — 낙관적 업데이트 + 서버 `toggleTaskStatus` 호출.
 *      실패 시 snapshot 으로 롤백 (TaskListView 와 동일 패턴).
 *   4) FAB 클릭 시 TaskFormSheet(create 모드) 오픈. 저장되면 revalidatePath 가
 *      서버 페이지를 다시 렌더해 initialItems 로 반영. 편집/삭제 플로우는 v1 에서
 *      Today 뷰에 포함하지 않는다(리스트 뷰 전담). 단, 저장 직후 깜빡임을 줄이기
 *      위해 로컬 items 에 즉시 추가만 한다.
 *   5) 재로그인 배너 표시 (Google OAuth 만료/해지 시).
 *
 * 서버 경계:
 *   - 서버에서 계산한 startMs(사용자 timezone 기준 UTC ms) 를 그대로 신뢰.
 *     클라이언트 로컬 시계에 의존하지 않는다 → Vercel 같은 서버 환경과 사용자
 *     브라우저 시계가 어긋나도 scope 필터가 정확하게 동작.
 * -------------------------------------------------------------------------- */

/** 서버가 주입하는 라벨 정보 — filter rail + TaskFormSheet 공용. */
export interface TodayRouteLabel {
  id: LabelId
  name: string
  color: LabelChipColor
}

/**
 * 서버가 주입하는 stream 아이템. 화면 렌더에 필요한 TodayStreamItem 필드에
 * scope 필터링용 `startMs` 와 (내부 태스크 한정) `taskId` 를 덧붙인 슈퍼셋.
 */
export interface TodayRouteStreamItem {
  /** TodayStreamItem.id — 예: 'task-42' / 'event-abc123'. */
  id: string
  /** 내부 태스크일 때만 존재. 토글/편집 server action 호출용. */
  taskId?: number
  kind: TodayRowKind
  /** 사용자 timezone 기준 시작 시각의 UTC epoch ms. scope 필터에 사용. */
  startMs: number
  time: string
  title: string
  label: LabelId
  labelText: string
  labelColor?: LabelChipColor
  completed?: boolean
  note?: string
}

export interface TodayRouteClientProps {
  /** 서버가 만든 일주일 범위의 전체 stream (task + event 혼합, 시간순). */
  initialItems: TodayRouteStreamItem[]
  /** 사용자 라벨 전량 — FilterRail + TaskFormSheet 에 사용. */
  userLabels: TodayRouteLabel[]
  /** 오늘 00:00 UTC epoch ms (사용자 timezone 기준). */
  todayStartMs: number
  /** 내일 00:00 UTC epoch ms. 'today' 와 'tomorrow' 경계. */
  tomorrowStartMs: number
  /** 오늘 +7일 00:00 UTC epoch ms. 'week' 끝 경계. */
  weekEndMs: number
  /** 사용자 timezone (Intl 식별자). 이 컴포넌트에서는 현재 직접 쓰지 않지만
   *  향후 dueAt 편집 후 재포맷 같은 케이스에 대비해 보관. */
  timezone: string
  /** 로케일. */
  locale?: 'ko' | 'en'
  /** Google 인증 배너 노출 여부. true 이면 상단에 안내 문구. */
  showReauthBanner?: boolean
}

export function TodayRouteClient({
  initialItems,
  userLabels,
  todayStartMs,
  tomorrowStartMs,
  weekEndMs,
  locale = 'ko',
  showReauthBanner = false,
}: TodayRouteClientProps) {
  /* --- 로컬 상태 ------------------------------------------------------- */
  const [items, setItems] = useState<TodayRouteStreamItem[]>(initialItems)
  const [scope, setScope] = useState<TodayHeaderScope>('today')
  const [activeFilter, setActiveFilter] = useState<FilterValue>(FILTER_ALL)
  const [, startTransition] = useTransition()

  /* TaskFormSheet (create 전용) — 편집 기능은 Today 뷰에서는 노출하지 않는다. */
  const [formOpen, setFormOpen] = useState(false)

  /* mutation 실패 시 되돌릴 스냅샷. */
  const snapshotRef = useRef<TodayRouteStreamItem[] | null>(null)

  /* TaskFormSheet 의 availableLabels — 구조가 같으므로 경량 매핑만. */
  const formLabelOptions = useMemo<TaskFormLabelOption[]>(
    () =>
      userLabels.map(l => ({ id: l.id, name: l.name, color: l.color })),
    [userLabels],
  )

  /* FilterRail 의 userLabels — 이름만 유지하는 얕은 뷰 모델. */
  const filterableLabels = useMemo<FilterableLabel[]>(
    () => userLabels.map(l => ({ id: l.id, name: l.name })),
    [userLabels],
  )

  /* FilterRail 의 custom items — buildDefaultFilterItems 가 라벨별 color 를
   * LABEL_COLOR_MAP 에서 찾지만, 사용자 라벨 숫자 id 는 매핑에 없어 moss 로 폴백한다.
   * 여기서 직접 color override 를 주입해 정확한 라벨 색이 칩에 찍히도록 한다. */
  const customFilterItems = useMemo(() => {
    const allLabel = locale === 'ko' ? '전체' : 'All'
    const calendarLabel = locale === 'ko' ? '캘린더' : 'Calendar'
    return [
      { value: FILTER_ALL as FilterValue, label: allLabel },
      {
        value: 'calendar' as FilterValue,
        label: calendarLabel,
        color: 'dust-blue' as LabelChipColor,
      },
      ...userLabels.map(l => ({
        value: l.id as FilterValue,
        label: l.name,
        color: l.color,
      })),
    ]
  }, [userLabels, locale])

  /* --- scope 필터링 ---------------------------------------------------- */
  const scopedItems = useMemo<TodayStreamItem[]>(() => {
    const filtered = items.filter(item => {
      if (scope === 'today') {
        return item.startMs >= todayStartMs && item.startMs < tomorrowStartMs
      }
      if (scope === 'tomorrow') {
        return (
          item.startMs >= tomorrowStartMs &&
          item.startMs < tomorrowStartMs + 24 * 60 * 60 * 1000
        )
      }
      /* week: 오늘 ~ +7일 (서버 조회 범위 전체) */
      return item.startMs >= todayStartMs && item.startMs < weekEndMs
    })
    /* TodayStreamItem 로 좁혀 반환 — 내부용 메타(taskId/startMs) 는 숨긴다. */
    return filtered.map(item => ({
      id: item.id,
      kind: item.kind,
      time: item.time,
      title: item.title,
      label: item.label,
      labelText: item.labelText,
      labelColor: item.labelColor,
      completed: item.completed,
      note: item.note,
    }))
  }, [items, scope, todayStartMs, tomorrowStartMs, weekEndMs])

  /* scope 기준 헤더 날짜 (today 탭은 오늘, tomorrow 는 내일, week 는 오늘). */
  const headerDate = useMemo(() => {
    if (scope === 'tomorrow') return new Date(tomorrowStartMs)
    return new Date(todayStartMs)
  }, [scope, todayStartMs, tomorrowStartMs])

  /* --- 체크박스 토글 --------------------------------------------------- */
  const handleToggleTask = useCallback(
    (streamId: string) => {
      /* streamId 에서 해당 item 을 찾고, 내부 태스크(mine)가 아니면 무시. */
      const target = items.find(i => i.id === streamId)
      if (!target || target.kind !== 'mine' || target.taskId == null) return

      const nextCompleted = !target.completed
      const nextStatus = nextCompleted ? 'done' : 'pending'

      snapshotRef.current = items
      setItems(prev =>
        prev.map(entry =>
          entry.id === streamId
            ? { ...entry, completed: nextCompleted }
            : entry,
        ),
      )

      const taskId = target.taskId
      startTransition(async () => {
        try {
          await toggleTaskStatus(taskId, { status: nextStatus })
          snapshotRef.current = null
        } catch (err) {
          console.error('[TodayRouteClient] toggleTaskStatus 실패:', err)
          if (snapshotRef.current) {
            setItems(snapshotRef.current)
            snapshotRef.current = null
          }
        }
      })
    },
    [items, startTransition],
  )

  /* --- FAB (새 태스크) ------------------------------------------------- */
  const handleCreateTask = useCallback(() => {
    setFormOpen(true)
  }, [])

  /* --- 재로그인 배너 --------------------------------------------------- */
  const reauthCopy =
    locale === 'ko'
      ? 'Google 캘린더 연결이 만료됐어요. 설정에서 다시 연결해주세요.'
      : 'Google Calendar connection expired. Reconnect in settings.'

  return (
    <div className="relative flex min-h-full flex-1 flex-col">
      {showReauthBanner && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 border-b border-border-secondary bg-bg-warning-primary px-4 py-2 text-[13px] text-text-warning-primary"
        >
          <span>{reauthCopy}</span>
          <a
            href="/settings"
            className="font-medium underline underline-offset-2 hover:opacity-80"
          >
            {locale === 'ko' ? '설정' : 'Settings'}
          </a>
        </div>
      )}

      <TodayView
        date={headerDate}
        scope={scope}
        onScopeChange={setScope}
        userLabels={filterableLabels}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        filterItems={customFilterItems}
        items={scopedItems}
        onToggleTask={handleToggleTask}
        onCreateTask={handleCreateTask}
        locale={locale}
      />

      {/* Task 생성 Sheet — Today 뷰에서는 create 전용. 편집/삭제는 /list 에서. */}
      <TaskFormSheet
        mode="create"
        open={formOpen}
        onOpenChange={setFormOpen}
        availableLabels={formLabelOptions}
        locale={locale}
        /* 저장 직후 즉시 로컬 반영은 생략 — server action 의 revalidatePath 가
         * /today 를 다시 렌더해 initialItems 가 갱신된다. 새로 만든 태스크가
         * 현재 scope(today/tomorrow/week) 범위 밖의 dueAt 을 가지면 자연스럽게
         * 보이지 않는 게 맞으므로 낙관적 병합을 굳이 시도하지 않는다. */
      />
    </div>
  )
}
