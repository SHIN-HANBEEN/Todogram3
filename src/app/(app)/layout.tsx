import type { ReactNode } from 'react'

// ============================================================================
// (app) 라우트 그룹 레이아웃 — Phase 4 U1-E1
// ============================================================================
// - 역할: 인증된 사용자 전용 페이지들(`/calendar`, 추후 `/today`, `/list`, `/settings`)
//   이 공유할 "앱 셸" 레이아웃. 괄호 `(app)` 는 Next.js 라우트 그룹 문법 — URL 경로에
//   영향을 주지 않으면서 레이아웃/미들웨어만 공유하게 해 준다.
// - 세션 가드는 `src/middleware.ts` 에서 이미 `/calendar/:path*` 등을 가로채
//   `/login` 으로 리다이렉트하므로 이 레이아웃 안에서 재확인하지 않는다. 여기서 한 번 더
//   `requireUserId()` 를 호출하면 렌더 전/후 타이밍 경쟁으로 드물게 이중 리다이렉트가
//   발생할 수 있고, 미들웨어 하나로 책임이 집중되도록 단순화.
// - 이 레이아웃은 의도적으로 "얇게" 유지한다. 캘린더는 전체 뷰포트를 사용하는 drill-down
//   UX 라 BottomNav/FAB 등 글로벌 chrome 은 각 페이지가 자체 판단해 렌더한다.
//   (공통 chrome 이 필요해지면 이 파일에 점진적으로 추가.)
// ============================================================================

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    // min-h-screen 으로 뷰포트 전체를 기본 배경으로 덮는다. 자식 페이지가
    // h-screen / h-dvh 를 다시 설정해 drill-down 슬라이드 화면을 꽉 채울 수 있다.
    <div data-slot="app-shell" className="min-h-screen bg-bg-primary">
      {children}
    </div>
  )
}
