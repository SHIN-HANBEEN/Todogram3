import { and, asc, eq } from 'drizzle-orm'

import { db } from '@/db'
import { labels, taskLabels, tasks } from '@/db/schema'
import { requireUserId } from '@/lib/session'
import {
  hexToLabelColor,
  type LabelId,
} from '@/components/todogram/labels'
import { TaskListView, type TaskListItem, type TaskListLabel } from '@/components/task-list/task-list-view'

// ============================================================================
// /list 서버 페이지 — Phase 4 U2
// ============================================================================
// - 역할: List View 의 서버 조립자. 다음을 수행한다.
//     1) `requireUserId()` 로 세션 확인 (middleware 가 이미 수행한 것을 재확인하진 않음 —
//        `src/middleware.ts` 가 (app) 라우트 그룹을 일괄 가드하지만 userId 는 여기서 읽어야 함).
//     2) 현재 사용자 tasks 전량 조회 (position ASC → id ASC, calendar 페이지와 동일 정렬).
//     3) 해당 tasks 의 task_labels + labels 를 한 쿼리에 조인해 labelId 배열 + 라벨 메타 맵 구성.
//     4) 각 라벨의 hex color 를 LabelChipColor slug 로 변환해 클라이언트에 전달
//        (UI 는 토큰 기반 slug 로만 렌더하므로 이 매핑이 없으면 라벨이 전부 회색으로 떨어짐).
//     5) TaskListItem / TaskListLabel 로 정규화해 TaskListView 에 주입.
//
// - v1 정책: calendar 페이지와 달리 이 페이지는 외부 Google 이벤트를 섞지 않는다.
//   List View 는 tasks 테이블의 "태스크 리스트" 만 다루는 영역이며, calendar reserved
//   label 은 필터 rail 에서도 의도적으로 제외된다 (approved.json list-view-20260419).
//
// - 페이지네이션 없음: v1 전제 (≤300 태스크). 이 크기라면 SSR 한 번에 다 보내는 것이
//   메모리/네트워크 모두 싸고 클라이언트 검색/필터링도 즉시 체감(Quiet Layer 원칙).
//   v1.5 에서 수가 커지면 서버 페이지네이션 + searchTasks 로 이행 예정.
//
// - 캐시 무효화는 mutation 쪽(actions/tasks.ts) 이 revalidatePath('/list') 를 호출 →
//   이 페이지가 자연스럽게 다시 실행된다.
// ============================================================================

export default async function ListPage() {
  const userId = await requireUserId()

  /* --- 1) 사용자 tasks 전량 조회 --- */
  const userTasks = await db
    .select()
    .from(tasks)
    .where(eq(tasks.userId, userId))
    .orderBy(asc(tasks.position), asc(tasks.id))

  /* --- 2) labels + task_labels 조인 한 번에 --- */
  /* labels 는 tasks 와 독립적으로 전량 필요 (filter rail 이 빈 라벨도 노출해야 하는지는
   * v1 에서는 "사용자가 만든 라벨 전부 노출" 로 결정 — approved.json). */
  const userLabelRows = await db
    .select()
    .from(labels)
    .where(eq(labels.userId, userId))
    .orderBy(asc(labels.position), asc(labels.id))

  /* task_labels junction — 해당 사용자의 tasks 에 연결된 label 연결만 조회.
   * ownership 이중 가드: tasks.userId + labels.userId 둘 다 eq(userId) 로 걸어 labels 의
   * 다른 사용자 유출을 원천 차단. */
  const taskLabelRows =
    userTasks.length === 0
      ? []
      : await db
          .select({
            taskId: taskLabels.taskId,
            labelId: taskLabels.labelId,
          })
          .from(taskLabels)
          .innerJoin(labels, eq(taskLabels.labelId, labels.id))
          .innerJoin(tasks, eq(taskLabels.taskId, tasks.id))
          .where(
            and(eq(labels.userId, userId), eq(tasks.userId, userId)),
          )

  /* --- 3) task id → labelIds[] 맵 구성 --- */
  const labelIdsByTaskId = new Map<number, LabelId[]>()
  for (const row of taskLabelRows) {
    const idStr = String(row.labelId)
    const arr = labelIdsByTaskId.get(row.taskId) ?? []
    arr.push(idStr)
    labelIdsByTaskId.set(row.taskId, arr)
  }

  /* --- 4) userLabels 를 TaskListLabel 로 변환 (hex → slug) --- */
  const userLabelsForView: TaskListLabel[] = userLabelRows.map(l => ({
    id: String(l.id),
    name: l.name,
    color: hexToLabelColor(l.color),
  }))

  /* --- 5) TaskListItem 배열 정규화 --- */
  const initialTasks: TaskListItem[] = userTasks.map(task => ({
    task,
    labelIds: labelIdsByTaskId.get(task.id) ?? [],
  }))

  return (
    <TaskListView
      initialTasks={initialTasks}
      userLabels={userLabelsForView}
      locale="ko"
    />
  )
}
