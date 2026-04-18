import { auth } from '@/lib/auth'

// ============================================================================
// 서버 사이드 세션 헬퍼 (Phase 2 - D1)
// ============================================================================
// - Server Action / Route Handler / Server Component 에서 "현재 로그인된 사용자의
//   DB id" 가 반드시 필요한 경로의 표준 진입점.
// - `auth()` 를 직접 호출하던 코드를 이 헬퍼로 모아두는 이유:
//     1) ownership 가드(`WHERE user_id = ?`) 누락 방지 — 모든 액션이 이 함수만
//        호출하도록 강제하면, 익명 요청에서 쿼리가 실행되는 사고를 한 곳에서 차단할 수 있다.
//     2) 미인증 분기를 일관된 Error 메시지로 throw — UI 가 catch 해 재로그인 유도하는
//        패턴이 단일 형태를 유지한다.
//     3) 후속 v1.5/v2 에서 RBAC/플랜 정보가 추가되더라도 헬퍼만 확장하면 된다.
// ============================================================================

/**
 * 인증 실패를 표현하는 전용 에러. UI 레이어가 catch 해 401 응답이나 재로그인
 * 모달 트리거 등으로 처리할 수 있도록 일반 Error 와 구분한다.
 */
export class UnauthenticatedError extends Error {
  constructor(message = '인증되지 않았습니다. 로그인 후 다시 시도하세요.') {
    super(message)
    this.name = 'UnauthenticatedError'
  }
}

/**
 * 현재 세션의 DB 사용자 PK(`users.id`) 를 반환한다.
 * - 세션이 없거나 token.userId 가 비어 있으면 즉시 throw → 호출자 입장에서는 항상 number.
 * - auth.ts 의 jwt 콜백이 최초 로그인 + stale JWT backfill 시점에 userId 를 채우므로,
 *   정상 로그인 흐름을 거친 사용자라면 이 함수는 매번 number 를 반환한다.
 */
export async function requireUserId(): Promise<number> {
  const session = await auth()
  const userId = session?.dbUserId
  if (typeof userId !== 'number' || !Number.isInteger(userId) || userId <= 0) {
    throw new UnauthenticatedError()
  }
  return userId
}
