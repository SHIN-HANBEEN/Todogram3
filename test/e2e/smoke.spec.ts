// ============================================================================
// E2E smoke check (Phase 0 - F3)
// ============================================================================
// - Playwright + Next.js dev 서버가 정상적으로 묶여 있는지만 확인.
// - 본격적인 시나리오 테스트(로그인, 캘린더 렌더, rollover) 는 Phase 1~5 에서 추가한다.
// - F5 에서 랜딩 페이지가 Todogram 로그인 안내로 교체되더라도 이 테스트가 깨지지 않도록
//   페이지 콘텐츠가 아니라 "<html> 이 응답되는가" 만 검증한다.
// ============================================================================

import { expect, test } from '@playwright/test'

test('홈 페이지가 200 OK 로 응답하고 <html> 루트가 렌더된다', async ({
  page,
}) => {
  // baseURL 은 playwright.config.ts 의 use.baseURL 에서 주입됨 (기본값: http://localhost:3000).
  const response = await page.goto('/')
  // SSR 응답이 정상이면 200 또는 304 (캐시 적중) 가 와야 한다.
  expect(response?.ok()).toBeTruthy()
  // <html lang="..."> 루트가 존재 = Next.js 앱이 살아있고 RootLayout 까지 렌더됐다는 뜻.
  await expect(page.locator('html')).toBeVisible()
})
