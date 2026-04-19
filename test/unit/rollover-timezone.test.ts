import { describe, expect, it } from 'vitest'

import {
  computeTodayDateString,
  computeTodayStartUtc,
  getTimezoneOffsetMs,
  shiftDueAtToToday,
  zonedDateToUtc,
} from '@/lib/rollover'

// ============================================================================
// rollover.ts 의 순수 timezone 헬퍼 단위 테스트 — Phase 5 R2
// ============================================================================
// - DB / HTTP 없이 순수 수학만 검증한다. 여기서 버그가 새면 전 세계 TZ 사용자가 잘못된
//   시각에 이월되므로, 의도적으로 "사용자 살고 있는 TZ × 현재 시각" 조합을 섞어 본다.
// - Asia/Seoul (+9 고정, DST 없음) 과 America/Los_Angeles (DST 전환 있음) 를 둘 다 돌려
//   오프셋 계산 자체가 맞는지와 DST 경계 양쪽이 맞는지 본다.
// ============================================================================

describe('getTimezoneOffsetMs', () => {
  it('Asia/Seoul 은 항상 +9시간(32_400_000ms) 이다 (DST 없음)', () => {
    const hot = new Date('2026-07-15T00:00:00Z')
    const cold = new Date('2026-01-15T00:00:00Z')
    expect(getTimezoneOffsetMs('Asia/Seoul', hot)).toBe(9 * 60 * 60 * 1000)
    expect(getTimezoneOffsetMs('Asia/Seoul', cold)).toBe(9 * 60 * 60 * 1000)
  })

  it('UTC 는 항상 0 이다', () => {
    const instant = new Date('2026-03-08T10:00:00Z')
    expect(getTimezoneOffsetMs('UTC', instant)).toBe(0)
  })

  it('America/Los_Angeles 는 DST 전환 전/후로 -8h / -7h 로 바뀐다', () => {
    // 2026 년 미국 DST 시작: 2026-03-08 02:00 (PST → PDT). 이후 여름 내내 -7h.
    const beforeDst = new Date('2026-03-01T12:00:00Z') // 아직 PST
    const afterDst = new Date('2026-03-15T12:00:00Z') // 이미 PDT
    expect(getTimezoneOffsetMs('America/Los_Angeles', beforeDst)).toBe(
      -8 * 60 * 60 * 1000
    )
    expect(getTimezoneOffsetMs('America/Los_Angeles', afterDst)).toBe(
      -7 * 60 * 60 * 1000
    )
  })
})

describe('zonedDateToUtc', () => {
  it('Asia/Seoul 00:00 은 UTC 로 전날 15:00 이다', () => {
    const result = zonedDateToUtc('Asia/Seoul', 2026, 4, 20, 0, 0, 0)
    expect(result.toISOString()).toBe('2026-04-19T15:00:00.000Z')
  })

  it('UTC 입력은 변환 없이 그대로다', () => {
    const result = zonedDateToUtc('UTC', 2026, 4, 19, 9, 30, 0)
    expect(result.toISOString()).toBe('2026-04-19T09:30:00.000Z')
  })

  it('America/Los_Angeles 여름(PDT) 00:00 은 같은 날 07:00 UTC 이다', () => {
    const result = zonedDateToUtc('America/Los_Angeles', 2026, 7, 4, 0, 0, 0)
    expect(result.toISOString()).toBe('2026-07-04T07:00:00.000Z')
  })

  it('America/Los_Angeles 겨울(PST) 00:00 은 같은 날 08:00 UTC 이다', () => {
    const result = zonedDateToUtc('America/Los_Angeles', 2026, 1, 15, 0, 0, 0)
    expect(result.toISOString()).toBe('2026-01-15T08:00:00.000Z')
  })
})

describe('computeTodayStartUtc', () => {
  it('한국 사용자: UTC 14:00 시점의 오늘(KST) 시작은 같은 UTC 날짜 15:00 전', () => {
    // KST 로는 2026-04-19 23:00. 가장 최근 KST 자정 = 2026-04-19 00:00 KST = 2026-04-18 15:00 UTC.
    const now = new Date('2026-04-19T14:00:00Z')
    const result = computeTodayStartUtc('Asia/Seoul', now)
    expect(result.toISOString()).toBe('2026-04-18T15:00:00.000Z')
  })

  it('UTC 00:01 시점 한국 사용자는 이미 당일 오전이므로 오늘 시작 = 전날 15:00 UTC', () => {
    // UTC 00:01 → KST 09:01. 이 순간의 "오늘 자정" = KST 2026-04-19 00:00 = UTC 2026-04-18 15:00.
    const now = new Date('2026-04-19T00:01:00Z')
    const result = computeTodayStartUtc('Asia/Seoul', now)
    expect(result.toISOString()).toBe('2026-04-18T15:00:00.000Z')
  })

  it('LA 사용자(PDT): UTC 05:00 시점엔 아직 어제 밤 22:00 이므로 오늘 시작 = 어제 07:00 UTC', () => {
    // UTC 2026-04-19 05:00 → LA 로 2026-04-18 22:00 PDT. 오늘 자정(LA) = 2026-04-18 00:00 PDT = 2026-04-18 07:00 UTC.
    const now = new Date('2026-04-19T05:00:00Z')
    const result = computeTodayStartUtc('America/Los_Angeles', now)
    expect(result.toISOString()).toBe('2026-04-18T07:00:00.000Z')
  })

  it('UTC 타임존 사용자: 오늘 시작은 그대로 그 날 00:00 UTC', () => {
    const now = new Date('2026-04-19T12:34:56Z')
    const result = computeTodayStartUtc('UTC', now)
    expect(result.toISOString()).toBe('2026-04-19T00:00:00.000Z')
  })
})

describe('computeTodayDateString — R3 rollover_logs PK 키 계산', () => {
  // 이 문자열이 곧 `rollover_logs.rolled_at` (DATE 타입) 의 값으로 들어간다.
  // 같은 UTC 물리 시각이라도 사용자 timezone 마다 다른 "오늘" 이 나와야 하므로 핵심 경계 케이스를 커버한다.

  it('한국 사용자: UTC 00:00 은 이미 KST 09:00 이라 오늘 날짜가 나온다', () => {
    const now = new Date('2026-04-19T00:00:00Z')
    expect(computeTodayDateString('Asia/Seoul', now)).toBe('2026-04-19')
  })

  it('한국 사용자: UTC 14:59 까지는 여전히 같은 KST 날짜 (자정 전)', () => {
    const now = new Date('2026-04-19T14:59:00Z')
    // KST 로 2026-04-19 23:59 → 여전히 2026-04-19
    expect(computeTodayDateString('Asia/Seoul', now)).toBe('2026-04-19')
  })

  it('한국 사용자: UTC 15:00 부터는 다음 날로 넘어간다 (KST 자정 경계)', () => {
    const now = new Date('2026-04-19T15:00:00Z')
    // KST 로 2026-04-20 00:00 → 2026-04-20
    expect(computeTodayDateString('Asia/Seoul', now)).toBe('2026-04-20')
  })

  it('UTC 사용자는 UTC 날짜 그대로', () => {
    const now = new Date('2026-04-19T23:59:59Z')
    expect(computeTodayDateString('UTC', now)).toBe('2026-04-19')
  })

  it('LA 사용자(PDT): UTC 05:00 은 아직 전날 밤 22:00', () => {
    const now = new Date('2026-04-19T05:00:00Z')
    // LA 로 2026-04-18 22:00 PDT → 2026-04-18
    expect(computeTodayDateString('America/Los_Angeles', now)).toBe('2026-04-18')
  })
})

describe('shiftDueAtToToday', () => {
  it('한국 21:00 태스크를 어제→오늘로 이월하면 같은 21:00(KST) 으로 유지된다', () => {
    // 원 due_at: 2026-04-18 21:00 KST = 2026-04-18 12:00 UTC
    const original = new Date('2026-04-18T12:00:00Z')
    // 현재: 2026-04-19 14:00 UTC = 2026-04-19 23:00 KST → 오늘(KST) = 2026-04-19
    const now = new Date('2026-04-19T14:00:00Z')
    const result = shiftDueAtToToday(original, 'Asia/Seoul', now)
    // 기대: 2026-04-19 21:00 KST = 2026-04-19 12:00 UTC
    expect(result.toISOString()).toBe('2026-04-19T12:00:00.000Z')
  })

  it('UTC 사용자: 시분초만 보존하고 날짜만 갱신된다', () => {
    const original = new Date('2026-04-17T09:30:15Z')
    const now = new Date('2026-04-19T23:59:59Z')
    const result = shiftDueAtToToday(original, 'UTC', now)
    expect(result.toISOString()).toBe('2026-04-19T09:30:15.000Z')
  })

  it('LA 사용자 PST→PDT DST 경계를 넘어도 로컬 시각이 유지된다', () => {
    // 원 due_at: 2026-03-07 10:00 PST = 2026-03-07 18:00 UTC (PST = UTC-8)
    const original = new Date('2026-03-07T18:00:00Z')
    // 현재: 2026-03-15 18:00 UTC = 2026-03-15 11:00 PDT → 오늘(LA) = 2026-03-15
    const now = new Date('2026-03-15T18:00:00Z')
    const result = shiftDueAtToToday(original, 'America/Los_Angeles', now)
    // 기대: 2026-03-15 10:00 PDT (PDT = UTC-7) = 2026-03-15 17:00 UTC
    expect(result.toISOString()).toBe('2026-03-15T17:00:00.000Z')
  })
})
