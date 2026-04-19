'use client'

// ============================================================================
// CalendarDayRow — Screen B ledger 의 3-state 단일 행 (Phase 4 - U1)
// ============================================================================
// - 역할: CalendarItem 한 개를 "time | status | title | chip" 4-column 그리드 행으로 렌더.
//   TodayRow 와 **동일 geometry** 지만, 체크박스가 TaskStatusIndicator (3-state) 로 승격.
// - 왜 TodayRow 를 재사용하지 않는가: TodayRow 는 2-state + onToggle() 부울 전제로 설계되어
//   있어, 3-state 를 도입하려면 breaking change 가 필요. Phase 4 는 캘린더만 먼저 3-state
//   로 전환하고, 추후 /today 라우트 마운트 시점에 TodayRow 를 교체 리팩터링한다.
// - 외부 이벤트(event kind) 는 TaskStatusIndicator 자리를 visibility:hidden 으로 유지해
//   geometry 를 동일하게 만든다(TodayRow 와 같은 전략). 좌측 3px 색 틱은 dust-blue.
// - 내부 task 가 `in_progress` 일 때는 행 배경 전체에 sage 5% tint 를 깔아 목록에서
//   "지금 하는 일" 을 시각적으로 구별 (approved.json 및 memory feedback_quiet_layer_status).
// - 상호작용: 행 자체 탭 → 상세(Screen C) 진입 (onClick). status indicator 는 자체
//   stopPropagation 으로 row 클릭과 분리 → 상태만 순환 전이, 상세 진입 없음.
// ============================================================================

import type { HTMLAttributes, MouseEvent } from 'react'
import { cx } from '@/utils/cx'
import type { CalendarItem, TaskStatus } from '@/lib/calendar/types'
import {
  CALENDAR_LABEL_ID,
  getLabelColor,
} from '@/components/todogram/labels'
import type { LabelChipColor } from '@/components/todogram/label-chip'
import { LabelChip } from '@/components/todogram/label-chip'
import { TaskStatusIndicator } from './task-status-indicator'

export interface CalendarDayRowProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'onSelect' | 'onClick'> {
  /** 이 행이 표현할 단일 CalendarItem. */
  item: CalendarItem
  /**
   * 3-state 상태 전이 콜백 — 내부 task(row kind='task') 에서만 호출.
   * 서버 액션 `toggleTaskStatus` 로 연결될 자리.
   */
  onStatusChange?: (item: CalendarItem, next: TaskStatus) => void
  /**
   * 행 자체 클릭(→ 상세 진입) 콜백. 외부 event 에서는 호출하지 않는다(clickDisabled).
   */
  onSelect?: (item: CalendarItem) => void
  /** 상태 전이 중 비활성화(중복 클릭 방지). 부모 useTransition 등으로 제어. */
  pending?: boolean
  /** 라벨 칩 텍스트. 미지정 시 item.labelId 를 그대로 표시. */
  labelText?: string
}

/**
 * 라벨 색 → border-left 색 클래스 매핑. TodayRow 의 매핑과 동일한 토큰.
 */
const BORDER_L_CLASS: Record<LabelChipColor, string> = {
  sage: 'border-l-label-sage',
  terracotta: 'border-l-label-terracotta',
  'dust-blue': 'border-l-label-dust-blue',
  amber: 'border-l-label-amber',
  plum: 'border-l-label-plum',
  moss: 'border-l-label-moss',
}

export function CalendarDayRow({
  item,
  onStatusChange,
  onSelect,
  pending = false,
  labelText,
  className,
  ...rest
}: CalendarDayRowProps) {
  const isExt = item.kind === 'event' || item.clickDisabled
  const color: LabelChipColor = isExt
    ? 'dust-blue'
    : getLabelColor(item.labelId)
  const status: TaskStatus = item.status ?? 'pending'

  const isInProgress = !isExt && status === 'in_progress'
  const isDone = !isExt && status === 'done'

  /* 행 클릭: 외부 이벤트는 무시. 내부 task 만 상세 진입. */
  const handleRowClick = (e: MouseEvent<HTMLDivElement>) => {
    if (isExt) return
    /* 상태 인디케이터는 stopPropagation 으로 이미 분리. 여기 닿는 건 "title 영역 클릭" 뿐. */
    e.preventDefault()
    onSelect?.(item)
  }

  const handleStatusChange = (next: TaskStatus) => {
    if (isExt) return
    onStatusChange?.(item, next)
  }

  /* 라벨 칩 텍스트: 외부 이벤트 = "캘린더" / 내부 task = labelText > labelId fallback. */
  const chipText =
    labelText ?? (isExt ? '캘린더' : item.labelId)

  return (
    <div
      data-slot="calendar-day-row"
      data-kind={item.kind}
      data-status={item.status ?? undefined}
      data-ext={isExt || undefined}
      data-in-progress={isInProgress || undefined}
      data-done={isDone || undefined}
      role="listitem"
      onClick={handleRowClick}
      className={cx(
        /* 4-column grid: time 56px · status 20px · title 1fr · chip auto */
        'grid items-center gap-2 min-h-[56px] py-2.5 pl-[11px] pr-2.5',
        'grid-cols-[56px_20px_1fr_auto]',
        'border-l-[3px] rounded-r-md',
        'transition-colors duration-100 ease-linear motion-reduce:transition-none',
        BORDER_L_CLASS[color],
        /* hover: sage 3% tint (외부 이벤트는 hover 없음 — cursor:default) */
        !isExt &&
          'cursor-pointer hover:bg-[color-mix(in_srgb,var(--color-brand-600)_3%,transparent)]',
        isExt && 'cursor-default',
        /* in_progress row tint — Quiet Layer 예외(명확성 우선). */
        isInProgress &&
          'bg-[color-mix(in_srgb,var(--color-brand-600)_5%,transparent)]' +
            ' hover:bg-[color-mix(in_srgb,var(--color-brand-600)_8%,transparent)]',
        pending && 'opacity-60 pointer-events-none',
        className
      )}
      {...rest}
    >
      {/* time — 모노 + tabular-nums. ext/mine 동일 표기. */}
      <span className="font-mono tabular-nums text-[13px] leading-none text-text-muted [font-feature-settings:'tnum']">
        {item.timeLabel}
      </span>

      {/* status slot — ext 는 공간만 유지(geometry 통일) */}
      <span
        className={cx(
          'inline-flex items-center justify-center',
          isExt && 'invisible'
        )}
        aria-hidden={isExt}
      >
        {!isExt && (
          <TaskStatusIndicator
            status={status}
            onStatusChange={handleStatusChange}
            disabled={pending}
            size="md"
          />
        )}
      </span>

      {/* title + optional note */}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={cx(
            'truncate text-[15px] leading-[1.35] tracking-[-0.1px]',
            /* 기본: mine → text-primary / ext → text-secondary */
            isExt
              ? 'font-normal text-text-secondary'
              : 'font-medium text-text-primary',
            /* in_progress: 제목 볼드 + primary 유지 */
            isInProgress && 'font-semibold',
            /* done: 취소선 + muted */
            isDone && 'line-through text-text-muted font-normal'
          )}
        >
          {item.title}
        </span>
        {item.note && (
          <span className="truncate text-[12px] leading-none text-text-tertiary">
            {item.note}
          </span>
        )}
      </span>

      {/* label chip — dot variant (Today View 와 동일 규칙) */}
      <span className="inline-flex flex-none items-center">
        <LabelChip color={color} variant="dot" size="md">
          {chipText}
        </LabelChip>
      </span>
    </div>
  )
}

/**
 * row 사이 1px 구분선. TodayRowDivider 와 동일 패턴 (flex collapse 방지).
 */
export function CalendarDayRowDivider({
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      data-slot="calendar-day-row-divider"
      className={cx(
        'flex-none min-h-px h-px ml-[3px] bg-border-secondary',
        className
      )}
      style={{ flex: '0 0 1px' }}
      {...rest}
    />
  )
}
