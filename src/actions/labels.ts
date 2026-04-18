'use server'

import { and, asc, eq, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { db } from '@/db'
import { labels, type Label } from '@/db/schema'
import { requireUserId } from '@/lib/session'
import {
  createLabelInputSchema,
  labelIdSchema,
  updateLabelInputSchema,
  type CreateLabelInput,
  type UpdateLabelInput,
} from '@/lib/validators/labels'

// ============================================================================
// Labels Server Actions (Phase 2 - D1)
// ============================================================================
// - CRUD 4종 (`createLabel` / `updateLabel` / `deleteLabel` / `listLabels`).
// - 모든 쿼리는 반드시 `WHERE user_id = session.user.id` 가드를 동반한다.
//   가드가 빠지면 다른 사용자의 라벨을 임의로 조작할 수 있다 (Critical Test Gap #1 — Phase 2 D2 와 같은 원리).
// - 입력 검증: `src/lib/validators/labels.ts` 의 Zod 스키마를 100% 경유.
// - 자동 채번: 새 라벨의 `position` 은 (현재 사용자 라벨 중 max + 1) 로 트랜잭션 안에서 계산.
//   같은 사용자가 동시에 두 라벨을 만드는 경합은 v1 dogfooding(1인 사용자) 환경에서 발생하지 않으나,
//   트랜잭션 안에 read+insert 를 묶어두면 v1.5+ 에서 다중 클라이언트로 확장될 때도 안전.
// - 캐시 무효화: 라벨을 소비하는 모든 라우트(`/settings/labels`, `/list`, `/calendar`, `/today`) 에
//   대해 mutation 후 revalidatePath. 일부 라우트는 Phase 4 까지 미생성이지만, 미리 호출해도
//   해당 페이지가 없으면 Next.js 가 조용히 무시하므로 안전.
// ============================================================================

/**
 * 라벨을 소비하는 페이지 경로 모음. mutation 직후 일괄 revalidate 한다.
 * 새 라우트가 추가되면 이 배열만 확장하면 된다 — 호출 지점은 손대지 않는다.
 */
const LABEL_CONSUMER_PATHS = [
  '/settings/labels',
  '/list',
  '/calendar',
  '/today',
] as const

function revalidateLabelConsumers() {
  for (const path of LABEL_CONSUMER_PATHS) {
    revalidatePath(path)
  }
}

/**
 * Postgres unique 제약 위반(코드 23505) 인지 식별한다.
 * postgres.js 드라이버는 에러 객체에 `code` 를 그대로 노출한다. 라벨 도메인에서는
 * UNIQUE(user_id, name) 위반만 발생할 수 있으므로, 코드 매칭만 확인하면 충분하다.
 */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  )
}

/**
 * 현재 사용자의 모든 라벨을 position 오름차순으로 반환.
 * UI 가 순서 그대로 렌더링하면 사용자 정의 정렬이 자연스럽게 보존된다.
 */
export async function listLabels(): Promise<Label[]> {
  const userId = await requireUserId()

  return db
    .select()
    .from(labels)
    .where(eq(labels.userId, userId))
    .orderBy(asc(labels.position), asc(labels.id))
}

/**
 * 라벨 생성. position 은 자동으로 (현재 사용자 라벨 중 max + 1) 로 채워진다.
 *
 * @throws ZodError — 입력 검증 실패 (UI 가 form field 별 메시지 매핑)
 * @throws UnauthenticatedError — 세션 없음
 * @throws Error('이미 같은 이름의 라벨이 있습니다...') — UNIQUE(user_id, name) 위반
 */
export async function createLabel(rawInput: CreateLabelInput): Promise<Label> {
  const userId = await requireUserId()
  const input = createLabelInputSchema.parse(rawInput)

  try {
    return await db.transaction(async tx => {
      // 같은 사용자 한정으로 현재 최대 position 을 읽는다. 다른 사용자 데이터는 절대 보지 않는다.
      const [maxRow] = await tx
        .select({ max: sql<number | null>`max(${labels.position})` })
        .from(labels)
        .where(eq(labels.userId, userId))

      const nextPosition = (maxRow?.max ?? 0) + 1

      const [created] = await tx
        .insert(labels)
        .values({
          userId,
          name: input.name,
          color: input.color,
          googleColorId: input.googleColorId,
          position: nextPosition,
        })
        .returning()

      // .returning() 은 RETURNING * 결과 배열을 돌려준다. 단건 insert 라 [0] 이 항상 존재.
      // 그래도 방어적으로 체크 — undefined 면 드라이버 또는 Drizzle 동작이 변경된 셈이므로 즉시 실패.
      if (!created) {
        throw new Error('라벨 생성에 실패했습니다.')
      }

      revalidateLabelConsumers()
      return created
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error(`이미 같은 이름의 라벨이 있습니다: '${input.name}'`)
    }
    throw error
  }
}

/**
 * 라벨 수정. ownership 가드(`user_id = session.user.id`) 가 일치하는 row 만 갱신.
 * - 일치 row 가 없으면(=다른 사용자 라벨이거나 이미 삭제) Error throw → UI 는 404/403 처리.
 * - 부분 수정 허용. 호출자가 보낸 필드만 SET 절에 포함해 의도하지 않은 컬럼 덮어쓰기 차단.
 *
 * @param labelId 수정 대상 라벨 ID. number 또는 string 모두 허용 (zod coerce).
 * @param rawInput 부분 수정 입력. 최소 1개 필드 필요.
 */
export async function updateLabel(
  labelId: number | string,
  rawInput: UpdateLabelInput
): Promise<Label> {
  const userId = await requireUserId()
  const id = labelIdSchema.parse(labelId)
  const input = updateLabelInputSchema.parse(rawInput)

  // SET 절은 사용자가 명시적으로 보낸 필드로만 구성한다.
  // (undefined 는 Drizzle 이 무시하지만, 명시 분기가 의도가 더 분명해 가독성에 유리.)
  const updateValues: Partial<typeof labels.$inferInsert> = {}
  if (input.name !== undefined) updateValues.name = input.name
  if (input.color !== undefined) updateValues.color = input.color
  if (input.googleColorId !== undefined)
    updateValues.googleColorId = input.googleColorId

  try {
    const updated = await db
      .update(labels)
      .set(updateValues)
      .where(and(eq(labels.id, id), eq(labels.userId, userId)))
      .returning()

    if (updated.length === 0) {
      // ownership 가드가 모든 미일치 케이스(존재하지 않거나 / 타 사용자 소유) 를 동일한
      // "찾을 수 없음" 으로 묶는다. 리소스 존재 여부를 노출하지 않아 enumeration 공격 차단.
      throw new Error(`라벨을 찾을 수 없습니다: id=${id}`)
    }

    revalidateLabelConsumers()
    return updated[0]
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error(`이미 같은 이름의 라벨이 있습니다: '${input.name ?? ''}'`)
    }
    throw error
  }
}

/**
 * 라벨 삭제. ownership 가드 동일.
 * - task_labels junction 은 ON DELETE CASCADE 로 자동 정리(설계 §8-2).
 * - 미일치 시 동일하게 "찾을 수 없음" Error.
 */
export async function deleteLabel(labelId: number | string): Promise<void> {
  const userId = await requireUserId()
  const id = labelIdSchema.parse(labelId)

  const deleted = await db
    .delete(labels)
    .where(and(eq(labels.id, id), eq(labels.userId, userId)))
    .returning({ id: labels.id })

  if (deleted.length === 0) {
    throw new Error(`라벨을 찾을 수 없습니다: id=${id}`)
  }

  revalidateLabelConsumers()
}
