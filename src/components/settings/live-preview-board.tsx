'use client'

import { cx } from '@/utils/cx'
import {
  LabelChip,
  type LabelChipColor,
} from '@/components/todogram/label-chip'

/* --------------------------------------------------------------------------
 * tickBgBySlug — TaskRow 좌측 3px 색 틱 배경 매핑.
 *
 * 이유: Tailwind v4 JIT 는 `bg-label-${slug}` 처럼 동적으로 조립된 클래스를
 * 번들에 포함시키지 못한다(빌드 타임 스캔 기반). 정적 문자열 테이블로 매핑해
 * 실제 배포 번들에 6색 background 유틸이 모두 들어가도록 한다.
 * -------------------------------------------------------------------------- */
const tickBgBySlug: Record<LabelChipColor, string> = {
  sage: 'bg-label-sage',
  terracotta: 'bg-label-terracotta',
  'dust-blue': 'bg-label-dust-blue',
  amber: 'bg-label-amber',
  plum: 'bg-label-plum',
  moss: 'bg-label-moss',
}

/* --------------------------------------------------------------------------
 * LivePreviewBoard — U4 LabelEditorSheet 상단 "이 색이 실제로 어떻게 보일까"
 * 미리보기 영역.
 *
 * approved.json: designs/settings-labels-20260419/variant-C (Editor Sheet)
 *   - 요점: 편집 중인 라벨이 list/today/calendar 컨텍스트에서 어떻게 보일지
 *     즉시 확인 가능해야 "색을 고르는 실수" 가 줄어든다. Variant C 가 선정된 결정적 이유.
 *
 * 구성:
 *   1) LabelChip 4변형 한 줄 (dot / pill / outline / pill-dot)
 *      - default = dot (labelchip-variants-20260416 approved.json)
 *      - 같은 텍스트로 4가지를 한 번에 보여주면 사용자가 list/filter-rail 의
 *        outline 선택 상태도 가늠할 수 있다.
 *   2) TaskRow mock — 실제 리스트에 들어갔을 때 좌측 3px 색 틱 + dot chip 조합.
 *      list view 가 실제로 쓰는 언어와 동일하게 배치해 "이 색이 ledger 안에서
 *      너무 튀지 않나" 를 검증.
 *
 * 이름이 비어 있으면 placeholder 문구로 대체해서 프리뷰가 깨지지 않게 한다.
 * -------------------------------------------------------------------------- */

export interface LivePreviewBoardProps {
  /** 라벨 이름. 빈 문자열이면 placeholder 로 폴백. */
  name: string
  /** 현재 선택된 slug (design system 값). */
  slug: LabelChipColor
  /** 프리뷰 TaskRow 가 보여줄 가짜 태스크 타이틀. 로케일 기본값 제공. */
  sampleTaskTitle?: string
  className?: string
}

export function LivePreviewBoard({
  name,
  slug,
  sampleTaskTitle = '회의 준비 — 예시 태스크',
  className,
}: LivePreviewBoardProps) {
  // 공백만 들어왔을 때도 placeholder 로 떨어지도록 trim
  const displayName = name.trim().length > 0 ? name : '라벨 이름'

  return (
    <div
      data-slot="live-preview-board"
      className={cx(
        'rounded-2xl border border-border-secondary bg-bg-secondary p-4',
        className
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[12px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
          미리보기
        </h3>
        <span className="text-[11px] text-text-quaternary">
          라벨이 실제 화면에 보이는 방식
        </span>
      </div>

      {/* 1) LabelChip 4 variant 한 줄. Quiet Layer 원칙상 wrap 허용 — 좁은 화면에서 2줄이 되어도 깨지지 않음. */}
      <div className="flex flex-wrap items-center gap-2">
        <LabelChip color={slug} variant="dot" size="md">
          {displayName}
        </LabelChip>
        <LabelChip color={slug} variant="pill" size="md">
          {displayName}
        </LabelChip>
        <LabelChip color={slug} variant="outline" size="md">
          {displayName}
        </LabelChip>
        <LabelChip color={slug} variant="pill-dot" size="md">
          {displayName}
        </LabelChip>
      </div>

      {/* 2) TaskRow mock — list view 의 ledger row 와 동일한 geometry 를 최소화한 버전.
            좌측 3px 색 틱 + 체크원 + 타이틀 + dot chip 조합. */}
      <div className="mt-4">
        <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-text-quaternary">
          리스트에서
        </div>
        <div
          className={cx(
            'relative overflow-hidden rounded-xl border border-border-tertiary bg-bg-primary',
            'grid items-center gap-3 py-2.5 pr-3 pl-4',
            'grid-cols-[auto_1fr_auto]'
          )}
        >
          {/* 좌측 3px 색 틱 — TaskRow 와 동일한 시각 언어. */}
          <span
            aria-hidden="true"
            className={cx(
              'absolute inset-y-0 left-0 w-[3px]',
              tickBgBySlug[slug]
            )}
          />
          {/* 미완료 체크원 (시각적 토큰만). */}
          <span
            aria-hidden="true"
            className="size-4 rounded-full border border-border-primary"
          />
          <span className="truncate text-[14px] text-text-primary">
            {sampleTaskTitle}
          </span>
          <LabelChip color={slug} variant="dot" size="sm">
            {displayName}
          </LabelChip>
        </div>
      </div>
    </div>
  )
}
