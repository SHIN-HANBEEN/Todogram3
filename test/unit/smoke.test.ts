// ============================================================================
// 단위 테스트 smoke check (Phase 0 - F3)
// ============================================================================
// - Vitest 가 정상 부팅되고, jsdom 환경 + jest-dom matcher 가 등록되었는지 확인.
// - 실제 비즈니스 로직 검증은 Phase 2(D1/D2/D3) 부터 본격적으로 추가한다.
// ============================================================================

import { describe, expect, it } from 'vitest'

describe('unit smoke', () => {
  // 1. vitest 자체가 잘 도는지 (가장 기본적인 sanity check)
  it('산술 연산이 정상적으로 동작한다', () => {
    expect(1 + 1).toBe(2)
  })

  // 2. jsdom 환경이 활성화되어 document API 가 살아있는지 확인.
  //    이게 깨지면 React Testing Library 기반 컴포넌트 테스트가 전부 무용지물.
  it('jsdom document 가 사용 가능하다', () => {
    const div = document.createElement('div')
    div.textContent = '안녕'
    expect(div.textContent).toBe('안녕')
  })
})
