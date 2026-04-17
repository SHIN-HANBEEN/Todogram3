import { date, integer, pgTable, primaryKey } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tasks } from './tasks'

// 자동 이월(rollover) 로그 — Phase 5 R3 중복 실행 방지의 핵심.
// (task_id, rolled_at) 복합 PK 로 "특정 날짜에 이 태스크가 이미 이월됐는지" 를 원자적으로 판별.
// cron 이 여러 번 실행되거나 timezone 경계 근처에서 재실행되어도 PK 충돌로 자연히 멱등성을 보장.
export const rolloverLogs = pgTable(
  'rollover_logs',
  {
    // 이월된 태스크. 태스크가 삭제되면 로그도 같이 정리.
    taskId: integer('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    // 이월이 "수행된 날짜" (사용자 timezone 기준의 DATE — 시각 정보 없이 YYYY-MM-DD).
    // timestamptz 대신 DATE 를 쓰는 이유: 00:05 cron 이 timezone 마다 다른 시각에 실행되더라도
    // 같은 논리적 '그 날' 에 대해서는 단 1회만 기록되어야 하기 때문. 설계 §8-4.
    rolledAt: date('rolled_at').notNull(),
  },
  table => [primaryKey({ columns: [table.taskId, table.rolledAt] })]
)

export const rolloverLogsRelations = relations(rolloverLogs, ({ one }) => ({
  task: one(tasks, {
    fields: [rolloverLogs.taskId],
    references: [tasks.id],
  }),
}))

export type RolloverLog = typeof rolloverLogs.$inferSelect
export type NewRolloverLog = typeof rolloverLogs.$inferInsert
