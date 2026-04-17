// 스키마 배럴 파일 — drizzle-kit 은 `schema: './src/db/schema'` 폴더 단위로 읽지만,
// 애플리케이션 코드에서 쓸 때는 `import { tasks, labels } from '@/db/schema'` 한 줄로 끝내는 편이 편하다.
// 추가로 Phase 0-F2 에서 만들 `src/db/index.ts` 의 drizzle 클라이언트가 relational query 를 위해
// 이 배럴 전체(`import * as schema from './schema'`) 를 한번에 등록할 때도 사용.

export * from './users'
export * from './labels'
export * from './tasks'
export * from './task-labels'
export * from './rollover-logs'
