import { integer, pgTable, primaryKey } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tasks } from './tasks'
import { labels } from './labels'

// 태스크 ↔ 라벨 다대다 junction. 설계 §8-2.
// 부모가 삭제되면 junction row 도 자동 정리되어야 하므로 양쪽 모두 ON DELETE CASCADE.
export const taskLabels = pgTable(
  'task_labels',
  {
    taskId: integer('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    labelId: integer('label_id')
      .notNull()
      .references(() => labels.id, { onDelete: 'cascade' }),
  },
  table => [
    // 복합 PK — 같은 (task, label) 쌍이 중복되지 않도록 보장. 설계 DDL 기준.
    primaryKey({ columns: [table.taskId, table.labelId] }),
  ]
)

// junction 테이블은 양쪽을 one() 으로 연결해야 drizzle 의 `with: { taskLabels: { with: { label: true } } }` 가 작동한다.
export const taskLabelsRelations = relations(taskLabels, ({ one }) => ({
  task: one(tasks, {
    fields: [taskLabels.taskId],
    references: [tasks.id],
  }),
  label: one(labels, {
    fields: [taskLabels.labelId],
    references: [labels.id],
  }),
}))

export type TaskLabel = typeof taskLabels.$inferSelect
export type NewTaskLabel = typeof taskLabels.$inferInsert
