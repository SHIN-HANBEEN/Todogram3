import { describe, expect, it } from 'vitest'

import {
  TASK_LABELS_MAX_COUNT,
  setTaskLabelsInputSchema,
} from '@/lib/validators/task-labels'

// ============================================================================
// 태스크-라벨 junction 입력 스키마 테스트 (Phase 2 - D3)
// ============================================================================
// - setTaskLabels 의 입력 경계를 한 곳에 잠근다.
// - 핵심 관심사:
//     1) labelIds 는 배열이어야 하며 각 원소는 양의 정수 (labelIdSchema 재사용 확인)
//     2) 빈 배열은 "모든 라벨 연결 해제" 의미로 허용
//     3) 중복 labelId 는 transform 에서 제거 (junction PK 위반 사전 차단, 원본 순서 보존)
//     4) TASK_LABELS_MAX_COUNT 상한 초과 거부
//     5) 잘못된 원소(문자열/0/음수/소수) 는 array 검증 단계에서 거부
// ============================================================================

describe('setTaskLabelsInputSchema', () => {
  // ---- 정상 케이스 ----
  it('정상 labelIds 배열을 그대로 통과시킨다', () => {
    const parsed = setTaskLabelsInputSchema.parse({ labelIds: [1, 2, 3] })
    expect(parsed.labelIds).toEqual([1, 2, 3])
  })

  it('빈 배열은 "모든 연결 해제" 의도로 허용한다', () => {
    const parsed = setTaskLabelsInputSchema.parse({ labelIds: [] })
    expect(parsed.labelIds).toEqual([])
  })

  it('문자열 형태 id 도 coerce 로 number 가 된다 (labelIdSchema 재사용 확인)', () => {
    const parsed = setTaskLabelsInputSchema.parse({
      labelIds: ['1', '42', '7'],
    })
    expect(parsed.labelIds).toEqual([1, 42, 7])
  })

  // ---- 중복 제거 ----
  it('중복 labelId 는 transform 에서 제거되고 원본 순서를 보존한다', () => {
    const parsed = setTaskLabelsInputSchema.parse({
      labelIds: [3, 1, 2, 1, 3, 2],
    })
    // 첫 등장 순서대로 [3, 1, 2] 만 남아야 한다 (Set + Array.from 의 삽입 순서 보존 속성).
    expect(parsed.labelIds).toEqual([3, 1, 2])
  })

  it('문자열/숫자 혼합이더라도 coerce 후 중복이면 제거된다', () => {
    const parsed = setTaskLabelsInputSchema.parse({
      labelIds: ['1', 1, '2', 2],
    })
    expect(parsed.labelIds).toEqual([1, 2])
  })

  // ---- 상한 ----
  it(`labelIds 가 정확히 ${TASK_LABELS_MAX_COUNT} 개면 통과한다 (경계값)`, () => {
    const exact = Array.from({ length: TASK_LABELS_MAX_COUNT }, (_, i) => i + 1)
    const parsed = setTaskLabelsInputSchema.parse({ labelIds: exact })
    expect(parsed.labelIds.length).toBe(TASK_LABELS_MAX_COUNT)
  })

  it(`labelIds 가 ${TASK_LABELS_MAX_COUNT} 개를 초과하면 거부한다`, () => {
    const oversize = Array.from(
      { length: TASK_LABELS_MAX_COUNT + 1 },
      (_, i) => i + 1
    )
    const result = setTaskLabelsInputSchema.safeParse({ labelIds: oversize })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(
        new RegExp(`${TASK_LABELS_MAX_COUNT}개`)
      )
    }
  })

  // ---- 잘못된 원소 ----
  it.each([0, -1, 1.5, 'abc', '', null])(
    '잘못된 원소 %s 가 섞이면 거부한다',
    invalid => {
      const result = setTaskLabelsInputSchema.safeParse({
        labelIds: [1, invalid, 2],
      })
      expect(result.success).toBe(false)
    }
  )

  // ---- 구조적 거부 ----
  it('labelIds 가 배열이 아니면 거부한다', () => {
    const result = setTaskLabelsInputSchema.safeParse({ labelIds: 'not-array' })
    expect(result.success).toBe(false)
  })

  it('labelIds 가 누락되면 거부한다 (명시적 빈 배열 요구)', () => {
    const result = setTaskLabelsInputSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('labelIds 가 null 이면 거부한다', () => {
    const result = setTaskLabelsInputSchema.safeParse({ labelIds: null })
    expect(result.success).toBe(false)
  })
})
