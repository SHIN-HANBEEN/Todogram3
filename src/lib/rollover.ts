import { and, eq, lt, ne } from 'drizzle-orm'

import { db as defaultDb } from '@/db'
import { rolloverLogs, tasks, users } from '@/db/schema'

// ============================================================================
// Auto-rollover 공용 로직 — Phase 5 R2 + R3
// ============================================================================
// - 본 모듈은 Vercel Cron(`/api/cron/rollover`) 이 호출하는 실제 "이월" 엔진이다.
//   R1 이 인증 가드를 얹어 두었고, R2 가 사용자별 timezone 해소 + 격리 실행을 채웠다.
//   R3 은 여기에 "같은 날에 두 번 이월하지 않음" + "다른 세션이 편집 중인 태스크와의 경쟁 회피" 를
//   붙인다.
// - 제공 책임:
//     1) **사용자 timezone 해소** (R2) — 각 user 의 `timezone` 컬럼을 기준으로 "오늘 00:00 (현지)" 을
//        UTC 인스턴트로 계산. Vercel Cron 자체는 UTC 단일 시각에 실행되므로, 사용자마다
//        "그 시점에서 현지상으로 이미 지난 자정" 을 찾아야 한다 (§8-4).
//     2) **사용자별 격리 실행** (R2) — `Promise.allSettled` + 개별 try/catch 로 한 유저의 에러가
//        다른 유저의 이월을 절대 막지 않게 한다.
//     3) **중복 실행 방지** (R3) — `(task_id, rolled_at)` 복합 PK 가 설정된 `rollover_logs` 에
//        `ON CONFLICT DO NOTHING` 으로 원자 삽입. RETURNING 이 행을 돌려주는 경우에만 실제
//        `tasks.due_at` UPDATE 를 수행 → 같은 UTC 날짜 안에서 cron 이 여러 번 실행돼도
//        멱등.
//     4) **동시 편집 락** (R3) — 후보 SELECT 를 `FOR UPDATE SKIP LOCKED` 로 수행해, 다른
//        트랜잭션이 편집 중인 태스크는 그 사이클에서 건너뛴다. 다음 cron 주기에서 자연
//        복구되거나, 해당 유저가 직접 완료 처리하면 더 이상 대상이 아니게 된다. 절대
//        기다리지 않는다(=cron 은 총 실행시간이 유한해야 한다).
// - Google Calendar 이벤트는 절대 건드리지 않는다. Todogram 자체 태스크(`tasks` 테이블)만 대상.
// ============================================================================

// --- 1) Timezone 변환 헬퍼 ---------------------------------------------------
// 외부 의존성 없이 `Intl.DateTimeFormat` 만으로 처리한다. date-fns-tz 는 번들 사이즈 증가와
// 런타임 하나 더 학습할 의미 대비 이득이 적어 v1 에서는 도입하지 않는다.

/**
 * 주어진 UTC 인스턴트에서 `timezone` 의 UTC 오프셋(ms)을 계산한다.
 *
 * 반환값은 "동쪽이 양수" 관습을 따른다 (Asia/Seoul 은 +9:00 = +32_400_000).
 *
 * 구현 원리:
 *  - `Intl.DateTimeFormat` 으로 UTC 인스턴트를 해당 TZ 의 벽시계 문자열로 포맷한다.
 *  - 포맷 결과를 **UTC 로 해석한 가상의 인스턴트**(`asIfUtc`) 와 실제 UTC 인스턴트의 차이가
 *    곧 그 순간 TZ 의 오프셋이다.
 *  - DST 경계에서도 "그 순간의 로컬 시각" 을 `formatToParts` 가 정확히 알려주므로 DST 를
 *    가리지 않고 올바른 오프셋이 나온다.
 */
export function getTimezoneOffsetMs(timezone: string, utcDate: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(utcDate)

  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find(p => p.type === type)
    if (!part) {
      throw new Error(`Intl.DateTimeFormat 결과에 "${type}" 조각이 없습니다.`)
    }
    return Number(part.value)
  }

  const asIfUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second')
  )
  return asIfUtc - utcDate.getTime()
}

/**
 * `(y, m, d, h, min, s)` 를 `timezone` 의 로컬 벽시계 시각으로 간주하고, 그에 해당하는
 * UTC 인스턴트를 반환한다.
 *
 * 알고리즘:
 *  1) 일단 입력을 UTC 로 간주해 naive 인스턴트를 만든다.
 *  2) 그 시점 TZ 의 오프셋을 구해 1차 보정한다.
 *  3) DST 경계(예: 봄 전진) 근처에서 보정 후 오프셋이 달라지는 케이스가 있으므로, 한 번 더
 *     오프셋을 재확인해 2차 보정한다. 경험적으로 수렴은 2회 이내에 끝난다.
 *
 * 주의: DST 가 바뀌는 "존재하지 않는 시각" (예: 봄 전진 2:30) 이 입력으로 들어오면 어떤
 * 변환도 모호하다. 이 프로젝트의 호출 시점에서는 실제 DB 에 저장된 `due_at` 이거나
 * `Intl` 로 해석한 오늘 자정이라 그런 시각이 나오지 않는다.
 */
export function zonedDateToUtc(
  timezone: string,
  y: number,
  m: number,
  d: number,
  h = 0,
  min = 0,
  s = 0
): Date {
  const naiveUtc = Date.UTC(y, m - 1, d, h, min, s)
  const firstOffset = getTimezoneOffsetMs(timezone, new Date(naiveUtc))
  const firstGuess = naiveUtc - firstOffset
  const secondOffset = getTimezoneOffsetMs(timezone, new Date(firstGuess))
  if (secondOffset === firstOffset) return new Date(firstGuess)
  return new Date(naiveUtc - secondOffset)
}

/**
 * `now`(UTC 인스턴트) 기준으로, `timezone` 에서 "가장 최근에 지난 로컬 자정" 의 UTC 인스턴트.
 *
 * 예) now = 2026-04-19T14:00Z, timezone = 'Asia/Seoul'
 *     → KST 로는 2026-04-19 23:00. 가장 최근 KST 자정은 2026-04-19 00:00 KST
 *     → UTC 2026-04-18T15:00Z 를 반환.
 *
 * Cron 본체에서 "due_at < 이 값" 조건으로 어제까지의 pending 태스크를 뽑는다.
 */
export function computeTodayStartUtc(timezone: string, now: Date): Date {
  // 현재 시각을 해당 TZ 의 Y/M/D 로만 뽑아낸다 (`en-CA` 는 ISO-ish `YYYY-MM-DD` 출력 보장).
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const y = Number(parts.find(p => p.type === 'year')?.value)
  const m = Number(parts.find(p => p.type === 'month')?.value)
  const d = Number(parts.find(p => p.type === 'day')?.value)
  return zonedDateToUtc(timezone, y, m, d, 0, 0, 0)
}

/**
 * `now`(UTC 인스턴트) 에서 `timezone` 기준 "오늘 날짜" 를 `YYYY-MM-DD` 문자열로 돌려준다.
 *
 * R3 의 `rollover_logs.rolled_at` (DATE 컬럼) 키로 사용되는 값. 같은 UTC 물리 시각이라도
 * 사용자 timezone 마다 다른 "오늘" 이 나올 수 있으므로, 이 함수 결과가 곧 PK 의 '그 날' 이다.
 *
 * 포맷 선택 근거: `en-CA` 로케일은 ISO-ish `YYYY-MM-DD` 출력을 보장한다 — Postgres
 * DATE 리터럴과 1:1 매칭되므로 중간 파싱 없이 바로 삽입 가능.
 */
export function computeTodayDateString(timezone: string, now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/**
 * 원래의 `due_at` 이 가진 "로컬 시분초" 를 보존하면서, 날짜 부분만 `timezone` 기준 오늘로
 * 옮긴 새로운 UTC 인스턴트를 반환한다.
 *
 * 설계 §8-4: "오늘로 due_at 업데이트 (시간은 유지)".
 * 시간대가 섞여 있어도 "사용자 기준으로 같은 시각" 이 보존되므로, 예컨대 한국 사용자가
 * 매일 21:00 에 잡아둔 태스크를 놓쳤을 때도 오늘 21:00 (KST) 에 다시 마감되도록 이월된다.
 */
export function shiftDueAtToToday(
  original: Date,
  timezone: string,
  now: Date
): Date {
  // 1) 오늘의 로컬 Y/M/D
  const todayParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const y = Number(todayParts.find(p => p.type === 'year')?.value)
  const m = Number(todayParts.find(p => p.type === 'month')?.value)
  const d = Number(todayParts.find(p => p.type === 'day')?.value)

  // 2) 원래 due_at 의 로컬 시/분/초
  const origParts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(original)
  const h = Number(origParts.find(p => p.type === 'hour')?.value)
  const min = Number(origParts.find(p => p.type === 'minute')?.value)
  const s = Number(origParts.find(p => p.type === 'second')?.value)

  // 3) "오늘 Y/M/D + 원래 시/분/초" 를 로컬로 해석해 UTC 로 변환
  return zonedDateToUtc(timezone, y, m, d, h, min, s)
}

// --- 2) 사용자별 격리 실행 --------------------------------------------------

/**
 * 한 유저의 작업이 실패해도 다른 유저는 그대로 진행되도록 격리한 범용 오케스트레이터.
 *
 * - `Promise.allSettled` 로 모든 작업이 끝날 때까지 기다린 뒤, 성공/실패를 분리해 돌려준다.
 * - 실패 사유는 원본 Error 를 유지해 로깅 측에서 스택을 추적할 수 있게 한다.
 *
 * R2 의 critical test gap #3 의 절반(사용자 레벨 try/catch) 이 여기서 충족된다.
 * 나머지 절반(`FOR UPDATE SKIP LOCKED`) 은 R3 에서 `RolloverTxIO.lockCandidates` 에 구현된다.
 */
export async function runForEachUser<U, R>(
  items: U[],
  run: (item: U) => Promise<R>
): Promise<{
  ok: Array<{ item: U; result: R }>
  failed: Array<{ item: U; error: Error }>
}> {
  const settled = await Promise.allSettled(items.map(run))
  const ok: Array<{ item: U; result: R }> = []
  const failed: Array<{ item: U; error: Error }> = []
  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i]
    const item = items[i]
    if (outcome.status === 'fulfilled') {
      ok.push({ item, result: outcome.value })
    } else {
      const reason = outcome.reason
      const error = reason instanceof Error ? reason : new Error(String(reason))
      failed.push({ item, error })
    }
  }
  return { ok, failed }
}

// --- 3) DB 경계 어댑터 -------------------------------------------------------
// R3 에서 도메인 로직(멱등 삽입 판정 + 시프트)과 Drizzle-specific SQL 을 분리한다.
// 테스트는 fake 어댑터를 주입해 PK 동작과 락 경쟁을 in-memory 로 재현할 수 있다.

/** 트랜잭션 내부에서 노출되는 데이터베이스 연산. */
export interface RolloverTxIO {
  /**
   * 이월 후보 태스크를 `FOR UPDATE SKIP LOCKED` 로 잠가 가져온다.
   *
   * `SKIP LOCKED` 는 "다른 트랜잭션이 이미 이 행을 잠그고 있으면 기다리지 말고 건너뛴다" 는
   * 세맨틱이다. 사용자가 그 순간 앱에서 태스크를 편집 중이면 cron 은 그 태스크를 이번 주기에
   * 그냥 건너뛰고, 다음 cron 에서 다시 시도한다. → 락 경쟁으로 cron 전체가 블로킹되지 않는다.
   */
  lockCandidates: (
    userId: number,
    todayStartUtc: Date
  ) => Promise<Array<{ id: number; dueAt: Date | null }>>

  /**
   * `(task_id, rolled_at)` 로그를 원자 삽입한다. PK 충돌이면 `false` 를 반환해 "이미 오늘
   * 이월됨" 을 알린다. 호출자는 `true` 일 때만 실제 UPDATE 를 수행해야 한다.
   */
  tryClaimRolloverLog: (taskId: number, rolledAt: string) => Promise<boolean>

  /** 해당 태스크의 `due_at` 을 새 UTC 인스턴트로 갱신. `updated_at` 은 ORM 훅이 자동 갱신. */
  shiftTaskDueAt: (taskId: number, nextDueAt: Date) => Promise<void>
}

/** 이월 cron 전체가 사용하는 DB 경계. 트랜잭션 오프너 + 사용자 목록 로더. */
export interface RolloverIO {
  listUsers: () => Promise<Array<{ id: number; timezone: string }>>
  withTransaction: <T>(run: (tx: RolloverTxIO) => Promise<T>) => Promise<T>
}

// 주입 가능한 최소 DB 인터페이스. 실제 Drizzle 타입 그대로.
type Db = typeof defaultDb

/**
 * 실제 Drizzle 인스턴스를 `RolloverIO` 계약으로 감싸는 어댑터.
 *
 * 런타임 경로: `runDailyRollover()` → (deps.io 미지정) → `makeDrizzleRolloverIO(db)`.
 * 테스트 경로: 테스트가 `runDailyRollover({ io: fakeIO })` 를 직접 주입.
 */
export function makeDrizzleRolloverIO(db: Db): RolloverIO {
  return {
    // 전체 사용자 로드. id + timezone 만 필요하므로 최소 컬럼만 뽑는다.
    listUsers: async () =>
      db.select({ id: users.id, timezone: users.timezone }).from(users),

    // Drizzle 의 트랜잭션 진입점. postgres-js 드라이버가 pgBouncer transaction mode 에서도
    // BEGIN/COMMIT 을 단일 physical connection 에 고정해 준다.
    withTransaction: async run =>
      db.transaction(async tx => {
        const txIO: RolloverTxIO = {
          // 이월 후보. 부분 인덱스(idx_tasks_rollover) 가 status != 'done' AND rollover_enabled=true
          // 조건을 미리 필터링하므로 풀스캔 되지 않는다.
          lockCandidates: async (userId, todayStartUtc) =>
            tx
              .select({ id: tasks.id, dueAt: tasks.dueAt })
              .from(tasks)
              .where(
                and(
                  eq(tasks.userId, userId),
                  eq(tasks.rolloverEnabled, true),
                  ne(tasks.status, 'done'),
                  lt(tasks.dueAt, todayStartUtc)
                )
              )
              // 동시 편집과의 경쟁 회피 — 잠긴 행은 기다리지 말고 skip.
              .for('update', { skipLocked: true }),

          // `ON CONFLICT DO NOTHING` + `RETURNING` 조합으로 "처음 이월" 여부를 원자 판정.
          // 반환 배열이 비었으면 같은 (task_id, rolled_at) 이 이미 존재 → 오늘은 건너뜀.
          tryClaimRolloverLog: async (taskId, rolledAt) => {
            const inserted = await tx
              .insert(rolloverLogs)
              .values({ taskId, rolledAt })
              .onConflictDoNothing()
              .returning({ taskId: rolloverLogs.taskId })
            return inserted.length > 0
          },

          // due_at 만 갱신. `$onUpdate` 훅이 updated_at 도 자동으로 현재 시각으로 찍어준다.
          shiftTaskDueAt: async (taskId, nextDueAt) => {
            await tx
              .update(tasks)
              .set({ dueAt: nextDueAt })
              .where(eq(tasks.id, taskId))
          },
        }
        return run(txIO)
      }),
  }
}

// --- 4) 실제 이월 본체 -------------------------------------------------------

// 한 사용자에 대해 이월 1사이클이 끝난 뒤 남길 요약.
interface UserRolloverSummary {
  userId: number
  rolledOver: number
}

// 전체 cron 호출의 응답 계약.
export interface RolloverResult {
  rolledOver: number
  failed: number
  failures: Array<{ userId: number; error: string }>
}

interface RunDailyRolloverDeps {
  // R3: DB 경계. 테스트는 fake IO 를 주입해 PK 동작과 트랜잭션 흐름을 재현한다.
  io?: RolloverIO
  // 레거시 편의: `io` 생략 시 이 `db` 로 기본 어댑터를 구성한다 (프로덕션은 모두 생략 경로).
  db?: Db
  now?: Date
}

/**
 * 한 사용자의 미완료 태스크를 오늘(사용자 로컬) 로 이월한다. R3 트랜잭션 판본.
 *
 * 실행 흐름 (트랜잭션 내부):
 *   1. `lockCandidates` — `FOR UPDATE SKIP LOCKED` 로 후보 행을 잠그며 SELECT.
 *   2. 각 후보 task 에 대해:
 *      a) `tryClaimRolloverLog(task.id, todayDate)` → PK 충돌이면 "이미 오늘 이월됨" → skip.
 *      b) 아니면 `due_at` 의 로컬 시분초를 보존한 채 오늘 날짜로 UPDATE.
 *   3. 커밋과 함께 (task.due_at 갱신, rollover_logs PK) 가 원자적으로 영속된다.
 *
 * 멱등성 보장 범위:
 *   - **같은 UTC 날짜** 안에서 cron 이 여러 번 실행돼도 두 번째 호출부터는 `rolledOver=0`.
 *   - 사용자 timezone 자정을 넘겨 "논리적으로 다른 날" 이 되면 `rolled_at` 값이 달라져
 *     새 이월 이력으로 카운트되는데, 이건 의도된 동작이다 (연속일 이월).
 */
async function rolloverSingleUser(
  io: RolloverIO,
  user: { id: number; timezone: string },
  now: Date
): Promise<UserRolloverSummary> {
  return io.withTransaction(async tx => {
    const todayStartUtc = computeTodayStartUtc(user.timezone, now)
    const todayDate = computeTodayDateString(user.timezone, now)

    const candidates = await tx.lockCandidates(user.id, todayStartUtc)

    let rolledOver = 0
    for (const task of candidates) {
      // `lt(due_at, today_start_utc)` 조건이 NULL 을 걸러 주지만 타입상 nullable 이라 방어.
      if (!task.dueAt) continue

      // 먼저 로그를 claim. 실패하면 누군가 이미 오늘 이월했으므로 task UPDATE 자체를 skip.
      const claimed = await tx.tryClaimRolloverLog(task.id, todayDate)
      if (!claimed) continue

      const nextDueAt = shiftDueAtToToday(task.dueAt, user.timezone, now)
      await tx.shiftTaskDueAt(task.id, nextDueAt)

      rolledOver += 1
    }

    return { userId: user.id, rolledOver }
  })
}

/**
 * 매일 cron 이 호출하는 메인 엔트리.
 *
 * 1) 전체 사용자 목록을 로드한다 (id + timezone 만).
 * 2) 사용자별로 `rolloverSingleUser` 를 격리 실행한다.
 * 3) 성공/실패 요약을 합산해 돌려준다.
 *
 * 주입 가능한 의존성:
 *   - `io`: R3 에서 추가된 DB 경계 어댑터. 테스트에서 fake 를 주입.
 *   - `db`: 레거시 편의. `io` 미지정 시 이 드라이버로 기본 어댑터 생성.
 *   - `now`: 기본값은 `new Date()`. 테스트에서 고정 시각을 주입해 재현성 확보.
 */
export async function runDailyRollover(
  deps: RunDailyRolloverDeps = {}
): Promise<RolloverResult> {
  const io = deps.io ?? makeDrizzleRolloverIO(deps.db ?? defaultDb)
  const now = deps.now ?? new Date()

  const allUsers = await io.listUsers()

  const { ok, failed } = await runForEachUser(allUsers, user =>
    rolloverSingleUser(io, user, now)
  )

  const rolledOver = ok.reduce((acc, entry) => acc + entry.result.rolledOver, 0)
  const failures = failed.map(entry => ({
    userId: entry.item.id,
    error: entry.error.message,
  }))

  return {
    rolledOver,
    failed: failures.length,
    failures,
  }
}
