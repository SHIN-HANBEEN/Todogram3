import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

// ============================================================================
// Vitest 설정 (Phase 0 - F3)
// ============================================================================
// - Next.js 15.5.3 + React 19 + TypeScript 5 환경에서 단위/통합 테스트 실행.
// - Playwright(E2E)와 충돌하지 않도록 `test/e2e/**` 와 `node_modules` 는 제외.
// - 테스트는 `test/` 디렉터리에 종류별로 모은다:
//     * test/unit/        — 순수 함수, 컴포넌트, 헬퍼 등 의존성 mock 가능
//     * test/integration/ — DB/외부 API 와의 round-trip 등 실제 인프라 사용
// - `vite-tsconfig-paths` 가 tsconfig.json 의 `@/*` alias 를 그대로 인식하므로
//   소스 코드와 동일한 import 경로를 테스트에서도 사용할 수 있다.
// - `globals: true` 로 describe/it/expect 를 import 없이 사용. (`@testing-library/jest-dom`
//   의 matcher 도 setup 파일에서 자동 등록.)
// ============================================================================

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    // jsdom: React 컴포넌트 렌더링·DOM 어설션을 위해 필요. 순수 노드 테스트도 호환됨.
    environment: 'jsdom',
    // import 없이 globals(describe/it/expect/vi) 사용. tsconfig 의 types 에도 등록.
    globals: true,
    // jest-dom matcher 등록. (toBeInTheDocument 등)
    setupFiles: ['./test/setup.ts'],
    // 어떤 파일을 테스트로 인식할지. test/unit·integration 만 포함.
    include: [
      'test/unit/**/*.{test,spec}.{ts,tsx}',
      'test/integration/**/*.{test,spec}.{ts,tsx}',
    ],
    // E2E(Playwright)·node_modules·빌드 산출물은 Vitest 가 절대 건드리지 않도록 명시.
    exclude: ['test/e2e/**', 'node_modules/**', '.next/**', 'dist/**'],
    // 테스트 런타임에 주입할 환경변수. 실제 시크릿 없이도 `@/env` 모듈이 import 가능하도록
    // 검증 스킵 플래그를 켠다 (Phase 0 - F4). 각 테스트가 env 검증 로직을 직접 확인하려면
    // `parseEnv(mockedSource)` 를 명시적으로 호출하면 된다.
    env: {
      SKIP_ENV_VALIDATION: '1',
    },
  },
})
