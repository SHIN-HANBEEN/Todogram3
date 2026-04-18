'use server'

import { and, asc, eq, gte, lte, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { db } from '@/db'
import { tasks, type Task } from '@/db/schema'
import { requireUserId } from '@/lib/session'
import {
  createTaskInputSchema,
  listTasksInputSchema,
  taskIdSchema,
  toggleTaskStatusInputSchema,
  updateTaskInputSchema,
  type CreateTaskInput,
  type ListTasksInput,
  type ToggleTaskStatusInput,
  type UpdateTaskInput,
} from '@/lib/validators/tasks'

// ============================================================================
// Tasks Server Actions (Phase 2 - D2)
// ============================================================================
// - CRUD 5종 (`createTask` / `updateTask` / `toggleTaskStatus` / `deleteTask` / `listTasks`).
// - 모든 쿼리는 반드시 `WHERE user_id = session.user.id` ownership 가드를 동반한다.
//   가드가 빠지면 A 사용자가 B 사용자의 task id 로 요청을 보내 임의로 수정·삭제가 가능해진다.
//   (Critical Test Gap #1 — 완료 기준에 명시된 필수 보안 속성.)
// - 입력 검증: `src/lib/validators/tasks.ts` 의 Zod 스키마를 100% 경유.
// - 자동 채번: 새 task 의 `position` 은 (현재 사용자 task 중 max + 1) 로 트랜잭션 안에서 계산.
//   같은 사용자가 동시에 두 task 를 만드는 경합은 v1 dogfooding(1인 사용자) 환경에서 희박하지만,
//   트랜잭션 안에 read+insert 를 묶어두면 다중 기기에서 동시 생성하는 경우도 안전.
// - 상태 전이 규칙: status 가 'done' 으로 바뀔 때 `doneAt = now`, 다른 값으로 바뀔 때 `doneAt = null`.
//   createTask / updateTask / toggleTaskStatus 가 모두 동일한 헬퍼(`resolveDoneAt`) 를 거쳐
//   일관성을 보장.
// - 캐시 무효화: 태스크를 소비하는 모든 라우트(`/today`, `/list`, `/calendar`) 에 대해
//   mutation 후 revalidatePath. Phase 4 에서 미생성 라우트가 호출돼도 Next.js 가 조용히 무시.
// - D3 범위(task_labels junction 연결) 는 이 파일이 아니라 `src/actions/task-labels.ts` 에서
//   별도 트랜잭션으로 처리 — 여기서는 tasks 테이블 행 자체만 다룬다.
// ============================================================================

/**
 * 태스크를 소비하는 페이지 경로 모음. mutation 직후 일괄 revalidate 한다.
 * 새 라우트가 추가되면 이 배열만 확장하면 된다 — 호출 지점은 손대지 않는다.
 */
const TASK_CONSUMER_PATHS = ['/today', '/list', '/calendar'] as const

function revalidateTaskConsumers() {
  for (const path of TASK_CONSUMER_PATHS) {
    revalidatePath(path)
  }
}

/**
 * status 변경에 맞춰 doneAt 이 가져야 할 값을 계산한다.
 * - 'done' 으로 전이 → 현재 시각 스탬프 (완료 처리 UI 가 이 값으로 "오후 3시에 완료" 같은
 *   표시를 해야 하므로 null 이 아닌 실제 타임스탬프가 필요).
 * - 'pending' / 'in_progress' 로 전이 → null (완료 이력 제거).
 * - undefined (status 미변경) → undefined 반환 → 호출자가 SET 절에서 doneAt 자체를 제외하도록.
 */
function resolveDoneAt(
  nextStatus: Task['status'] | undefined
): Date | null | undefined {
  if (nextStatus === undefined) return undefined
  return nextStatus === 'done' ? new Date() : null
}

/**
 * 현재 사용자의 태스크를 조회. 필터가 주어지면 동일 ownership 가드 위에 AND 로 붙는다.
 * 정렬은 position ASC → id ASC 로 고정 — 드래그 재정렬이 도입되기 전까지 생성 순서를 보존한다.
 */
export async function listTasks(rawInput?: ListTasksInput): Promise<Task[]> {
  const userId = await requireUserId()
  const input = listTasksInputSchema.parse(rawInput)

  // ownership 가드는 항상 첫 번째 조건으로 고정 — 어떤 추가 필터가 와도 이 가드가 빠지지 않도록.
  const conditions = [eq(tasks.userId, userId)]

  if (input?.status !== undefined) {
    conditions.push(eq(tasks.status, input.status))
  }
  if (input?.dueFrom != null) {
    conditions.push(gte(tasks.dueAt, input.dueFrom))
  }
  if (input?.dueTo != null) {
    conditions.push(lte(tasks.dueAt, input.dueTo))
  }

  return db
    .select()
    .from(tasks)
    .where(and(...conditions))
    .orderBy(asc(tasks.position), asc(tasks.id))
}

/**
 * 태스크 생성. position 은 자동으로 (현재 사용자 태스크 중 max + 1) 로 채워진다.
 * status 가 'done' 으로 생성되는 경우 doneAt 도 같은 순간의 타임스탬프로 함께 기록.
 *
 * @throws ZodError — 입력 검증 실패
 * @throws UnauthenticatedError — 세션 없음
 */
export async function createTask(rawInput: CreateTaskInput): Promise<Task> {
  const userId = await requireUserId()
  const input = createTaskInputSchema.parse(rawInput)

  return db.transaction(async tx => {
    // 같은 사용자 한정으로 현재 최대 position 을 읽는다. 다른 사용자 데이터는 절대 보지 않는다.
    const [maxRow] = await tx
      .select({ max: sql<number | null>`max(${tasks.position})` })
      .from(tasks)
      .where(eq(tasks.userId, userId))

    const nextPosition = (maxRow?.max ?? 0) + 1

    const doneAt = input.status === 'done' ? new Date() : null

    const [created] = await tx
      .insert(tasks)
      .values({
        userId,
        title: input.title,
        notes: input.notes,
        location: input.location,
        status: input.status,
        dueAt: input.dueAt,
        rolloverEnabled: input.rolloverEnabled,
        position: nextPosition,
        doneAt,
      })
      .returning()

    // .returning() 은 RETURNING * 결과 배열을 돌려준다. 단건 insert 라 [0] 이 항상 존재.
    // 그래도 방어적으로 체크 — undefined 면 드라이버·Drizzle 동작이 변경된 셈이므로 즉시 실패.
    if (!created) {
      throw new Error('태스크 생성에 실패했습니다.')
    }

    revalidateTaskConsumers()
    return created
  })
}

/**
 * 태스크 수정. ownership 가드(`user_id = session.user.id`) 가 일치하는 row 만 갱신.
 * - 일치 row 가 없으면(=다른 사용자 태스크이거나 이미 삭제) Error throw → UI 는 404/403 처리.
 * - 부분 수정 허용. 호출자가 보낸 필드만 SET 절에 포함해 의도하지 않은 컬럼 덮어쓰기 차단.
 * - status 가 바뀌면 doneAt 이 같은 업데이트 안에서 함께 갱신되어야 완료 이력의 정합이 유지된다.
 *
 * @param taskId 수정 대상 태스크 ID. number 또는 string 모두 허용 (zod coerce).
 * @param rawInput 부분 수정 입력. 최소 1개 필드 필요.
 */
export async function updateTask(
  taskId: number | string,
  rawInput: UpdateTaskInput
): Promise<Task> {
  const userId = await requireUserId()
  const id = taskIdSchema.parse(taskId)
  const input = updateTaskInputSchema.parse(rawInput)

  // SET 절은 사용자가 명시적으로 보낸 필드로만 구성한다.
  // (undefined 는 Drizzle 이 무시하지만, 명시 분기가 의도가 더 분명해 가독성에 유리.)
  const updateValues: Partial<typeof tasks.$inferInsert> = {}
  if (input.title !== undefined) updateValues.title = input.title
  if (input.notes !== undefined) updateValues.notes = input.notes
  if (input.location !== undefined) updateValues.location = input.location
  if (input.status !== undefined) {
    updateValues.status = input.status
    // 같은 update 안에서 status 와 doneAt 을 함께 바꿔야 중간 상태(= status=done 인데 doneAt=null) 가 생기지 않는다.
    updateValues.doneAt = resolveDoneAt(input.status)
  }
  if (input.dueAt !== undefined) updateValues.dueAt = input.dueAt
  if (input.rolloverEnabled !== undefined) {
    updateValues.rolloverEnabled = input.rolloverEnabled
  }

  const updated = await db
    .update(tasks)
    .set(updateValues)
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
    .returning()

  if (updated.length === 0) {
    // ownership 가드가 모든 미일치 케이스(존재하지 않거나 / 타 사용자 소유) 를 동일한
    // "찾을 수 없음" 으로 묶는다. 리소스 존재 여부를 노출하지 않아 enumeration 공격 차단.
    throw new Error(`태스크를 찾을 수 없습니다: id=${id}`)
  }

  revalidateTaskConsumers()
  return updated[0]
}

/**
 * 태스크 상태를 명시적으로 전달받은 값으로 전이한다.
 * - 체크박스 토글처럼 UI 가 다음 상태를 계산해 보내는 경우의 전용 진입점.
 * - 내부적으로는 updateTask 의 status 변경 경로와 동일 규칙(doneAt 동기화) 를 사용한다.
 *   중복 구현을 피하려면 updateTask 를 호출하는 것도 방법이지만, 전용 action 은 UI 가
 *   Server Action 을 호출할 때 payload 가 명시적으로 `{ status }` 하나만 담겨 의도가
 *   명확해지고, 추후 로깅/이벤트 훅을 거는 지점도 좁아지는 이점이 있다.
 */
export async function toggleTaskStatus(
  taskId: number | string,
  rawInput: ToggleTaskStatusInput
): Promise<Task> {
  const userId = await requireUserId()
  const id = taskIdSchema.parse(taskId)
  const input = toggleTaskStatusInputSchema.parse(rawInput)

  const updated = await db
    .update(tasks)
    .set({
      status: input.status,
      doneAt: resolveDoneAt(input.status),
    })
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
    .returning()

  if (updated.length === 0) {
    throw new Error(`태스크를 찾을 수 없습니다: id=${id}`)
  }

  revalidateTaskConsumers()
  return updated[0]
}

/**
 * 태스크 삭제. ownership 가드 동일.
 * - task_labels junction 은 ON DELETE CASCADE 로 자동 정리(설계 §8-2).
 * - rollover_logs 는 FK 제약 없음 — 이력이므로 살려둔다 (Phase 5 R3 관심사).
 * - 미일치 시 동일하게 "찾을 수 없음" Error.
 */
export async function deleteTask(taskId: number | string): Promise<void> {
  const userId = await requireUserId()
  const id = taskIdSchema.parse(taskId)

  const deleted = await db
    .delete(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
    .returning({ id: tasks.id })

  if (deleted.length === 0) {
    throw new Error(`태스크를 찾을 수 없습니다: id=${id}`)
  }

  revalidateTaskConsumers()
}
