'use client'

// ============================================================================
// CalendarRouteClient — /calendar 서버 페이지가 클라이언트 경계로 넘기는 조립자 (U1-E1)
// ============================================================================
// - 왜 필요한가:
//     1) CalendarViewport 는 client component 인데 statusAction/onSelectDay 같은
//        콜백 prop 을 받는다. 서버 컴포넌트가 직접 함수를 넘기면 "함수는 직렬화
//        불가" 에러가 나므로, 클라이언트 경계에서 콜백을 만들어 주입해야 한다.
//     2) `renderDayHeader` 는 render prop(함수) — 역시 클라이언트에서 정의해야 한다.
//     3) 월 네비게이션(prev/next/today 링크) 헤더와 Day 화면 뒤로가기 버튼이 모두
//        이 파일에서 조립되어 UX 일관성이 유지된다.
// - 서버에서 받은 cells 배열만으로 렌더 가능 — 추가 fetch 없음. Next.js 가 cells 를
//   RSC payload 로 직렬화해 전달한다 (React 19: Date 객체 지원).
// - 상태 전이: `statusAction` 은 toggleTaskStatus 서버 액션을 `{ status: next }` 객체
//   시그니처로 한 번 래핑. viewport 내부 useTransition 이 pending 을 관리.
// - G4 연동: `showReauthBanner` 가 true 이면 상단에 재로그인 안내를 고정 표시. 구글
//   이벤트 로드가 revoked 상태로 실패해도 페이지는 task-only 로 정상 렌더된다.
// ============================================================================

import Link from 'next/link'
import { useCallback } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight } from '@untitledui/icons'
import type {
  CalendarGridCell,
  CalendarItem,
  TaskStatus,
} from '@/lib/calendar/types'
import type { WeekStart } from '@/lib/calendar/month'
import { CalendarViewport } from '@/components/calendar/calendar-viewport'
import { toggleTaskStatus } from '@/actions/tasks'
import { cx } from '@/utils/cx'

export interface CalendarRouteClientProps {
  /** aggregateMonth().cells — 서버에서 계산 완료. */
  cells: CalendarGridCell[]
  /** 기준 연도. */
  year: number
  /** 기준 월(1-12). */
  month: number
  /** 사용자 timezone. */
  timezone: string
  /** 로케일. 기본 'ko'. */
  locale?: 'ko' | 'en'
  /** 주 시작 요일. 기본 'sunday' (v1 은 한국 사용자이지만 finalized.html 과 일치). */
  weekStart?: WeekStart
  /**
   * 초기 선택 dateKey. 서버에서 "오늘 or 해당 월 첫날" 을 미리 결정해 내려준다.
   * CalendarViewport 가 uncontrolled 모드로 이 값을 초기 selected 로 사용.
   */
  initialSelectedDateKey: string
  /** 라벨 id → 표시명 매핑. ledger row 의 LabelChip 텍스트에 쓰인다. */
  labelNameMap: Map<string, string>
  /** 이전 달 URL (`/calendar?month=YYYY-MM`). */
  prevMonthHref: string
  /** 다음 달 URL. */
  nextMonthHref: string
  /** "오늘" 바로가기 URL. 현재 월이 이미 오늘 월이면 서버가 `null` 전달 — 버튼 숨김. */
  todayHref: string | null
  /** 화면 상단에 표시할 월 라벨 (예: "2026년 4월"). */
  monthLabel: string
  /** G4: Google 재로그인 필요 상태. true 면 상단 배너 노출. */
  showReauthBanner: boolean
}

export function CalendarRouteClient({
  cells,
  year,
  month,
  timezone,
  locale = 'ko',
  weekStart = 'sunday',
  initialSelectedDateKey,
  labelNameMap,
  prevMonthHref,
  nextMonthHref,
  todayHref,
  monthLabel,
  showReauthBanner,
}: CalendarRouteClientProps) {
  /* CalendarViewport 의 statusAction 은 (taskId, next) 시그니처 — toggleTaskStatus 는
   * (taskId, { status: next }) 시그니처라 여기서 얇게 래핑. useCallback 으로 감싸
   * viewport 내부 의존성 배열이 매 렌더마다 재생성되는 것을 방지. */
  const statusAction = useCallback(
    async (taskId: number, next: TaskStatus) => {
      await toggleTaskStatus(taskId, { status: next })
    },
    []
  )

  /* Screen C(태스크 상세) 는 U6 에서 도입 — 현재는 no-op 로 두어 viewport 내부 클릭은
   * 아무 반응 없이 통과시킨다. 미래에 `router.push(`/calendar/${dateKey}/${itemId}`)` 등으로
   * 치환 예정. */
  const handleSelectItem = useCallback((_item: CalendarItem) => {
    /* v1-U1 에서는 상세 라우트 미구현 — 클릭은 무시 */
  }, [])

  /* 월 네비게이션 헤더. finalized.html 의 chrome 을 참고해 왼쪽에 월 라벨, 오른쪽에
   * prev/today/next 3버튼. 터치 타겟은 최소 40px. 로케일별 aria-label. */
  const monthHeader = (
    <header
      data-slot="calendar-route-header"
      className="flex flex-none items-center justify-between gap-3 px-4 pt-4 pb-2"
    >
      <h1 className="font-display text-[22px] leading-none text-text-primary">
        {monthLabel}
      </h1>
      <nav
        aria-label={locale === 'ko' ? '월 이동' : 'Month navigation'}
        className="flex items-center gap-0.5"
      >
        <Link
          href={prevMonthHref}
          prefetch
          aria-label={locale === 'ko' ? '이전 달' : 'Previous month'}
          className={cx(
            'inline-flex h-10 w-10 items-center justify-center rounded-full text-fg-secondary',
            'transition-colors duration-100 ease-linear',
            'hover:bg-[color-mix(in_srgb,var(--color-brand-600)_6%,transparent)] hover:text-fg-primary',
            'focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring'
          )}
        >
          <ChevronLeft aria-hidden="true" className="size-5" />
        </Link>
        {todayHref && (
          <Link
            href={todayHref}
            prefetch
            aria-label={locale === 'ko' ? '오늘로 이동' : 'Jump to today'}
            className={cx(
              'inline-flex h-10 items-center rounded-full px-3 text-[13px] font-medium text-text-secondary',
              'transition-colors duration-100 ease-linear',
              'hover:bg-[color-mix(in_srgb,var(--color-brand-600)_6%,transparent)] hover:text-text-primary',
              'focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring'
            )}
          >
            {locale === 'ko' ? '오늘' : 'Today'}
          </Link>
        )}
        <Link
          href={nextMonthHref}
          prefetch
          aria-label={locale === 'ko' ? '다음 달' : 'Next month'}
          className={cx(
            'inline-flex h-10 w-10 items-center justify-center rounded-full text-fg-secondary',
            'transition-colors duration-100 ease-linear',
            'hover:bg-[color-mix(in_srgb,var(--color-brand-600)_6%,transparent)] hover:text-fg-primary',
            'focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring'
          )}
        >
          <ChevronRight aria-hidden="true" className="size-5" />
        </Link>
      </nav>
    </header>
  )

  /* Day 화면 헤더 — 뒤로가기 + 날짜 표시. back 핸들러는 viewport 가 주입(render prop).
   * CalendarDayDetail 이 별도의 큰 날짜 라벨을 divider 영역에 이미 렌더하므로,
   * 여기서는 "뒤로" 버튼만 남기고 남는 공간은 spacer. */
  const renderDayHeader = useCallback(
    ({ onBack }: { onBack: () => void; dateKey: string }) => (
      <header
        data-slot="calendar-route-day-header"
        className="flex flex-none items-center gap-2 px-2 pt-3 pb-1"
      >
        <button
          type="button"
          onClick={onBack}
          aria-label={locale === 'ko' ? '월 보기로 돌아가기' : 'Back to month view'}
          className={cx(
            'inline-flex h-10 items-center gap-1 rounded-full pl-2 pr-3 text-[14px] font-medium text-text-secondary',
            'transition-colors duration-100 ease-linear',
            'hover:bg-[color-mix(in_srgb,var(--color-brand-600)_6%,transparent)] hover:text-text-primary',
            'focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring'
          )}
        >
          <ArrowLeft aria-hidden="true" className="size-5" />
          <span>{monthLabel}</span>
        </button>
      </header>
    ),
    [locale, monthLabel]
  )

  return (
    <div
      data-slot="calendar-route-root"
      /* U5: 모바일/태블릿에서는 BottomNav(72px) 가 뷰포트 하단을 덮으므로
       * 캘린더 drill-down 영역이 BottomNav 에 가리지 않게 높이를 viewport - 72px 로 제한.
       * lg 이상은 BottomNav 대신 SidebarNav 가 쓰이므로 전체 dvh 그대로 사용. */
      className="flex h-[calc(100dvh-72px)] min-h-0 w-full flex-col bg-bg-primary lg:h-dvh"
    >
      {showReauthBanner && <ReauthBanner locale={locale} />}
      <div className="flex min-h-0 flex-1">
        <CalendarViewport
          cells={cells}
          year={year}
          month={month}
          timezone={timezone}
          locale={locale}
          weekStart={weekStart}
          initialSelectedDateKey={initialSelectedDateKey}
          statusAction={statusAction}
          onSelectItem={handleSelectItem}
          labelNameMap={labelNameMap}
          monthHeader={monthHeader}
          renderDayHeader={renderDayHeader}
        />
      </div>
    </div>
  )
}

/**
 * G4 Google 재로그인 안내 배너 — DESIGN.md Quiet Layer 에 따라 일러스트 없이
 * 얇은 띠 + 간단한 문구 + 재로그인 링크로만 구성. 색은 warning 토큰 사용.
 * 사용자가 dismiss 하지 않아도 Google 권한을 복구하면 자동 사라진다 (다음 렌더 시
 * googleAuthStatus=active 면 showReauthBanner=false).
 */
function ReauthBanner({ locale }: { locale: 'ko' | 'en' }) {
  return (
    <div
      role="alert"
      data-slot="calendar-reauth-banner"
      className={cx(
        'flex flex-none items-center justify-between gap-3 border-b border-border-secondary',
        'bg-bg-warning-primary px-4 py-2.5 text-[13px] text-text-warning-primary'
      )}
    >
      <span>
        {locale === 'ko'
          ? 'Google 캘린더 연동이 만료되었습니다. 외부 일정이 잠시 표시되지 않습니다.'
          : 'Google Calendar connection expired. External events are temporarily unavailable.'}
      </span>
      <Link
        href="/login?callbackUrl=%2Fcalendar"
        prefetch
        className="shrink-0 font-medium underline underline-offset-2 hover:no-underline"
      >
        {locale === 'ko' ? '재로그인' : 'Sign in again'}
      </Link>
    </div>
  )
}
