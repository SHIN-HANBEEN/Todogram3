'use client'

// ============================================================================
// CalendarViewport — Screen A ↔ Screen B drill-down container (Phase 4 - U1)
// ============================================================================
// - 역할: CalendarMonthGrid(오버뷰) 와 CalendarDayDetail(선택일 상세) 를 "수평 슬라이드"
//   2-페인으로 묶어 drill-down 네비게이션을 제공. 날짜 셀 탭 → 우측으로 B 가 들어오고,
//   B 의 뒤로가기/시스템 백 → 좌측으로 A 가 돌아온다.
// - finalized.html (calendar-view-20260418) 의 `.viewport` CSS 패턴을 그대로 이식:
//     · 외곽 컨테이너 `flex` + 두 child 각각 `flex: 0 0 100%` 로 가로 100% 차지
//     · 전환: `transform: translateX(-100%)` + `cubic-bezier(0.32, 0.72, 0.24, 1) 320ms`
//     · `prefers-reduced-motion` 일 때 transition 제거(DESIGN.md §7 Motion 규칙).
// - 상태 업데이트: 태스크 상태 전이를 useTransition 으로 감싸 "낙관적" 느낌을 살리되,
//   실제 낙관적 업데이트는 revalidateTag 후 Next.js 의 cache 재요청으로 처리됨.
//   전환 in-flight 시 해당 item 을 `pendingItemId` 로 표기해 중복 클릭 차단.
// - Screen C(태스크 상세) 는 Phase 4-U6 에서 도입. 여기서는 `onSelectItem?` 콜백만
//   호출하고 슬라이드는 일으키지 않는다. 상위 라우트가 push 로 처리하거나 slideout 을
//   띄우거나 자유롭게 결정.
// - 라우터 동기화는 상위에 위임: 본 컴포넌트는 selectedDateKey 를 내부 state 로 갖되,
//   `onSelectDay?` prop 으로 상위에 통지해 URL 동기화/딥링크가 가능하도록 한다.
//   상위가 `selectedDateKey` 를 controlled 로 주면 그것을 우선한다(controlled/uncontrolled 겸용).
// ============================================================================

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react'
import { cx } from '@/utils/cx'
import type {
  CalendarGridCell,
  CalendarItem,
  TaskStatus,
} from '@/lib/calendar/types'
import type { WeekStart } from '@/lib/calendar/month'
import { CalendarMonthGrid } from './calendar-month-grid'
import { CalendarDayDetail } from './calendar-day-detail'

export interface CalendarViewportProps {
  /** aggregateMonth().cells — 두 스크린이 공유한다. */
  cells: CalendarGridCell[]
  /** 기준 연도 — Screen A grid aria-label 에 사용. */
  year: number
  /** 기준 월(1-12). */
  month: number
  /** 타임존. Screen B 헤더 날짜 포맷에 사용. */
  timezone: string
  /** 로케일. 기본 'ko'. */
  locale?: 'ko' | 'en'
  /** 주 시작 요일. 기본 'sunday'. */
  weekStart?: WeekStart
  /**
   * 선택된 날짜(YYYY-MM-DD). controlled 모드로 사용하려면 상위에서 제공.
   * 미지정 시 내부 state 로 관리하며 초기값은 `initialSelectedDateKey`.
   */
  selectedDateKey?: string
  /**
   * uncontrolled 모드 초기 선택. 보통 "오늘" 또는 "월의 첫째 날" 을 주면 된다.
   * controlled 모드에선 무시.
   */
  initialSelectedDateKey?: string
  /** 날짜 선택이 바뀔 때 통지. URL 동기화/딥링크 용. */
  onSelectDay?: (dateKey: string) => void
  /** 뷰 전환(A↔B) 통지. 라우트 history 관리 훅이 필요할 때 사용. */
  onViewChange?: (view: 'month' | 'day') => void
  /**
   * 태스크 상태 전이를 실제 수행할 server action.
   *  - 서명: `(taskId: number, next: TaskStatus) => Promise<void>`
   *  - viewport 는 useTransition 으로 감싸 pending 상태를 자체 관리.
   *  - 외부 이벤트(kind='event') 는 호출되지 않는다 (CalendarDayRow 에서 차단).
   */
  statusAction?: (taskId: number, next: TaskStatus) => Promise<void>
  /** ledger row 본문 클릭 → Screen C(U6) 진입. 현재는 상위가 처리 결정. */
  onSelectItem?: (item: CalendarItem) => void
  /** 라벨 id → 표시명 매핑. 제공되면 LabelChip 텍스트가 대체. */
  labelNameMap?: Map<string, string>
  /** Screen A 헤더 슬롯 — 월 prev/next/검색 등. 상위 라우트가 주입. */
  monthHeader?: ReactNode
  /**
   * Screen B 헤더 렌더 프롭. `onBack` 을 포함한 인자를 받아 헤더 노드를 반환.
   * render prop 으로 설계한 이유: 뒤로가기 버튼이 viewport 내부 상태(`view='month'`) 를
   * 변경해야 하므로, 상위 JSX 에서 단순히 <BackButton onClick={???}/> 로 쓰기가 어색하다.
   */
  renderDayHeader?: (args: {
    onBack: () => void
    dateKey: string
  }) => ReactNode
  /** 두 스크린 하단 공통 슬롯(바텀 네비 등). 양쪽에 동일 노드가 렌더된다. */
  footer?: ReactNode
  /** 루트 추가 클래스. */
  className?: string
}

/**
 * cells 에서 dateKey 로 CalendarDay 를 찾는다. grid cell 이 leading/trailing 의 out-of-month
 * 이면 `day === undefined` — 그 경우 빈 day 를 반환해 Screen B 가 Quiet Empty 로 렌더되게 한다.
 */
function findDay(
  cells: CalendarGridCell[],
  dateKey: string
): CalendarGridCell['day'] | null {
  const cell = cells.find(c => c.dateKey === dateKey)
  return cell?.day ?? null
}

/**
 * 초기 선택 dateKey 결정 우선순위:
 *  1) controlled `selectedDateKey`
 *  2) uncontrolled `initialSelectedDateKey`
 *  3) cells 중 today 셀
 *  4) cells 중 inCurrentMonth=true 첫 셀
 *  5) 첫 cell
 * 빈 cells 배열은 호출자가 책임 — viewport 는 상위가 empty 를 방지한다고 가정.
 */
function resolveInitialKey(
  controlled: string | undefined,
  initial: string | undefined,
  cells: CalendarGridCell[]
): string {
  if (controlled) return controlled
  if (initial) return initial
  const todayCell = cells.find(c => c.isToday)
  if (todayCell) return todayCell.dateKey
  const firstInMonth = cells.find(c => c.inCurrentMonth)
  if (firstInMonth) return firstInMonth.dateKey
  return cells[0]?.dateKey ?? ''
}

export function CalendarViewport({
  cells,
  year,
  month,
  timezone,
  locale = 'ko',
  weekStart = 'sunday',
  selectedDateKey: selectedDateKeyProp,
  initialSelectedDateKey,
  onSelectDay,
  onViewChange,
  statusAction,
  onSelectItem,
  labelNameMap,
  monthHeader,
  renderDayHeader,
  footer,
  className,
}: CalendarViewportProps) {
  const isControlled = selectedDateKeyProp !== undefined

  /* 내부 state — uncontrolled 모드에서만 의미. controlled 는 prop 이 진실. */
  const [internalKey, setInternalKey] = useState(() =>
    resolveInitialKey(selectedDateKeyProp, initialSelectedDateKey, cells)
  )
  const selectedDateKey = isControlled
    ? (selectedDateKeyProp as string)
    : internalKey

  const [view, setView] = useState<'month' | 'day'>('month')

  /* 태스크 상태 전이 in-flight 관리. useTransition 이 서버 액션을 "낙관적" 느낌으로
   * 감싸준다 — 실제 UI 업데이트는 revalidate 후 리렌더로 일어나지만 transition 중에는
   * 전환 버튼을 disabled 로 두기 위해 pendingItemId 를 따로 관리한다. */
  const [isPending, startTransition] = useTransition()
  const [pendingItemId, setPendingItemId] = useState<string | null>(null)

  /** 뷰 전환 통지 — prop 이 주어졌을 때만. */
  useEffect(() => {
    onViewChange?.(view)
  }, [view, onViewChange])

  /** 날짜 선택 통지 — prop 이 주어졌을 때만. controlled 에서는 상위가 직접 알고 있으므로
   *  불필요할 수도 있지만, uncontrolled 에서 URL 동기화 등에 쓰인다. */
  const lastNotifiedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!selectedDateKey) return
    if (lastNotifiedRef.current === selectedDateKey) return
    lastNotifiedRef.current = selectedDateKey
    onSelectDay?.(selectedDateKey)
  }, [selectedDateKey, onSelectDay])

  /* Screen A 셀 탭 → B 진입. */
  const handleSelectDayFromMonth = useCallback(
    (dateKey: string) => {
      if (!isControlled) setInternalKey(dateKey)
      setView('day')
    },
    [isControlled]
  )

  /* Screen B 상단 압축 그리드 탭 → 같은 B 에서 selectedDate 만 바꾼다 (슬라이드 없음). */
  const handleSelectDayInDay = useCallback(
    (dateKey: string) => {
      if (!isControlled) setInternalKey(dateKey)
    },
    [isControlled]
  )

  /* B → A 복귀. */
  const handleBackToMonth = useCallback(() => {
    setView('month')
  }, [])

  /* 태스크 상태 전이. 외부 이벤트는 CalendarDayRow 단계에서 걸러지지만,
   * 방어적으로 kind 검사. originalId 는 task 의 경우 number 보장. */
  const handleStatusChange = useCallback(
    (item: CalendarItem, next: TaskStatus) => {
      if (!statusAction) return
      if (item.kind !== 'task') return
      if (typeof item.originalId !== 'number') return
      const taskId = item.originalId
      setPendingItemId(item.id)
      startTransition(async () => {
        try {
          await statusAction(taskId, next)
        } finally {
          /* transition 완료 후에도 revalidate 가 끝나기까지 한 템포 더 있을 수 있으나,
           * 사용자 체감상 여기서 pending 해제로 충분. 이후 리렌더에서 새 status 반영. */
          setPendingItemId(null)
        }
      })
    },
    [statusAction]
  )

  /* 선택된 날짜의 CalendarDay. out-of-month 나 이벤트 0건이면 null → Quiet Empty. */
  const selectedDay = useMemo(
    () => findDay(cells, selectedDateKey),
    [cells, selectedDateKey]
  )

  /* 슬라이드 transform — 320ms cubic-bezier(0.32, 0.72, 0.24, 1). prefers-reduced-motion
   * 에 의해 `motion-reduce:transition-none` 으로 감속 효과 즉시 비활성. */
  const slideClass =
    view === 'day' ? '-translate-x-full' : 'translate-x-0'

  return (
    <div
      data-slot="calendar-viewport"
      data-view={view}
      className={cx(
        'relative h-full w-full overflow-hidden',
        className
      )}
    >
      {/* inner track: 두 스크린 수평 배치. transform 으로 -100% 이동해 B 가 들어온다. */}
      <div
        data-slot="calendar-viewport-track"
        className={cx(
          'flex h-full w-full will-change-transform',
          /* 애플-네이티브 드릴다운 이징. approved.json motion.ease 와 동일. */
          'transition-transform duration-[320ms] ease-[cubic-bezier(0.32,0.72,0.24,1)]',
          'motion-reduce:transition-none',
          slideClass
        )}
        aria-live="polite"
      >
        {/* Screen A */}
        <section
          data-slot="calendar-viewport-screen-a"
          aria-hidden={view !== 'month'}
          inert={view !== 'month'}
          className="flex h-full w-full flex-none flex-col"
        >
          <CalendarMonthGrid
            cells={cells}
            year={year}
            month={month}
            selectedDateKey={selectedDateKey}
            onSelectDay={handleSelectDayFromMonth}
            weekStart={weekStart}
            locale={locale}
            header={monthHeader}
            footer={footer}
          />
        </section>

        {/* Screen B */}
        <section
          data-slot="calendar-viewport-screen-b"
          aria-hidden={view !== 'day'}
          inert={view !== 'day'}
          className="flex h-full w-full flex-none flex-col"
        >
          <CalendarDayDetail
            cells={cells}
            day={selectedDay ?? null}
            selectedDateKey={selectedDateKey}
            onSelectDay={handleSelectDayInDay}
            onStatusChange={handleStatusChange}
            onSelectItem={onSelectItem}
            pendingItemId={pendingItemId ?? undefined}
            timezone={timezone}
            locale={locale}
            weekStart={weekStart}
            labelNameMap={labelNameMap}
            header={renderDayHeader?.({
              onBack: handleBackToMonth,
              dateKey: selectedDateKey,
            })}
            footer={footer}
          />
        </section>
      </div>

      {/* 진행 신호: 상태 전이 중 하단 1px sage bar 가 pulse. Quiet Layer 원칙에 따라
       *  스피너/커다란 오버레이 금지, 얇은 선으로만 "처리 중" 신호.
       *  role=status + aria-live=polite 로 보조기기에도 1 회 안내.
       *  reduced-motion 에서는 pulse 정지(단색 bar 만 유지). */}
      {isPending && (
        <div
          role="status"
          aria-live="polite"
          aria-label={locale === 'ko' ? '상태 업데이트 중' : 'Updating status'}
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px overflow-hidden"
        >
          <span className="block h-full w-full animate-pulse bg-brand-600 motion-reduce:animate-none" />
        </div>
      )}
    </div>
  )
}
