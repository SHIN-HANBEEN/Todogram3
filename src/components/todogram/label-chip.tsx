'use client'

import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import { X as CloseX } from '@untitledui/icons'
import { cx, sortCx } from '@/utils/cx'

/* --------------------------------------------------------------------------
 * LabelChip — Todogram v3 (Quiet Layer) 라벨 칩
 *
 * DESIGN.md §4-3 (6색 역할 구분) + §8 (컴포넌트 구현 지침) 근거.
 * approved.json: labelchip-variants-20260416 — 맥락별 variant 전략, default = 'dot'.
 *
 * 4 variant × 3 size × 6 color × (selected | deletable | disabled).
 *   variant 'dot'       — TaskCard 인라인 메타 기본값 (가장 조용함)
 *   variant 'pill'      — DESIGN.md §4-3 canonical (label 관리/알림)
 *   variant 'outline'   — 필터바의 탭 가능한 칩 (selected 상태 표현 자연스러움)
 *   variant 'pill-dot'  — 색맹 접근성 강화 (Sunsama 따라감)
 * -------------------------------------------------------------------------- */

export type LabelChipColor =
  | 'sage'
  | 'terracotta'
  | 'dust-blue'
  | 'amber'
  | 'plum'
  | 'moss'

export type LabelChipVariant = 'dot' | 'pill' | 'outline' | 'pill-dot'

export type LabelChipSize = 'sm' | 'md' | 'lg'

/* color별 Tailwind 클래스 매핑. --color-label-{name}, --color-label-{name}-bg 사용. */
const colorStyles = sortCx({
  sage: {
    pillBg: 'bg-label-sage-bg text-label-sage',
    outline: 'border-label-sage text-label-sage',
    outlineSelected:
      'border-label-sage text-label-sage bg-label-sage-bg font-semibold',
    dot: 'bg-label-sage',
  },
  terracotta: {
    pillBg: 'bg-label-terracotta-bg text-label-terracotta',
    outline: 'border-label-terracotta text-label-terracotta',
    outlineSelected:
      'border-label-terracotta text-label-terracotta bg-label-terracotta-bg font-semibold',
    dot: 'bg-label-terracotta',
  },
  'dust-blue': {
    pillBg: 'bg-label-dust-blue-bg text-label-dust-blue',
    outline: 'border-label-dust-blue text-label-dust-blue',
    outlineSelected:
      'border-label-dust-blue text-label-dust-blue bg-label-dust-blue-bg font-semibold',
    dot: 'bg-label-dust-blue',
  },
  amber: {
    pillBg: 'bg-label-amber-bg text-label-amber',
    outline: 'border-label-amber text-label-amber',
    outlineSelected:
      'border-label-amber text-label-amber bg-label-amber-bg font-semibold',
    dot: 'bg-label-amber',
  },
  plum: {
    pillBg: 'bg-label-plum-bg text-label-plum',
    outline: 'border-label-plum text-label-plum',
    outlineSelected:
      'border-label-plum text-label-plum bg-label-plum-bg font-semibold',
    dot: 'bg-label-plum',
  },
  moss: {
    pillBg: 'bg-label-moss-bg text-label-moss',
    outline: 'border-label-moss text-label-moss',
    outlineSelected:
      'border-label-moss text-label-moss bg-label-moss-bg font-semibold',
    dot: 'bg-label-moss',
  },
})

/* variant/size 별 형태. dot 는 pill shape 없이 텍스트 + 색점만. */
const variantSizeStyles = sortCx({
  common: {
    base: 'inline-flex items-center leading-none transition duration-100 ease-linear',
    focus:
      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
  },
  pill: {
    base: 'rounded-full font-semibold uppercase tracking-[0.08em]',
    sm: 'gap-1.5 px-2 py-0.5 text-[10px]',
    md: 'gap-1.5 px-2.5 py-1 text-[11px]',
    lg: 'gap-2 px-3.5 py-1.5 text-[12px]',
  },
  outline: {
    base: 'rounded-full border font-medium',
    sm: 'gap-1.5 px-2 py-[3px] text-[11px]',
    md: 'gap-1.5 px-2.5 py-1 text-[12px]',
    lg: 'gap-2 px-3.5 py-1.5 text-[13px]',
  },
  dot: {
    base: 'gap-1.5 font-medium text-text-secondary bg-transparent',
    sm: 'text-[12px]',
    md: 'text-[13px]',
    lg: 'text-[14px]',
  },
  pillDot: {
    base: 'rounded-full font-semibold uppercase tracking-[0.08em]',
    sm: 'gap-1.5 pl-2 pr-2.5 py-0.5 text-[10px]',
    md: 'gap-1.5 pl-2.5 pr-3 py-1 text-[11px]',
    lg: 'gap-2 pl-3 pr-4 py-1.5 text-[12px]',
  },
})

/* dot 원 자체의 크기. variant=dot / pill-dot 공용. */
const dotSizeStyles = sortCx({
  sm: 'size-[5px]',
  md: 'size-[6px]',
  lg: 'size-[7px]',
})

export interface LabelChipProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, 'children' | 'color'> {
  color: LabelChipColor
  children: ReactNode
  variant?: LabelChipVariant
  size?: LabelChipSize
  selected?: boolean
  onRemove?: () => void
  disabled?: boolean
}

/* 칩 단일 렌더. interactive 여부는 onRemove/selected 유무에 따라 달라짐. */
export function LabelChip({
  color,
  children,
  variant = 'dot',
  size = 'md',
  selected = false,
  onRemove,
  disabled = false,
  className,
  ...props
}: LabelChipProps) {
  const colors = colorStyles[color]

  /* variant 별 root 클래스 조합 */
  let variantClasses = ''
  let showDot = false

  switch (variant) {
    case 'pill':
      variantClasses = cx(
        variantSizeStyles.pill.base,
        variantSizeStyles.pill[size],
        colors.pillBg,
      )
      break
    case 'outline':
      variantClasses = cx(
        variantSizeStyles.outline.base,
        variantSizeStyles.outline[size],
        selected ? colors.outlineSelected : colors.outline,
      )
      break
    case 'dot':
      variantClasses = cx(
        variantSizeStyles.dot.base,
        variantSizeStyles.dot[size],
      )
      showDot = true
      break
    case 'pill-dot':
      variantClasses = cx(
        variantSizeStyles.pillDot.base,
        variantSizeStyles.pillDot[size],
        colors.pillBg,
      )
      showDot = true
      break
  }

  return (
    <span
      data-slot="label-chip"
      data-variant={variant}
      data-size={size}
      data-color={color}
      aria-selected={variant === 'outline' ? selected : undefined}
      aria-disabled={disabled || undefined}
      className={cx(
        variantSizeStyles.common.base,
        variantClasses,
        disabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
      {...props}
    >
      {showDot && (
        <span
          aria-hidden="true"
          className={cx(
            'flex-none rounded-full',
            colors.dot,
            dotSizeStyles[size],
          )}
        />
      )}
      <span className="truncate">{children}</span>
      {onRemove && !disabled && (
        <button
          type="button"
          aria-label="라벨 제거"
          onClick={event => {
            event.stopPropagation()
            onRemove()
          }}
          className={cx(
            'inline-flex items-center justify-center rounded-full',
            'size-3.5 ml-0.5 opacity-60 hover:opacity-100',
            'hover:bg-current/15 transition duration-100 ease-linear',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-current',
          )}
        >
          <CloseX className="size-3" aria-hidden="true" />
        </button>
      )}
    </span>
  )
}

/* --------------------------------------------------------------------------
 * LabelChipButton — 탭 가능한 인터랙티브 칩 (필터바 전용)
 * outline variant 에 주로 쓰이며, 터치 타겟 48px 확보를 위해 wrapper 제공.
 * -------------------------------------------------------------------------- */

export interface LabelChipButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'color'>,
    Pick<LabelChipProps, 'color' | 'variant' | 'size' | 'selected'> {
  children: ReactNode
}

export function LabelChipButton({
  color,
  children,
  variant = 'outline',
  size = 'md',
  selected = false,
  disabled,
  className,
  ...props
}: LabelChipButtonProps) {
  return (
    <button
      type="button"
      data-slot="label-chip-button"
      aria-pressed={selected}
      disabled={disabled}
      className={cx(
        /* 터치 타겟 48px 확보 (DESIGN.md §5). 실제 칩은 안쪽에 렌더. */
        'inline-flex items-center justify-center min-h-[44px] py-0.5',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <LabelChip
        color={color}
        variant={variant}
        size={size}
        selected={selected}
      >
        {children}
      </LabelChip>
    </button>
  )
}

/* --------------------------------------------------------------------------
 * LabelChipOverflow — "+N" 표시 칩 (라벨이 많아 잘릴 때)
 * JetBrains Mono + tabular-nums (DESIGN.md §3 특수 스타일).
 * -------------------------------------------------------------------------- */

export interface LabelChipOverflowProps
  extends HTMLAttributes<HTMLSpanElement> {
  count: number
  size?: LabelChipSize
}

/* overflow 칩 size 별 스타일 — pill 과 비슷하지만 중립 색상 사용. */
const overflowSizeStyles = sortCx({
  sm: 'px-2 py-0.5 text-[10px]',
  md: 'px-2.5 py-1 text-[11px]',
  lg: 'px-3 py-1.5 text-[12px]',
})

export function LabelChipOverflow({
  count,
  size = 'md',
  className,
  ...props
}: LabelChipOverflowProps) {
  if (count <= 0) return null
  return (
    <span
      data-slot="label-chip-overflow"
      className={cx(
        'inline-flex items-center rounded-full',
        'bg-bg-subtle text-text-muted',
        'font-mono font-medium tabular-nums',
        overflowSizeStyles[size],
        className,
      )}
      {...props}
    >
      +{count}
    </span>
  )
}
