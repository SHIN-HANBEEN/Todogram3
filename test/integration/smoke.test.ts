// ============================================================================
// 통합 테스트 smoke check (Phase 0 - F3)
// ============================================================================
// - 통합 테스트는 DB·외부 API·NextAuth 같은 실제 의존성을 함께 사용해 round-trip 을 검증한다.
// - F3 단계에서는 아직 그런 인프라가 준비되지 않았으므로 "스키마 모듈이 import 가능한가" 만
//   확인해 두고, Phase 2(D1/D2/D3) 에서 실제 DB 연결 테스트를 채워 넣는다.
// - 이 파일이 통과한다는 것은 alias(`@/db/schema`) 가 정상 해석되고, Drizzle 스키마 정의에
//   순환참조·런타임 에러가 없다는 뜻이다.
// ============================================================================

import { describe, expect, it } from 'vitest'

import * as schema from '@/db/schema'

describe('integration smoke', () => {
  // Drizzle 스키마 배럴이 5개의 핵심 테이블 정의를 모두 export 하는지 확인.
  // 새 테이블이 추가/제거되면 이 테스트가 알려준다.
  it('Drizzle 스키마 배럴이 핵심 테이블 정의를 모두 export 한다', () => {
    expect(schema).toHaveProperty('users')
    expect(schema).toHaveProperty('labels')
    expect(schema).toHaveProperty('tasks')
    expect(schema).toHaveProperty('taskLabels')
    expect(schema).toHaveProperty('rolloverLogs')
  })
})
