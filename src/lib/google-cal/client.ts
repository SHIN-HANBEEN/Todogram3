import { eq } from 'drizzle-orm'

import { db } from '@/db'
import { users } from '@/db/schema'
import { env } from '@/env'
import { decrypt } from '@/lib/crypto'

// ============================================================================
// Google Calendar API 클라이언트 (Phase 3 - G1 + G4)
// ============================================================================
// - Google Calendar API 호출을 감싸는 얇은 fetch 래퍼.
//     * access_token 캐시가 유효하면 그대로 사용
//     * 캐시가 비어 있거나 만료(skew 이내)면 refresh_token 으로 새 access_token 발급
//     * 호출 결과가 401 이면 한 번만 refresh 후 재시도 — "토큰이 지금 막 revoke" 된 상태 대응
//     * refresh 응답이 invalid_grant 면 GoogleAuthRevokedError 를 throw + onRevoked 훅 호출
// - `googleapis` 패키지를 직접 사용하는 대신 token endpoint 를 손수 호출하는 이유:
//     1) v1 은 refresh 프로토콜 + 재시도 루프 + DB 쓰기 타이밍만 정확히 제어하면 충분해
//        googleapis 의 OAuth2Client(~수십 KB) 를 전부 끌어들일 이유가 없다.
//     2) 손수 호출하면 httpFetch 를 DI 로 주입 → 테스트에서 Google 서버를 전혀 건드리지 않음.
//     3) G2(events.list) 단계에서 googleapis 를 추가해야 할 때, 이 클라이언트가 발급한
//        access_token 을 googleapis 의 `google.auth.OAuth2` 에 주입하는 방식으로 자연 연결된다.
// - G4 (401 revoked → users.google_auth_status = 'revoked' 전이) 는 이 파일의
//   `getGoogleCalClientForUser` 가 wire 하는 `onRevoked` 훅에서 직접 DB 업데이트를
//   수행한다 (아래 상세). 훅 실패는 상위 GoogleAuthRevokedError 전파를 절대 가로막지 않는다.
// ============================================================================

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
// Google 서버와 우리 서버 간 시계 편차를 흡수하기 위한 여유(초). expires_at 이 이 범위 안에 들어오면
// 이미 만료된 것으로 간주하고 선제적으로 refresh 한다. 60초는 NTP 환경에서 충분히 큰 여유.
const EXPIRY_SKEW_SECONDS = 60

/**
 * Google 측이 이 refresh_token 을 더 이상 인정하지 않을 때 throw 되는 도메인 에러.
 * 호출자(Server Action / API Route) 는 이 에러를 잡아 UI 에 "재로그인" 을 유도해야 한다.
 */
export class GoogleAuthRevokedError extends Error {
  constructor(
    message = 'Google 인증이 해제되었습니다. 재로그인이 필요합니다.'
  ) {
    super(message)
    this.name = 'GoogleAuthRevokedError'
  }
}

/**
 * access_token 캐시 + refresh_token 로딩 + revoke 훅을 책임지는 저장소 인터페이스.
 *
 * 이 추상화의 목적:
 *  - 순수 refresh/retry 로직(client)과 DB/메모리 상태 관리(store)를 분리해 단위 테스트 용이성 확보.
 *  - 실서버 경로는 `getGoogleCalClientForUser` 가 DB + 모듈-레벨 Map 캐시로 이 인터페이스를 구현한다.
 */
export interface TokenStore {
  /** 현재 캐시된 access_token + 만료시각(Unix 초). 없으면 null. */
  getCachedAccessToken(): { token: string; expiresAt: number } | null
  /** DB 에서 복호화한 refresh_token 을 비동기로 반환. 없거나 손상되었으면 throw. */
  loadRefreshToken(): Promise<string>
  /** 새 access_token 을 캐시에 저장. DB 가 아니라 메모리 캐시 권장(토큰은 1시간 휘발성). */
  saveAccessToken(tokens: { token: string; expiresAt: number }): Promise<void>
  /** refresh 응답이 invalid_grant 일 때 호출. G4 에서 users.google_auth_status='revoked' 로 전이. */
  onRevoked(): Promise<void>
}

/** Google Calendar API 호출의 최종 사용자 인터페이스 — fetch 와 시그니처 동일. */
export interface GoogleCalClient {
  fetch(url: string, init?: RequestInit): Promise<Response>
}

interface CreateGoogleCalClientOptions {
  store: TokenStore
  /** 외부 HTTP 호출 주입. 기본값은 전역 fetch. 테스트에서 vi.fn() 으로 대체. */
  httpFetch?: typeof fetch
  /** 현재 시각(밀리초). 기본값은 Date.now. 테스트에서 고정 시각 주입. */
  now?: () => number
}

/**
 * Google OAuth 2.0 token endpoint 에 refresh POST 를 보내고 access_token 을 반환.
 *
 * 성공 시 반환값은 `{ accessToken, expiresAt }` 로 저장소에 위임되고,
 * invalid_grant 응답은 GoogleAuthRevokedError 로 승격한다. 그 외 오류(5xx, 네트워크) 는
 * 일반 Error 로 던져서 호출자가 재시도/회로차단을 결정할 수 있게 한다.
 *
 * @param refreshToken 복호화된 Google refresh_token
 * @param httpFetch 주입된 fetch — 테스트에서는 mock, 실서버에서는 global fetch
 * @param now 현재 시각 source (ms). expires_at 계산에 사용.
 */
async function exchangeRefreshToken(
  refreshToken: string,
  httpFetch: typeof fetch,
  now: () => number
): Promise<{ token: string; expiresAt: number }> {
  // RFC6749 §6 — refresh_token grant. 표준 form-urlencoded 포맷.
  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  })

  const response = await httpFetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  // 실패 응답 처리 — 본문 파싱은 베스트 에포트(JSON 아닐 수 있음).
  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as {
      error?: string
      error_description?: string
    } | null

    // invalid_grant 는 Google 이 이 refresh_token 을 더 이상 받지 않는다는 신호.
    //  * 사용자가 Google 계정 화면에서 앱 권한을 직접 취소
    //  * 6개월 이상 미사용으로 자연 소멸
    //  * 동일 client 에서 refresh_token 이 교체되어 구버전 무효화
    // 어떤 경우든 재로그인이 유일한 복구 경로라 revoked 상태로 승격한다.
    if (errorBody?.error === 'invalid_grant') {
      throw new GoogleAuthRevokedError()
    }

    // 그 외 오류(5xx, 임시 네트워크 장애, quota 초과 등) — revoked 로 오진하면 사용자가
    // 연쇄적으로 재로그인 루프에 빠질 수 있으므로 일반 Error 로만 보고하고 상위 정책에 맡긴다.
    throw new Error(
      `Google token refresh 실패: ${response.status} ${errorBody?.error ?? ''}`.trim()
    )
  }

  const payload = (await response.json()) as {
    access_token: string
    expires_in: number
    token_type?: string
    scope?: string
  }

  // Google 응답의 expires_in 은 "지금으로부터 N초" 상대시간. 절대시각(Unix 초)으로 환산해서
  // 저장 — 이후 캐시 적중 판단 시 `now/1000 < expiresAt - SKEW` 로 단순 비교 가능.
  const expiresAt = Math.floor(now() / 1000) + payload.expires_in
  return { token: payload.access_token, expiresAt }
}

/**
 * 순수 refresh/retry 래퍼. DB 접근은 전부 주입된 TokenStore 에 위임한다.
 *
 * 호출 흐름:
 *  1. 캐시된 access_token 이 있고 skew 여유 이상 남아 있으면 그대로 사용.
 *  2. 없거나 만료 임박이면 refresh → 저장소 업데이트 후 사용.
 *  3. API 응답이 401 이면 한 번만 추가 refresh 후 재시도 — 그 외 실패는 그대로 반환.
 *  4. refresh 자체가 invalid_grant 로 실패하면 onRevoked() 훅 호출 + GoogleAuthRevokedError throw.
 */
export function createGoogleCalClient(
  options: CreateGoogleCalClientOptions
): GoogleCalClient {
  const { store } = options
  const httpFetch = options.httpFetch ?? globalThis.fetch
  const now = options.now ?? (() => Date.now())

  /**
   * 캐시 적중이면 캐시 토큰, 아니면 refresh 결과를 반환. refresh 실패 경로는 예외로 상향.
   * onRevoked 훅은 invalid_grant 경우에만 정확히 한 번 호출되도록 여기서 한 곳에 집중.
   */
  async function ensureAccessToken(): Promise<string> {
    const cached = store.getCachedAccessToken()
    const nowSeconds = Math.floor(now() / 1000)
    if (cached && nowSeconds < cached.expiresAt - EXPIRY_SKEW_SECONDS) {
      return cached.token
    }
    return await performRefresh()
  }

  async function performRefresh(): Promise<string> {
    const refreshToken = await store.loadRefreshToken()
    try {
      const tokens = await exchangeRefreshToken(refreshToken, httpFetch, now)
      await store.saveAccessToken(tokens)
      return tokens.token
    } catch (err) {
      if (err instanceof GoogleAuthRevokedError) {
        // G4 훅 — DB 의 google_auth_status 를 'revoked' 로 전이하고 캐시 무효화.
        //   * await 로 대기해 훅 완료 후에만 상위로 예외 전파 — 상위가 UI 에 "재로그인" 을
        //     표시하는 시점에는 이미 DB 상태가 갱신되어 있어야 한다.
        //   * 훅 자체가 throw 하면 그 에러로 덮어쓰지 않고 원래 revoked 에러를 우선 전파.
        try {
          await store.onRevoked()
        } catch {
          // 훅 실패는 로깅 대상이지만 상위 호출자에게는 revoked 신호가 더 중요.
        }
      }
      throw err
    }
  }

  /**
   * Authorization 헤더만 Bearer 로 갈아끼운 새 init 객체를 만든다. 기존 headers 는 보존.
   * Headers 를 새로 만들어 반환해 caller 가 전달한 init 이 mutate 되지 않도록 한다.
   */
  function withBearerAuth(
    init: RequestInit | undefined,
    token: string
  ): RequestInit {
    const headers = new Headers(init?.headers)
    headers.set('authorization', `Bearer ${token}`)
    return { ...init, headers }
  }

  return {
    async fetch(url, init) {
      const token = await ensureAccessToken()
      const firstResponse = await httpFetch(url, withBearerAuth(init, token))
      if (firstResponse.status !== 401) {
        return firstResponse
      }
      // 401 — 캐시 토큰이 이미 서버에서 revoke 된 상태. 한 번만 refresh 후 재시도한다.
      // refresh 가 실패하면 예외가 그대로 전파되어 여기서 중단. 재시도도 401 이면 그대로 401 반환 —
      // 무한 루프 방지를 위해 절대 2회 이상 재시도하지 않는다.
      const refreshedToken = await performRefresh()
      return await httpFetch(url, withBearerAuth(init, refreshedToken))
    },
  }
}

// ============================================================================
// DB 기반 실서버 팩토리
// ============================================================================
// - 프로세스 단위 in-memory access_token 캐시 + users.google_refresh_token 복호화 + (G4 에서) DB 상태 전이.
// - access_token 은 최대 1시간 휘발성이라 DB 저장하지 않고 모듈-레벨 Map 에만 보관한다.
//   Vercel 같은 서버리스 환경에서 콜드 스타트마다 캐시가 비워지지만, 그 경우 한 번만 refresh 가 더
//   발생할 뿐이고 refresh_token 자체는 DB 에 있어 문제 없다.
// ============================================================================

// userId → 현재 프로세스의 캐시된 access_token. 서로 다른 세션/사용자 격리를 위해 key 는 DB PK.
const inMemoryAccessTokenCache = new Map<
  number,
  { token: string; expiresAt: number }
>()

/**
 * 지정된 사용자로 인증된 GoogleCalClient 를 만든다.
 *
 * 처리 순서:
 *  1. users 테이블에서 refresh_token / auth status 조회
 *  2. auth status 가 'active' 가 아니거나 refresh_token 이 비어있으면 GoogleAuthRevokedError 로 즉시 중단
 *     (이미 revoked 된 사용자에게 refresh 시도는 불필요한 API 호출 + invalid_grant 루프만 유발)
 *  3. AES-256-GCM 복호화
 *  4. in-memory 캐시 + DB 전이 훅(G4)을 연결해 createGoogleCalClient 에 위임
 *
 * G4 — `onRevoked` 훅 책임:
 *  - Google 이 refresh_token 을 invalid_grant 로 거부하면 해당 유저는 재로그인 전까지 복구 불가.
 *  - 이 훅에서 `users.google_auth_status = 'revoked'` 업데이트 + 메모리 캐시 무효화를 동시에 수행.
 *  - DB 실패는 swallow — 상위 `GoogleAuthRevokedError` 가 호출자(UI) 에 도달하는 게 최우선.
 *    (DB 업데이트 실패 시에도 호출자는 "재로그인 필요" 신호를 받아야 한다. 다음 요청에서
 *     `loadRefreshToken` → 또 invalid_grant → 다시 이 훅이 호출 → 또 업데이트 시도 사이클이라
 *     결국 한 번은 DB 에도 반영될 기회가 있음.)
 */
export async function getGoogleCalClientForUser(
  userId: number
): Promise<GoogleCalClient> {
  const [user] = await db
    .select({
      id: users.id,
      googleRefreshToken: users.googleRefreshToken,
      googleAuthStatus: users.googleAuthStatus,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!user) {
    throw new Error(`사용자를 찾을 수 없습니다: userId=${userId}`)
  }
  if (user.googleAuthStatus !== 'active' || !user.googleRefreshToken) {
    // 이미 revoked/expired 상태면 리프레시를 시도하지 말고 곧바로 재로그인 유도.
    throw new GoogleAuthRevokedError()
  }

  const refreshToken = decrypt(user.googleRefreshToken)

  return createGoogleCalClient({
    store: {
      getCachedAccessToken: () => inMemoryAccessTokenCache.get(userId) ?? null,
      loadRefreshToken: async () => refreshToken,
      saveAccessToken: async tokens => {
        inMemoryAccessTokenCache.set(userId, tokens)
      },
      onRevoked: async () => {
        // ---- G4: Google 측 refresh_token 이 invalid_grant → "영구 거부" 상태 전이 ----
        // (1) 캐시 무효화 먼저 — 같은 프로세스의 후속 요청이 stale access_token 으로
        //     계속 401 → refresh 루프를 돌지 않도록 즉시 비워둔다.
        inMemoryAccessTokenCache.delete(userId)
        // (2) DB 에 revoked 기록. 호출자(UI) 가 다음 렌더에서 `google_auth_status` 를 조회해
        //     재로그인 플로우로 넘어갈 수 있도록 한다.
        //     - set 에 들어가는 객체는 users 스키마의 컬럼 이름(drizzle camelCase) 과 정확히 일치해야 한다.
        //     - where 절이 없으면 테이블 전체 업데이트로 터질 위험이 있어 반드시 `eq(users.id, userId)` 고정.
        await db
          .update(users)
          .set({ googleAuthStatus: 'revoked' })
          .where(eq(users.id, userId))
        // 참고: G3 의 per-consumer event cache(`createEventCache`) clear 는 이 시점에 수행하지 않는다 —
        // 이벤트 캐시는 U1 Calendar View 가 컴포넌트 상태로 소유하는 인스턴스라 여기서 참조 경로가 없다.
        // U1 은 GoogleAuthRevokedError 를 catch 해 자체적으로 `cache.clear()` 를 호출하도록 조립한다.
      },
    },
  })
}

// 테스트에서 프로세스간 상태 격리가 필요할 때만 쓰는 헬퍼. 실서버 코드에서는 호출하지 않는다.
export function __clearInMemoryAccessTokenCacheForTests(): void {
  inMemoryAccessTokenCache.clear()
}
