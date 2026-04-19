import type { ReactNode } from 'react'

import { BottomNav } from '@/components/todogram/bottom-nav'
import { SidebarNav } from '@/components/todogram/sidebar-nav'

// ============================================================================
// (app) 라우트 그룹 레이아웃 — Phase 4 U5 (모바일 퍼스트 네비 셸)
// ============================================================================
// - 역할: 인증 사용자 전용 페이지(`/calendar`, `/today`, `/list`, `/settings/...`)
//   가 공유할 "앱 셸". 괄호 `(app)` 는 Next.js 라우트 그룹 문법 — URL 경로에
//   영향 없이 레이아웃/미들웨어만 공유한다.
//
// - 세션 가드는 `src/middleware.ts` 가 `/calendar/:path*` 등을 가로채
//   `/login` 으로 리다이렉트하므로 여기서 재확인하지 않는다. 이중 가드를 넣으면
//   렌더 타이밍 경쟁으로 드문 이중 리다이렉트가 날 수 있어 단순화.
//
// - 레이아웃 배치 (DESIGN.md §6):
//     [모바일 xs~sm (<768)]    단일 컬럼 + BottomNav(fixed bottom)
//     [태블릿 md~lg (768~1023)] 단일 컬럼 + BottomNav(fixed bottom) 유지
//     [데스크탑 lg+ (1024+)]    SidebarNav(좌측 240px) + 메인 컨텐츠
//
// - CSS 구조: flex row container.
//     SidebarNav 는 데스크탑(lg+) 에서만 보이고 모바일/태블릿은 display:none.
//     메인 래퍼(flex-1)가 모든 뷰포트에서 나머지 너비를 차지 → 모바일에서는
//     sidebar 0px + main 100% 이므로 DESIGN §12 "모바일 콘텐츠 영역 ≥ 65%"
//     제약을 자연스럽게 충족 (실제로는 100%).
//
// - 주의: BottomNav 는 fixed bottom-0 z-40 으로 뷰포트 하단 72px 를 덮는다.
//     각 페이지가 스크롤 영역에 padding-bottom(≈120px) 을 부여해 마지막 행이
//     가려지지 않도록 이미 처리되어 있다 (list/today stream 참고). 캘린더는
//     `h-dvh` 를 쓰는 특수 drill-down UX 라 내부에서 자체 조정.
//
// - FAB(`src/components/todogram/fab.tsx`) 도 lg:hidden 으로 BottomNav 와
//   동일 브레이크포인트. 데스크탑은 sidebar 상단 "+" 자리로 대체 예정(후속 작업).
// ============================================================================

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div
      data-slot="app-shell"
      className="relative flex min-h-dvh bg-bg-primary"
    >
      {/* 좌측 사이드바 — 데스크탑(1024px+) 에서만 flex 참여. 그 이하에서는 hidden. */}
      <SidebarNav />

      {/* 메인 컨텐츠 컬럼 — min-w-0 으로 flex child 의 overflow 기본값 auto 보정
       * (안 쓰면 자식 요소의 긴 텍스트가 flex 너비를 밀어내 레이아웃이 깨진다).
       * flex-col 으로 자식 페이지가 header/stream 수직 분할을 자유롭게. */}
      <main
        data-slot="app-main"
        className="flex min-h-dvh min-w-0 flex-1 flex-col"
      >
        {children}
      </main>

      {/* 하단 네비 — 모바일/태블릿 전용 (lg:hidden). position fixed 라서
       * flex flow 에 영향 주지 않으며, 어느 children 이 렌더되든 전역으로 노출. */}
      <BottomNav />
    </div>
  )
}
