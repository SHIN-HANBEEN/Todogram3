'use client'

// ============================================================================
// CalendarMonthGrid — Screen A 월 그리드 (Phase 4 - U1)
// ============================================================================
// - 역할: 요일 헤더(32px) + 7×N(N=5|6) 셀 그리드 컨테이너. 내부는 CalendarDayCell 만
//   꽂으면 되는 얇은 래퍼지만, 월 변경 prev/next 컨트롤·aria-label(grid) 관리·
//   주 시작 요일 분기(일요일/월요일) 등의 "그리드 레벨" 관심사를 한 곳에 모았다.
// - 셀 렌더는 `aggregateMonth()` 가 이미 계산해둔 `cells` 배열을 그대로 순회 — 이 컴포넌트는
//   추가 계산을 하지 않는다(테스트 가능성 + RSC 친화적).
// - weekStart 기본은 'sunday' (미국/기본). 'monday' 도 지원하여 한국/유럽 관례에 대응.
//   요일 헤더 라벨 순서도 weekStart 에 따라 회전.
// - grid 내부 셀 크기: CSS grid auto-rows=1fr 로 동일 높이 균등 분할. 상위에서
//   height 를 제공하면 알아서 5 행/6 행에 맞춰 늘어난다.
// - 접근성: role=grid + aria-label="YYYY년 M월" (로케일 반영). 개별 셀은 role=gridcell.
// ============================================================================

import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from '@/utils/cx'
import type { CalendarGridCell } from '@/lib/calendar/types'
import { CalendarDayCell } from './calendar-day-cell'
import type { WeekStart } from '@/lib/calendar/month'

export interface CalendarMonthGridProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'onSelect'> {
  /** aggregateMonth().cells — 순서대로 렌더. */
  cells: CalendarGridCell[]
  /** 기준 연도 — grid aria-label 에 사용. */
  year: number
  /** 기준 월 (1-12) — grid aria-label 에 사용. */
  month: number
  /** 선택된 dateKey — 하이라이트 표시. */
  selectedDateKey?: string
  /** 셀 확정 시 상위에 통지. Screen B 진입. */
  onSelectDay?: (dateKey: string) => void
  /** 주 시작 요일. 기본 'sunday'. 'monday' 로 바꾸면 요일 헤더 순서도 회전. */
  weekStart?: WeekStart
  /** 로케일 — 요일/월 라벨. 기본 'ko'. */
  locale?: 'ko' | 'en'
  /**
   * 그리드 위/아래에 끼워 넣을 영역. 상단: 헤더/네비게이션 바. 하단: 추가 컨트롤.
   * 본 컴포넌트는 월 표시 책임만 지므로 네비게이션은 상위 ViewportSwitcher 에서 제공.
   */
  header?: ReactNode
  footer?: ReactNode
}

/**
 * 요일 라벨 (sunday-first 기본). weekStart='monday' 인 경우 순서를 회전시킨다.
 * 한국어는 1글자 축약이 관례 — 영어는 3글자(SUN/MON/...).
 */
const WEEKDAYS: Record<'ko' | 'en', readonly string[]> = {
  ko: ['일', '월', '화', '수', '목', '금', '토'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
}

/**
 * weekStart 에 따라 요일 배열을 회전. 월요일 시작이면 일요일이 마지막으로 간다.
 * (finalized.html 은 sunday-first 이지만 사용자 설정으로 재정의 가능하도록 설계.)
 */
function rotateWeekdays(
  labels: readonly string[],
  weekStart: WeekStart
): readonly string[] {
  if (weekStart === 'sunday') return labels
  // monday-first: [월 화 수 목 금 토 일]
  return [...labels.slice(1), labels[0] ?? '']
}

/**
 * 요일 색 강조 — 일요일 terracotta 톤, 토요일 dust-blue 톤. 한국 달력 관례.
 * weekStart 에 따라 인덱스가 달라지므로 회전 후 기준으로 매핑.
 */
function getWeekdayToneClass(
  index: number,
  weekStart: WeekStart
): string | null {
  // sunday-first: 0=Sun, 6=Sat. monday-first: 6=Sun, 5=Sat.
  const sunIdx = weekStart === 'sunday' ? 0 : 6
  const satIdx = weekStart === 'sunday' ? 6 : 5
  if (index === sunIdx) {
    return 'text-[color-mix(in_srgb,var(--color-label-terracotta)_85%,var(--color-text-tertiary))]'
  }
  if (index === satIdx) {
    return 'text-[color-mix(in_srgb,var(--color-label-dust-blue)_85%,var(--color-text-tertiary))]'
  }
  return null
}

export function CalendarMonthGrid({
  cells,
  year,
  month,
  selectedDateKey,
  onSelectDay,
  weekStart = 'sunday',
  locale = 'ko',
  header,
  footer,
  className,
  ...rest
}: CalendarMonthGridProps) {
  const weekdayLabels = rotateWeekdays(WEEKDAYS[locale], weekStart)
  const gridAriaLabel =
    locale === 'ko' ? `${year}년 ${month}월` : `${monthNameEn(month)} ${year}`

  return (
    <div
      data-slot="calendar-month-grid"
      className={cx('flex h-full min-h-0 flex-col bg-bg-primary', className)}
      {...rest}
    >
      {header}

      {/* 요일 헤더 — 32px 높이 고정. aria-hidden: 날짜 aria-label 에 이미 요일이 포함됨. */}
      <div
        aria-hidden="true"
        className="grid flex-none grid-cols-7 px-2 pt-1.5 pb-1 h-8"
      >
        {weekdayLabels.map((label, index) => {
          const toneClass = getWeekdayToneClass(index, weekStart)
          return (
            <span
              key={label + index}
              className={cx(
                'text-center text-[10px] font-semibold uppercase tracking-[0.08em]',
                toneClass ?? 'text-text-tertiary'
              )}
            >
              {label}
            </span>
          )
        })}
      </div>

      {/* 월 그리드 — 1fr 동일 분배. 35 또는 42 셀 (5 주 or 6 주). */}
      <div
        role="grid"
        aria-label={gridAriaLabel}
        className="grid flex-1 grid-cols-7 auto-rows-fr min-h-0"
      >
        {cells.map(cell => (
          <CalendarDayCell
            key={cell.dateKey}
            cell={cell}
            selectedDateKey={selectedDateKey}
            onSelect={onSelectDay}
          />
        ))}
      </div>

      {footer}
    </div>
  )
}

/**
 * 영어 월 이름. Intl.DateTimeFormat 을 써도 되지만 정적 테이블이 렌더 성능·SSR 일관성에 유리.
 */
function monthNameEn(month: number): string {
  const NAMES = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ]
  return NAMES[month - 1] ?? ''
}
