// ============================================================================
// 미들웨어 + 보호 라우트 E2E — Phase 1 A3
// ============================================================================
// - 비로그인 상태에서 /calendar, /list, /settings/* 에 접근하면 /login 으로 리다이렉트
//   되는지, 그리고 callbackUrl 쿼리가 원본 경로로 보존되는지 검증한다.
// - 보호 라우트의 실제 페이지(/calendar, /list 등) 는 Phase 4 에서 구현되지만,
//   Next.js 미들웨어는 라우팅 이전 단계에서 돌기 때문에 페이지가 없어도 리다이렉트
//   검증이 가능하다 — 페이지가 있는지 여부와 무관하게 미들웨어 계층의 계약만 본다.
// - /login 자체나 일반 공개 경로(`/`) 는 matcher 에서 제외되어 있으므로 리다이렉트 되지
//   않는 것도 함께 확인해 matcher 오작성 시 회귀를 잡는다.
// ============================================================================

import { expect, test } from '@playwright/test'

// playwright 가 리다이렉트를 자동으로 따라가지 않도록 page.goto 대신 waitForURL 을 활용.
// 각 케이스는 새 컨텍스트라 쿠키(세션) 가 없는 상태 = 미들웨어가 미인증으로 판정해야 함.

test.describe('A3 보호 라우트 미들웨어 (비로그인)', () => {
  test('/calendar 접근 시 /login?callbackUrl=/calendar 로 리다이렉트', async ({
    page,
  }) => {
    await page.goto('/calendar')
    await page.waitForURL(url => url.pathname === '/login')
    const url = new URL(page.url())
    expect(url.pathname).toBe('/login')
    expect(url.searchParams.get('callbackUrl')).toBe('/calendar')
  })

  test('/list 접근 시 /login?callbackUrl=/list 로 리다이렉트', async ({
    page,
  }) => {
    await page.goto('/list')
    await page.waitForURL(url => url.pathname === '/login')
    const url = new URL(page.url())
    expect(url.pathname).toBe('/login')
    expect(url.searchParams.get('callbackUrl')).toBe('/list')
  })

  test('/settings/labels 접근 시 /login?callbackUrl=/settings/labels 로 리다이렉트', async ({
    page,
  }) => {
    await page.goto('/settings/labels')
    await page.waitForURL(url => url.pathname === '/login')
    const url = new URL(page.url())
    expect(url.pathname).toBe('/login')
    expect(url.searchParams.get('callbackUrl')).toBe('/settings/labels')
  })

  test('/settings 자체도 보호된다 (prefix 포함)', async ({ page }) => {
    await page.goto('/settings')
    await page.waitForURL(url => url.pathname === '/login')
    const url = new URL(page.url())
    expect(url.pathname).toBe('/login')
    expect(url.searchParams.get('callbackUrl')).toBe('/settings')
  })

  test('/login 자체는 미들웨어가 건드리지 않는다 (matcher 제외)', async ({
    page,
  }) => {
    const response = await page.goto('/login')
    expect(response?.ok()).toBeTruthy()
    // callbackUrl 쿼리가 자동으로 붙지 않아야 함 — 직접 방문 시 전달할 이유가 없음.
    const url = new URL(page.url())
    expect(url.pathname).toBe('/login')
    expect(url.searchParams.get('callbackUrl')).toBeNull()
  })
})
