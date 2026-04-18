import { describe, expect, it } from 'vitest'

import {
  isValidTimeZone,
  TZ_COOKIE_MAX_AGE_SECONDS,
  TZ_COOKIE_NAME,
} from '@/lib/timezone'

// ============================================================================
// timezone.ts 테스트 (Phase 1 - A4)
// ============================================================================
// - 브라우저에서 수집된 TZ 쿠키 값이 서버 측 JWT 콜백에서 DB 로 흘러가기 전
//   최소한의 안전망으로 통과시키기 위한 검증 함수 커버리지.
// - 핵심 관심사:
//     1) 정상적인 IANA 식별자(대륙/도시) 통과.
//     2) UTC / Etc/UTC / Etc/GMT+9 처럼 slash 없는·+부호 포함 변형도 통과.
//     3) 누락(null/undefined/빈 문자열) · 비문자열 · 무의미 문자열 · 과도한 길이 · 제어문자 거절.
//     4) 상수 값(쿠키 이름/TTL) 이 소스와 일치해 컴포넌트 ↔ 서버 계약이 깨지지 않음을 보장.
// - 이 함수는 DB 저장 직전 "게이트" 역할이므로 False positive 가 더 위험하다.
//   그래서 경계 케이스(과도한 길이, 비정상 문자) 를 명시적으로 거절하는지 확인한다.
// ============================================================================

describe('isValidTimeZone', () => {
  it('표준 IANA 대륙/도시 식별자를 통과시킨다', () => {
    expect(isValidTimeZone('Asia/Seoul')).toBe(true)
    expect(isValidTimeZone('America/Los_Angeles')).toBe(true)
    expect(isValidTimeZone('Europe/London')).toBe(true)
    expect(isValidTimeZone('Australia/Sydney')).toBe(true)
  })

  it('UTC / Etc 계열 식별자도 통과시킨다', () => {
    expect(isValidTimeZone('UTC')).toBe(true)
    expect(isValidTimeZone('Etc/UTC')).toBe(true)
  })

  it('문자열이 아니거나 비어 있으면 거절한다', () => {
    expect(isValidTimeZone(undefined)).toBe(false)
    expect(isValidTimeZone(null)).toBe(false)
    expect(isValidTimeZone('')).toBe(false)
    expect(isValidTimeZone('   ')).toBe(false)
    expect(isValidTimeZone(42)).toBe(false)
    expect(isValidTimeZone({})).toBe(false)
  })

  it('IANA 목록에 없는 임의 문자열을 거절한다', () => {
    expect(isValidTimeZone('Not_A/Real_Zone')).toBe(false)
    expect(isValidTimeZone('Asia/Neverland')).toBe(false)
    expect(isValidTimeZone('banana')).toBe(false)
  })

  it('허용 문자셋을 벗어난 값(공백/세미콜론/스크립트) 을 거절한다', () => {
    // 쿠키 헤더 인젝션 시도를 모사 — 서버에서 DB 로 흘리면 안 된다.
    expect(isValidTimeZone('Asia/Seoul; DROP TABLE users;')).toBe(false)
    expect(isValidTimeZone('<script>alert(1)</script>')).toBe(false)
    expect(isValidTimeZone('Asia Seoul')).toBe(false)
  })

  it('과도하게 긴 입력(64자 초과)을 거절한다', () => {
    const tooLong = 'A'.repeat(65)
    expect(isValidTimeZone(tooLong)).toBe(false)
  })
})

describe('timezone 공용 상수', () => {
  it('쿠키 이름은 앱 네임스페이스를 가진 짧은 식별자', () => {
    // 쿠키 이름이 바뀌면 LoginForm(쿠키 writer) 과 auth.ts(쿠키 reader) 가 어긋난다.
    // 이 테스트가 계약을 잠가 둬서 한쪽만 실수로 바뀌는 사고를 방지.
    expect(TZ_COOKIE_NAME).toBe('td_tz')
  })

  it('쿠키 TTL 은 OAuth 왕복을 커버할 수 있는 수 분 단위', () => {
    // 너무 짧으면 Google 인증 중 만료, 너무 길면 세션 누수 위험 → 60~600초 범위로 고정.
    expect(TZ_COOKIE_MAX_AGE_SECONDS).toBeGreaterThanOrEqual(60)
    expect(TZ_COOKIE_MAX_AGE_SECONDS).toBeLessThanOrEqual(600)
  })
})
