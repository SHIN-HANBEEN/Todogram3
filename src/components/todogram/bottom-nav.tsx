'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ComponentType, HTMLAttributes, SVGProps } from 'react'
import {
  Calendar,
  CalendarCheck01,
  Settings01,
  Tag01,
} from '@untitledui/icons'
import { cx, sortCx } from '@/utils/cx'

/* --------------------------------------------------------------------------
 * BottomNav — Todogram v3 (Quiet Layer) 모바일 하단 네비게이션
 *
 * DESIGN.md §4 (컬러) + §5 (48px 터치 타겟) + §6 (72px 네비 높이) + §8 (컴포넌트) 근거.
 * approved.json: bottomnav-variants-20260417 — Variant C "Monolith Underline"
 *   - TodayHeader(U0.5) 와 동일한 "sage 1.5px underline" 활성 표현을 하단에 계승
 *   - 상단 탭(오늘/내일/이번 주) 과 하단 탭(Today/Calendar/Labels/Settings)이
 *     하나의 시각 언어로 동작 → 시스템 일관성 최대
 *
 * 구조:
 *   - 4탭: Today / Calendar / Labels / Settings (DESIGN.md §8 명세 순서)
 *   - 모바일 전용 (`md:hidden`). 태블릿 이상은 sidebar 로 대체 (DESIGN.md §6).
 *   - next/link + usePathname() 로 active 판별 — 외부 상태 관리 불필요.
 *
 * 접근성:
 *   - nav[aria-label] 로 스크린리더에 "주요 네비게이션" 의미 전달
 *   - 활성 탭은 aria-current="page" (현재 페이지 표식)
 *   - 각 탭 min-height/width 48px (DESIGN.md §5, §9-10 터치 타겟)
 *   - focus-visible 시 sage 링 (키보드 내비게이션)
 *   - prefers-reduced-motion: underline transition 1ms 로 무력화 (DESIGN.md §9-9)
 *   - 아이콘은 aria-hidden, 라벨 텍스트가 탭 이름 전달
 * -------------------------------------------------------------------------- */

export type BottomNavTabId = 'today' | 'calendar' | 'labels' | 'settings'

export type BottomNavLocale = 'ko' | 'en'

/* 탭 정의 — 라우트, 라벨, 아이콘을 한 곳에. 외부에서 href 커스터마이즈 필요 없도록 고정. */
interface BottomNavTab {
  id: BottomNavTabId
  href: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  /** i18n 라벨. 로케일별 표시 문구 (DESIGN.md 한/영 병용 원칙). */
  label: Record<BottomNavLocale, string>
}

/* 아이콘 매핑 — approved.json §icon.mapping 기준.
 *   - Today:    CalendarCheck01 (할 일이 들어있는 오늘 — 체크가 은유 전달)
 *   - Calendar: Calendar (순수 달력 뷰)
 *   - Labels:   Tag01 (라벨 관리)
 *   - Settings: Settings01 (톱니바퀴 정석)
 * 모두 @untitledui/icons 의 line-style 세트로 stroke 1.75 대응. */
const tabs: BottomNavTab[] = [
  {
    id: 'today',
    href: '/today',
    icon: CalendarCheck01,
    label: { ko: '오늘', en: 'Today' },
  },
  {
    id: 'calendar',
    href: '/calendar',
    icon: Calendar,
    label: { ko: '캘린더', en: 'Calendar' },
  },
  {
    id: 'labels',
    href: '/labels',
    icon: Tag01,
    label: { ko: '라벨', en: 'Labels' },
  },
  {
    id: 'settings',
    href: '/settings',
    icon: Settings01,
    label: { ko: '설정', en: 'Settings' },
  },
]

export interface BottomNavProps
  extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  /** 로케일. 기본 'ko' (Todogram v1 주 사용자 한국어). */
  locale?: BottomNavLocale
  /** 활성 탭 강제 지정. 미지정 시 usePathname() 으로 자동 판별. 스토리북/테스트 용. */
  activeTab?: BottomNavTabId
}

/* --------------------------------------------------------------------------
 * 스타일 — sortCx 로 그룹핑. 시맨틱 토큰만 사용 (DESIGN.md §9-1).
 * 컬러 매핑:
 *   - `bg-bg-primary`         ≈ DESIGN.md --bg-surface (#FFFFFF)
 *   - `border-border-primary` ≈ DESIGN.md --border-muted (#D9D6CC) — chrome 경계 (TodayHeader 와 동일)
 *   - `text-fg-brand-primary` ≈ DESIGN.md --brand (sage #3A6E5B / dark #6FA58C)
 *   - `text-text-tertiary`    ≈ DESIGN.md --text-tertiary (비활성 탭)
 *   - `text-text-secondary`   ≈ DESIGN.md --text-secondary (hover state)
 *   - `outline-focus-ring`    ≈ DESIGN.md --brand-500 (키보드 포커스)
 * -------------------------------------------------------------------------- */
const styles = sortCx({
  wrapper: {
    /* 72px 높이 + env(safe-area-inset-bottom) 로 iPhone 홈 인디케이터 공간 확보.
     * fixed bottom — 모바일 전용. md 이상은 hidden. z-40 으로 FAB(z-30 가정)보다 위. */
    base:
      'fixed inset-x-0 bottom-0 z-40 md:hidden' +
      ' flex h-[72px] items-center justify-around' +
      ' bg-bg-primary border-t border-border-primary' +
      ' px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]' +
      ' shadow-[0_-1px_2px_rgba(26,26,23,0.03),0_-6px_20px_rgba(26,26,23,0.04)]',
  },
  tab: {
    /* 48x48 터치 타겟 + 밑줄 공간 pb-1. flex-1 로 4등분. */
    base:
      'relative flex min-h-12 min-w-12 flex-1 flex-col items-center justify-center gap-1 pb-1' +
      ' text-text-tertiary transition-colors duration-[180ms] ease-out' +
      ' hover:text-text-secondary' +
      ' focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring' +
      ' rounded-sm',
    /* 활성: sage 컬러 + 라벨 weight 증가는 tabLabel 쪽에서 처리. */
    active: 'text-fg-brand-primary',
    /* underline — 28px × 1.5px sage 라인. scaleX 로 penultimate 애니메이션.
     * TodayHeader 와 동일한 duration 220ms ease-in-out 로 시각 언어 통일. */
    underline:
      'absolute left-1/2 -bottom-[2px] h-[1.5px] w-7 -translate-x-1/2 rounded-[2px] bg-fg-brand-primary' +
      ' origin-center transition-transform duration-[220ms] ease-in-out' +
      ' motion-reduce:transition-none',
    underlineActive: 'scale-x-100',
    underlineInactive: 'scale-x-0',
  },
  icon: {
    /* 22px line-style. stroke 1.75 는 prop 으로 전달 (UntitledUI 아이콘 지원). */
    base: 'size-[22px]',
  },
  tabLabel: {
    /* Pretendard 11px / 500. 활성 시 600 으로 굵기 강화 (색+굵기 이중 표식). */
    base: 'text-[11px] leading-none font-medium tracking-[0.01em]',
    active: 'font-semibold',
  },
})

/* --------------------------------------------------------------------------
 * 활성 판별 — pathname 이 tab.href 로 시작하면 활성.
 * 단, href='/settings' 가 '/settings/view' 에도 매칭되어야 하므로 startsWith 기반.
 * 정확 매칭 + prefix 매칭 (tab.href + '/') 둘 중 하나면 활성.
 * -------------------------------------------------------------------------- */
function matchTab(pathname: string, tabHref: string): boolean {
  return pathname === tabHref || pathname.startsWith(`${tabHref}/`)
}

export function BottomNav({
  locale = 'ko',
  activeTab,
  className,
  ...props
}: BottomNavProps) {
  /* next/navigation 의 usePathname — 클라이언트 컴포넌트에서만 동작. 'use client' 선언 필요. */
  const pathname = usePathname()

  /* ariaLabel 도 로케일 대응. 스크린리더 사용자에게 의미 있는 네비 이름 전달. */
  const navAriaLabel = locale === 'ko' ? '주요 네비게이션' : 'Primary navigation'

  return (
    <nav
      data-slot="bottom-nav"
      aria-label={navAriaLabel}
      className={cx(styles.wrapper.base, className)}
      {...props}
    >
      {tabs.map(tab => {
        /* activeTab prop 우선, 없으면 pathname 으로 판별. */
        const isActive =
          activeTab != null ? activeTab === tab.id : matchTab(pathname, tab.href)
        const Icon = tab.icon
        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={isActive ? 'page' : undefined}
            data-active={isActive || undefined}
            className={cx(styles.tab.base, isActive && styles.tab.active)}
          >
            {/* 아이콘 — aria-hidden 으로 스크린리더가 중복 읽지 않도록. 라벨 텍스트가 이름 전달. */}
            <Icon
              aria-hidden="true"
              className={styles.icon.base}
              strokeWidth={1.75}
            />
            <span
              className={cx(
                styles.tabLabel.base,
                isActive && styles.tabLabel.active
              )}
            >
              {tab.label[locale]}
            </span>
            {/* underline — 활성 시 scaleX(1), 비활성 시 scaleX(0). prefers-reduced-motion 자동 대응. */}
            <span
              aria-hidden="true"
              className={cx(
                styles.tab.underline,
                isActive
                  ? styles.tab.underlineActive
                  : styles.tab.underlineInactive
              )}
            />
          </Link>
        )
      })}
    </nav>
  )
}
