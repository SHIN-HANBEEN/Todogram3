// ============================================================================
// Vitest 글로벌 setup (Phase 0 - F3)
// ============================================================================
// - vitest.config.ts 의 `setupFiles` 가 모든 테스트 파일 실행 전에 한 번 로드한다.
// - jest-dom 의 커스텀 matcher (`toBeInTheDocument`, `toHaveTextContent` 등) 를 vitest 의
//   `expect` 에 등록해, React Testing Library 와 동일한 단언을 사용할 수 있게 한다.
// ============================================================================

import '@testing-library/jest-dom/vitest'
