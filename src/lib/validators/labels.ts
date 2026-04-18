import { z } from 'zod'

// ============================================================================
// 라벨 입력 검증 (Phase 2 - D1)
// ============================================================================
// - Server Action(`src/actions/labels.ts`) 의 입력 경계를 한 곳에 집중시킨다.
// - 같은 스키마를 클라이언트 폼(React Hook Form + zodResolver)에서도 재사용해
//   브라우저 / 서버 검증 메시지가 자동으로 통일되도록 한다 (Phase 4 U4 라벨 관리 화면).
// - 한국어 메시지는 사용자에게 직접 노출될 수 있으므로 친절·구체적으로 작성.
// ============================================================================

/** 라벨 이름 최대 길이. UI 칩 가로 폭과 DB text 컬럼의 의미상 한도를 고려한 정책 값. */
export const LABEL_NAME_MAX_LENGTH = 50

/** UI 표시용 색상 정규식. `#` + 6자리 16진수만 허용. 4자리/8자리 형태(RGBA)는 거부. */
export const LABEL_HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/

/**
 * Google Calendar API 가 허용하는 colorId 집합. Google 문서에서 'event colorId' 는
 * 1~11 의 문자열로 고정되어 있다. 설계 §8-5 매핑 근거.
 *
 * 정수가 아니라 문자열로 보관하는 이유: Google API 가 응답에서도 문자열로 돌려주고,
 * DB 컬럼(`google_color_id text`) 도 문자열이라 변환 단계를 줄이기 위함.
 */
export const GOOGLE_CALENDAR_COLOR_IDS = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  '11',
] as const

export type GoogleCalendarColorId = (typeof GOOGLE_CALENDAR_COLOR_IDS)[number]

// 라벨 이름 — 양옆 공백 자동 trim 후 1~LABEL_NAME_MAX_LENGTH.
// trim 하지 않으면 ' 직장 ' 과 '직장' 이 UNIQUE(user_id, name) 충돌 없이 둘 다 들어가
// 사용자 입장에서 "왜 같은 이름인데 두 번 만들어지지?" 가 됨.
const labelNameSchema = z
  .string({ message: '라벨 이름이 필요합니다.' })
  .trim()
  .min(1, '라벨 이름은 1자 이상이어야 합니다.')
  .max(
    LABEL_NAME_MAX_LENGTH,
    `라벨 이름은 ${LABEL_NAME_MAX_LENGTH}자 이내여야 합니다.`
  )

// 라벨 색상 — 정규식 검증. UI 컬러피커가 항상 #RRGGBB 형식으로 내보내는 것을 가정.
const labelColorSchema = z
  .string({ message: '색상이 필요합니다.' })
  .regex(
    LABEL_HEX_COLOR_PATTERN,
    '색상은 #RRGGBB 형식의 헥스 코드여야 합니다 (예: #3A6E5B).'
  )

// Google colorId — '1'~'11' 문자열 또는 null 만 허용 (쓰기 토글 OFF 사용자는 null).
// 변환은 두 가지 의미가 다르므로 schema 별로 다르게 적용한다:
//  - create: 누락 = null 로 정규화 (DB 컬럼은 nullable, 신규 라벨은 매핑 없음이 기본).
//  - update: 누락(undefined) = "그대로 유지", null = "명시적으로 매핑 해제" — 두 개를 구별해야
//    하므로 transform 을 걸지 않고 raw 값을 그대로 반환한다.
const googleColorIdEnum = z.enum(GOOGLE_CALENDAR_COLOR_IDS)
const nullableGoogleColorIdSchema = z.union([googleColorIdEnum, z.null()])

/**
 * createLabel 입력 스키마.
 * - position 은 서버가 자동 채번하므로 입력에서 제외.
 * - userId 는 세션에서 주입되므로 입력에서 제외 (클라이언트가 임의로 보내지 못하도록 차단).
 */
export const createLabelInputSchema = z.object({
  name: labelNameSchema,
  color: labelColorSchema,
  // 누락 시 null 로 자동 변환. action 코드가 항상 동일한 형태(`string | null`)로 처리할 수 있게 한다.
  googleColorId: nullableGoogleColorIdSchema
    .optional()
    .transform(value => value ?? null),
})

export type CreateLabelInput = z.infer<typeof createLabelInputSchema>

/**
 * updateLabel 입력 스키마.
 * - 부분 수정 허용(이름만, 색상만 등). 모든 필드가 비어 있으면 의미가 없으므로 refine 으로 거부.
 * - googleColorId 는 다음 세 케이스를 구분해야 한다:
 *     a) undefined  → 변경하지 않음 (SET 절에서 제외)
 *     b) null       → DB 값을 NULL 로 (쓰기 토글 해제)
 *     c) '1'~'11'   → 새 colorId 로 교체
 *   따라서 transform 을 걸지 않고 raw 값을 그대로 둔다 — undefined / null 의 의미 차이를 보존.
 */
export const updateLabelInputSchema = z
  .object({
    name: labelNameSchema.optional(),
    color: labelColorSchema.optional(),
    googleColorId: nullableGoogleColorIdSchema.optional(),
  })
  .refine(
    value =>
      value.name !== undefined ||
      value.color !== undefined ||
      value.googleColorId !== undefined,
    { message: '수정할 필드를 최소 1개 이상 지정해야 합니다.' }
  )

export type UpdateLabelInput = z.infer<typeof updateLabelInputSchema>

/**
 * URL/Form 파라미터로 들어오는 정수 ID 검증용. SERIAL 컬럼이라 양의 정수만 허용한다.
 * 클라이언트가 number 로 보내든 string 으로 보내든 모두 number 로 반환한다.
 */
export const labelIdSchema = z.coerce
  .number({ message: '라벨 ID 가 필요합니다.' })
  .int('라벨 ID 는 정수여야 합니다.')
  .positive('라벨 ID 는 양수여야 합니다.')
