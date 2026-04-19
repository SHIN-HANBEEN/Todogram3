import { describe, expect, it } from 'vitest'

import { runForEachUser } from '@/lib/rollover'

// ============================================================================
// rollover.ts 의 사용자-단위 격리 실행기 단위 테스트 — Phase 5 R2 / critical test gap #3
// ============================================================================
// - "한 유저의 이월이 폭발해도 다른 유저는 처리되어야 한다" 는 운영 요구가 있어(§8-4),
//   `runForEachUser` 가 그 계약을 실제로 지키는지 확인한다.
// - 실제 이월 로직은 주입된 `run` 함수가 담당하므로 여기서는 DB 없이 Promise 만 가지고
//   성공/실패/혼합 시나리오를 검증한다.
// ============================================================================

interface FakeUser {
  id: number
  label: string
}

describe('runForEachUser — 사용자 레벨 격리', () => {
  it('모든 유저가 성공하면 ok 에 결과가 쌓이고 failed 는 빈 배열이다', async () => {
    const itemsInput: FakeUser[] = [
      { id: 1, label: 'A' },
      { id: 2, label: 'B' },
    ]
    const { ok, failed } = await runForEachUser(itemsInput, async user => ({
      echoed: user.label,
    }))
    expect(failed).toEqual([])
    expect(ok).toHaveLength(2)
    expect(ok[0]).toEqual({
      item: itemsInput[0],
      result: { echoed: 'A' },
    })
    expect(ok[1]).toEqual({
      item: itemsInput[1],
      result: { echoed: 'B' },
    })
  })

  it('일부 유저가 throw 해도 다른 유저의 결과는 그대로 보존된다', async () => {
    const itemsInput: FakeUser[] = [
      { id: 1, label: 'ok-1' },
      { id: 2, label: 'boom' },
      { id: 3, label: 'ok-3' },
    ]

    const { ok, failed } = await runForEachUser(itemsInput, async user => {
      if (user.label === 'boom') {
        throw new Error('simulated user-level failure')
      }
      return user.label
    })

    // 성공 2명은 정상 누적.
    expect(ok).toHaveLength(2)
    expect(ok.map(entry => entry.result).sort()).toEqual(['ok-1', 'ok-3'])

    // 실패 1명은 failed 에 Error 객체 그대로 담긴다 (원본 스택 보존).
    expect(failed).toHaveLength(1)
    expect(failed[0].item).toEqual({ id: 2, label: 'boom' })
    expect(failed[0].error).toBeInstanceOf(Error)
    expect(failed[0].error.message).toBe('simulated user-level failure')
  })

  it('non-Error 거부 값도 Error 로 감싸져서 failed 에 들어간다', async () => {
    const itemsInput: FakeUser[] = [{ id: 9, label: 'x' }]
    // Promise.reject 에 문자열을 던지는 경우 (라이브러리 오류 모양이 이러하면 스택이 소실될 수 있음 → 우리가 감싸야 함).
    const { ok, failed } = await runForEachUser(itemsInput, async () => {
      return Promise.reject('string rejection')
    })
    expect(ok).toEqual([])
    expect(failed).toHaveLength(1)
    expect(failed[0].error).toBeInstanceOf(Error)
    expect(failed[0].error.message).toBe('string rejection')
  })

  it('빈 입력에 대해서는 두 배열 모두 비어 있다', async () => {
    const { ok, failed } = await runForEachUser<FakeUser, number>(
      [],
      async () => 42
    )
    expect(ok).toEqual([])
    expect(failed).toEqual([])
  })

  it('모든 작업이 병렬로 진행된다 (직렬이 아님)', async () => {
    // 각 유저가 50ms 대기한다면, 3명을 직렬로 돌리면 150ms+, 병렬이면 ~50ms 로 끝난다.
    // 마진을 넉넉히 줘 CI 의 느린 머신에서도 flaky 하지 않게 한다: 100ms 이내면 병렬로 판정.
    const itemsInput: FakeUser[] = [
      { id: 1, label: 'a' },
      { id: 2, label: 'b' },
      { id: 3, label: 'c' },
    ]
    const started = Date.now()
    await runForEachUser(itemsInput, async () => {
      await new Promise(resolve => setTimeout(resolve, 50))
      return 'done'
    })
    const elapsed = Date.now() - started
    expect(elapsed).toBeLessThan(140)
  })
})
