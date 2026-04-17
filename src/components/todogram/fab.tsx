'use client'

import type { ButtonHTMLAttributes } from 'react'
import { Plus } from '@untitledui/icons'
import { cx, sortCx } from '@/utils/cx'

/* --------------------------------------------------------------------------
 * Fab — Todogram v3 (Quiet Layer) 새 태스크 추가 플로팅 액션 버튼
 *
 * DESIGN.md §5 (56px 크기) + §6 (rounded-full) + §7 (모션) + §8 (컴포넌트) 근거.
 * approved.json: fab-variants-20260417 — Variant A "Sage Solid (Canonical)"
 *   - sage solid 색면이 TaskCard 3px 좌측 보더 · BottomNav sage underline 과 함께
 *     sage 삼위일체(fill ↔ line ↔ underline)를 완성 → 시스템 일관성 유지
 *   - 발견성 우선 채택 (Quiet Layer 충실도 7/10, 발견성 9/10) —
 *     아침 2초 체크가 핵심인 Todogram v1 의 정체성 반영
 *
 * 배치:
 *   - 모바일 전용 (`md:hidden`). 태블릿 이상은 sidebar 상단 '+ 새 태스크' 버튼으로 대체.
 *   - bottom = 72px (BottomNav 높이) + 16px (gap) + env(safe-area-inset-bottom)
 *   - right = 16px (모바일 side padding 과 동일)
 *   - z-30 — BottomNav(z-40) 아래, 일반 컨텐츠 위. 모달 오픈 시 자연스레 가려짐.
 *
 * 접근성:
 *   - aria-label 로 목적 전달 ("새 태스크 추가" / "Add new task")
 *   - 아이콘 aria-hidden (라벨이 이름 전달)
 *   - focus-visible 시 sage 링 (키보드 내비게이션)
 *   - prefers-reduced-motion: hover scale transition 1ms 로 무력화 (DESIGN §9-9)
 *   - 터치 타겟 56px — DESIGN §5 48px+ 요건 충족
 *   - type="button" 명시 — <form> 내부에 잘못 중첩되어도 submit 방지
 * -------------------------------------------------------------------------- */

export type FabLocale = 'ko' | 'en'

export interface FabProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'type'> {
  /** 로케일. 기본 'ko'. aria-label 기본값 결정에만 사용 (ariaLabel prop 우선). */
  locale?: FabLocale
  /**
   * aria-label 오버라이드. 미지정 시 locale 에 따라 자동.
   *   ko → '새 태스크 추가'
   *   en → 'Add new task'
   */
  ariaLabel?: string
  /**
   * 고정 위치(fixed) 비활성화. 스토리북/데모/데스크탑 sidebar 내부 등
   * 특수 맥락에서 부모가 레이아웃을 잡아야 할 때 true.
   */
  unstyled?: boolean
}

/* i18n 기본 라벨 — DESIGN.md 한/영 병용 원칙. */
const defaultAriaLabel: Record<FabLocale, string> = {
  ko: '새 태스크 추가',
  en: 'Add new task',
}

/* --------------------------------------------------------------------------
 * 스타일 — sortCx 로 position/visual/motion 로 그룹핑.
 * 컬러 매핑 (DESIGN.md §4 시맨틱 토큰만 사용, §9-1):
 *   - `bg-bg-brand-solid`         ≈ DESIGN --brand (sage #3A6E5B / dark #6FA58C)
 *   - `bg-bg-brand-solid_hover`   ≈ DESIGN --brand-hover
 *   - `text-white`                ≈ 아이콘 흰색 고정 (sage 위 최대 대비)
 *   - `outline-focus-ring`        ≈ 키보드 포커스 sage 링
 *   - `shadow-float`              ≈ DESIGN §6 플로팅 요소 그림자
 * -------------------------------------------------------------------------- */
const styles = sortCx({
  /* 고정 위치 — BottomNav(72px) 위 16px gap + iPhone 홈 인디케이터 safe-area.
   * md:hidden — 태블릿 이상은 BottomNav 와 함께 숨김. */
  position: {
    fixed:
      'fixed right-4 z-30 md:hidden' +
      ' bottom-[calc(theme(spacing.4)+72px+env(safe-area-inset-bottom))]',
  },
  visual: {
    /* 56×56 · rounded-full · sage solid + shadow-float.
     * 아이콘은 내부 중앙 정렬. */
    base:
      'inline-flex items-center justify-center size-14 rounded-full' +
      ' bg-bg-brand-solid text-white shadow-float' +
      ' hover:bg-bg-brand-solid_hover' +
      ' focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring' +
      ' disabled:cursor-not-allowed disabled:opacity-50',
  },
  motion: {
    /* hover scale(1.05) · active scale(0.97). prefers-reduced-motion 자동 대응.
     * DESIGN §7: hover 150ms ease-linear, active 100ms ease-out. */
    base:
      'transition-transform duration-150 ease-linear' +
      ' hover:scale-105 active:scale-[0.97] active:duration-100 active:ease-out' +
      ' motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100',
  },
  icon: {
    /* 24px · stroke 1.75 (line-style 일관). aria-hidden 은 JSX 에서 부여. */
    base: 'size-6',
  },
})

export function Fab({
  locale = 'ko',
  ariaLabel,
  unstyled = false,
  className,
  onClick,
  disabled,
  ...props
}: FabProps) {
  /* aria-label 결정 순서: 명시적 ariaLabel > locale 기본값. */
  const label = ariaLabel ?? defaultAriaLabel[locale]

  return (
    <button
      type="button"
      data-slot="fab"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        /* unstyled 모드: 고정 위치 제거. 부모가 배치를 잡는 맥락(sidebar 등). */
        !unstyled && styles.position.fixed,
        styles.visual.base,
        styles.motion.base,
        className,
      )}
      {...props}
    >
      <Plus aria-hidden="true" className={styles.icon.base} strokeWidth={1.75} />
    </button>
  )
}
