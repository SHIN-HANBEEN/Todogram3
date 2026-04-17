import {
  boolean,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { labels } from './labels'
import { tasks } from './tasks'

// Google OAuth 토큰 상태. NextAuth refresh 실패(401 invalid_grant) 감지 시 'revoked' 로 전이되어
// 재로그인 안내 UI 를 띄우도록 한다. 'expired' 는 Google 측에서 장기 미사용으로 만료된 경우.
// Phase 3 - G4 에서 실제 전이 로직을 구현.
export const googleAuthStatusEnum = pgEnum('google_auth_status', [
  'active',
  'revoked',
  'expired',
])

// TaskCard 뷰 밀도 선택지. Phase 4 - U6 / U7 에서 사용. default = 'comfortable'
// (Soft Card 변형이 일반 사용자에게 권장되는 차분한 분위기).
export const taskCardStyleEnum = pgEnum('task_card_style', [
  'compact',
  'comfortable',
])

// 사용자 테이블 — Phase 1 Auth 에서 NextAuth Google Provider 가 최초 로그인 시 upsert.
// 설계 §8-2 DDL 기반 + F1 명세에 따른 3개 필드(timezone, google_auth_status, task_card_style) 추가.
export const users = pgTable('users', {
  // 기존 v1 auth 호환 위해 SERIAL 유지.
  id: serial('id').primaryKey(),

  // Google 로그인에서 받은 프로필 정보.
  email: text('email').unique().notNull(),
  username: text('username').notNull(),

  // ---- Google OAuth ----
  // 암호화된 refresh token (AES-256-GCM). Phase 1 - A2 에서 src/lib/crypto.ts 로 encrypt/decrypt.
  // nullable 인 이유: 최초 로그인 직후 콜백에서 세팅 전 순간이 있기 때문.
  googleRefreshToken: text('google_refresh_token'),
  // 'primary' 또는 Todogram 전용 서브캘린더 ID. v1 read-only 에서는 'primary' 고정.
  googleCalendarId: text('google_calendar_id'),
  // Google 측 인증 상태 — 401/invalid_grant 감지 시 'revoked' 로 업데이트되어 UI 가 재로그인을 유도.
  googleAuthStatus: googleAuthStatusEnum('google_auth_status')
    .notNull()
    .default('active'),

  // ---- 사용자 설정 ----
  // 새 태스크의 기본 rollover 토글. 태스크별로도 개별 설정 가능(tasks.rollover_enabled).
  defaultRollover: boolean('default_rollover').notNull().default(true),
  // Phase 5 rollover cron 에서 "오늘 00:00"을 사용자 시간대로 계산할 때 사용. §8-4.
  // Intl TZ 식별자(`Asia/Seoul`, `America/Los_Angeles` ...) 를 저장한다.
  timezone: text('timezone').notNull().default('Asia/Seoul'),
  // TaskCard 렌더링 밀도. Phase 4 - U7 Settings > 뷰 밀도 토글에서 변경.
  taskCardStyle: taskCardStyleEnum('task_card_style')
    .notNull()
    .default('comfortable'),

  // ---- 메타 ----
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

// Drizzle relational query API(`.query.users.findMany({ with: { labels: true } })`) 를 쓰기 위한 관계 선언.
// Phase 2 - D3 에서 N+1 방지용 관계 쿼리가 필요하다.
export const usersRelations = relations(users, ({ many }) => ({
  labels: many(labels),
  tasks: many(tasks),
}))

// 애플리케이션 코드에서 쓸 인서트/셀렉트 추론 타입.
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
