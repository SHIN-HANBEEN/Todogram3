import { expect, test } from '@playwright/test'
import type { Sql } from 'postgres'

import { E2E_CRON_SECRET } from './global-setup'
import {
  cleanupRolloverFixture,
  openTestSql,
  readRolloverLogs,
  readTaskSnapshot,
  seedRolloverFixture,
  type RolloverSeed,
} from './helpers/rollover-fixtures'

// ============================================================================
// Phase 5 R4 완료 기준 E2E — rollover 실-DB round-trip
// ============================================================================
// 시나리오:
//   1) 테스트 전용 유저(Asia/Seoul) 를 생성하고,
//      `due_at = 어제 10:00 KST`, `status='pending'`, `rollover_enabled=true` 인 태스크를 시드.
//   2) `Authorization: Bearer ${E2E_CRON_SECRET}` 로 `/api/cron/rollover` 를 호출.
//   3) 응답 JSON 이 `{ ok:true, rolledOver>=1, failed:0 }` 형태인지 확인.
//   4) DB 를 재조회해 `tasks.due_at` 이 "오늘 10:00 KST" 로 이동했는지 검증.
//   5) `rollover_logs` 에 `(task_id, rolled_at=오늘-KST)` 행이 정확히 1건 기록됐는지 검증.
//   6) 같은 UTC 날짜에 cron 을 한 번 더 때려도 `rolledOver=0` 이고 로그가 중복 생성되지
//      않는지(R3 의 (task_id, rolled_at) PK 멱등성) 확인.
//
// 왜 실제 Supabase 를 치는가:
//   - 이 테스트의 존재 이유는 "쿼리 · 트랜잭션 · 인덱스 · FK · DATE 컬럼 · Drizzle 어댑터"
//     조합이 프로덕션 DB 드라이버와 실제로 맞물리는지 검증하기 위함.
//     fake IO 로 빈틈을 놓친 적이 여러 번 있어 R4 완료 기준으로 명시됐다.
// ============================================================================

test.describe('Phase 5 R4 — /api/cron/rollover 실 DB round-trip', () => {
  // `.env.local` + globalSetup 이 정상 동작하면 반드시 채워져 있어야 한다.
  // 하나라도 비어 있으면 테스트 자체를 skip 해 "왜 실패했는지" 혼동을 줄인다.
  const DATABASE_URL = process.env.DATABASE_URL ?? ''
  test.skip(
    !DATABASE_URL,
    'DATABASE_URL 이 비어 있음 — .env.local 에 값을 채운 뒤 재실행하세요.'
  )

  let sql: Sql
  let seed: RolloverSeed
  const startedAt = new Date()

  test.beforeAll(async () => {
    sql = openTestSql(DATABASE_URL)
    seed = await seedRolloverFixture(sql, startedAt)
  })

  test.afterAll(async () => {
    // 테스트 도중 실패해도 뒷정리는 시도 (존재하지 않으면 NOOP).
    if (seed) await cleanupRolloverFixture(sql, seed)
    if (sql) await sql.end({ timeout: 5 })
  })

  test('어제 pending 태스크가 오늘로 이동하고 rollover_logs 에 단일 기록이 남는다', async ({
    request,
  }) => {
    // --- 사전 상태 확인 (시드가 의도대로 들어갔는지) ----------------------
    const before = await readTaskSnapshot(sql, seed.taskId)
    expect(before.status).toBe('pending')
    // 어제 날짜인지: "오늘 KST 자정" 과 비교.
    const todayKst = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
    }).format(startedAt)
    const beforeKstDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
    }).format(before.dueAt)
    expect(beforeKstDate).not.toBe(todayKst)

    // --- cron 엔드포인트 호출 ---------------------------------------------
    const firstCall = await request.get('/api/cron/rollover', {
      headers: { Authorization: `Bearer ${E2E_CRON_SECRET}` },
    })
    expect(firstCall.status()).toBe(200)
    const firstBody = await firstCall.json()
    expect(firstBody.ok).toBe(true)
    expect(firstBody.rolledOver).toBeGreaterThanOrEqual(1)
    expect(firstBody.failed).toBe(0)

    // --- 이월된 태스크 상태 검증 ------------------------------------------
    const after = await readTaskSnapshot(sql, seed.taskId)
    expect(after.status).toBe('pending') // 이월은 status 를 건드리지 않음
    const afterKstDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
    }).format(after.dueAt)
    expect(afterKstDate).toBe(todayKst)
    // 시간 컴포넌트 보존(§8-4): 원래 10:00 KST → 이월 후에도 10:00 KST.
    const afterKstTime = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Seoul',
      hourCycle: 'h23',
      hour: '2-digit',
      minute: '2-digit',
    }).format(after.dueAt)
    expect(afterKstTime).toBe('10:00')

    // --- rollover_logs 기록 검증 -----------------------------------------
    const logs = await readRolloverLogs(sql, seed.taskId)
    expect(logs).toHaveLength(1)
    expect(logs[0].taskId).toBe(seed.taskId)
    expect(logs[0].rolledAt).toBe(todayKst)

    // --- 멱등성: 두 번째 호출은 rolledOver=0 + log 중복 없음 --------------
    const secondCall = await request.get('/api/cron/rollover', {
      headers: { Authorization: `Bearer ${E2E_CRON_SECRET}` },
    })
    expect(secondCall.status()).toBe(200)
    const secondBody = await secondCall.json()
    expect(secondBody.ok).toBe(true)
    // 이 테스트 태스크 기준으로는 0. 다른 유저가 DB 에 있을 수 있어 >=0 만 검증.
    expect(secondBody.failed).toBe(0)
    const logsAfterSecond = await readRolloverLogs(sql, seed.taskId)
    expect(logsAfterSecond).toHaveLength(1)
  })
})
