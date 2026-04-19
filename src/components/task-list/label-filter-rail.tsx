'use client'

import type { HTMLAttributes } from 'react'
import { cx, sortCx } from '@/utils/cx'
import { LabelChip, type LabelChipColor } from '@/components/todogram/label-chip'
import {
  FILTER_ALL,
  getLabelColor,
  type FilterValue,
  type LabelId,
} from '@/components/todogram/labels'

/* --------------------------------------------------------------------------
 * LabelFilterRail — Todogram v3 List View 전용 라벨 필터 바
 *
 * approved.json list-view-20260419 · spec.label_filter_rail 근거.
 *   - sticky top (검색 박스 바로 아래). bg-primary · 하단 1px 구분선.
 *   - chips: [전체 · 사용자 라벨 …]. Today View 의 FilterRail 과 달리
 *     **calendar reserved(dust-blue) 는 포함하지 않는다** — List View 는
 *     tasks 테이블만 다루고 외부 캘린더 이벤트는 범위 밖.
 *   - 칩은 LabelChip outline variant. selected 시 bg-tint + weight 600.
 *   - 터치 타겟은 wrapper button 이 min-h-[44px] 로 확보 (LabelChip 자체는 30px).
 *
 * filter rail 과 Today View 의 FilterRail 을 분리한 이유:
 *   - Today View 의 FilterRail 은 buildDefaultFilterItems 가 calendar 를 자동
 *     삽입한다. List View 에서 그 함수를 재사용하면 calendar 칩을 수동 제거해야
 *     하고, 미래에 Today View 쪽 빌더가 변하면 List View 가 깨진다.
 *   - 섹션 구조와의 시각 연동(섹션 헤더 sticky 가 필터 rail 바로 아래 붙어야 함)
 *     을 위해 여기서 offset 을 고정하고 싶다.
 *
 * 접근성:
 *   - tablist · tab · aria-selected (FilterRail 과 동일 패턴)
 *   - panelId 가 주어지면 aria-controls 로 연결 (stream panel 과 매핑)
 *   - 키보드: 현재 활성 탭만 tabIndex 0, 나머지 -1 (tablist 표준 roving tabindex)
 * -------------------------------------------------------------------------- */

/** rail 한 칩의 데이터. List View 는 'all' + user label ids 만 허용. */
export interface LabelFilterItem {
  /** 'all' 또는 user label id (문자열). */
  value: FilterValue
  /** 화면 라벨 (예: '전체', '직장'). */
  label: string
  /** 칩 색 override — 없으면 value 기준으로 해석. */
  color?: LabelChipColor
}

export interface LabelFilterRailProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  items: LabelFilterItem[]
  active: FilterValue
  onChange: (value: FilterValue) => void
  ariaLabel?: string
  panelId?: string
}

const styles = sortCx({
  wrapper: {
    /* sticky 상단 — top 은 부모 layout(검색 박스 아래) 이 설정.
     * z 인덱스는 섹션 헤더(z=2) 보다 높아야 스크롤 시 섹션 헤더가 필터 rail 위로
     * 겹쳐 올라가지 않는다. */
    base:
      'sticky top-0 z-[5] bg-bg-primary border-b border-border-primary',
  },
  scroller: {
    /* 좌우 16 · 상하 10(하단 12) · 가로 스크롤 · 스크롤바 숨김. */
    base:
      'flex gap-1.5 px-4 pt-2.5 pb-3 overflow-x-auto' +
      ' [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
  },
  button: {
    /* LabelChipButton 과 동일한 44px 터치 타겟 + focus ring. */
    base:
      'flex-none inline-flex items-center justify-center min-h-[44px]' +
      ' rounded-full' +
      ' focus-visible:outline focus-visible:outline-2' +
      ' focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
  },
})

/* --------------------------------------------------------------------------
 * resolveColor — value 에 따라 색 결정.
 *   - 'all' → 'moss' (중립, Today FilterRail 과 동일)
 *   - user label id → LABEL_COLOR_MAP 해석 (없으면 'moss' fallback)
 * -------------------------------------------------------------------------- */
function resolveColor(item: LabelFilterItem): LabelChipColor {
  if (item.color) return item.color
  if (item.value === FILTER_ALL) return 'moss'
  return getLabelColor(item.value as LabelId)
}

/* --------------------------------------------------------------------------
 * LabelFilterRail — List View 의 라벨 필터. calendar 제외.
 * -------------------------------------------------------------------------- */
export function LabelFilterRail({
  items,
  active,
  onChange,
  ariaLabel = '라벨 필터',
  panelId,
  className,
  ...props
}: LabelFilterRailProps) {
  return (
    <div
      data-slot="task-list-label-filter-rail"
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
              data-value={String(item.value)}
              data-active={isActive || undefined}
              className={styles.button.base}
            >
              <LabelChip color={color} variant="outline" size="md" selected={isActive}>
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
 * buildListFilterItems — 부모가 userLabels 만 넘기면 rail 용 item 배열 생성.
 * 순서: [전체] → [사용자 라벨 …]. calendar 는 List View 범위 밖이라 제외.
 * -------------------------------------------------------------------------- */
export interface FilterableUserLabel {
  /** label id. DB 의 string 화된 id (tasks.ts 쿼리와 정합). */
  id: LabelId
  /** 화면 표시명 (예: '직장'). */
  name: string
  /**
   * 라벨 색 — 원래 DB 의 Label.color(#RRGGBB) 가 truth 이지만, List View 는
   * LabelChip 에서 토큰 기반으로 렌더하므로 'sage'|'terracotta'|... 슬러그 필요.
   * 파라미터로 받아 넘겨주면 getLabelColor fallback 을 우회할 수 있다.
   */
  color?: LabelChipColor
}

export function buildListFilterItems(
  userLabels: FilterableUserLabel[],
  locale: 'ko' | 'en' = 'ko',
): LabelFilterItem[] {
  const allLabel = locale === 'ko' ? '전체' : 'All'

  return [
    { value: FILTER_ALL, label: allLabel },
    ...userLabels.map<LabelFilterItem>(l => ({
      value: l.id,
      label: l.name,
      color: l.color ?? getLabelColor(l.id),
    })),
  ]
}
