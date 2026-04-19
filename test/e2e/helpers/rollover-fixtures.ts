import postgres, { type Sql } from 'postgres'

// ============================================================================
// Playwright E2E 용 rollover 시드/검증 헬퍼 — Phase 5 R4 완료 검증
// ============================================================================
// - `rollover.spec.ts` 가 테스트 본체에 집중하도록, DB round-trip(유저/태스크 생성, 정리,
//   상태 읽기) 를 이 모듈로 분리한다.
// - 실 Drizzle 클라이언트를 재사용하지 않고 독립적인 `postgres.js` 연결을 연다.
//   이유:
//     1) 드리즐 인스턴스는 Next.js 런타임 전용이며 `@/env` 가 평가되는 순간 전역 상태가
//        생성된다. Playwright worker 에서 불필요한 side-effect(다른 env var 누락 에러 등) 가
//        발생할 수 있어 분리하는 편이 안전.
//     2) 테스트 측에서 순수 SQL 로 후처리를 하면 스키마 변경에 대한 결합도도 낮아진다.
// - 이 파일은 **테스트 쪽에서만 사용** 되며 프로덕션 코드 경로와 완전히 격리된다.
// ============================================================================

export interface RolloverSeed {
  userId: number
  taskId: number
  email: string
}

export interface TaskSnapshot {
  id: number
  dueAt: Date
  status: string
}

export interface RolloverLogRow {
  taskId: number
  rolledAt: string // YYYY-MM-DD (Postgres DATE → string)
}

/**
 * 테스트 전용 DB 세션을 연다. 연결 실패는 호출자에게 전파해 테스트 자체를 skip/fail 하도록
 * 맡긴다 (Playwright 는 beforeAll 예외를 명확히 출력한다).
 */
export function openTestSql(databaseUrl: string): Sql {
  return postgres(databaseUrl, {
    // pgBouncer transaction mode 에서도 호환되도록 prepare 비활성화 (프로덕션 @/db 와 동일 정책).
    prepare: false,
    // 테스트는 짧게 쓰고 바로 close.
    idle_timeout: 5,
    max: 2,
    // 연결 로그가 터미널 출력을 덮지 않도록 기본 레벨 유지 (postgres.js 기본이 조용함).
  })
}

/**
 * 테스트 전용 유저 + "어제 KST 10:00" 에 마감되는 pending 태스크 하나를 시드한다.
 *
 * - 이메일은 호출 시점 timestamp 로 충돌 방지. 완료 후 cleanup 이 이를 삭제한다.
 * - `timezone='Asia/Seoul'`, `rollover_enabled=true`, `status='pending'` 조합이 모두
 *   cron 의 `lockCandidates` WHERE 조건에 정확히 매칭된다.
 * - `due_at` 을 어제 10:00 KST (= 어제 01:00 UTC) 로 잡아 DST/자정 경계에서 안전.
 */
export async function seedRolloverFixture(
  sql: Sql,
  now: Date = new Date()
): Promise<RolloverSeed> {
  const email = `e2e-rollover-${now.getTime()}@todogram.test`

  const [userRow] = await sql<{ id: number }[]>`
    INSERT INTO users (email, username, timezone, default_rollover)
    VALUES (${email}, 'e2e-rollover', 'Asia/Seoul', true)
    RETURNING id
  `
  const userId = userRow.id

  // "어제 10:00 KST" 를 UTC 로 환산: 어제(=now-24h) KST 의 날짜 파트를 뽑아 10:00 KST 를
  // UTC 로 변환. KST = UTC+9 이므로 10:00 KST = 01:00 UTC (DST 없음).
  const yesterdayUtc = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const kstDateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(yesterdayUtc)
  const y = Number(kstDateParts.find(p => p.type === 'year')!.value)
  const m = Number(kstDateParts.find(p => p.type === 'month')!.value)
  const d = Number(kstDateParts.find(p => p.type === 'day')!.value)
  // 10:00 KST = 01:00 UTC (KST 는 고정 +9, DST 없음).
  const dueAt = new Date(Date.UTC(y, m - 1, d, 1, 0, 0))

  const [taskRow] = await sql<{ id: number }[]>`
    INSERT INTO tasks (user_id, title, status, due_at, rollover_enabled, position)
    VALUES (${userId}, 'E2E rollover 검증 태스크', 'pending', ${dueAt.toISOString()}, true, 0)
    RETURNING id
  `

  return { userId, taskId: taskRow.id, email }
}

/** 시드한 태스크의 현재 상태(due_at, status) 를 가져온다. */
export async function readTaskSnapshot(
  sql: Sql,
  taskId: number
): Promise<TaskSnapshot> {
  const rows = await sql<
    { id: number; due_at: Date; status: string }[]
  >`SELECT id, due_at, status FROM tasks WHERE id = ${taskId}`
  if (rows.length === 0) throw new Error(`task(id=${taskId}) 가 존재하지 않습니다.`)
  return {
    id: rows[0].id,
    dueAt: new Date(rows[0].due_at),
    status: rows[0].status,
  }
}

/** 시드한 태스크의 rollover_logs 기록을 모두 읽는다. */
export async function readRolloverLogs(
  sql: Sql,
  taskId: number
): Promise<RolloverLogRow[]> {
  const rows = await sql<
    { task_id: number; rolled_at: string | Date }[]
  >`SELECT task_id, rolled_at FROM rollover_logs WHERE task_id = ${taskId}`
  return rows.map(row => ({
    taskId: row.task_id,
    rolledAt:
      typeof row.rolled_at === 'string'
        ? row.rolled_at
        : new Intl.DateTimeFormat('en-CA', {
            timeZone: 'UTC',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).format(row.rolled_at),
  }))
}

/**
 * 시드한 유저/태스크와 관련 log 를 모두 정리한다. FK 순서(rollover_logs → tasks → users)
 * 를 지켜야 한다. 이미 없어도 NOOP.
 */
export async function cleanupRolloverFixture(
  sql: Sql,
  seed: Pick<RolloverSeed, 'userId' | 'taskId'>
): Promise<void> {
  await sql`DELETE FROM rollover_logs WHERE task_id = ${seed.taskId}`
  await sql`DELETE FROM tasks WHERE id = ${seed.taskId}`
  await sql`DELETE FROM users WHERE id = ${seed.userId}`
}
