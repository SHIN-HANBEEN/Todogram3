import { z } from 'zod'

import { TASK_STATUSES } from '@/db/schema'

// ============================================================================
// 태스크 입력 검증 (Phase 2 - D2)
// ============================================================================
// - Server Action(`src/actions/tasks.ts`) 의 입력 경계를 한 곳에 집중시킨다.
// - 같은 스키마를 클라이언트 폼(React Hook Form + zodResolver)에서도 재사용해
//   브라우저 / 서버 검증 메시지가 자동으로 통일되도록 한다 (Phase 4 U3 태스크 편집 모달).
// - 한국어 메시지는 사용자에게 직접 노출될 수 있으므로 친절·구체적으로 작성.
// - D3 가 task_labels junction 을 붙이기 전까지 labelIds 필드는 여기에 포함하지 않는다
//   (관심사 분리 — D2 범위는 tasks 테이블 CRUD 만).
// ============================================================================

/** 제목 최대 길이. 설계 §8-2 tasks.title 에 하드 제약은 없지만 UI 카드 폭을 고려한 정책값. */
export const TASK_TITLE_MAX_LENGTH = 200

/** 메모(자유 서술) 최대 길이. 10K 문자면 보통 사용자가 손으로 쓸 수 있는 한도를 훨씬 넘는다. */
export const TASK_NOTES_MAX_LENGTH = 10000

/** 장소(단일 행 텍스트) 최대 길이. 일반 주소/장소명이 200자를 넘는 경우는 희박. */
export const TASK_LOCATION_MAX_LENGTH = 200

/**
 * 앱 레이어가 허용하는 태스크 상태 집합.
 * DB 컬럼(`status text not null default 'pending'`) 에 저장되는 값의 유일한 출처.
 * DB 스키마(`src/db/schema/tasks.ts`) 의 TASK_STATUSES 를 그대로 re-export 하여 단일 진실.
 */
export const TASK_STATUS_VALUES = TASK_STATUSES
export type TaskStatusValue = (typeof TASK_STATUS_VALUES)[number]

// ---- 공용 필드 스키마 ----

// 제목 — 양옆 공백 자동 trim 후 1~TASK_TITLE_MAX_LENGTH.
// trim 없이 두면 '  장보기  ' 가 저장된 뒤 UI 에서 검색·정렬이 예측 불가능해진다.
const taskTitleSchema = z
  .string({ message: '제목이 필요합니다.' })
  .trim()
  .min(1, '제목은 1자 이상이어야 합니다.')
  .max(
    TASK_TITLE_MAX_LENGTH,
    `제목은 ${TASK_TITLE_MAX_LENGTH}자 이내여야 합니다.`
  )

/**
 * nullable 텍스트 필드 (notes / location) 를 만드는 공통 팩토리.
 * - 공백만 있는 문자열을 trim 후 빈 문자열이 되면 null 로 정규화 → DB 에 들어가는 형태 통일.
 * - 명시적 null 은 그대로 null 로 통과 (UI 가 "값을 지웠다" 는 의도를 표현).
 * - maxLength 검증은 trim 전 기준으로 적용해야 사용자가 겉으로 보이는 길이와 어긋나지 않는다.
 */
const createNullableTextSchema = (maxLength: number, fieldLabel: string) =>
  z.union([
    z
      .string()
      .max(maxLength, `${fieldLabel}은(는) ${maxLength}자 이내여야 합니다.`)
      .transform(value => {
        const trimmed = value.trim()
        return trimmed === '' ? null : trimmed
      }),
    z.null(),
  ])

const taskNotesSchema = createNullableTextSchema(TASK_NOTES_MAX_LENGTH, '메모')
const taskLocationSchema = createNullableTextSchema(
  TASK_LOCATION_MAX_LENGTH,
  '장소'
)

/**
 * 상태 enum. TASK_STATUSES 를 그대로 enum 화해 DB/앱 사이에 어긋난 값이 흘러가는 사고를 차단.
 * 대소문자도 엄격히 구분 — 'DONE' 같은 입력은 즉시 거부되어야 UI 가 잘못된 상수를 쓰고 있는지 드러난다.
 */
export const taskStatusSchema = z.enum(TASK_STATUS_VALUES, {
  message: `상태는 ${TASK_STATUS_VALUES.join(' | ')} 중 하나여야 합니다.`,
})

/**
 * 마감/예정 시각(dueAt) 스키마.
 * - Date 객체 : 그대로 통과 (서버에서 직접 호출한 경우)
 * - ISO 문자열 : new Date() 로 파싱해 Date 로 변환 (UI 가 보낸 JSON 직렬화 값)
 * - 빈 문자열 : null 로 정규화 (date picker 가 값을 지웠을 때 UI 가 '' 로 보내도 안전)
 * - null    : 그대로 null (명시적으로 "마감 없음" 의도)
 * - 그 외(숫자/객체/잘못된 문자열/Invalid Date) : 거부.
 *
 * 주의 — 최초에 `z.coerce.date()` 를 쓰면 `new Date(null)` 이 1970-01-01 로 coerce 되어
 * "마감 없음" 의도가 통째로 사라진다. 그래서 union 으로 명시적으로 분기한다.
 */
const taskDueAtSchema = z
  .union([z.date(), z.string(), z.null()])
  .transform((value, ctx) => {
    if (value === null) return null

    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) {
        ctx.addIssue({
          code: 'custom',
          message: '마감일은 유효한 날짜여야 합니다.',
        })
        return z.NEVER
      }
      return value
    }

    // string
    if (value.trim() === '') return null
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) {
      ctx.addIssue({
        code: 'custom',
        message: '마감일은 유효한 ISO 8601 형식이어야 합니다.',
      })
      return z.NEVER
    }
    return parsed
  })

// ---- 외부 export 스키마 ----

/**
 * createTask 입력 스키마.
 * - `userId` / `position` 은 세션과 서버가 주입하므로 입력에서 제외 (클라이언트 위조 방지).
 * - status / rolloverEnabled / dueAt / notes / location 은 누락 시 DB DEFAULT 와 일치하는
 *   값으로 정규화한다 → Server Action 코드가 항상 같은 형태로 row 를 insert.
 * - D3 이 추가할 `labelIds` 는 여기에 포함하지 않는다 (태스크 생성과 라벨 연결은 별도 관심사).
 */
export const createTaskInputSchema = z.object({
  title: taskTitleSchema,
  notes: taskNotesSchema.optional().transform(value => value ?? null),
  location: taskLocationSchema.optional().transform(value => value ?? null),
  status: taskStatusSchema.optional().transform(value => value ?? 'pending'),
  dueAt: taskDueAtSchema.optional().transform(value => value ?? null),
  rolloverEnabled: z
    .boolean({ message: 'rolloverEnabled 는 boolean 이어야 합니다.' })
    .optional()
    .transform(value => value ?? true),
})

export type CreateTaskInput = z.infer<typeof createTaskInputSchema>

/**
 * updateTask 입력 스키마.
 * - 부분 수정 허용(제목만, 상태만 등). 모든 필드가 undefined 이면 refine 으로 거부.
 * - nullable 필드(notes/location/dueAt) 는 아래 세 케이스를 구별해야 한다:
 *     a) undefined → "변경하지 않음" (SET 절에서 제외)
 *     b) null      → "DB 값을 NULL 로" (메모/장소/마감 삭제)
 *     c) 유효한 값 → 새 값으로 교체
 *   따라서 `.optional().transform(v ?? null)` 같은 정규화를 걸지 않고 raw 를 그대로 둔다.
 */
export const updateTaskInputSchema = z
  .object({
    title: taskTitleSchema.optional(),
    notes: taskNotesSchema.optional(),
    location: taskLocationSchema.optional(),
    status: taskStatusSchema.optional(),
    dueAt: taskDueAtSchema.optional(),
    rolloverEnabled: z
      .boolean({ message: 'rolloverEnabled 는 boolean 이어야 합니다.' })
      .optional(),
  })
  .refine(value => Object.values(value).some(field => field !== undefined), {
    message: '수정할 필드를 최소 1개 이상 지정해야 합니다.',
  })

export type UpdateTaskInput = z.infer<typeof updateTaskInputSchema>

/**
 * toggleTaskStatus 입력 스키마.
 * - "pending↔done 토글" 이 아니라 "목표 상태를 명시적으로 전달" 패턴.
 *   'in_progress' 처럼 3-상태 전이도 자연스럽게 지원하고, UI 가 낙관적 업데이트 후
 *   서버가 목표 상태로 수렴하도록 만드는 게 단순하다.
 * - status 누락은 거부 — 빈 페이로드로 상태가 바뀌는 사고를 차단.
 */
export const toggleTaskStatusInputSchema = z.object({
  status: taskStatusSchema,
})

export type ToggleTaskStatusInput = z.infer<typeof toggleTaskStatusInputSchema>

/**
 * URL/Form 파라미터로 들어오는 정수 ID 검증용. tasks.id 는 SERIAL 이라 양의 정수만 허용.
 * 클라이언트가 number 로 보내든 string 으로 보내든 모두 number 로 반환한다.
 */
export const taskIdSchema = z.coerce
  .number({ message: '태스크 ID 가 필요합니다.' })
  .int('태스크 ID 는 정수여야 합니다.')
  .positive('태스크 ID 는 양수여야 합니다.')

/**
 * listTasks 필터 스키마. 전부 선택 사항이며 필요 없으면 undefined 자체도 허용.
 * - status : 상태별 필터 (완료 이력만 보기, 진행중만 보기 등)
 * - dueFrom / dueTo : 날짜 범위 필터. 캘린더/오늘/주간 뷰가 시야 범위만 쿼리하도록 강제해
 *   전체 스캔을 막는 게 목적 (Phase 3 G2 와 같은 사고).
 * - 라벨 필터는 D3 에서 task_labels junction 위에 구축.
 */
export const listTasksInputSchema = z
  .object({
    status: taskStatusSchema.optional(),
    dueFrom: taskDueAtSchema.optional(),
    dueTo: taskDueAtSchema.optional(),
  })
  .optional()

export type ListTasksInput = z.infer<typeof listTasksInputSchema>

// ---- Phase 4 U2 (List View) 전용 스키마 ----

/**
 * updateTaskPosition 입력 스키마 — 리스트 뷰 드래그 재정렬 + 섹션 간 이동 전용.
 * - newPosition: DB tasks.position 정렬값(양의 정수, 1 기반). 대상 위치에 놓일 값.
 *   같은 사용자 범위 내에서 유일할 필요는 없다. Server Action 안에서 인근 row 를
 *   shift 하는 전략으로 충돌을 해소한다 (actions/tasks.ts 주석 참조).
 * - newStatus: 섹션 간 드래그(= 상태 전이) 시에만 전달. 생략/undefined → 같은 섹션
 *   내부 재정렬. 전달된 경우 updateTask 와 동일한 doneAt 동기화 규칙 적용.
 */
export const updateTaskPositionInputSchema = z.object({
  newPosition: z.coerce
    .number({ message: '새 position 값이 필요합니다.' })
    .int('position 은 정수여야 합니다.')
    .positive('position 은 양수여야 합니다.'),
  newStatus: taskStatusSchema.optional(),
})

export type UpdateTaskPositionInput = z.infer<typeof updateTaskPositionInputSchema>

/**
 * searchTasks 입력 스키마 — 리스트 뷰 검색 박스 전용.
 * - query: 검색어. 공백만 있거나 빈 문자열이면 null 로 정규화 → 호출자가 "검색 없음"
 *   으로 판단하고 listTasksWithLabels 를 대신 호출하는 분기가 가능.
 * - labelId: 라벨 필터(단일). 생략 시 전체. 0 이하 또는 'all' 같은 특수값은 UI 층에서
 *   제거하고 여기로 넘기지 않는다 (v1 정책 — 'all' 은 undefined 로 전송).
 *
 * v1 구현 주의사항:
 *   - ILIKE 는 `%` / `_` / `\` 를 특수문자로 취급하므로 Server Action 안에서 반드시
 *     이스케이프 처리 후 질의한다 (actions/tasks.ts 에서 처리).
 *   - 검색어 최소 길이 제한은 두지 않는다 (1자 검색이 자연스러운 한국어 UX).
 *   - 최대 길이는 title 과 동일한 200자로 제한 — 그 이상은 폼 공격성 의심.
 */
export const searchTasksInputSchema = z.object({
  query: z
    .string()
    .max(TASK_TITLE_MAX_LENGTH, `검색어는 ${TASK_TITLE_MAX_LENGTH}자 이내여야 합니다.`)
    .transform(value => {
      const trimmed = value.trim()
      return trimmed === '' ? null : trimmed
    }),
  labelId: z.coerce
    .number({ message: 'labelId 는 정수여야 합니다.' })
    .int('labelId 는 정수여야 합니다.')
    .positive('labelId 는 양수여야 합니다.')
    .optional(),
})

export type SearchTasksInput = z.infer<typeof searchTasksInputSchema>
