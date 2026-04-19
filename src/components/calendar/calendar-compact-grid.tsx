'use client'

// ============================================================================
// CalendarCompactGrid — Screen B 상단 압축 월 그리드 (Phase 4 - U1)
// ============================================================================
// - 역할: Screen B 상단 리본 영역의 "7×N 미니 월 그리드". 각 셀은 48px 높이,
//   날짜 숫자 + 최대 3색 dot stack 으로 압축 시각화한다. 탭하면 상위에 dateKey 통지.
// - Classic Screen A 와 별개 컴포넌트로 둔 이유: 시각 규칙이 크게 다르다.
//     · A 는 셀 격자 보더 + 라벨 "바" 3 줄, B 는 pill-shape + dot stack.
//     · A 는 1fr × 5-6 rows(수직 flex), B 는 48px 고정 높이 + 2px gap.
//   공유 추상을 억지로 만들면 둘 다 복잡해져서 각각 얇게 유지.
// - dot stack 규칙 (finalized.html): 내부 task 라벨 색 순회 + 외부 이벤트(dust-blue) →
//   고유 색만 최대 3개까지. 4개 이상이면 앞쪽 3개만. 없는 날은 빈 dots row 유지해
//   셀 높이가 튀지 않도록.
// ============================================================================

import type { KeyboardEvent, MouseEvent } from 'react'
import { cx } from '@/utils/cx'
import type { CalendarGridCell } from '@/lib/calendar/types'
import {
  CALENDAR_LABEL_ID,
  getLabelColor,
} from '@/components/todogram/labels'
import type { LabelChipColor } from '@/components/todogram/label-chip'

export interface CalendarCompactGridProps {
  cells: CalendarGridCell[]
  selectedDateKey?: string
  onSelectDay?: (dateKey: string) => void
  className?: string
}

/**
 * 48px 높이 고정, 2px gap, rounded 8px. inner flex column 으로 day 숫자 + dots.
 */
export function CalendarCompactGrid({
  cells,
  selectedDateKey,
  onSelectDay,
  className,
}: CalendarCompactGridProps) {
  return (
    <div
      data-slot="calendar-compact-grid"
      role="grid"
      className={cx(
        'grid grid-cols-7 gap-[2px] px-2 pt-1 pb-[6px] bg-bg-primary',
        className
      )}
    >
      {cells.map(cell => (
        <CompactCell
          key={cell.dateKey}
          cell={cell}
          selectedDateKey={selectedDateKey}
          onSelectDay={onSelectDay}
        />
      ))}
    </div>
  )
}

interface CompactCellProps {
  cell: CalendarGridCell
  selectedDateKey?: string
  onSelectDay?: (dateKey: string) => void
}

function CompactCell({ cell, selectedDateKey, onSelectDay }: CompactCellProps) {
  const { dateKey, date, inCurrentMonth, isToday, day } = cell
  const isSelected = selectedDateKey === dateKey
  const dayNum = date.getUTCDate()

  /* out-of-month: div, 불투명도 낮춤, 클릭 불가. dots 자리도 공간만 유지해 셀 높이 통일. */
  if (!inCurrentMonth) {
    return (
      <div
        data-slot="calendar-compact-cell"
        data-date-key={dateKey}
        role="gridcell"
        aria-disabled="true"
        className="flex h-12 flex-col items-center justify-center gap-[3px] rounded-lg px-0.5 py-1 bg-transparent cursor-default"
      >
        <span
          aria-hidden="true"
          className="font-mono tabular-nums text-[12px] font-medium text-text-tertiary/45 leading-none"
        >
          {dayNum}
        </span>
        <span className="min-h-1" aria-hidden="true" />
      </div>
    )
  }

  /* 활성 셀: 점 최대 3개 추출 — 라벨 기준 중복 제거 후 상위 3색. */
  const dotColors = collectTopDotColors(day?.items ?? [])

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    onSelectDay?.(dateKey)
  }
  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelectDay?.(dateKey)
    }
  }

  return (
    <button
      type="button"
      data-slot="calendar-compact-cell"
      data-date-key={dateKey}
      data-today={isToday || undefined}
      data-selected={isSelected || undefined}
      role="gridcell"
      aria-selected={isSelected}
      aria-label={`${date.getUTCMonth() + 1}월 ${dayNum}일${
        isToday ? ', 오늘' : ''
      }`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cx(
        'flex h-12 flex-col items-center justify-center gap-[3px] rounded-lg px-0.5 py-1',
        'cursor-pointer bg-transparent transition-colors duration-120 ease-linear motion-reduce:transition-none',
        'hover:bg-[color-mix(in_srgb,var(--color-bg-brand-solid)_6%,transparent)]',
        'active:bg-[color-mix(in_srgb,var(--color-bg-brand-solid)_12%,transparent)]',
        'focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
        /* today: sage solid bg + soft outline (다크에서 sage 명도 상승) */
        isToday && 'bg-bg-brand-solid outline outline-2 outline-offset-1 outline-[color-mix(in_srgb,var(--color-bg-brand-solid)_40%,transparent)]',
        /* selected(today 아님): sage 14% tint + 1.5px sage outline */
        isSelected &&
          !isToday &&
          'bg-[color-mix(in_srgb,var(--color-bg-brand-solid)_14%,transparent)] outline outline-[1.5px] outline-brand'
      )}
    >
      <span
        className={cx(
          'font-mono tabular-nums text-[12px] font-medium leading-none',
          isToday ? 'text-text-primary_on-brand' : 'text-text-secondary'
        )}
      >
        {dayNum}
      </span>

      {/* dots — 비어있어도 최소 높이 4px 유지해 셀 레이아웃 안정 */}
      <span
        className="flex min-h-1 items-center justify-center gap-[3px]"
        aria-hidden="true"
      >
        {dotColors.map(color => (
          <span
            key={color}
            data-color={color}
            className={cx(
              'inline-block size-1 rounded-full',
              DOT_BG_CLASS[color],
              /* today 배경 위에서 약간 명도 상승시켜 대비 확보 */
              isToday && 'brightness-140 saturate-80'
            )}
          />
        ))}
      </span>
    </button>
  )
}

/**
 * items 에서 고유 라벨 색을 뽑아 최대 3개까지. 외부 이벤트는 dust-blue 로 묶여 하나의 색.
 * 순회 순서는 items 의 시간순을 따라간다 — "오전 먼저" 라는 직관이 dot 순서에도 반영됨.
 */
function collectTopDotColors(
  items: { labelId: string; clickDisabled: boolean }[]
): LabelChipColor[] {
  const seen = new Set<LabelChipColor>()
  const ordered: LabelChipColor[] = []
  for (const item of items) {
    const color: LabelChipColor = item.clickDisabled
      ? 'dust-blue'
      : getLabelColor(item.labelId)
    if (!seen.has(color)) {
      seen.add(color)
      ordered.push(color)
      if (ordered.length === 3) break
    }
  }
  return ordered
}

/**
 * 라벨 색 → bg 클래스 매핑. label-chip 의 dot 스타일과 동일 토큰 사용.
 */
const DOT_BG_CLASS: Record<LabelChipColor, string> = {
  sage: 'bg-label-sage',
  terracotta: 'bg-label-terracotta',
  'dust-blue': 'bg-label-dust-blue',
  amber: 'bg-label-amber',
  plum: 'bg-label-plum',
  moss: 'bg-label-moss',
}
