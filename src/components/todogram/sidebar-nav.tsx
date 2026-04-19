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
 * SidebarNav — Todogram v3 (Quiet Layer) 데스크탑 좌측 네비게이션 (U5)
 *
 * DESIGN.md §6 Layout 근거:
 *   - 데스크탑 (1024px+) 에서만 등장. 3컬럼 레이아웃의 첫 번째 컬럼이 이 사이드바.
 *   - 고정 폭 240px · 세로 flex · 상단 sticky. 모바일/태블릿에서는 hidden.
 *   - 모바일/태블릿은 BottomNav 가 동일한 4탭을 담당 — 시스템 일관성 유지.
 *
 * approved.json 연결:
 *   - BottomNav(bottomnav-variants-20260417) 의 Monolith Underline 활성 표현을
 *     세로 방향에서는 "왼쪽 2px sage 바" 로 전치. TaskCard 의 좌측 3px 보더와
 *     시각 언어(색·두께)가 호응 → sage 삼위일체(fill ↔ line ↔ underline/bar).
 *   - 상단 "Todogram" 워드마크 1회 노출 (display 폰트) — DESIGN.md §3 Instrument Serif
 *     허용 영역. 본문 레이어는 Pretendard 로 유지.
 *
 * 접근성:
 *   - nav[aria-label] 로 "주요 네비게이션" 의미 전달 (BottomNav 와 동일)
 *   - 활성 탭 aria-current="page"
 *   - focus-visible 시 sage 링 (키보드 내비게이션)
 *   - 탭 최소 높이 44px — DESIGN.md §5 48px 권장치에 근접 (데스크탑 포인터 위주).
 *   - 아이콘 aria-hidden, 라벨 텍스트가 탭 이름 전달
 *
 * 왜 BottomNav 와 분리된 컴포넌트인가:
 *   - 배치(수평 바 vs 세로 스택)가 근본적으로 달라 스타일 분기가 너무 많아짐.
 *   - 활성 인디케이터 모양(underline vs left bar)이 서로 직교 —
 *     한 컴포넌트로 묶으면 className 분기가 복잡해져 읽기 어려워진다.
 *   - 탭 정의(id/href/icon/label)만 상수로 공유하면 충분.
 * -------------------------------------------------------------------------- */

export type SidebarNavTabId = 'today' | 'calendar' | 'labels' | 'settings'

export type SidebarNavLocale = 'ko' | 'en'

interface SidebarNavTab {
  id: SidebarNavTabId
  href: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  label: Record<SidebarNavLocale, string>
}

/* 탭 정의 — BottomNav 와 동일한 순서·아이콘·라우트를 유지해 디바이스 간 일관성 확보.
 * `/settings/labels` 가 `/settings` 보다 먼저 오도록 두어 longest-prefix-wins 가
 * 배열 순서에 의존하지 않음을 명시적으로 보여 준다. */
const tabs: SidebarNavTab[] = [
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
    href: '/settings/labels',
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

export interface SidebarNavProps
  extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  /** 로케일. 기본 'ko'. */
  locale?: SidebarNavLocale
  /** 활성 탭 강제 지정 (스토리북/테스트 용). 미지정 시 usePathname() 자동 판별. */
  activeTab?: SidebarNavTabId
}

/* --------------------------------------------------------------------------
 * 스타일 — sortCx 로 wrapper/brand/list/tab 그룹핑. 시맨틱 토큰만 사용.
 * 컬러 매핑 (DESIGN.md §4):
 *   - `bg-bg-primary`         ≈ --bg-surface (#FFFFFF)
 *   - `border-border-primary` ≈ --border-muted (#D9D6CC)
 *   - `text-fg-brand-primary` ≈ --brand (sage #3A6E5B / dark #6FA58C)
 *   - `text-text-tertiary`    ≈ --text-tertiary (비활성)
 *   - `text-text-secondary`   ≈ --text-secondary (hover)
 * -------------------------------------------------------------------------- */
const styles = sortCx({
  wrapper: {
    /* 데스크탑(lg+) 전용. 240px 고정폭, sticky top-0 으로 스크롤 시 고정.
     * h-dvh 로 뷰포트 전체 높이 확보 — 내부 nav 영역이 스크롤 가능하도록 overflow 설정. */
    base:
      'hidden lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-[240px] lg:shrink-0' +
      ' lg:flex-col lg:border-r lg:border-border-primary lg:bg-bg-primary',
  },
  brand: {
    /* 상단 워드마크 블록. 높이는 모바일 TodayHeader chrome(64px) 과 맞춰 시각 리듬 통일. */
    base:
      'flex h-16 shrink-0 items-center px-5 text-[20px] leading-none text-text-primary' +
      ' font-display tracking-[-0.01em]',
  },
  list: {
    /* nav 아이템 래퍼 — 남은 세로 공간 확보 + 내부 스크롤 허용. */
    base: 'flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-4',
  },
  tab: {
    /* 44px 높이 수평 행. 왼쪽 2px 공간(indicator)을 위해 pl-4(=16px) 에서 bar 2px 차감된
     * 14px 내부 여백. 아이콘-라벨-gap 12px. rounded-lg 로 hover 표시 명확히. */
    base:
      'relative flex h-11 items-center gap-3 rounded-lg pl-[14px] pr-3' +
      ' text-text-tertiary transition-colors duration-100 ease-linear' +
      ' hover:bg-[color-mix(in_srgb,var(--color-bg-brand-solid)_6%,transparent)] hover:text-text-secondary' +
      ' focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
    active:
      /* 활성: sage 텍스트 + 왼쪽 2px 수직 바. bar 는 ::before 대신 별도 span 으로 넣어
       * prefers-reduced-motion 자동 대응 (transition 없이 단순 표시/숨김). */
      'text-fg-brand-primary',
  },
  indicator: {
    /* 왼쪽 2px × 20px sage 바. absolute 로 tab 의 top/bottom 중앙 정렬. */
    base:
      'absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-[1px] bg-fg-brand-primary',
  },
  icon: {
    base: 'size-5 shrink-0',
  },
  label: {
    base: 'text-[14px] font-medium tracking-[0.005em]',
    active: 'font-semibold',
  },
})

/* --------------------------------------------------------------------------
 * 활성 판별 — BottomNav 와 동일한 longest-prefix-wins 전략.
 * pathname='/settings/labels' 일 때 Labels 탭이 활성. pathname='/settings/ui-test' 같이
 * 구체 하위 탭이 없는 경로는 Settings 로 폴백.
 * -------------------------------------------------------------------------- */
function matchBestTab(pathname: string): SidebarNavTabId | null {
  let best: { id: SidebarNavTabId; length: number } | null = null
  for (const tab of tabs) {
    const isMatch =
      pathname === tab.href || pathname.startsWith(`${tab.href}/`)
    if (!isMatch) continue
    if (best == null || tab.href.length > best.length) {
      best = { id: tab.id, length: tab.href.length }
    }
  }
  return best?.id ?? null
}

export function SidebarNav({
  locale = 'ko',
  activeTab,
  className,
  ...props
}: SidebarNavProps) {
  const pathname = usePathname()

  /* activeTab prop 우선, 아니면 pathname → longest-prefix-wins 자동 판별. */
  const resolvedActiveTab = activeTab ?? matchBestTab(pathname)

  const navAriaLabel = locale === 'ko' ? '주요 네비게이션' : 'Primary navigation'
  const brandLabel = 'Todogram'

  return (
    <aside
      data-slot="sidebar-nav"
      className={cx(styles.wrapper.base, className)}
      {...props}
    >
      {/* 브랜드 워드마크 — 클릭 시 Today 로 이동 (일반적 UX 관습). */}
      <Link
        href="/today"
        aria-label={locale === 'ko' ? '홈 · 오늘로 이동' : 'Home · Go to Today'}
        className={cx(
          styles.brand.base,
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
        )}
      >
        {brandLabel}
      </Link>

      {/* 구분선 — border-b 만 얇게. DESIGN.md 의 border-muted 톤으로 노이즈 최소화. */}
      <div
        aria-hidden="true"
        className="mx-5 h-px shrink-0 bg-border-secondary"
      />

      <nav aria-label={navAriaLabel} className={styles.list.base}>
        {tabs.map(tab => {
          const isActive = resolvedActiveTab === tab.id
          const Icon = tab.icon
          return (
            <Link
              key={tab.id}
              href={tab.href}
              aria-current={isActive ? 'page' : undefined}
              data-active={isActive || undefined}
              className={cx(styles.tab.base, isActive && styles.tab.active)}
            >
              {/* 왼쪽 활성 바 — 활성 탭에서만 렌더. 비활성 때는 DOM 자체에서 제거. */}
              {isActive && (
                <span aria-hidden="true" className={styles.indicator.base} />
              )}
              <Icon
                aria-hidden="true"
                className={styles.icon.base}
                strokeWidth={1.75}
              />
              <span
                className={cx(
                  styles.label.base,
                  isActive && styles.label.active,
                )}
              >
                {tab.label[locale]}
              </span>
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
