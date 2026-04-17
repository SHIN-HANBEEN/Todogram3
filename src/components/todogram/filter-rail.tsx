'use client'

import type { HTMLAttributes } from 'react'
import { cx, sortCx } from '@/utils/cx'
import { LabelChip, type LabelChipColor } from './label-chip'
import {
  CALENDAR_LABEL_ID,
  FILTER_ALL,
  getLabelColor,
  type FilterValue,
  type LabelId,
} from './labels'

/* --------------------------------------------------------------------------
 * FilterRail — Todogram v3 (Quiet Layer) Today View sticky 라벨 필터 바
 *
 * DESIGN.md §4-3 (라벨 팔레트) + §5 (44px+ 터치 타겟) 근거.
 * approved.json: today-view-20260417 — filter rail sticky layout.
 *
 * 레이아웃:
 *   - position: sticky · top: 0 · z-5 (TodayHeader 바로 아래에 고정)
 *   - display: flex · gap: 6px · padding: 10px 16px
 *   - overflow-x: auto + scrollbar-width: none (+ webkit 숨김)
 *   - background: bg-page · border-bottom: 1px (TodayHeader 와 구분선)
 *
 * 칩 순서: [전체] → [캘린더 reserved] → [사용자 라벨 …]
 *   - 전체: 중립 outline (현재 활성 색은 있지만 특정 label 색 아님)
 *   - 캘린더: dust-blue outline (reserved 라벨)
 *   - 사용자 라벨: 해당 색 outline · selected 시 bg-tint + semibold
 *
 * 접근성:
 *   - 전체 래퍼 role="tablist" · horizontal orientation
 *   - 각 칩 role="tab" · aria-selected · aria-controls (부모가 stream panel 에
 *     id 를 매핑)
 *   - 스크롤 영역은 키보드 tab 순환으로도 접근 가능
 *   - 터치 타겟 44px — LabelChipButton 이 내부적으로 min-height 44 확보
 * -------------------------------------------------------------------------- */

/* 필터 rail 에 그려질 하나의 chip 데이터 — LabelId 또는 'all' 특수값. */
export interface FilterRailItem {
  /** 'all' 이면 전체, 그 외는 label id (calendar 포함). */
  value: FilterValue
  /** 화면 표시 문구. */
  label: string
  /**
   * 칩 색상을 직접 지정하고 싶을 때 override.
   * 미지정 시: 'all' → 'moss' (중립) · 그 외 → LABEL_COLOR_MAP 에서 해석.
   */
  color?: LabelChipColor
}

export interface FilterRailProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  /** 표시할 칩 목록. 순서 = 화면에 나타날 순서. */
  items: FilterRailItem[]
  /** 현재 선택된 값. 'all' | label id. */
  active: FilterValue
  /** 선택 변경 콜백. */
  onChange: (value: FilterValue) => void
  /** aria-label 로 노출될 rail 의 의미 (기본 '라벨 필터'). */
  ariaLabel?: string
  /** stream panel id — aria-controls 로 연결. 없으면 속성 생략. */
  panelId?: string
}

/* --------------------------------------------------------------------------
 * 스타일 — sortCx 로 wrapper/scroller/button 그룹핑.
 * scrollbar 숨김은 Tailwind 단독으로 표현 어렵기 때문에 inline style 로.
 * -------------------------------------------------------------------------- */
const styles = sortCx({
  wrapper: {
    /* sticky 상단 고정. TodayHeader 아래 z-index 순서 유의 (header 가 우선 그림자). */
    base:
      'sticky top-0 z-[5] bg-bg-primary border-b border-border-primary',
  },
  scroller: {
    /* 좌우 padding 16 · 상하 10 · 가로 스크롤 허용 · 스크롤바 숨김.
     * scrollbar-width 는 Firefox, -webkit-scrollbar 는 Chrome/Safari.
     * Tailwind v4 의 [&::-webkit-scrollbar]:hidden arbitrary variant 사용. */
    base:
      'flex gap-1.5 px-4 py-2.5 overflow-x-auto' +
      ' [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
  },
  button: {
    /* LabelChipButton 이 min-height 44 + focus ring 을 제공하므로
     * 여기선 flex-none 으로만 추가 (shrink 되면 칩이 찌그러짐). */
    base: 'flex-none',
  },
})

/* --------------------------------------------------------------------------
 * resolveColor — FilterRailItem 의 color 를 결정.
 * -------------------------------------------------------------------------- */
function resolveColor(item: FilterRailItem): LabelChipColor {
  if (item.color) return item.color
  if (item.value === FILTER_ALL) return 'moss' /* 중립 — 라벨 색 아님 */
  return getLabelColor(item.value as LabelId)
}

/* --------------------------------------------------------------------------
 * FilterRail — Today View 전용 sticky 필터. Mobile-first.
 * -------------------------------------------------------------------------- */
export function FilterRail({
  items,
  active,
  onChange,
  ariaLabel = '라벨 필터',
  panelId,
  className,
  ...props
}: FilterRailProps) {
  return (
    <div
      data-slot="filter-rail"
      className={cx(styles.wrapper.base, className)}
      {...props}
    >
      <div
        role="tablist"
        aria-orientation="horizontal"
        aria-label={ariaLabel}
        className={styles.scroller.base}
      >
        {items.map(item => {
          const isActive = item.value === active
          const color = resolveColor(item)

          return (
            <button
              key={String(item.value)}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={panelId}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onChange(item.value)}
              className={cx(
                /* 터치 타겟 44px 확보 (DESIGN §5). focus-ring 은 LabelChip 이 주지 않으므로 여기. */
                styles.button.base,
                'inline-flex items-center justify-center min-h-[44px]' +
                  ' rounded-full' +
                  ' focus-visible:outline focus-visible:outline-2' +
                  ' focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
              )}
              data-value={String(item.value)}
              data-active={isActive || undefined}
            >
              <LabelChip
                color={color}
                variant="outline"
                size="md"
                selected={isActive}
              >
                {item.label}
              </LabelChip>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* --------------------------------------------------------------------------
 * buildDefaultFilterItems — 부모가 라벨 목록만 넘기면 filter rail 용 아이템 생성.
 * 순서: [전체] → [캘린더 reserved] → [사용자 라벨 …]
 * -------------------------------------------------------------------------- */
export interface FilterableLabel {
  id: LabelId
  /** 화면에 표시될 라벨 이름 */
  name: string
}

export function buildDefaultFilterItems(
  userLabels: FilterableLabel[],
  locale: 'ko' | 'en' = 'ko',
): FilterRailItem[] {
  const allLabel = locale === 'ko' ? '전체' : 'All'
  const calendarLabel = locale === 'ko' ? '캘린더' : 'Calendar'

  return [
    { value: FILTER_ALL, label: allLabel },
    {
      value: CALENDAR_LABEL_ID,
      label: calendarLabel,
      color: 'dust-blue',
    },
    ...userLabels.map<FilterRailItem>(l => ({
      value: l.id,
      label: l.name,
      color: getLabelColor(l.id),
    })),
  ]
}
