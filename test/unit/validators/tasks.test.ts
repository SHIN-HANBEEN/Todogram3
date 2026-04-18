import { describe, expect, it } from 'vitest'

import {
  TASK_LOCATION_MAX_LENGTH,
  TASK_NOTES_MAX_LENGTH,
  TASK_STATUS_VALUES,
  TASK_TITLE_MAX_LENGTH,
  createTaskInputSchema,
  listTasksInputSchema,
  taskIdSchema,
  toggleTaskStatusInputSchema,
  updateTaskInputSchema,
} from '@/lib/validators/tasks'

// ============================================================================
// 태스크 입력 스키마 테스트 (Phase 2 - D2)
// ============================================================================
// - createTask / updateTask / toggleTaskStatus / deleteTask / listTasks 의 입력 경계를 한 곳에 잠근다.
// - 핵심 관심사:
//     1) title 은 trim 후 1~200자 (DB 컬럼과 UI 폭을 고려한 정책값)
//     2) notes / location 은 nullable. 빈 문자열은 null 로 정규화해 DB 에 들어가는 형태를 통일.
//     3) status 는 TASK_STATUSES('pending'|'in_progress'|'done') 만 허용. Google Cal 외부 이벤트
//        용 값이나 자유 문자열이 섞여 DB 에 저장되는 사고를 차단.
//     4) dueAt 은 Date / ISO 문자열 / null 세 형태를 모두 받되, 유효하지 않은 날짜는 거부.
//        빈 문자열은 null 로 정규화 (사용자가 date picker 에서 지웠을 때).
//     5) create 에서 status/rolloverEnabled/dueAt 생략 시 서버 기본값으로 정규화 (DB DEFAULT 와 정합).
//     6) update 는 부분 수정 허용하되 모든 필드가 undefined 이면 거부. null 은 "값 제거" 로 구별.
//     7) taskId 는 양의 정수만 (string→number coerce 포함).
// - D3 가 task_labels junction 을 붙이기 전까지 labelIds 필드는 이 스키마에 포함하지 않는다
//   (관심사 분리 — D2 범위는 tasks 테이블 CRUD 만).
// ============================================================================

describe('createTaskInputSchema', () => {
  // ---- title ----
  it('정상 입력을 통과시키고 title 양옆 공백을 trim 한다', () => {
    const parsed = createTaskInputSchema.parse({
      title: '  장보기  ',
    })
    expect(parsed.title).toBe('장보기')
  })

  it('title 이 trim 후 빈 문자열이면 거부한다', () => {
    const result = createTaskInputSchema.safeParse({ title: '   ' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['title'])
    }
  })

  it(`title 이 ${TASK_TITLE_MAX_LENGTH}자를 초과하면 거부한다`, () => {
    const oversize = 'ㄱ'.repeat(TASK_TITLE_MAX_LENGTH + 1)
    const result = createTaskInputSchema.safeParse({ title: oversize })
    expect(result.success).toBe(false)
  })

  it(`title 이 정확히 ${TASK_TITLE_MAX_LENGTH}자면 통과한다 (경계값)`, () => {
    const exact = 'ㄱ'.repeat(TASK_TITLE_MAX_LENGTH)
    const result = createTaskInputSchema.safeParse({ title: exact })
    expect(result.success).toBe(true)
  })

  it('title 이 누락되면 거부한다', () => {
    const result = createTaskInputSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  // ---- notes ----
  it('notes 누락 시 null 로 정규화된다', () => {
    const parsed = createTaskInputSchema.parse({ title: '테스트' })
    expect(parsed.notes).toBeNull()
  })

  it('notes 가 명시적 null 이면 null 을 보존한다', () => {
    const parsed = createTaskInputSchema.parse({ title: '테스트', notes: null })
    expect(parsed.notes).toBeNull()
  })

  it('notes 가 빈 문자열이면 null 로 정규화된다', () => {
    const parsed = createTaskInputSchema.parse({ title: '테스트', notes: '' })
    expect(parsed.notes).toBeNull()
  })

  it('notes 가 공백만 있으면 trim 후 null 로 정규화된다', () => {
    const parsed = createTaskInputSchema.parse({
      title: '테스트',
      notes: '   ',
    })
    expect(parsed.notes).toBeNull()
  })

  it('notes 가 내용 있으면 trim 후 그대로 통과', () => {
    const parsed = createTaskInputSchema.parse({
      title: '테스트',
      notes: '  긴 메모  ',
    })
    expect(parsed.notes).toBe('긴 메모')
  })

  it(`notes 가 ${TASK_NOTES_MAX_LENGTH}자를 초과하면 거부한다`, () => {
    const oversize = 'ㄱ'.repeat(TASK_NOTES_MAX_LENGTH + 1)
    const result = createTaskInputSchema.safeParse({
      title: '테스트',
      notes: oversize,
    })
    expect(result.success).toBe(false)
  })

  // ---- location ----
  it('location 누락 시 null 로 정규화된다', () => {
    const parsed = createTaskInputSchema.parse({ title: '테스트' })
    expect(parsed.location).toBeNull()
  })

  it('location 이 빈 문자열이면 null 로 정규화된다', () => {
    const parsed = createTaskInputSchema.parse({
      title: '테스트',
      location: '',
    })
    expect(parsed.location).toBeNull()
  })

  it(`location 이 ${TASK_LOCATION_MAX_LENGTH}자를 초과하면 거부한다`, () => {
    const oversize = 'ㄱ'.repeat(TASK_LOCATION_MAX_LENGTH + 1)
    const result = createTaskInputSchema.safeParse({
      title: '테스트',
      location: oversize,
    })
    expect(result.success).toBe(false)
  })

  // ---- status ----
  it.each(TASK_STATUS_VALUES)('status 허용 값 %s 통과', valid => {
    const parsed = createTaskInputSchema.parse({
      title: '테스트',
      status: valid,
    })
    expect(parsed.status).toBe(valid)
  })

  it('status 누락 시 pending 으로 정규화된다 (DB DEFAULT 와 일치)', () => {
    const parsed = createTaskInputSchema.parse({ title: '테스트' })
    expect(parsed.status).toBe('pending')
  })

  it.each(['', 'unknown', 'DONE', 'completed', 'canceled', 5, null])(
    '잘못된 status %s 를 거부한다',
    invalid => {
      const result = createTaskInputSchema.safeParse({
        title: '테스트',
        status: invalid,
      })
      expect(result.success).toBe(false)
    }
  )

  // ---- dueAt ----
  it('dueAt 이 Date 객체면 그대로 통과', () => {
    const when = new Date('2026-05-01T09:00:00Z')
    const parsed = createTaskInputSchema.parse({
      title: '테스트',
      dueAt: when,
    })
    expect(parsed.dueAt).toBeInstanceOf(Date)
    expect(parsed.dueAt?.toISOString()).toBe(when.toISOString())
  })

  it('dueAt 이 ISO 문자열이면 Date 로 변환', () => {
    const iso = '2026-05-01T09:00:00.000Z'
    const parsed = createTaskInputSchema.parse({
      title: '테스트',
      dueAt: iso,
    })
    expect(parsed.dueAt).toBeInstanceOf(Date)
    expect(parsed.dueAt?.toISOString()).toBe(iso)
  })

  it('dueAt 이 빈 문자열이면 null 로 정규화된다', () => {
    const parsed = createTaskInputSchema.parse({
      title: '테스트',
      dueAt: '',
    })
    expect(parsed.dueAt).toBeNull()
  })

  it('dueAt 이 누락되면 null 로 정규화된다', () => {
    const parsed = createTaskInputSchema.parse({ title: '테스트' })
    expect(parsed.dueAt).toBeNull()
  })

  it('dueAt 이 명시적 null 이면 null 로 통과', () => {
    const parsed = createTaskInputSchema.parse({
      title: '테스트',
      dueAt: null,
    })
    expect(parsed.dueAt).toBeNull()
  })

  it.each([
    'not-a-date',
    'foo',
    '2026-13-40',
    '2026/05/01 invalid',
    123,
    {},
    true,
  ])('잘못된 dueAt %s 를 거부한다', invalid => {
    const result = createTaskInputSchema.safeParse({
      title: '테스트',
      dueAt: invalid,
    })
    expect(result.success).toBe(false)
  })

  // ---- rolloverEnabled ----
  it('rolloverEnabled 누락 시 true 로 정규화된다 (DB DEFAULT 와 일치)', () => {
    const parsed = createTaskInputSchema.parse({ title: '테스트' })
    expect(parsed.rolloverEnabled).toBe(true)
  })

  it.each([true, false])('rolloverEnabled 불리언 값 %s 그대로 통과', value => {
    const parsed = createTaskInputSchema.parse({
      title: '테스트',
      rolloverEnabled: value,
    })
    expect(parsed.rolloverEnabled).toBe(value)
  })

  it.each(['true', 1, 0, null])(
    '잘못된 rolloverEnabled %s 를 거부한다',
    invalid => {
      const result = createTaskInputSchema.safeParse({
        title: '테스트',
        rolloverEnabled: invalid,
      })
      expect(result.success).toBe(false)
    }
  )
})

describe('updateTaskInputSchema', () => {
  it('title 만 보내는 부분 수정 통과', () => {
    expect(updateTaskInputSchema.safeParse({ title: '새 제목' }).success).toBe(
      true
    )
  })

  it('status 만 보내는 부분 수정 통과', () => {
    expect(updateTaskInputSchema.safeParse({ status: 'done' }).success).toBe(
      true
    )
  })

  it('rolloverEnabled 만 false 로 보내는 부분 수정 통과', () => {
    expect(
      updateTaskInputSchema.safeParse({ rolloverEnabled: false }).success
    ).toBe(true)
  })

  it('notes 가 undefined (미전송) 와 null (명시적 제거) 을 구별한다', () => {
    const parsedNull = updateTaskInputSchema.parse({ notes: null })
    expect(parsedNull.notes).toBeNull()

    const parsedMissing = updateTaskInputSchema.parse({ title: '제목' })
    expect(parsedMissing.notes).toBeUndefined()
  })

  it('location 도 undefined / null 을 구별한다', () => {
    const parsedNull = updateTaskInputSchema.parse({ location: null })
    expect(parsedNull.location).toBeNull()

    const parsedMissing = updateTaskInputSchema.parse({ title: '제목' })
    expect(parsedMissing.location).toBeUndefined()
  })

  it('dueAt 도 undefined / null 을 구별한다', () => {
    const parsedNull = updateTaskInputSchema.parse({ dueAt: null })
    expect(parsedNull.dueAt).toBeNull()

    const parsedMissing = updateTaskInputSchema.parse({ title: '제목' })
    expect(parsedMissing.dueAt).toBeUndefined()
  })

  it('아무 필드도 없으면 거부한다 (의미 없는 update 차단)', () => {
    const result = updateTaskInputSchema.safeParse({})
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/최소 1개/)
    }
  })

  it('잘못된 status 가 섞이면 부분 수정이라도 거부한다', () => {
    const result = updateTaskInputSchema.safeParse({
      title: '괜찮음',
      status: 'completed',
    })
    expect(result.success).toBe(false)
  })

  it('trim 후 빈 title 을 거부한다 (update 경로도 동일 규칙)', () => {
    const result = updateTaskInputSchema.safeParse({ title: '   ' })
    expect(result.success).toBe(false)
  })
})

describe('toggleTaskStatusInputSchema', () => {
  it.each(TASK_STATUS_VALUES)('status %s 통과', valid => {
    const parsed = toggleTaskStatusInputSchema.parse({ status: valid })
    expect(parsed.status).toBe(valid)
  })

  it.each([undefined, null, '', 'DONE', 'completed'])(
    '잘못된 status %s 를 거부한다',
    invalid => {
      const result = toggleTaskStatusInputSchema.safeParse({ status: invalid })
      expect(result.success).toBe(false)
    }
  )

  it('status 누락 시 거부한다 (toggle 은 목표 상태가 반드시 있어야 함)', () => {
    const result = toggleTaskStatusInputSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})

describe('taskIdSchema', () => {
  it.each([
    [1, 1],
    ['1', 1],
    ['42', 42],
    [42, 42],
  ])('양의 정수 %s 를 %s 로 변환', (input, expected) => {
    expect(taskIdSchema.parse(input)).toBe(expected)
  })

  it.each([0, -1, 1.5, 'abc', '', null, undefined])(
    '%s 는 거부한다',
    invalid => {
      expect(taskIdSchema.safeParse(invalid).success).toBe(false)
    }
  )
})

describe('listTasksInputSchema', () => {
  it('필터 없이도 통과한다 (전체 조회 기본값)', () => {
    expect(listTasksInputSchema.safeParse(undefined).success).toBe(true)
    expect(listTasksInputSchema.safeParse({}).success).toBe(true)
  })

  it('status 필터만 있는 경우 통과', () => {
    const parsed = listTasksInputSchema.parse({ status: 'pending' })
    expect(parsed?.status).toBe('pending')
  })

  it('dueFrom / dueTo 필터를 ISO 문자열로 받는다', () => {
    const parsed = listTasksInputSchema.parse({
      dueFrom: '2026-04-01T00:00:00Z',
      dueTo: '2026-04-30T23:59:59Z',
    })
    expect(parsed?.dueFrom).toBeInstanceOf(Date)
    expect(parsed?.dueTo).toBeInstanceOf(Date)
  })

  it('잘못된 status 필터를 거부한다', () => {
    const result = listTasksInputSchema.safeParse({ status: 'invalid' })
    expect(result.success).toBe(false)
  })

  it('잘못된 dueFrom 을 거부한다', () => {
    const result = listTasksInputSchema.safeParse({ dueFrom: 'not-a-date' })
    expect(result.success).toBe(false)
  })
})
