import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { users } from './users'
import { taskLabels } from './task-labels'
import { rolloverLogs } from './rollover-logs'

// 할 일(task). Todogram 의 핵심 엔티티. 설계 §8-2.
// status 는 설계 DDL 에서 TEXT 로 정의됨 → 앱 레이어(Zod)에서 'pending'|'in_progress'|'done' 검증.
// (google_auth_status / task_card_style 과 달리 값이 확장될 여지가 있어서 ENUM 승격을 유보.)
export const tasks = pgTable(
  'tasks',
  {
    id: serial('id').primaryKey(),

    // 태스크 소유자.
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),

    // 기본 텍스트 정보.
    title: text('title').notNull(),
    notes: text('notes'),
    location: text('location'),

    // 상태 문자열. DEFAULT 'pending' 으로 생성 직후 자동 pending 상태.
    status: text('status').notNull().default('pending'),

    // 마감/예정 시간. NULL 허용 → '언젠가' 태스크.
    dueAt: timestamp('due_at', { withTimezone: true }),

    // Phase 5 auto-rollover 에서 미완료 태스크를 다음 날로 넘길지 여부. users.default_rollover 와 독립.
    rolloverEnabled: boolean('rollover_enabled').notNull().default(true),

    // 리스트 정렬용 정수. drag-and-drop 시 재계산. 같은 user/같은 day 내에서 유효.
    position: integer('position').notNull(),

    // ---- Google Calendar 동기화 메타 (v1 은 read-only 이므로 null 로 시작) ----
    // v1.5 에서 '쓰기 토글' 활성 시 events.insert 응답 ID 를 저장. 토글 OFF 사용자는 영구 null.
    googleEventId: text('google_event_id'),
    // 마지막 성공 sync 시각. NULL 이면 미동기화 상태 → 재시도 대상.
    googleSyncedAt: timestamp('google_synced_at', { withTimezone: true }),

    // ---- 메타 ----
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Drizzle ORM 쿼리(`db.update(tasks)`) 사용 시 자동으로 현재 시각을 주입한다.
    // 원시 SQL 로 UPDATE 실행 시에는 별도 트리거가 필요하지만 v1 에서는 ORM 경유만 허용.
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    // 완료 처리 시점. status 가 'done' 으로 전이될 때 앱 레이어에서 세팅.
    doneAt: timestamp('done_at', { withTimezone: true }),
  },
  table => [
    // 특정 사용자의 특정 날짜 범위 조회(캘린더/리스트 뷰 로딩) 가속. 설계 §8-2.
    index('idx_tasks_user_due').on(table.userId, table.dueAt),
    // Phase 5 rollover cron 이 스캔할 대상만 남기는 부분 인덱스. WHERE 조건이 중요.
    // 이 인덱스가 없으면 매일 전체 tasks 테이블 풀스캔 발생.
    index('idx_tasks_rollover')
      .on(table.userId, table.status, table.rolloverEnabled, table.dueAt)
      .where(
        sql`${table.status} != 'done' AND ${table.rolloverEnabled} = true`
      ),
  ]
)

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  user: one(users, {
    fields: [tasks.userId],
    references: [users.id],
  }),
  // 태스크에 달린 라벨 목록 (many-to-many junction).
  taskLabels: many(taskLabels),
  // 이월 기록. 중복 이월 방지용.
  rolloverLogs: many(rolloverLogs),
}))

export type Task = typeof tasks.$inferSelect
export type NewTask = typeof tasks.$inferInsert

// 앱 레이어 Zod 검증에서 공유할 수 있도록 상태 상수를 함께 export.
// (이 값 목록이 곧 status TEXT 컬럼의 허용 집합 — 설계 §8-2 주석 근거.)
export const TASK_STATUSES = ['pending', 'in_progress', 'done'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]
