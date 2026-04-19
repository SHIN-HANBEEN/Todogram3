import { describe, expect, it } from 'vitest'

import {
  runDailyRollover,
  type RolloverIO,
  type RolloverTxIO,
} from '@/lib/rollover'

// ============================================================================
// rollover.ts 의 R3 중복 방지 + 트랜잭션 계약 단위 테스트 — Phase 5 R3
// ============================================================================
// 이 테스트는 `RolloverIO` 어댑터를 fake 로 주입해 아래 계약을 검증한다:
//   1. 같은 UTC 날짜 안에서 `runDailyRollover` 를 두 번 호출해도 멱등 (두 번째는 0건).
//   2. 첫 실행 이후 `rollover_logs` 에 `(task_id, rolled_at)` 키가 기록된다.
//   3. PK 충돌(ON CONFLICT DO NOTHING) 은 `task.due_at` UPDATE 자체를 막는다
//      — 즉, 로그 없이 UPDATE 만 터지는 경로가 없어야 한다.
//   4. `FOR UPDATE SKIP LOCKED` 로 잠긴 태스크는 이번 사이클에서 통째로 건너뛰어진다.
//   5. 각 사용자는 정확히 한 번만 `withTransaction` 으로 감싸져 실행된다 (사용자당 단일 BEGIN).
//
// 실제 Postgres 동작을 fake 로 시뮬레이션한다:
//   - `rolloverLogs` 는 `"${taskId}|${rolledAt}"` 문자열 키의 Set — PK 충돌을 흉내.
//   - `tasks.dueAt` 은 fake 가 inplace 로 갱신 → 두 번째 호출 시 자연 필터링으로도 후보에서 빠진다.
//   - `locked` Set 에 포함된 태스크 id 는 `lockCandidates` 반환에서 미리 제외 (SKIP LOCKED).
// ============================================================================

interface FakeTask {
  id: number
  userId: number
  dueAt: Date | null
  rolloverEnabled: boolean
  status: string
}

interface FakeIOState {
  users: Array<{ id: number; timezone: string }>
  tasks: FakeTask[]
  rolloverLogs: Set<string>
  locked: Set<number>
  calls: {
    withTransaction: number
    lockCandidates: number
    tryClaimRolloverLog: number
    shiftTaskDueAt: number
  }
}

/**
 * 실제 Drizzle 없이도 R3 계약만 재현하는 fake IO.
 * - PK 충돌은 Set 기반 "이미 존재하면 false" 로 흉내.
 * - 트랜잭션은 단순히 콜백을 그대로 호출 (롤백 시나리오는 본 테스트 범위 밖).
 * - SKIP LOCKED 는 `locked` 에 포함된 태스크 id 를 후보에서 제외해 표현한다.
 */
function createFakeIO(initial: {
  users: Array<{ id: number; timezone: string }>
  tasks: FakeTask[]
  locked?: Set<number>
}): { io: RolloverIO; state: FakeIOState } {
  const state: FakeIOState = {
    users: initial.users,
    tasks: initial.tasks,
    rolloverLogs: new Set<string>(),
    locked: initial.locked ?? new Set<number>(),
    calls: {
      withTransaction: 0,
      lockCandidates: 0,
      tryClaimRolloverLog: 0,
      shiftTaskDueAt: 0,
    },
  }

  const txIO: RolloverTxIO = {
    lockCandidates: async (userId, todayStartUtc) => {
      state.calls.lockCandidates += 1
      return state.tasks
        .filter(t => t.userId === userId)
        .filter(t => t.rolloverEnabled)
        .filter(t => t.status !== 'done')
        .filter(t => t.dueAt !== null && t.dueAt.getTime() < todayStartUtc.getTime())
        .filter(t => !state.locked.has(t.id))
        .map(t => ({ id: t.id, dueAt: t.dueAt }))
    },
    tryClaimRolloverLog: async (taskId, rolledAt) => {
      state.calls.tryClaimRolloverLog += 1
      const key = `${taskId}|${rolledAt}`
      if (state.rolloverLogs.has(key)) return false
      state.rolloverLogs.add(key)
      return true
    },
    shiftTaskDueAt: async (taskId, nextDueAt) => {
      state.calls.shiftTaskDueAt += 1
      const task = state.tasks.find(t => t.id === taskId)
      if (!task) throw new Error(`fake: unknown task ${taskId}`)
      task.dueAt = nextDueAt
    },
  }

  const io: RolloverIO = {
    listUsers: async () => state.users.slice(),
    withTransaction: async run => {
      state.calls.withTransaction += 1
      return run(txIO)
    },
  }

  return { io, state }
}

describe('runDailyRollover — R3 멱등성 + 트랜잭션 계약', () => {
  it('첫 실행: 어제 미완료 task 들이 모두 이월되고 rollover_logs 에 기록된다', async () => {
    const now = new Date('2026-04-19T14:00:00Z') // KST 로 2026-04-19 23:00
    const { io, state } = createFakeIO({
      users: [{ id: 1, timezone: 'Asia/Seoul' }],
      tasks: [
        {
          id: 10,
          userId: 1,
          dueAt: new Date('2026-04-18T12:00:00Z'), // 어제 21:00 KST
          rolloverEnabled: true,
          status: 'pending',
        },
        {
          id: 11,
          userId: 1,
          dueAt: new Date('2026-04-17T10:00:00Z'), // 이틀 전 19:00 KST
          rolloverEnabled: true,
          status: 'in_progress',
        },
      ],
    })

    const result = await runDailyRollover({ io, now })

    expect(result).toEqual({ rolledOver: 2, failed: 0, failures: [] })
    // KST 기준 오늘 = 2026-04-19 → PK 에 이 날짜로 두 개 기록.
    expect(state.rolloverLogs.has('10|2026-04-19')).toBe(true)
    expect(state.rolloverLogs.has('11|2026-04-19')).toBe(true)
    // 로컬 21:00 / 19:00 이 보존된 채 날짜만 오늘로 이동 (검증 본체는 timezone 테스트에 있음; 여기선 존재만).
    expect(state.tasks.find(t => t.id === 10)?.dueAt?.toISOString()).toBe(
      '2026-04-19T12:00:00.000Z'
    )
    expect(state.tasks.find(t => t.id === 11)?.dueAt?.toISOString()).toBe(
      '2026-04-19T10:00:00.000Z'
    )
    // 사용자 1명 → withTransaction 정확히 1회.
    expect(state.calls.withTransaction).toBe(1)
    expect(state.calls.shiftTaskDueAt).toBe(2)
  })

  it('같은 UTC 날짜에 두 번째 호출: PK 덕분에 0건 (UPDATE 호출도 0회)', async () => {
    const now = new Date('2026-04-19T14:00:00Z')
    const { io, state } = createFakeIO({
      users: [{ id: 1, timezone: 'Asia/Seoul' }],
      tasks: [
        {
          id: 10,
          userId: 1,
          dueAt: new Date('2026-04-18T12:00:00Z'),
          rolloverEnabled: true,
          status: 'pending',
        },
      ],
    })

    await runDailyRollover({ io, now })
    // 첫 실행 이후 task.dueAt 은 이미 오늘로 갱신됨 → 자연 필터만으로도 두 번째 호출은 비워진다.
    const second = await runDailyRollover({ io, now })

    expect(second.rolledOver).toBe(0)
    // UPDATE 호출 횟수는 첫 실행의 1번에서 늘지 않아야 한다.
    expect(state.calls.shiftTaskDueAt).toBe(1)
    // 로그도 단 1건만 존재.
    expect(state.rolloverLogs.size).toBe(1)
  })

  it('PK 충돌이면 UPDATE 가 실행되지 않는다 (로그 없이 이월되는 경로 차단)', async () => {
    const now = new Date('2026-04-19T14:00:00Z')
    const { io, state } = createFakeIO({
      users: [{ id: 1, timezone: 'Asia/Seoul' }],
      tasks: [
        {
          id: 10,
          userId: 1,
          dueAt: new Date('2026-04-18T12:00:00Z'),
          rolloverEnabled: true,
          status: 'pending',
        },
      ],
    })
    // 이월하기 전에 "이미 오늘 로그가 있음" 상태를 주입 (ex: 새벽 재시도 직후 수동 호출 케이스).
    state.rolloverLogs.add('10|2026-04-19')

    const result = await runDailyRollover({ io, now })

    expect(result.rolledOver).toBe(0)
    // 후보에는 잡혔지만 PK 충돌로 claim 실패 → UPDATE 한 번도 안 불렸어야 한다.
    expect(state.calls.tryClaimRolloverLog).toBe(1)
    expect(state.calls.shiftTaskDueAt).toBe(0)
    // 원본 dueAt 은 그대로 유지.
    expect(state.tasks[0].dueAt?.toISOString()).toBe('2026-04-18T12:00:00.000Z')
  })

  it('FOR UPDATE SKIP LOCKED: 잠긴 태스크는 이번 사이클에서 건너뛰어진다', async () => {
    const now = new Date('2026-04-19T14:00:00Z')
    const { io, state } = createFakeIO({
      users: [{ id: 1, timezone: 'Asia/Seoul' }],
      tasks: [
        {
          id: 10,
          userId: 1,
          dueAt: new Date('2026-04-18T12:00:00Z'),
          rolloverEnabled: true,
          status: 'pending',
        },
        {
          id: 11,
          userId: 1,
          dueAt: new Date('2026-04-18T10:00:00Z'),
          rolloverEnabled: true,
          status: 'pending',
        },
      ],
      // task 10 은 사용자가 앱에서 수동 편집 중이라 가정 → SKIP LOCKED 으로 건너뛴다.
      locked: new Set<number>([10]),
    })

    const result = await runDailyRollover({ io, now })

    expect(result.rolledOver).toBe(1)
    expect(state.rolloverLogs.has('10|2026-04-19')).toBe(false)
    expect(state.rolloverLogs.has('11|2026-04-19')).toBe(true)
    // 다음 cron 주기(= 락 풀린 뒤) 에서 task 10 이 재시도 가능함을 확인하기 위해 dueAt 이 그대로인지 본다.
    expect(state.tasks.find(t => t.id === 10)?.dueAt?.toISOString()).toBe(
      '2026-04-18T12:00:00.000Z'
    )
  })

  it('사용자 여러 명이면 각자 별도 트랜잭션으로 격리 실행된다', async () => {
    const now = new Date('2026-04-19T14:00:00Z')
    const { io, state } = createFakeIO({
      users: [
        { id: 1, timezone: 'Asia/Seoul' },
        { id: 2, timezone: 'UTC' },
      ],
      tasks: [
        {
          id: 10,
          userId: 1,
          dueAt: new Date('2026-04-18T12:00:00Z'),
          rolloverEnabled: true,
          status: 'pending',
        },
        {
          id: 20,
          userId: 2,
          // UTC 사용자 기준 어제 (2026-04-18 09:00 UTC = 2026-04-18 날짜).
          dueAt: new Date('2026-04-18T09:00:00Z'),
          rolloverEnabled: true,
          status: 'pending',
        },
      ],
    })

    const result = await runDailyRollover({ io, now })

    expect(result.rolledOver).toBe(2)
    expect(state.calls.withTransaction).toBe(2)
    // 사용자 1 (KST) 의 오늘 = 2026-04-19, 사용자 2 (UTC) 의 오늘 = 2026-04-19.
    expect(state.rolloverLogs.has('10|2026-04-19')).toBe(true)
    expect(state.rolloverLogs.has('20|2026-04-19')).toBe(true)
  })

  it('완료(done)되었거나 rollover_enabled=false 인 태스크는 대상에서 제외된다', async () => {
    const now = new Date('2026-04-19T14:00:00Z')
    const { io, state } = createFakeIO({
      users: [{ id: 1, timezone: 'Asia/Seoul' }],
      tasks: [
        {
          id: 10,
          userId: 1,
          dueAt: new Date('2026-04-18T12:00:00Z'),
          rolloverEnabled: true,
          status: 'done', // 이미 완료 — 제외
        },
        {
          id: 11,
          userId: 1,
          dueAt: new Date('2026-04-18T09:00:00Z'),
          rolloverEnabled: false, // opt-out — 제외
          status: 'pending',
        },
        {
          id: 12,
          userId: 1,
          dueAt: new Date('2026-04-18T10:00:00Z'),
          rolloverEnabled: true,
          status: 'pending', // 정상 대상
        },
      ],
    })

    const result = await runDailyRollover({ io, now })

    expect(result.rolledOver).toBe(1)
    expect(state.rolloverLogs.size).toBe(1)
    expect(state.rolloverLogs.has('12|2026-04-19')).toBe(true)
  })
})
