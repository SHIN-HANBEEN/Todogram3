import { z } from 'zod'

// ============================================================================
// 환경변수 Zod 검증 (Phase 0 - F4)
// ============================================================================
// - 서버 부트스트랩 시점에 모든 필수 환경변수가 올바른 형식인지 한 번 검증한다.
// - 실제 기능 코드(Server Action, API Route, cron, NextAuth 등)는 `process.env` 를
//   직접 읽지 말고 반드시 이 모듈이 export 하는 `env` 객체를 import 해서 사용한다.
//   그래야 타입 안전(모든 값이 string 확정)과 런타임 안전(형식 검증 통과) 을 동시에 보장한다.
// - parse 실패 시 throw 하는 방식이라, 서버가 잘못된 설정으로 조용히 시작되는 것을
//   원천 차단한다. 런타임 중에 "뭔가가 undefined" 라고 터지는 것보다 기동 실패가 훨씬 낫다.
// - Next.js 빌드 단계(Vercel 등)나 일부 정적 분석 파이프라인에서는 실제 시크릿이 없는
//   상태로 모듈이 import 될 수 있다. 그런 경우를 위해 `SKIP_ENV_VALIDATION=1` 또는
//   `NEXT_PHASE=phase-production-build` 일 때는 검증을 건너뛰고 타입만 유지한다.
//   (t3-env 관행을 따름. 프로덕션 런타임에서는 Vercel 이 환경변수를 주입하므로
//    실제 요청 처리 경로에서 다시 검증된다.)
// ============================================================================

// --- 1) 각 키별 Zod 스키마 --------------------------------------------------
// 단순 `z.string().min(1)` 가 아니라 "실수하기 쉬운 포맷" 을 구체적으로 막는다.

// DATABASE_URL: Supabase Postgres 연결 문자열. pooler(6543) 또는 direct(5432) 모두 허용.
const databaseUrlSchema = z
  .string()
  .min(
    1,
    'DATABASE_URL 가 비어 있습니다. .env.local 에 Supabase 연결 문자열을 채워주세요.'
  )
  .refine(
    value =>
      value.startsWith('postgres://') || value.startsWith('postgresql://'),
    'DATABASE_URL 은 postgres:// 또는 postgresql:// 스킴으로 시작해야 합니다.'
  )

// NEXTAUTH_SECRET: JWT 서명용 비밀키. `openssl rand -base64 32` 가 표준.
// 32바이트 base64 인코딩 결과는 최소 43자(패딩 포함 44자) 이상이므로 32자 이상을 강제.
const nextauthSecretSchema = z
  .string()
  .min(
    32,
    'NEXTAUTH_SECRET 은 최소 32자 이상이어야 합니다. `openssl rand -base64 32` 로 생성하세요.'
  )

// NEXTAUTH_URL: OAuth 콜백이 돌아올 배포 URL. 로컬은 http://localhost:3000.
const nextauthUrlSchema = z
  .string()
  .url('NEXTAUTH_URL 은 절대 URL 이어야 합니다 (예: http://localhost:3000).')

// Google OAuth Client 자격 증명. 값이 존재하는지만 체크 — 포맷 검증은 Google 측에서 수행.
const googleClientIdSchema = z
  .string()
  .min(1, 'GOOGLE_CLIENT_ID 가 비어 있습니다.')
const googleClientSecretSchema = z
  .string()
  .min(1, 'GOOGLE_CLIENT_SECRET 가 비어 있습니다.')

// ENCRYPTION_KEY: AES-256-GCM 키. 반드시 정확히 32바이트. Base64 로 인코딩해서 보관.
// `openssl rand -base64 32` → 44자(패딩 포함) 문자열이고 디코드 시 32바이트가 된다.
// 여기서는 디코드한 byte 길이로 정확히 검증해 "32바이트가 아닌 키로 암호화 후 나중에 복호화 실패"
// 시나리오를 기동 시점에 잡아낸다.
const encryptionKeySchema = z
  .string()
  .min(
    1,
    'ENCRYPTION_KEY 가 비어 있습니다. `openssl rand -base64 32` 로 생성하세요.'
  )
  .refine(value => {
    try {
      // Node.js 런타임에서만 실행되는 모듈이라 Buffer 사용이 안전.
      return Buffer.from(value, 'base64').length === 32
    } catch {
      return false
    }
  }, 'ENCRYPTION_KEY 는 base64 로 인코딩된 정확히 32바이트(AES-256) 값이어야 합니다.')

// CRON_SECRET: Vercel Cron → /api/cron/* 호출 시 Bearer 토큰. 최소 32자 랜덤.
const cronSecretSchema = z
  .string()
  .min(
    32,
    'CRON_SECRET 은 최소 32자 이상이어야 합니다. 랜덤 토큰으로 생성하세요.'
  )

// NODE_ENV: Next.js 가 자동 주입하므로 enum 만 제한.
const nodeEnvSchema = z
  .enum(['development', 'production', 'test'])
  .default('development')

// --- 2) 통합 스키마 ---------------------------------------------------------
const envSchema = z.object({
  NODE_ENV: nodeEnvSchema,
  DATABASE_URL: databaseUrlSchema,
  NEXTAUTH_SECRET: nextauthSecretSchema,
  NEXTAUTH_URL: nextauthUrlSchema,
  GOOGLE_CLIENT_ID: googleClientIdSchema,
  GOOGLE_CLIENT_SECRET: googleClientSecretSchema,
  ENCRYPTION_KEY: encryptionKeySchema,
  CRON_SECRET: cronSecretSchema,
})

// --- 3) 빌드/테스트 스킵 판단 + 검증 실행 -----------------------------------
// Next.js 가 `next build` 중 설정하는 `NEXT_PHASE=phase-production-build` 플래그와,
// CI/테스트에서 명시적으로 사용할 수 있는 `SKIP_ENV_VALIDATION=1` 을 존중한다.
// 스킵 시에도 타입은 그대로 노출되어야 하므로, parse 대신 `process.env` 캐스팅으로 대체.
const shouldSkipValidation =
  process.env.SKIP_ENV_VALIDATION === '1' ||
  process.env.SKIP_ENV_VALIDATION === 'true' ||
  process.env.NEXT_PHASE === 'phase-production-build'

/**
 * 실제 검증을 수행한다. 테스트에서 재현 가능하도록 함수로 분리했다.
 * 애플리케이션 코드는 `env` 상수를 import 하면 되고 이 함수를 직접 호출할 필요는 없다.
 */
export function parseEnv(source: NodeJS.ProcessEnv = process.env) {
  const result = envSchema.safeParse(source)
  if (!result.success) {
    // 사람이 읽기 좋은 포맷으로 에러 나열. 여러 키가 동시에 비어 있어도 한 번에 확인 가능.
    const issues = result.error.issues
      .map(issue => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n')
    throw new Error(
      `환경변수 검증에 실패했습니다. .env.local 또는 배포 환경 변수를 확인하세요.\n${issues}`
    )
  }
  return result.data
}

// 검증을 통과한 타입 안전 env 객체. 실제 애플리케이션 코드는 이 값만 사용한다.
// SKIP 모드일 때는 원본 process.env 를 그대로 캐스팅해 최소 동작만 보장한다
// (주로 `next build` 중 정적 최적화 단계가 해당됨. 런타임 시에는 정상 검증 경로를 탐).
export const env = shouldSkipValidation
  ? (process.env as unknown as z.infer<typeof envSchema>)
  : parseEnv()

export type Env = z.infer<typeof envSchema>
