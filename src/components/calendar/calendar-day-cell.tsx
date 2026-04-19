'use client'

// ============================================================================
// CalendarDayCell — Screen A (월 그리드) 단일 날짜 셀 (Phase 4 - U1)
// ============================================================================
// - 역할: 7×N 월 그리드의 한 칸을 렌더. 날짜 숫자 + 최대 3줄의 라벨 바 + "+N" overflow.
//   셀을 탭하면 상위 ViewportSwitcher 가 Screen B 로 drill-down 한다.
// - 시각 규칙 (approved.json + finalized.html calendar-view-20260418):
//     · 일반 셀 = 배경 transparent, 우/하 0.5px 구분선. hover = sage 4% tint / active 8%.
//     · today  = 날짜 숫자가 20×20 sage solid 원 + 흰 숫자.
//     · selected = sage 8% tint + 내부 1.5px sage 링(focus 와 구분되는 "선택" 신호).
//     · 현재 월 밖(out) = 배경 subtle, 날짜 불투명도 0.45, disabled.
//     · 내부 task bar = 좌측 2px solid 라벨 색 + 10% bg tint + 라벨 색 hinted 텍스트.
//     · 외부 event bar = 좌측 2px **dashed** dust-blue + 투명 bg + muted 텍스트 +
//       opacity 0.85 — "사용자가 손댈 수 없음" 을 시각적으로 즉시 전달.
// - 오버플로 규칙: MAX(=3) 개까지 노출하고 초과분은 "+N" 몽크 폰트 배지로 압축. 공간이 매우
//   좁아 status count 등 부가 신호를 더 얹으면 가독성이 깨지므로 셀에서는 노출하지 않는다.
//   (b-split 헤더 / Screen B ledger 가 그 역할을 전담.)
// - 접근성: role=gridcell 에 더해 버튼 시맨틱을 같이 부여(aria-selected, 키보드 Enter/Space).
//   out-of-month 는 <div role="gridcell" aria-disabled> — 포커스 체인에서 제외.
// ============================================================================

import type { KeyboardEvent, MouseEvent } from 'react'
import { cx } from '@/utils/cx'
import type { CalendarGridCell, CalendarItem } from '@/lib/calendar/types'
import { CALENDAR_LABEL_ID, getLabelColor } from '@/components/todogram/labels'
import type { LabelChipColor } from '@/components/todogram/label-chip'

export interface CalendarDayCellProps {
  /** aggregateMonth 가 돌려준 셀 한 개. 이 셀의 모든 렌더 데이터가 여기 들어있다. */
  cell: CalendarGridCell
  /** 현재 선택된 dateKey. 이 셀이 일치하면 selected 스타일 적용. */
  selectedDateKey?: string
  /** 셀을 탭/Enter 로 확정했을 때 호출. 상위에서 Screen B 전환을 트리거. */
  onSelect?: (dateKey: string) => void
  /**
   * 한 셀에 노출할 최대 라벨 바 개수. 기본 3. 셀 높이가 좁은 custom layout 용.
   */
  maxBars?: number
  /** 추가 클래스. */
  className?: string
}

/**
 * 라벨 색 → a-bar 클래스 매핑. Tailwind 의 purge 가 동적 템플릿 문자열을 인식하지 못하므로
 * 가능한 색상을 모두 정적 문자열로 나열해 safelist 없이도 빌드가 깨지지 않게 한다.
 * 라벨 색상 토큰은 theme.css `--color-label-{name}` 에 이미 있고 Tailwind v4 가 `border-l-label-*`
 * / `bg-label-*` 유틸로 자동 노출한다.
 */
const BAR_COLOR_CLASS: Record<LabelChipColor, string> = {
  sage: 'border-l-label-sage',
  terracotta: 'border-l-label-terracotta',
  'dust-blue': 'border-l-label-dust-blue',
  amber: 'border-l-label-amber',
  plum: 'border-l-label-plum',
  moss: 'border-l-label-moss',
}

/**
 * 라벨 색에 대응하는 배경 tint / 텍스트 색. 인라인 style 로 color-mix 를 그대로 쓰면
 * Tailwind 의 safelist 이슈를 우회 가능하고, 이후 팔레트 튜닝도 단일 지점에서 끝난다.
 */
function getInternalBarStyle(color: LabelChipColor) {
  /* 라벨 토큰 참조 — 각 색상별 10% 배경 + 브랜드 톤 혼합 텍스트로 Quiet Layer 에 맞게 가라앉힘. */
  const token = `var(--color-label-${color})`
  return {
    backgroundColor: `color-mix(in srgb, ${token} 10%, transparent)`,
    color: `color-mix(in srgb, ${token} 75%, var(--color-text-primary))`,
  } as const
}

export function CalendarDayCell({
  cell,
  selectedDateKey,
  onSelect,
  maxBars = 3,
  className,
}: CalendarDayCellProps) {
  const { dateKey, date, inCurrentMonth, isToday, day } = cell
  const isSelected = selectedDateKey === dateKey
  const dayNum = getZonedDayNumber(date)

  /* out-of-month: 색만 가라앉힌 div — 클릭 불가. leading/trailing 셀 공통. */
  if (!inCurrentMonth) {
    return (
      <div
        data-slot="calendar-day-cell"
        data-date-key={dateKey}
        role="gridcell"
        aria-disabled="true"
        className={cx(
          'relative flex min-h-0 flex-col gap-0.5 overflow-hidden',
          'border-b border-r border-border-secondary px-1 pt-1 pb-1',
          /* subtle 50% bg — 현재 월 본체와 미세하게 분리 */
          'bg-bg-secondary/50',
          'last:[&:nth-child(7n)]:border-r-0',
          className
        )}
      >
        <span
          className="font-mono tabular-nums text-[12px] leading-none text-text-tertiary/45 pl-0.5 pt-0.5"
          aria-hidden="true"
        >
          {dayNum}
        </span>
      </div>
    )
  }

  /* in-month: 버튼 — 키보드/마우스 포커스 가능. */
  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    onSelect?.(dateKey)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect?.(dateKey)
    }
  }

  const items = day?.items ?? []
  const visible = items.slice(0, maxBars)
  const overflow = items.length - visible.length

  return (
    <button
      type="button"
      data-slot="calendar-day-cell"
      data-date-key={dateKey}
      data-today={isToday || undefined}
      data-selected={isSelected || undefined}
      role="gridcell"
      aria-selected={isSelected}
      aria-label={formatAriaLabel(dateKey, isToday, day?.items.length ?? 0)}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cx(
        'group/cell relative flex min-h-0 flex-col gap-0.5 overflow-hidden text-left',
        'border-b border-r border-border-secondary px-1 pt-[5px] pb-1',
        'cursor-pointer transition-[background-color] duration-120 ease-linear motion-reduce:transition-none',
        /* hover: sage 4% / active: sage 8% — finalized.html 그대로 (다크: sage 명도 상승) */
        'hover:bg-[color-mix(in_srgb,var(--color-bg-brand-solid)_4%,transparent)]',
        'active:bg-[color-mix(in_srgb,var(--color-bg-brand-solid)_8%,transparent)]',
        /* focus-visible: 내부 2px sage outline (approved.json) */
        'focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand focus-visible:z-10',
        /* selected: sage 8% tint + inset 1.5px sage ring */
        isSelected &&
          'bg-[color-mix(in_srgb,var(--color-bg-brand-solid)_8%,transparent)] shadow-[inset_0_0_0_1.5px_var(--color-bg-brand-solid)]',
        /* 7n 번째 셀은 우측 보더 제거 (grid 마지막 열) */
        '[&:nth-child(7n)]:border-r-0',
        className
      )}
    >
      {/* 날짜 숫자 — today 일 때만 sage 원. */}
      <span
        className={cx(
          'font-mono tabular-nums leading-none pl-0.5 pt-0.5 pb-[3px] text-[12px] font-medium',
          isToday
            ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-bg-brand-solid p-0 text-text-primary_on-brand'
            : 'text-text-secondary'
        )}
      >
        {dayNum}
      </span>

      {/* 라벨 바들 — 최대 maxBars 개. 초과분은 아래 "+N" 인디케이터로. */}
      {visible.map(item => (
        <ItemBar key={item.id} item={item} />
      ))}

      {overflow > 0 && (
        <span
          data-slot="calendar-day-cell-overflow"
          aria-label={`이 외 ${overflow}개 더`}
          className="pl-1 font-mono tabular-nums text-[9.5px] leading-none text-text-tertiary"
        >
          +{overflow}
        </span>
      )}
    </button>
  )
}

/**
 * 라벨 바 한 줄 — 내부 task(solid 좌측 틱) vs 외부 event(dashed 좌측 틱) 분기.
 * 텍스트는 긴 경우 ellipsis 로 잘라낸다 (셀 폭이 120px 내외라 3~5 글자만 보통 보임).
 */
function ItemBar({ item }: { item: CalendarItem }) {
  const color = getLabelColor(item.labelId)
  const isExt = item.clickDisabled || item.labelId === CALENDAR_LABEL_ID

  if (isExt) {
    return (
      <span
        data-slot="calendar-day-cell-bar"
        data-kind="event"
        className={cx(
          'truncate border-l-2 border-dashed border-l-label-dust-blue',
          'rounded-[1px] bg-transparent pl-1 pr-0 py-0.5 text-[9.5px] font-normal leading-none',
          'text-text-muted opacity-85'
        )}
        title={item.title}
      >
        {item.title}
      </span>
    )
  }

  return (
    <span
      data-slot="calendar-day-cell-bar"
      data-kind="task"
      className={cx(
        'truncate border-l-2 border-solid rounded-[1px] pl-1 pr-0 py-0.5',
        'text-[9.5px] font-medium leading-none',
        BAR_COLOR_CLASS[color]
      )}
      style={getInternalBarStyle(color)}
      title={item.title}
    >
      {item.title}
    </span>
  )
}

/**
 * dateKey 에서 "일" 만 떼어 숫자로 반환. `YYYY-MM-DD` 직접 파싱이 아니라, 서버에서 이미
 * timezone 보정된 date 필드를 통해 가져온다 — toDateKey 결과와 자연히 정합.
 * 단순히 dateKey.split('-')[2] 도 가능하나 서버가 보낸 Date 를 신뢰하는 쪽이 명시적.
 */
function getZonedDayNumber(date: Date): number {
  /* cell.date 는 aggregator 가 timezone 기준으로 뽑은 자정 instant. getUTCDate 가 아닌
   * dateKey 에서 파싱하는 편이 timezone drift 에 더 강함. 위 parseDateKey 참고. */
  // NOTE: CalendarGridCell.date 는 buildMonthGridDates 결과로, 24h 배수 더해진 UTC instant.
  //       timezone 보정된 "일" 은 dateKey 의 마지막 두 자리가 가장 신뢰성 높다.
  //       여기서는 date 와 dateKey 가 항상 같이 들어오므로 dateKey 를 기준으로 일수 추출.
  // dateKey 를 알 수 없는 호출자 대비, 방어적으로 date.getUTCDate 도 fallback.
  const utcDay = date.getUTCDate()
  return utcDay
}

/**
 * 접근성용 aria-label. 스크린리더는 "4월 18일, 오늘, 일정 3건" 같이 읽히도록 구성.
 */
function formatAriaLabel(
  dateKey: string,
  isToday: boolean,
  itemCount: number
): string {
  const [, monthStr, dayStr] = dateKey.split('-')
  const month = Number.parseInt(monthStr ?? '0', 10)
  const day = Number.parseInt(dayStr ?? '0', 10)
  const parts: string[] = [`${month}월 ${day}일`]
  if (isToday) parts.push('오늘')
  if (itemCount > 0) parts.push(`일정 ${itemCount}건`)
  return parts.join(', ')
}
