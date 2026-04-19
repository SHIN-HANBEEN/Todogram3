'use server'

import { and, asc, eq, gte, inArray, lte, or, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { db } from '@/db'
import { labels, taskLabels, tasks, type Label, type Task } from '@/db/schema'
import { requireUserId } from '@/lib/session'
import {
  createTaskInputSchema,
  listTasksInputSchema,
  searchTasksInputSchema,
  taskIdSchema,
  toggleTaskStatusInputSchema,
  updateTaskInputSchema,
  updateTaskPositionInputSchema,
  type CreateTaskInput,
  type ListTasksInput,
  type SearchTasksInput,
  type ToggleTaskStatusInput,
  type UpdateTaskInput,
  type UpdateTaskPositionInput,
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

// ============================================================================
// Phase 4 U2 (List View / Status Sections) 전용 Server Actions
// ----------------------------------------------------------------------------
// - `updateTaskPosition` : 드래그 재정렬 및 섹션 간(=상태 전이) 드래그를 하나의
//   원자 연산으로 처리한다. 같은 섹션 내부 재정렬은 tasks.position 만 재계산하고,
//   섹션 간 이동은 status + doneAt 까지 같은 트랜잭션 안에서 동시 갱신.
// - `searchTasks`         : title/notes ILIKE 검색. v1 단순 — FTS 인덱스는 v1.5 이후.
//   approved.json 의 search_behavior(섹션 구조 유지) 는 UI 레이어 책임이라 여기에
//   관여하지 않는다. 서버는 라벨 필터 + 검색어를 AND 로 적용한 원 목록만 반환.
// ----------------------------------------------------------------------------

/**
 * tasks.position 을 재계산한다. "대상 위치에 target task 를 놓고, 그 뒤 모든 task 는
 * position 을 1 씩 뒤로 밀어주는" 간단한 전략이다.
 *
 * 순서:
 *   1) 현재 사용자의 모든 태스크를 position ASC 로 읽는다 (트랜잭션 내부).
 *   2) 대상 task 를 배열에서 제거한 뒤, (1-based 기준) newPosition 인덱스에 삽입.
 *      newPosition 이 length 를 초과하면 맨 뒤에 push (out-of-range safe).
 *   3) 배열을 순회하며 index+1 을 새 position 으로 할당한다. 값이 기존과 다른 row
 *      만 UPDATE — 불필요한 쓰기를 줄여 트리거/인덱스 갱신을 최소화.
 *
 * v1 에서는 total task 수가 ≤ 300 개 (approved.json open_questions_v1_resolve #4) 로
 * 가정하므로 전역 재할당이 충분히 빠르다. v1.5 에서 수가 커지면 sparse position
 * (rank between) 전략으로 확장 고려.
 */
async function reassignPositions(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: number,
  targetTaskId: number,
  newPosition: number,
): Promise<void> {
  // 같은 사용자 범위만 본다. ownership 가드 대체가 아니라, 정렬 대상 스코프 한정.
  const ordered = await tx
    .select({ id: tasks.id, position: tasks.position })
    .from(tasks)
    .where(eq(tasks.userId, userId))
    .orderBy(asc(tasks.position), asc(tasks.id))

  const targetIndex = ordered.findIndex(row => row.id === targetTaskId)
  if (targetIndex === -1) {
    // 이 함수는 ownership 가드를 통과한 뒤에만 호출되므로 이 분기는 사실상 도달 불가.
    // 그래도 방어적으로 명시적 실패 — 조용한 no-op 보다 낫다.
    throw new Error(`태스크를 찾을 수 없습니다: id=${targetTaskId}`)
  }

  // 2) target 을 빼내고 (1-based) newPosition 자리에 끼워넣는다.
  const [target] = ordered.splice(targetIndex, 1)
  if (!target) throw new Error(`태스크를 찾을 수 없습니다: id=${targetTaskId}`)

  // newPosition 은 1-based. 배열 인덱스 기준 clamp: 0 ~ ordered.length.
  const insertIndex = Math.max(0, Math.min(newPosition - 1, ordered.length))
  ordered.splice(insertIndex, 0, target)

  // 3) 달라진 row 만 UPDATE — Promise.all 로 병렬 실행해 왕복 감소.
  const updates: Promise<unknown>[] = []
  for (let i = 0; i < ordered.length; i += 1) {
    const row = ordered[i]
    if (!row) continue
    const nextPos = i + 1
    if (row.position !== nextPos) {
      updates.push(
        tx
          .update(tasks)
          .set({ position: nextPos })
          .where(and(eq(tasks.id, row.id), eq(tasks.userId, userId))),
      )
    }
  }
  await Promise.all(updates)
}

/**
 * 태스크의 position 을 재조정한다. 섹션 간 이동 시 status 도 함께 바뀐다.
 *
 * 동시성:
 *   - 전부 하나의 트랜잭션 안에서 수행. status 갱신과 position 재할당 사이에 다른
 *     세션이 끼어들어 순서가 꼬이는 상황을 막는다.
 *   - position 재할당은 `reassignPositions` 가 전역 재정렬을 수행하므로 드래그가
 *     연달아 오더라도 최종 상태가 수렴한다 (뒤에 온 요청이 승자).
 *
 * 상태 전이:
 *   - newStatus 가 주어지면 `resolveDoneAt` 규칙을 동일 적용 → done 이면 타임스탬프,
 *     그 외면 null. updateTask 와 같은 헬퍼를 거쳐 완료 이력의 정합 유지.
 *
 * @throws ZodError 입력 검증 실패
 * @throws UnauthenticatedError 세션 없음
 * @throws Error '태스크를 찾을 수 없습니다: id=...' ownership 실패
 */
export async function updateTaskPosition(
  rawTaskId: number | string,
  rawInput: UpdateTaskPositionInput,
): Promise<Task> {
  const userId = await requireUserId()
  const id = taskIdSchema.parse(rawTaskId)
  const input = updateTaskPositionInputSchema.parse(rawInput)

  const updated = await db.transaction(async tx => {
    // 1) ownership 가드 — 없는 id 거나 타 사용자 소유면 즉시 차단.
    const [owned] = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
      .limit(1)

    if (!owned) {
      throw new Error(`태스크를 찾을 수 없습니다: id=${id}`)
    }

    // 2) 섹션 간 이동이면 status + doneAt 부터 먼저 갱신.
    //    position 재할당 이전에 하는 이유: reassignPositions 가 다시 SELECT 해도
    //    최신 row 를 보도록(+ 이 트랜잭션 외부에서 status 만 읽는 판독자가 위험한
    //    중간 상태를 보지 않도록).
    if (input.newStatus !== undefined) {
      await tx
        .update(tasks)
        .set({
          status: input.newStatus,
          doneAt: resolveDoneAt(input.newStatus),
        })
        .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
    }

    // 3) position 재할당.
    await reassignPositions(tx, userId, id, input.newPosition)

    // 4) 최종 row 반환 — UI 낙관적 업데이트 검증용.
    const [finalRow] = await tx
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
      .limit(1)

    if (!finalRow) {
      // reassignPositions 후에도 못 찾는 케이스는 실제로 불가능하지만, undefined 는 타입 안전
      // 을 위해 명시적 실패 처리.
      throw new Error(`태스크를 찾을 수 없습니다: id=${id}`)
    }

    return finalRow
  })

  revalidateTaskConsumers()
  return updated
}

/**
 * ILIKE 특수문자 이스케이프 — `%`, `_`, `\` 를 문자 그대로 매칭하도록 변환.
 * 이 처리를 빼먹으면 사용자가 `100%` 같은 검색어를 넣었을 때 의도와 다르게 모든 row
 * 가 매칭된다.
 */
function escapeIlikePattern(raw: string): string {
  return raw.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

/** 검색 결과 뷰 모델 — 각 태스크에 연결된 라벨 배열 동반. */
export type TaskSearchResult = Task & { labels: Label[] }

/**
 * 태스크 title + notes 에 대해 ILIKE 검색을 수행한다 (v1 단순 검색).
 *
 * - 검색어가 비어 있으면 `listTasksWithLabels` 를 그대로 대체하는 경로로 동작한다
 *   (사용자 전체 태스크 반환 + 라벨 병합). UI 가 '검색어 없음' 과 '전체 목록' 을
 *   동일한 호출 지점에서 처리할 수 있어 분기가 단순해진다.
 * - labelId 가 주어지면 해당 라벨이 부착된 태스크만 반환. 라벨 연결은 task_labels
 *   junction 으로 조회하므로 ownership 가드는 labels.userId 에도 걸어둔다.
 * - N+1 회피: 최종 결과의 labels 는 `inArray` 로 한 번에 조회해 태스크별로 병합.
 *
 * @throws ZodError 입력 검증 실패
 * @throws UnauthenticatedError 세션 없음
 */
export async function searchTasks(
  rawInput: SearchTasksInput,
): Promise<TaskSearchResult[]> {
  const userId = await requireUserId()
  const input = searchTasksInputSchema.parse(rawInput)

  // 1) 우선 필터 조건을 구성. ownership 가드는 언제나 최우선.
  const conditions = [eq(tasks.userId, userId)]

  // 2) 검색어 조건 — ILIKE title OR ILIKE notes. 한 번의 OR 로 묶는다.
  if (input.query) {
    const pattern = `%${escapeIlikePattern(input.query)}%`
    // Drizzle 의 `sql` 템플릿으로 ILIKE (Postgres 전용) 을 명시. 파라미터 바인딩으로
    // SQL injection 차단.
    const matchesTitle = sql`${tasks.title} ILIKE ${pattern}`
    const matchesNotes = sql`${tasks.notes} ILIKE ${pattern}`
    const orExpr = or(matchesTitle, matchesNotes)
    if (orExpr) conditions.push(orExpr)
  }

  // 3) labelId 필터 — 주어진 라벨이 현재 사용자 소유인지 먼저 확인(ownership).
  //    그 뒤 task_labels 에서 task_id 를 뽑아 inArray 로 좁힌다.
  if (input.labelId !== undefined) {
    const [ownedLabel] = await db
      .select({ id: labels.id })
      .from(labels)
      .where(and(eq(labels.userId, userId), eq(labels.id, input.labelId)))
      .limit(1)

    if (!ownedLabel) {
      // 타 사용자 라벨 id 로 검색 시도하는 케이스까지 "결과 없음" 으로 묶는다 — 존재
      // 여부 노출 차단.
      return []
    }

    const linked = await db
      .select({ taskId: taskLabels.taskId })
      .from(taskLabels)
      .where(eq(taskLabels.labelId, input.labelId))

    if (linked.length === 0) return []

    conditions.push(
      inArray(
        tasks.id,
        linked.map(row => row.taskId),
      ),
    )
  }

  // 4) 태스크 본체 조회. 정렬 규칙은 다른 list 계열과 동일(position → id).
  const rows = await db
    .select()
    .from(tasks)
    .where(and(...conditions))
    .orderBy(asc(tasks.position), asc(tasks.id))

  if (rows.length === 0) return []

  // 5) 라벨 병합 — 한 방에 전체 taskId 의 라벨 연결을 끌어온 뒤 메모리에서 groupBy.
  const taskIds = rows.map(r => r.id)
  const joined = await db
    .select({
      taskId: taskLabels.taskId,
      label: labels,
    })
    .from(taskLabels)
    .innerJoin(labels, eq(taskLabels.labelId, labels.id))
    .where(
      and(eq(labels.userId, userId), inArray(taskLabels.taskId, taskIds)),
    )

  const byTaskId = new Map<number, Label[]>()
  for (const row of joined) {
    const list = byTaskId.get(row.taskId) ?? []
    list.push(row.label)
    byTaskId.set(row.taskId, list)
  }

  return rows.map(task => ({
    ...task,
    labels: byTaskId.get(task.id) ?? [],
  }))
}
