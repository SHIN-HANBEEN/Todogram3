import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from './schema'

// ============================================================================
// Drizzle 런타임 클라이언트 (Phase 0 - F2)
// ============================================================================
// - `drizzle-kit` CLI 용 설정은 `drizzle.config.ts` 가 담당하고,
//   여기서는 Next.js 서버 런타임(Server Components / Server Actions / API Route)
//   에서 사용할 postgres.js + drizzle 조합을 만든다.
// - Supabase 는 두 가지 연결 엔드포인트를 제공한다.
//     1) Direct: 5432. 단일 프로세스/긴 연결. migration 전용.
//     2) Pooler (pgBouncer): 6543. 서버리스에서 안전. v1 은 Vercel 런타임이므로
//        기본값으로 pooler URL 을 쓰는 것을 권장한다.
// - pgBouncer 트랜잭션 모드는 `PREPARE` 를 지원하지 않으므로 postgres.js 에
//   반드시 `prepare: false` 를 넘겨야 한다. 안 그러면 첫 쿼리에서 터진다.
// ============================================================================

// DATABASE_URL 부재 시 바로 예외 — 의도를 숨기고 런타임 쿼리에서 undefined 에러로
// 터지는 것보다, 서버 부트스트랩 시점에 명시적으로 실패하는 편이 디버깅이 쉽다.
// Phase 0 - F4 에서 Zod 검증으로 교체될 예정이지만 지금은 최소 가드.
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL 환경변수가 설정되지 않았습니다. .env.local 에 Supabase 연결 문자열을 채워주세요.',
  )
}

// Next.js 개발 모드(HMR) 에서는 모듈이 반복 재평가되면서 postgres 커넥션이 누적될 수 있다.
// globalThis 캐시로 단일 클라이언트만 유지해 Too many clients 오류를 예방한다.
// 프로덕션(`NODE_ENV==='production'`) 에서는 Next.js 가 모듈을 한 번만 로드하므로 캐시 불필요.
type GlobalWithPostgres = typeof globalThis & {
  __todogramPostgres?: ReturnType<typeof postgres>
}
const globalForPostgres = globalThis as GlobalWithPostgres

const client =
  globalForPostgres.__todogramPostgres ??
  postgres(databaseUrl, {
    // pgBouncer(transaction mode) 호환. prepared statement 를 비활성화해야 한다.
    prepare: false,
    // 서버리스 환경에서 idle 커넥션을 오래 쥐지 않도록 짧게 유지. 단위: 초.
    idle_timeout: 20,
    // 한 인스턴스 당 최대 커넥션 수. Vercel hobby + Supabase free 조합에서 안전한 값.
    max: 10,
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPostgres.__todogramPostgres = client
}

// drizzle 인스턴스. relational query 를 쓰려면 schema 배럴을 넘겨야 한다.
// (Phase 2 - D3 에서 `db.query.tasks.findMany({ with: { labels: true } })` 형태로 사용)
export const db = drizzle(client, { schema, logger: process.env.NODE_ENV === 'development' })

// 재연결 여부 판단이 필요한 통합 테스트 등에서 쓸 수 있도록 raw 핸들도 export.
// 애플리케이션 코드는 항상 `db` 만 import 하도록 한다.
export { client as postgresClient }
export type Database = typeof db
