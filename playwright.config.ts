import { defineConfig, devices } from '@playwright/test'

// ============================================================================
// Playwright 설정 (Phase 0 - F3)
// ============================================================================
// - End-to-end 테스트 전용. UI/Server Action/Cron flow 를 실제 Next.js 서버에 띄워 검증.
// - `webServer` 가 자동으로 `npm run dev` 를 띄우고 baseURL 로 트래픽을 보낸다.
//   * CI 환경(`process.env.CI`) 에서는 매 실행마다 새로 띄우고,
//   * 로컬에서는 이미 떠 있는 dev 서버를 그대로 재사용 → 반복 실행 속도 개선.
// - v1 단계에서는 본인 dogfooding 위주이므로 Chromium 만 사용. (브라우저 호환성 검증은 v2)
// - 테스트 파일은 `test/e2e/` 에만 둔다. Vitest 와 절대 겹치지 않게 격리.
// ============================================================================

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`

export default defineConfig({
  // E2E 스펙 디렉터리. *.spec.ts / *.test.ts 모두 인식.
  testDir: './test/e2e',
  // 테스트 하나 당 최대 30초. 외부 네트워크가 끼면 늘릴 것.
  timeout: 30_000,
  // 모든 단언(`expect`) 은 5초 안에 통과해야 함.
  expect: { timeout: 5_000 },
  // CI 에서는 한 번이라도 .only 가 남아있으면 실패 처리(실수로 일부만 돌아가는 사고 방지).
  forbidOnly: !!process.env.CI,
  // 일시적 네트워크 실패에 대비해 CI 에서만 1회 재시도. 로컬은 재시도 0.
  retries: process.env.CI ? 1 : 0,
  // 병렬 워커. 로컬은 자동, CI 는 1개로 고정해 결과 안정화.
  workers: process.env.CI ? 1 : undefined,
  // 결과 리포터. 로컬은 list(콘솔), CI 에서는 list 와 함께 HTML 도 생성.
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL: BASE_URL,
    // 실패 시에만 trace 수집(용량 절약). `npx playwright show-trace` 로 디버깅.
    trace: 'on-first-retry',
    // 헤드리스 모드 기본값. UI 디버깅이 필요하면 `--headed` 플래그로 오버라이드.
    headless: true,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Next dev 서버 자동 기동. 이미 떠 있으면 재사용해 빠르게 반복 가능.
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
    // 테스트 인프라가 .env.local 의 Phase 1+ 시크릿 채움 상태와 독립적으로 동작하도록
    // env 검증을 스킵하고, NextAuth 가 필요로 하는 최소 시크릿만 테스트 전용 값으로 주입한다.
    //  * `SKIP_ENV_VALIDATION=1` — vitest.config.ts 와 동일한 F4 스킵 플래그.
    //    이 모드에서는 `@/env` 의 `env` 객체가 process.env 를 그대로 노출한다.
    //  * `NEXTAUTH_SECRET` — authConfig 가 모듈 평가 시 읽으므로 값이 필요. E2E 는 비로그인
    //    리다이렉트 계약만 본다(JWT 복호화 경로는 밟지 않음) 이지만, 미들웨어가 NextAuth 를
    //    초기화하는 시점에 secret 이 비어있지 않아야 한다. 프로덕션 시크릿과 절대 무관한
    //    테스트 전용 더미.
    env: {
      SKIP_ENV_VALIDATION: '1',
      NEXTAUTH_SECRET: 'playwright-e2e-only-dummy-secret-00000000000000000000',
    },
  },
})
