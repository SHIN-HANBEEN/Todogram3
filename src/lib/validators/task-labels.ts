import { z } from 'zod'

import { labelIdSchema } from './labels'

// ============================================================================
// 태스크-라벨 junction 입력 검증 (Phase 2 - D3)
// ============================================================================
// - Server Action(`src/actions/task-labels.ts`) 의 입력 경계를 한 곳에 집중시킨다.
// - 같은 스키마를 클라이언트 폼(U3 태스크 편집 모달)에서도 재사용해 브라우저/서버
//   검증 메시지를 통일한다.
// - "한 태스크에 라벨 N 개 연결" 을 대표하는 유일한 operation 은 `setTaskLabels`
//   (원자 교체) 이다. add / remove 같은 세부 API 는 의도적으로 제공하지 않는다 —
//   UI 가 다중 선택 체크박스를 통째로 교체하는 모델을 쓰기 때문에, 부분 API 를
//   제공하면 오히려 race condition 을 만든다 (같은 task 에 동시에 add/remove 가
//   날아가면 결과가 순서 의존적으로 갈라진다).
// ============================================================================

/**
 * 한 태스크에 연결 가능한 라벨 수 상한.
 * - UI 카드 폭(모바일 포함)에서 라벨 칩이 줄바꿈 없이 들어가는 현실적 한도.
 * - junction row 폭발을 막아 rollover/검색 쿼리 성능을 선제적으로 보호.
 * - v1 dogfooding(1인 사용자) 기준 널널하게 10 개로 책정. v1.5 에서 사용 통계로 재조정.
 */
export const TASK_LABELS_MAX_COUNT = 10

/**
 * setTaskLabels 입력 스키마.
 * - taskId 는 Server Action 시그니처의 첫 인자로 분리되어 있어 여기서는 검증하지 않는다
 *   (tasks.ts 의 `taskIdSchema` 재사용).
 * - 빈 배열(`[]`) 은 "이 태스크의 모든 라벨 연결 해제" 의도로 허용한다 — UI 에서
 *   체크박스를 전부 해제하는 경우가 자연스러운 유즈케이스.
 * - 같은 labelId 가 중복으로 들어오면 transform 단계에서 중복 제거 → junction PK
 *   위반(23505) 으로 인한 트랜잭션 롤백을 사전에 차단.
 * - 각 원소는 `labelIdSchema` 를 통과해야 하므로 양의 정수 coerce 까지 일관.
 */
export const setTaskLabelsInputSchema = z.object({
  labelIds: z
    .array(labelIdSchema, {
      message: 'labelIds 는 배열이어야 합니다.',
    })
    .max(
      TASK_LABELS_MAX_COUNT,
      `한 태스크에는 ${TASK_LABELS_MAX_COUNT}개 이하의 라벨만 연결할 수 있습니다.`
    )
    // 중복 제거는 원본 순서를 보존한다 — UI 정렬이나 칩 렌더 순서가 어긋나지 않도록.
    .transform(ids => Array.from(new Set(ids))),
})

export type SetTaskLabelsInput = z.infer<typeof setTaskLabelsInputSchema>
