'use client'

import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import {
  DotsGrid as GripIcon,
  ChevronRight,
  Lock01,
  Plus,
} from '@untitledui/icons'

import { cx } from '@/utils/cx'
import type { LabelChipColor } from '@/components/todogram/label-chip'

/* --------------------------------------------------------------------------
 * LabelsListStrip — U4 라벨 관리 화면의 "스트립" 리스트
 *
 * approved.json: designs/settings-labels-20260419/variant-C
 *   geometry: grid-template-columns: 20px 10px 1fr auto auto
 *             (grip, dot, name, count, chevron)
 *   row height: 52px (min 48px 터치 타겟 확보)
 *
 * 캘린더 reserved 라벨은 비활성화(클릭 불가) 상태로 맨 위에 고정 노출하고
 * 오른쪽에 "외부" 자물쇠 배지를 붙여 편집 금지 이유를 암시한다 (DESIGN.md §4-3).
 *
 * 드래그 리오더는 v1.5 이후 — v1 에서는 grip 만 시각적 힌트로 노출하되
 * 실제 DnD 라이브러리는 붙이지 않는다 (approved.json rationale: "v1 은
 * position 자동 채번으로 충분"). grip 이 cursor:grab 처럼 보이지 않도록
 * disabled 처리해 사용자 혼동을 줄인다.
 * -------------------------------------------------------------------------- */

/* color slug → dot 배경 매핑 (Tailwind JIT 정적 스캔을 위한 룩업 테이블) */
const dotBgBySlug: Record<LabelChipColor, string> = {
  sage: 'bg-label-sage',
  terracotta: 'bg-label-terracotta',
  'dust-blue': 'bg-label-dust-blue',
  amber: 'bg-label-amber',
  plum: 'bg-label-plum',
  moss: 'bg-label-moss',
}

export interface LabelStripItem {
  /** DB 라벨 id (정수). calendar reserved 는 문자열 sentinel 로 구분. */
  id: number | string
  name: string
  slug: LabelChipColor
  /** 이 라벨이 붙은 태스크 개수. UI 힌트용 — 0 은 '—' 로 표시. */
  taskCount: number
  /** 캘린더 reserved 여부. true 면 비활성화 + 자물쇠 배지. */
  reserved?: boolean
  /**
   * 편집 시트 초깃값 복원에 쓰이는 원본 DB 값.
   * slug 만으로는 여러 hex 후보가 있을 수 있고(hex→slug 가 다대일), 특히 다크모드
   * 헥스로 저장된 라벨을 라이트 모드에서 편집할 때도 정확히 복원하려면 hex 자체가 필요.
   * LabelsListStrip 는 렌더에 meta 를 쓰지 않는다 — 상위 컨테이너가 편집 시트에
   * 넘길 용도로만 사용.
   */
  meta?: {
    hex: string
    googleColorId: string | null
  }
}

export interface LabelsListStripProps {
  items: readonly LabelStripItem[]
  /** 행 클릭(또는 Enter/Space) 시 호출. reserved 는 호출되지 않음. */
  onSelect: (item: LabelStripItem) => void
  /** + 새 라벨 버튼 클릭 시 호출. */
  onAdd: () => void
  /** 라벨이 전혀 없을 때(캘린더 reserved 만 있을 때 등) 표시할 설명. */
  emptyHint?: string
}

export function LabelsListStrip({
  items,
  onSelect,
  onAdd,
  emptyHint = '아직 라벨이 없어요. 직장/가정/학습 등 분류를 만들어 보세요.',
}: LabelsListStripProps) {
  const editableCount = items.filter(item => !item.reserved).length

  return (
    <section
      data-slot="labels-list-strip"
      aria-label="라벨 목록"
      className="flex flex-col"
    >
      {/* 헤더: 개수 + Add 버튼 */}
      <header className="flex items-center justify-between pb-3">
        <div>
          <h2 className="text-[15px] font-semibold text-text-primary">
            라벨
          </h2>
          <p className="mt-0.5 text-[12px] text-text-tertiary">
            내가 만든 라벨 {editableCount}개
          </p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className={cx(
            'inline-flex min-h-10 items-center gap-1.5 rounded-full',
            'px-3.5 text-[13px] font-semibold',
            'bg-bg-brand-solid text-text-primary_on-brand hover:bg-bg-brand-solid_hover',
            'focus-visible:outline focus-visible:outline-2',
            'focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
            'transition duration-100 ease-linear'
          )}
        >
          <Plus className="size-4" aria-hidden="true" />새 라벨
        </button>
      </header>

      {/* 스트립 리스트 */}
      <ul
        role="list"
        className={cx(
          'flex flex-col overflow-hidden rounded-xl',
          'border border-border-secondary bg-bg-primary'
        )}
      >
        {items.length === 0 ? (
          <li className="px-4 py-6 text-center text-[13px] text-text-quaternary">
            {emptyHint}
          </li>
        ) : (
          items.map((item, index) => (
            <LabelStripRow
              key={item.id}
              item={item}
              isLast={index === items.length - 1}
              onSelect={onSelect}
            />
          ))
        )}
      </ul>
    </section>
  )
}

/* --------------------------------------------------------------------------
 * LabelStripRow — 52px 높이 단일 행.
 * -------------------------------------------------------------------------- */
interface LabelStripRowProps {
  item: LabelStripItem
  isLast: boolean
  onSelect: (item: LabelStripItem) => void
}

function LabelStripRow({ item, isLast, onSelect }: LabelStripRowProps) {
  const interactive = !item.reserved

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLLIElement>) => {
    if (!interactive) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect(item)
    }
  }

  return (
    <li
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : -1}
      aria-label={
        interactive
          ? `${item.name} 라벨 편집, 연결된 태스크 ${item.taskCount}개`
          : `${item.name} — 외부 캘린더 전용 라벨`
      }
      aria-disabled={interactive ? undefined : true}
      onClick={() => interactive && onSelect(item)}
      onKeyDown={handleKeyDown}
      className={cx(
        'grid items-center gap-3 px-4',
        /* 52px min-height, 48px 터치 타겟 확보 */
        'min-h-[52px]',
        /* grid: grip | dot | name | count | chevron-or-lock */
        '[grid-template-columns:20px_10px_1fr_auto_auto]',
        !isLast && 'border-b border-border-tertiary',
        interactive &&
          'cursor-pointer hover:bg-bg-primary_hover transition-colors duration-100 ease-linear',
        !interactive && 'bg-bg-secondary cursor-not-allowed',
        'focus-visible:outline focus-visible:outline-2',
        'focus-visible:outline-offset-[-2px] focus-visible:outline-focus-ring'
      )}
    >
      {/* grip — v1 은 시각 힌트만, DnD 미연결이므로 옅은 쿼터너리 색. */}
      <span
        aria-hidden="true"
        className={cx(
          'inline-flex items-center justify-center',
          item.reserved
            ? 'text-text-quaternary/40'
            : 'text-text-quaternary'
        )}
      >
        <GripIcon className="size-4" />
      </span>

      {/* 10px 색 dot */}
      <span
        aria-hidden="true"
        className={cx(
          'size-2.5 rounded-full',
          item.reserved ? 'opacity-70' : '',
          dotBgBySlug[item.slug]
        )}
      />

      {/* name */}
      <span
        className={cx(
          'truncate text-[14px]',
          item.reserved
            ? 'text-text-tertiary font-medium'
            : 'text-text-primary font-medium'
        )}
      >
        {item.name}
      </span>

      {/* count */}
      <span
        className={cx(
          'font-mono tabular-nums text-[12px]',
          item.taskCount === 0
            ? 'text-text-quaternary'
            : 'text-text-tertiary'
        )}
        aria-hidden="true"
      >
        {item.taskCount === 0 ? '—' : item.taskCount}
      </span>

      {/* chevron or lock badge */}
      {item.reserved ? (
        <span
          className={cx(
            'inline-flex items-center gap-1 rounded-full',
            'border border-border-tertiary bg-bg-primary',
            'px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]',
            'text-text-tertiary'
          )}
        >
          <Lock01 className="size-3" aria-hidden="true" />
          외부
        </span>
      ) : (
        <ChevronRight
          className="size-4 text-text-quaternary"
          aria-hidden="true"
        />
      )}
    </li>
  )
}
