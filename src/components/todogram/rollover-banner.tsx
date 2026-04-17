'use client'

import type { HTMLAttributes } from 'react'
import { RefreshCcw02, X as CloseX } from '@untitledui/icons'
import { cx, sortCx } from '@/utils/cx'

/* --------------------------------------------------------------------------
 * RolloverBanner — Todogram v3 (Quiet Layer) 이월 건 요약 배너
 *
 * DESIGN.md §4-3 (amber label) + §4-4 (warning semantic) + §5 (터치 타겟) +
 * §7 (Auto-rollover 모션: 아이콘 페이드인 only) 근거.
 * approved.json: today-view-20260417 — RolloverBanner spec.
 *
 * 기능: 어제 완료 못한 태스크가 오늘로 자동 이월되었을 때, Today View 상단에
 * 표시되는 요약 배너. 사용자는 한 번에 "오늘 유지(Keep)" 또는 "보관(Archive)"
 * 결정 가능. count === 0 이면 렌더하지 않음 (null 반환).
 *
 * 시각:
 *   - amber tint 배경 (warning semantic — 조용한 주의, 공격적 빨강 X)
 *   - 좌측 3px amber tick (TodayRow 와 동일한 '색 틱' 언어 계승)
 *   - ⟲ RefreshCcw 아이콘 (rollover 은 회전·재시작의 은유)
 *   - 2 primary 액션: 유지(sage outline) · 보관(ghost) · 닫기 X (선택)
 *
 * 접근성:
 *   - role="status" aria-live="polite" — 이월이 발생한 사실을 스크린리더에
 *     조용히 전달 (assertive 는 공격적이라 피함)
 *   - count 숫자 → aria-label 로 문장 전달 ("어제 이월 3건")
 *   - 액션 버튼 min-h 44px (DESIGN §5)
 *   - 닫기 X 아이콘만 있으므로 aria-label 필수
 *
 * 모션:
 *   - DESIGN §7: auto-rollover 는 아이콘 페이드인만 (400ms ease-out)
 *   - prefers-reduced-motion 시 duration-[1ms] (Tailwind motion-reduce 자동)
 * -------------------------------------------------------------------------- */

export type RolloverBannerLocale = 'ko' | 'en'

export interface RolloverBannerProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** 어제에서 이월된 태스크 개수. 0 이면 배너 자체가 렌더 안 됨. */
  count: number
  /**
   * 유지 — 이월된 태스크들을 오늘 날짜로 계속 유지.
   * Todogram 기본 동작(그대로 두기)을 명시적으로 확정시키는 의미.
   */
  onKeep: () => void
  /**
   * 보관 — 이월된 태스크들을 archived 상태로 이동.
   * 오늘 스트림에서 제거되어 시야에서 사라짐.
   */
  onArchive: () => void
  /** 배너 자체를 접기 (액션 없이 무시). 미지정 시 X 버튼 렌더 안 함. */
  onDismiss?: () => void
  /** 로케일. 기본 'ko'. 버튼/문구 i18n 에만 사용. */
  locale?: RolloverBannerLocale
}

/* --------------------------------------------------------------------------
 * i18n 문구 — DESIGN.md 의 한/영 병용 원칙.
 * -------------------------------------------------------------------------- */
const copy: Record<
  RolloverBannerLocale,
  {
    title: (count: number) => string
    description: string
    keep: string
    archive: string
    dismiss: string
  }
> = {
  ko: {
    title: count => `어제에서 이월된 할 일 ${count}건`,
    description: '오늘 처리할지, 보관할지 선택하세요.',
    keep: '오늘 유지',
    archive: '보관',
    dismiss: '배너 닫기',
  },
  en: {
    title: count => `${count} task${count === 1 ? '' : 's'} rolled over`,
    description: 'Keep them on today, or archive them.',
    keep: 'Keep',
    archive: 'Archive',
    dismiss: 'Dismiss banner',
  },
}

/* --------------------------------------------------------------------------
 * 스타일 — sortCx 로 root/icon/text/actions 그룹핑.
 * amber 계열 색은 label-amber 토큰 재사용 (DESIGN §4-3).
 * 배경은 커스텀 RGB — bg-utility-amber-50 이 있다면 그것을 쓰는 것이 더 나음.
 * 현 스타터 theme.css 에 있는지 불확실하여 inline label-amber-bg 로 안전하게.
 * -------------------------------------------------------------------------- */
const styles = sortCx({
  root: {
    /* 카드형 배너 — 좌측 3px amber tick + 우측 rounded · padding + soft amber bg. */
    base:
      'relative flex items-start gap-3 mx-4 my-3 pl-[11px] pr-3 py-3' +
      ' rounded-r-md border-l-[3px] border-l-label-amber bg-label-amber-bg' +
      ' motion-safe:animate-in motion-safe:fade-in motion-safe:duration-[400ms]',
  },
  iconWrap: {
    /* ⟲ 아이콘 — amber full color. 위쪽 정렬 (텍스트 첫 줄과 align). */
    base:
      'flex-none inline-flex items-center justify-center mt-0.5 size-5' +
      ' text-label-amber',
  },
  textWrap: {
    /* 텍스트 블록 — 제목 + 설명. flex-1 으로 액션 버튼에 자리 내주기. */
    base: 'flex-1 min-w-0 inline-flex flex-col gap-0.5',
  },
  title: {
    /* 제목 — Pretendard 14px / 600. amber 본문색(label-amber) 으로 배경과 톤 맞춤. */
    base: 'text-[14px] leading-[1.3] font-semibold text-label-amber truncate',
  },
  description: {
    /* 설명 — 13px text-secondary. 두 줄 넘지 않도록 부모가 관리. */
    base: 'text-[13px] leading-[1.4] text-text-secondary',
  },
  actions: {
    /* 액션 래퍼 — 모바일에서는 텍스트 우측 또는 하단 (공간에 따라). */
    base: 'flex-none inline-flex items-center gap-1.5',
  },
  btnBase: {
    /* 공통 버튼 — 터치 타겟 44px · focus-ring 공통. */
    base:
      'inline-flex items-center justify-center min-h-[44px] px-3 rounded-lg' +
      ' text-[13px] font-medium leading-none' +
      ' transition duration-100 ease-linear motion-reduce:transition-none' +
      ' focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2' +
      ' focus-visible:outline-focus-ring' +
      ' disabled:cursor-not-allowed disabled:opacity-50',
  },
  btnKeep: {
    /* primary outline sage — '유지' 는 기본 긍정 액션. */
    base:
      'border border-border-brand text-text-brand-primary bg-transparent' +
      ' hover:bg-bg-brand-primary',
  },
  btnArchive: {
    /* ghost — '보관' 은 덜 자주 쓰는 액션. text-muted + hover 시 배경 약간. */
    base:
      'text-text-secondary hover:bg-bg-primary_hover border border-transparent',
  },
  dismiss: {
    /* 우측 상단 X — 48px 터치 타겟 확보하면서 시각적으론 작게. */
    base:
      'absolute top-1.5 right-1.5 inline-flex items-center justify-center' +
      ' size-8 rounded-full text-text-tertiary hover:text-text-secondary' +
      ' hover:bg-bg-primary_hover transition duration-100 ease-linear' +
      ' focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2' +
      ' focus-visible:outline-focus-ring motion-reduce:transition-none',
  },
})

/* --------------------------------------------------------------------------
 * RolloverBanner — count 가 0 이면 null 반환 (부모 조건부 렌더 불필요).
 * -------------------------------------------------------------------------- */
export function RolloverBanner({
  count,
  onKeep,
  onArchive,
  onDismiss,
  locale = 'ko',
  className,
  ...props
}: RolloverBannerProps) {
  if (count <= 0) return null

  const text = copy[locale]
  const titleText = text.title(count)

  return (
    <div
      data-slot="rollover-banner"
      data-count={count}
      role="status"
      aria-live="polite"
      aria-label={titleText}
      className={cx(styles.root.base, className)}
      {...props}
    >
      {/* ⟲ 아이콘 — rollover 의 시각적 은유 (회전/재시작). aria-hidden: 제목이 의미 전달. */}
      <span className={styles.iconWrap.base} aria-hidden="true">
        <RefreshCcw02 className="size-5" strokeWidth={1.75} />
      </span>

      <span className={styles.textWrap.base}>
        <span className={styles.title.base}>{titleText}</span>
        <span className={styles.description.base}>{text.description}</span>
      </span>

      <span className={styles.actions.base}>
        <button
          type="button"
          onClick={onKeep}
          className={cx(styles.btnBase.base, styles.btnKeep.base)}
        >
          {text.keep}
        </button>
        <button
          type="button"
          onClick={onArchive}
          className={cx(styles.btnBase.base, styles.btnArchive.base)}
        >
          {text.archive}
        </button>
      </span>

      {/* 선택적 X 버튼 — onDismiss 넘긴 경우에만 렌더. */}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={text.dismiss}
          className={styles.dismiss.base}
        >
          <CloseX className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
