import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ============================================================================
// Playwright E2E 용 `.env.local` 로더 — Phase 5 R4 완료 검증
// ============================================================================
// - Vitest 와 달리 Playwright 테스트 프로세스는 `.env.local` 을 자동 로드하지 않는다.
//   Next.js dev 서버는 자체적으로 로드하지만, **테스트 코드 측** (DB 직접 접속 등) 에서도
//   `DATABASE_URL` 이 필요하므로 별도로 읽어야 한다.
// - dotenv 패키지 도입 없이 최소 파서로 처리한다. 값에 `=` 가 들어가거나 따옴표로 감싸진
//   경우도 프로젝트 현행 `.env.local` 형태에서 안전하게 파싱된다 (DATABASE_URL 패스워드 포함).
// - 이 모듈은 Playwright globalSetup 과 개별 테스트 양쪽에서 호출 가능하다. 이미 로드된 키는
//   덮어쓰지 않아 "셸에서 명시적으로 export 한 값" 이 우선된다.
// ============================================================================

/**
 * `.env.local` 을 파싱해 `process.env` 에 반영한다.
 *
 * - 라인 단위로 읽고, 주석(`#`) 과 빈 줄은 스킵.
 * - `KEY=VALUE` 의 첫 `=` 만 구분자로 사용 (값 쪽의 `=` 는 그대로 보존).
 * - 값이 전체 또는 부분적으로 양끝 따옴표로 감싸진 경우 풀어서 저장.
 * - 이미 `process.env[key]` 가 설정되어 있으면 **덮어쓰지 않는다** (셸 우선 원칙).
 *
 * 반환: 실제로 파일이 존재하고 로드에 성공했으면 true, 아니면 false (파일 미존재 허용).
 */
export function loadEnvLocal(
  filePath = resolve(process.cwd(), '.env.local')
): boolean {
  let raw: string
  try {
    raw = readFileSync(filePath, 'utf8')
  } catch {
    // 파일이 없는 환경(CI 초기 상태 등) 은 비-에러로 처리. 테스트 쪽에서 필수값 누락을
    // 감지해 더 명확한 메시지를 띄울 수 있도록 한다.
    return false
  }

  // 라인 파싱. CRLF/LF 모두 허용.
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue

    const key = trimmed.slice(0, eqIdx).trim()
    let value = trimmed.slice(eqIdx + 1).trim()
    if (!key) continue

    // 양끝 따옴표 제거. 단일/이중 따옴표 모두 지원.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    // 이미 외부에서 주입된 값은 존중.
    if (process.env[key] === undefined || process.env[key] === '') {
      process.env[key] = value
    }
  }
  return true
}
