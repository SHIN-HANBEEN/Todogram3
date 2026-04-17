import { integer, pgTable, serial, text, unique } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { users } from './users'
import { taskLabels } from './task-labels'

// 라벨 — 사용자별 태스크 분류(카테고리). 설계 §8-2.
// UI 에서 사용하는 `#RRGGBB` 색상과 Google Cal 에서 쓰는 colorId('1'~'11') 를 모두 보관 (§8-5 매핑).
export const labels = pgTable(
  'labels',
  {
    id: serial('id').primaryKey(),

    // 라벨 소유자. 설계 DDL 기준 ON DELETE 동작 미지정 → restrict(기본값) 유지.
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),

    // 사용자가 지정한 라벨 이름 (예: '직장', '가정').
    name: text('name').notNull(),

    // UI 에서 실제 표시될 색상 (#RRGGBB 7자). Phase 2 - D1 에서 Zod 정규식 검증.
    color: text('color').notNull(),
    // Google Calendar API 가 허용하는 colorId. '1'~'11' 문자열. §8-5 매핑 근거.
    googleColorId: text('google_color_id'),

    // 리스트 뷰 정렬용 정수. drag-and-drop 시 재계산.
    position: integer('position').notNull(),
  },
  table => [
    // 같은 사용자가 동일 이름의 라벨을 두 번 만들지 못하도록 복합 UNIQUE.
    unique('labels_user_name_unique').on(table.userId, table.name),
  ]
)

export const labelsRelations = relations(labels, ({ one, many }) => ({
  // 라벨 → 소유자(사용자) 역참조.
  user: one(users, {
    fields: [labels.userId],
    references: [users.id],
  }),
  // 라벨 → 태스크 다대다 junction.
  taskLabels: many(taskLabels),
}))

export type Label = typeof labels.$inferSelect
export type NewLabel = typeof labels.$inferInsert
