'use server'

import { and, eq, inArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { db } from '@/db'
import { labels, taskLabels, tasks, type Label, type Task } from '@/db/schema'
import { requireUserId } from '@/lib/session'
import {
  setTaskLabelsInputSchema,
  type SetTaskLabelsInput,
} from '@/lib/validators/task-labels'
import {
  listTasksInputSchema,
  taskIdSchema,
  type ListTasksInput,
} from '@/lib/validators/tasks'

// ============================================================================
// task_labels junction Server Actions (Phase 2 - D3)
// ============================================================================
// - 태스크-라벨 다대다 연결을 다루는 유일한 진입점.
// - 동시성 모델:
//     * setTaskLabels 는 "통째로 교체" 패턴 (DELETE 전부 → INSERT 전부) 을 하나의
//       트랜잭션에 담아 중간 상태 노출이 절대 없도록 한다.
//     * add/remove 같은 부분 API 는 의도적으로 제공하지 않는다 — 같은 task 에 동시에
//       상반된 요청이 오면 결과가 순서 의존적으로 갈라지기 때문 (validator 주석 참조).
// - 보안(Ownership 가드 2단):
//     1) taskId 가 현재 사용자 소유인지
//     2) 요청 labelIds 가 전부 현재 사용자 소유인지
//   하나라도 어긋나면 "찾을 수 없음" 단일 에러로 묶어 enumeration 공격 차단
//   (Critical Test Gap #1 회귀 방지 - D2 / D1 동일 기조).
// - 읽기 경로(listTasksWithLabels) 는 반드시 Drizzle relational query 로 로드해
//   N+1 을 구조적으로 차단. 클라이언트가 task 당 별도 쿼리를 날릴 수 없도록 이 한
//   진입점만 export 한다. (완료 기준: Drizzle 쿼리에 N+1 없음 - 단일 JOIN.)
// ============================================================================

/** 태스크를 라벨과 함께 반환하는 뷰 모델. UI(Task Card / List / Calendar) 가 직접 소비. */
export type TaskWithLabels = Task & { labels: Label[] }

/**
 * 태스크-라벨 mutation 후 일괄 revalidate 대상. tasks.ts 와 동일한 스코프를 공유한다.
 * 라벨 변경도 결국 태스크 카드의 시각 표현(칩) 을 갱신하는 사건이라서.
 */
const TASK_CONSUMER_PATHS = ['/today', '/list', '/calendar'] as const

function revalidateTaskConsumers() {
  for (const path of TASK_CONSUMER_PATHS) {
    revalidatePath(path)
  }
}

/**
 * 주어진 태스크의 라벨 연결을 통째로 교체한다 (원자 연산).
 * - 트랜잭션 안에서 `DELETE FROM task_labels WHERE task_id=?` 후
 *   `INSERT INTO task_labels (task_id, label_id) VALUES ...` 수행.
 * - 요청 labelIds 가 빈 배열이면 "이 태스크의 모든 라벨 연결 해제" 의미 — DELETE 만 수행.
 * - ownership 가드 2단계 (task / labels) 가 전부 같은 트랜잭션 안에서 검증되므로,
 *   검증 직후 다른 세션이 라벨을 삭제하는 race 가 있어도 transaction 안에서 FK 제약이
 *   막아준다 (labels.id 에 ON DELETE CASCADE 가 걸려있어 junction 고아 row 도 남지 않음).
 *
 * @param rawTaskId 라벨을 연결할 태스크 ID (number|string, zod coerce)
 * @param rawInput 연결할 labelIds 배열 (빈 배열 허용)
 * @returns 연결된 라벨 전체 객체 배열 (UI 가 즉시 칩 렌더에 쓸 수 있도록)
 *
 * @throws ZodError 입력 검증 실패 (labelIds 개수 초과, 잘못된 id 타입 등)
 * @throws UnauthenticatedError 세션 없음
 * @throws Error '태스크를 찾을 수 없습니다: id=...' ownership 실패
 * @throws Error '라벨을 찾을 수 없습니다: id=...' 타 사용자 라벨이 섞여 있거나 존재하지 않음
 */
export async function setTaskLabels(
  rawTaskId: number | string,
  rawInput: SetTaskLabelsInput
): Promise<Label[]> {
  const userId = await requireUserId()
  const taskId = taskIdSchema.parse(rawTaskId)
  const { labelIds } = setTaskLabelsInputSchema.parse(rawInput)

  const linkedLabels = await db.transaction(async tx => {
    // 1) 태스크 ownership 가드. select 로 id 만 끌어와도 충분 — 존재 확인이 목적.
    //    .limit(1) 로 최악의 케이스(중복 행 스캔) 를 방어.
    const [ownedTask] = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
      .limit(1)

    if (!ownedTask) {
      // 타 사용자 소유거나 이미 삭제된 케이스를 동일한 메시지로 묶는다 (enumeration 방어).
      throw new Error(`태스크를 찾을 수 없습니다: id=${taskId}`)
    }

    // 2) 라벨 ownership 가드 — 빈 배열이면 건너뛴다.
    //    IN 절 단일 쿼리로 한 번에 검증해 왕복을 줄인다.
    let ownedLabels: Label[] = []
    if (labelIds.length > 0) {
      ownedLabels = await tx
        .select()
        .from(labels)
        .where(and(eq(labels.userId, userId), inArray(labels.id, labelIds)))

      if (ownedLabels.length !== labelIds.length) {
        // 요청 id 중 현재 사용자가 소유하지 않은(또는 존재하지 않는) id 만 뽑아 메시지 구성.
        // 어떤 id 가 실패했는지는 본인 세션 범위 안의 정보라 노출해도 안전.
        const ownedIdSet = new Set(ownedLabels.map(label => label.id))
        const missingIds = labelIds.filter(id => !ownedIdSet.has(id))
        throw new Error(`라벨을 찾을 수 없습니다: id=${missingIds.join(', ')}`)
      }
    }

    // 3) 기존 junction row 를 모두 제거. 대상이 해당 태스크에 한정되므로 전체 스캔 아님
    //    (task_labels 의 task_id 가 복합 PK 의 선행 컬럼이라 인덱스 스캔).
    await tx.delete(taskLabels).where(eq(taskLabels.taskId, taskId))

    // 4) 새 junction row 를 한 번의 bulk insert 로 생성.
    //    labelIds 가 빈 배열인 경우는 위 DELETE 만으로 "모든 연결 해제" 의도를 달성.
    if (labelIds.length > 0) {
      await tx
        .insert(taskLabels)
        .values(labelIds.map(labelId => ({ taskId, labelId })))
    }

    return ownedLabels
  })

  // 라벨 연결 변경은 태스크 카드 시각에 영향을 주므로 소비 라우트를 모두 갱신.
  revalidateTaskConsumers()

  // Zod 가 정규화한 labelIds 순서대로 반환 정렬 — UI 가 입력 순서를 신뢰할 수 있도록.
  const labelsById = new Map(linkedLabels.map(label => [label.id, label]))
  return labelIds
    .map(id => labelsById.get(id))
    .filter((label): label is Label => label !== undefined)
}

/**
 * 현재 사용자의 태스크 목록을 라벨과 함께 반환한다 (N+1 없음).
 * - Drizzle relational query 를 사용해 `tasks → task_labels → labels` 를 한 번에 JOIN.
 * - `with: { taskLabels: { with: { label: true } } }` 가 내부적으로 단일 쿼리 세트로
 *   풀리므로, 태스크가 100 개여도 SQL 1회 + junction 펼침 1회 가 전부.
 * - 반환 시 junction 은 감추고 `{ ...task, labels: Label[] }` 로 평탄화 — UI 가
 *   `task.labels.map(...)` 로 바로 칩을 그릴 수 있도록.
 * - 정렬: tasks.position ASC → id ASC (tasks.ts `listTasks` 와 동일 규칙).
 * - 필터: listTasks 와 동일한 Zod 스키마(`listTasksInputSchema`) 재사용으로 UI 가
 *   두 API 사이에 필터 모양을 바꿀 필요 없이 동일한 payload 를 쓴다.
 *
 * @param rawInput 선택 필터 (status / dueFrom / dueTo). 없으면 전체 조회.
 * @returns 각 태스크와 그 라벨 배열. 라벨 없는 태스크는 `labels: []` 로 반환.
 *
 * @throws UnauthenticatedError 세션 없음
 * @throws ZodError 필터 입력 검증 실패
 */
export async function listTasksWithLabels(
  rawInput?: ListTasksInput
): Promise<TaskWithLabels[]> {
  const userId = await requireUserId()
  const input = listTasksInputSchema.parse(rawInput)

  // Drizzle relational API 는 스키마 배럴(`drizzle(client, { schema })`) 등록을
  // 전제로 동작한다. src/db/index.ts 가 이미 등록했으므로 여기서는 바로 사용 가능.
  const rows = await db.query.tasks.findMany({
    where: (table, { and: andOp, eq: eqOp, gte: gteOp, lte: lteOp }) => {
      const conditions = [eqOp(table.userId, userId)]
      if (input?.status !== undefined) {
        conditions.push(eqOp(table.status, input.status))
      }
      if (input?.dueFrom != null) {
        conditions.push(gteOp(table.dueAt, input.dueFrom))
      }
      if (input?.dueTo != null) {
        conditions.push(lteOp(table.dueAt, input.dueTo))
      }
      return andOp(...conditions)
    },
    orderBy: (table, { asc: ascOp }) => [
      ascOp(table.position),
      ascOp(table.id),
    ],
    with: {
      // junction 을 거쳐 label 실체까지 한 번에 eager load.
      // 여기서 with 를 생략하거나 별도 쿼리로 쪼개면 즉시 N+1 이 발생한다.
      taskLabels: {
        with: {
          label: true,
        },
      },
    },
  })

  // 클라이언트가 볼 필요 없는 junction 구조를 감추고 labels 배열만 노출.
  return rows.map(({ taskLabels: junction, ...task }) => ({
    ...task,
    labels: junction.map(joined => joined.label),
  }))
}
