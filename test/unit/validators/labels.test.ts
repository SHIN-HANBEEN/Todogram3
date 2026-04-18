import { describe, expect, it } from 'vitest'

import {
  GOOGLE_CALENDAR_COLOR_IDS,
  LABEL_HEX_COLOR_PATTERN,
  LABEL_NAME_MAX_LENGTH,
  createLabelInputSchema,
  labelIdSchema,
  updateLabelInputSchema,
} from '@/lib/validators/labels'

// ============================================================================
// 라벨 입력 스키마 테스트 (Phase 2 - D1)
// ============================================================================
// - createLabel / updateLabel / deleteLabel(=labelId) 의 모든 입력 경계값을 한 군데서 잠근다.
// - 핵심 관심사:
//     1) 색상은 #RRGGBB 정확히 7자만 허용 (DB color text 컬럼 의미를 보존)
//     2) googleColorId 는 '1'~'11' 범위만 허용 (Google API 가 거부하는 값을 사전 차단)
//     3) name 은 trim 후 1~50자
//     4) update 는 부분 수정 허용하되 모든 필드가 비면 거부
//     5) labelId 는 양의 정수만 (string→number coerce 포함)
// - 같은 스키마를 클라이언트 폼에서 재사용할 예정이므로, 메시지 톤도 사용자에게 그대로 노출 가능해야 함.
// ============================================================================

describe('createLabelInputSchema', () => {
  // ---- name ----
  it('정상 입력을 통과시키고 name 양옆 공백을 trim 한다', () => {
    const parsed = createLabelInputSchema.parse({
      name: '  직장  ',
      color: '#3A6E5B',
      googleColorId: '5',
    })
    expect(parsed.name).toBe('직장')
    expect(parsed.color).toBe('#3A6E5B')
    expect(parsed.googleColorId).toBe('5')
  })

  it('name 이 trim 후 빈 문자열이면 거부한다', () => {
    const result = createLabelInputSchema.safeParse({
      name: '   ',
      color: '#3A6E5B',
      googleColorId: null,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['name'])
    }
  })

  it(`name 이 ${LABEL_NAME_MAX_LENGTH}자를 초과하면 거부한다`, () => {
    const oversize = 'ㄱ'.repeat(LABEL_NAME_MAX_LENGTH + 1)
    const result = createLabelInputSchema.safeParse({
      name: oversize,
      color: '#3A6E5B',
      googleColorId: null,
    })
    expect(result.success).toBe(false)
  })

  it(`name 이 정확히 ${LABEL_NAME_MAX_LENGTH}자면 통과한다 (경계값)`, () => {
    const exact = 'ㄱ'.repeat(LABEL_NAME_MAX_LENGTH)
    const result = createLabelInputSchema.safeParse({
      name: exact,
      color: '#3A6E5B',
      googleColorId: null,
    })
    expect(result.success).toBe(true)
  })

  it('name 이 누락되면 거부한다', () => {
    const result = createLabelInputSchema.safeParse({
      color: '#3A6E5B',
      googleColorId: null,
    })
    expect(result.success).toBe(false)
  })

  // ---- color ----
  it('대소문자 헥스 모두 통과한다', () => {
    expect(
      createLabelInputSchema.safeParse({
        name: '소문자',
        color: '#a1b2c3',
        googleColorId: null,
      }).success
    ).toBe(true)
    expect(
      createLabelInputSchema.safeParse({
        name: '대문자',
        color: '#A1B2C3',
        googleColorId: null,
      }).success
    ).toBe(true)
  })

  it.each([
    ['#fff', '3자리 단축형'],
    ['#FFFFFFFF', '8자리 RGBA'],
    ['000000', '# 누락'],
    ['#GGGGGG', '비-16진수'],
    ['rgb(0,0,0)', 'CSS 함수'],
    ['', '빈 문자열'],
    ['#3A6E5B ', '뒤 공백'],
  ])('잘못된 color %s (%s) 를 거부한다', invalid => {
    const result = createLabelInputSchema.safeParse({
      name: '테스트',
      color: invalid,
      googleColorId: null,
    })
    expect(result.success).toBe(false)
  })

  it('LABEL_HEX_COLOR_PATTERN 자체가 #RRGGBB 만 매칭한다 (정규식 잠금 테스트)', () => {
    expect(LABEL_HEX_COLOR_PATTERN.test('#3A6E5B')).toBe(true)
    expect(LABEL_HEX_COLOR_PATTERN.test('#3a6e5b')).toBe(true)
    expect(LABEL_HEX_COLOR_PATTERN.test('#FFF')).toBe(false)
    expect(LABEL_HEX_COLOR_PATTERN.test('#FFFFFFFF')).toBe(false)
  })

  // ---- googleColorId ----
  it.each(GOOGLE_CALENDAR_COLOR_IDS)('googleColorId 허용 값 %s 통과', valid => {
    const result = createLabelInputSchema.safeParse({
      name: '테스트',
      color: '#3A6E5B',
      googleColorId: valid,
    })
    expect(result.success).toBe(true)
  })

  it.each(['0', '12', '99', 5, '5 ', ' 5', 'one'])(
    '잘못된 googleColorId %s 를 거부한다',
    invalid => {
      const result = createLabelInputSchema.safeParse({
        name: '테스트',
        color: '#3A6E5B',
        googleColorId: invalid,
      })
      expect(result.success).toBe(false)
    }
  )

  it('googleColorId 가 누락되면 null 로 정규화된다', () => {
    const parsed = createLabelInputSchema.parse({
      name: '테스트',
      color: '#3A6E5B',
    })
    expect(parsed.googleColorId).toBeNull()
  })

  it('googleColorId 가 명시적 null 이면 그대로 null 로 통과한다', () => {
    const parsed = createLabelInputSchema.parse({
      name: '테스트',
      color: '#3A6E5B',
      googleColorId: null,
    })
    expect(parsed.googleColorId).toBeNull()
  })
})

describe('updateLabelInputSchema', () => {
  it('name 만 보내는 부분 수정 통과', () => {
    expect(updateLabelInputSchema.safeParse({ name: '새이름' }).success).toBe(
      true
    )
  })

  it('color 만 보내는 부분 수정 통과', () => {
    expect(updateLabelInputSchema.safeParse({ color: '#000000' }).success).toBe(
      true
    )
  })

  it('googleColorId 만 명시적 null 로 보내는 부분 수정 통과 (매핑 해제)', () => {
    const parsed = updateLabelInputSchema.parse({ googleColorId: null })
    expect(parsed.googleColorId).toBeNull()
  })

  it('아무 필드도 없으면 거부한다 (의미 없는 update 차단)', () => {
    const result = updateLabelInputSchema.safeParse({})
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/최소 1개/)
    }
  })

  it('잘못된 color 가 섞이면 부분 수정이라도 거부한다', () => {
    const result = updateLabelInputSchema.safeParse({
      name: '괜찮음',
      color: 'not-a-color',
    })
    expect(result.success).toBe(false)
  })
})

describe('labelIdSchema', () => {
  it.each([
    [1, 1],
    ['1', 1],
    ['42', 42],
    [42, 42],
  ])('양의 정수 %s 를 %s 로 변환', (input, expected) => {
    expect(labelIdSchema.parse(input)).toBe(expected)
  })

  it.each([0, -1, 1.5, 'abc', '', null, undefined])(
    '%s 는 거부한다',
    invalid => {
      expect(labelIdSchema.safeParse(invalid).success).toBe(false)
    }
  )
})
