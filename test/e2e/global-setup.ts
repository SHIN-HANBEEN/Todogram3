import { loadEnvLocal } from './helpers/env-loader'

// ============================================================================
// Playwright globalSetup — Phase 5 R4 완료 검증용
// ============================================================================
// - 모든 Playwright 테스트 파일이 실행되기 전에 한 번만 돈다.
// - 책임:
//     1) `.env.local` 을 테스트 프로세스(`process.env`) 에 주입 → DB 접속을 위한
//        `DATABASE_URL` 을 개별 테스트가 그대로 읽게 된다.
//     2) 테스트 전용 고정 `CRON_SECRET` 을 주입 → playwright.config 의 `webServer.env` 에도
//        동일 값이 세팅되어 있어 "서버가 기대하는 토큰 == 테스트가 보내는 토큰" 이 보장된다.
//        `.env.local` 의 CRON_SECRET 값(비어 있거나 실 시크릿) 은 여기서 덮어쓴다.
// - 개발자 개인의 `.env.local` 은 건드리지 않는다. 테스트 고정값은 이 파일 한 곳에서만 관리.
// ============================================================================

/**
 * E2E 전용 CRON_SECRET.
 *
 * 32자 이상(env.ts 의 zod 검증 기준) 을 맞춰 `SKIP_ENV_VALIDATION=1` 없이도 통과 가능하게.
 * 프로덕션 시크릿과 전혀 겹치지 않도록 식별 prefix(`e2e-`) 를 유지한다.
 */
export const E2E_CRON_SECRET =
  'e2e-rollover-cron-secret-do-not-use-in-prod-0000'

export default async function globalSetup(): Promise<void> {
  // 1) 기존 .env.local 값 로드 (DATABASE_URL 등). 외부에서 이미 주입된 값은 덮어쓰지 않는다.
  loadEnvLocal()

  // 2) E2E 고정 CRON_SECRET 을 강제 주입 — 테스트 측(HTTP Authorization 헤더)과 서버 측
  //    (runtime env) 양쪽에서 같은 값을 사용하기 위함.
  process.env.CRON_SECRET = E2E_CRON_SECRET
}
