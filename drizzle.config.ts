import { defineConfig } from 'drizzle-kit'

// drizzle-kit CLI 에서 사용하는 설정 (`npm run db:generate`, `db:migrate`, `db:push`, `db:studio`).
// Next.js 런타임이 아니라 Node CLI 컨텍스트라서 여기서는 process.env 를 직접 읽는다.
// DATABASE_URL 은 Phase 0-F2 단계에서 Supabase 연결 문자열로 채운다 (없어도 schema 파싱/generate 는 동작).
const databaseUrl = process.env.DATABASE_URL ?? ''

export default defineConfig({
  // postgresql (Supabase Postgres) 전용
  dialect: 'postgresql',
  // 스키마 모듈을 폴더 단위로 읽어서 파일별로 테이블을 분리한다 (users/labels/tasks/task_labels/rollover_logs).
  schema: './src/db/schema',
  // 생성되는 migration SQL + snapshot 위치. git 에 커밋해서 스키마 변경 이력을 추적한다.
  out: './src/db/migrations',
  // drizzle-kit 이 DB 에 접속해야 하는 명령(`migrate`/`push`/`studio`) 을 위한 자격 증명.
  dbCredentials: {
    url: databaseUrl,
  },
  // 마이그레이션 테이블 이름을 명시적으로 고정 (기본값이지만 드러내두면 새 프로젝트 합류 시 가독성이 좋다).
  migrations: {
    table: '__drizzle_migrations',
    schema: 'public',
  },
  // 스키마 diff 시 엄격한 타입 체크를 강제 → 실수로 컬럼 타입을 바꿔 migration 이 조용히 깨지는 것을 방지.
  strict: true,
  // drizzle-kit CLI 의 출력 verbose 여부. 초기 1인 개발 단계이므로 모든 쿼리를 보여준다.
  verbose: true,
})
