import type { GoogleCalClient } from '@/lib/google-cal/client'

// ============================================================================
// Google Calendar events.list 래퍼 (Phase 3 - G2)
// ============================================================================
// - 역할: G1 의 `GoogleCalClient.fetch` 를 소비해 primary 캘린더의 특정 기간
//   이벤트를 pageToken 루프로 전부 수집한다.
// - 전체 캘린더 루트(`/users/me/calendarList`) 는 절대 호출하지 않는다. 설계 §8-3 에 따라
//   v1 은 primary(= 로그인 계정) 캘린더만 읽는다. 추후 멀티 캘린더가 필요해지면
//   calendarId 파라미터를 인자로 올려 받는 수준의 최소 변경으로 확장 가능.
// - 반복 이벤트는 클라이언트가 수동으로 풀지 않는다(`RRULE` 파서 복잡도 회피). `singleEvents=true`
//   로 서버가 이미 전개(expanded)된 개별 인스턴스를 돌려주도록 한다.
// - `maxResults=250` 은 Google 의 페이지당 상한에 맞춘 명시값. 기본값(250)과 같지만 문서화 목적.
// - 페이지네이션: 응답의 `nextPageToken` 이 비어있을 때까지 `pageToken` 을 실어 재요청.
//   같은 토큰이 반복되는 병리적 응답은 무한 루프 방지 가드로 즉시 throw.
// - 인증/토큰 refresh/401 재시도 로직은 전부 G1 의 클라이언트가 책임진다. 이 모듈은 순수하게
//   "URL 조립 + 페이지 루프 + 응답 병합" 만 수행해 단위 테스트 가능성을 극대화한다.
// ============================================================================

const EVENTS_ENDPOINT =
  'https://www.googleapis.com/calendar/v3/calendars/primary/events'
// Google Calendar API v3 페이지당 최대 결과 수. 설계 G2 요구치와 동일.
const MAX_RESULTS_PER_PAGE = 250

/**
 * Google Calendar API 의 이벤트 리소스. v1 에서 소비하는 필드만 얇게 얹고,
 * 알려지지 않은 필드는 index signature 로 흘려보낸다 — 전체 스키마를 중복 정의해 유지보수 부담을
 * 만드는 대신 "실제로 꺼내 쓰는 필드만 타입 안전" 전략.
 *
 * 참고: https://developers.google.com/calendar/api/v3/reference/events
 */
export interface GoogleCalendarEvent {
  id: string
  summary?: string
  description?: string
  location?: string
  status?: 'confirmed' | 'tentative' | 'cancelled' | string
  // start/end 는 종일 이벤트(`date`)와 시각 지정 이벤트(`dateTime`)가 공존 — union 대신 옵셔널로 표현.
  start?: { date?: string; dateTime?: string; timeZone?: string }
  end?: { date?: string; dateTime?: string; timeZone?: string }
  htmlLink?: string
  colorId?: string
  [key: string]: unknown
}

/**
 * Google API events.list 1페이지 응답의 subset. `items` / `nextPageToken` 만 필요.
 * 그 외 필드(summary, timezone, accessRole 등) 는 사용하지 않으므로 캡처하지 않는다.
 */
interface EventsListPage {
  items?: GoogleCalendarEvent[]
  nextPageToken?: string
}

export interface ListCalendarEventsOptions {
  /** 가져올 범위의 시작 (inclusive). Date 로 받아 내부에서 RFC3339(`toISOString`) 로 직렬화. */
  timeMin: Date
  /** 가져올 범위의 끝 (exclusive). `timeMin` 보다 뒤여야 한다. */
  timeMax: Date
}

/**
 * primary 캘린더의 `[timeMin, timeMax)` 구간 이벤트를 전부 수집해 반환한다.
 *
 * 호출 규약:
 *  - 네트워크 호출은 주입된 `client.fetch` 로 일원화 — Bearer 헤더/401 재시도/revoked 승격은 G1 담당.
 *  - 응답이 200 이 아니면 status 를 포함한 Error 를 throw (호출자가 로깅/재시도 정책 결정).
 *  - `client.fetch` 자체가 throw 하는 예외(예: `GoogleAuthRevokedError`) 는 손대지 않고 전파.
 *  - 입력이 `timeMin >= timeMax` 면 네트워크로 나가지 않고 즉시 throw — Google 이 어차피 400 을
 *    돌려주지만, 실수 가드를 상위에 두는 편이 호출자 입장에서 더 명확하다.
 *
 * 페이지 루프:
 *  - 첫 호출은 `pageToken` 없이, 이후 호출은 직전 응답의 `nextPageToken` 을 실어 재요청.
 *  - `nextPageToken` 이 직전 pageToken 과 동일하면 서버가 잘못 응답한 것이므로 즉시 throw.
 *    (무한 루프 + 과금 방지. 정상 Google 응답에서는 절대 발생하지 않는 경로.)
 */
export async function listCalendarEvents(
  client: GoogleCalClient,
  options: ListCalendarEventsOptions
): Promise<GoogleCalendarEvent[]> {
  const { timeMin, timeMax } = options

  // 방어적 입력 가드 — Date.prototype.getTime 비교로 Invalid Date 도 함께 검증.
  if (
    !(timeMin instanceof Date) ||
    !(timeMax instanceof Date) ||
    Number.isNaN(timeMin.getTime()) ||
    Number.isNaN(timeMax.getTime())
  ) {
    throw new Error('timeMin 과 timeMax 는 유효한 Date 객체여야 합니다.')
  }
  if (timeMin.getTime() >= timeMax.getTime()) {
    throw new Error(
      `유효하지 않은 범위입니다: timeMin(${timeMin.toISOString()}) 이 timeMax(${timeMax.toISOString()}) 보다 앞서야 합니다.`
    )
  }

  // 각 페이지마다 변하지 않는 파라미터는 한 번 계산해두고 pageToken 만 덧붙인다.
  const baseParams: Record<string, string> = {
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: 'true',
    maxResults: String(MAX_RESULTS_PER_PAGE),
  }

  const collected: GoogleCalendarEvent[] = []
  let pageToken: string | undefined

  // while(true) 대신 명시적 종료 조건을 두 개 유지:
  //  1) nextPageToken 이 비어있으면 정상 종료
  //  2) 동일 pageToken 재등장은 서버 버그로 간주하고 throw
  //     (추가: 1만 번 이상 루프는 안전망으로 abort — 정상 Google 응답에서는 도달 불가.)
  let loopSafetyCounter = 0
  for (;;) {
    loopSafetyCounter += 1
    if (loopSafetyCounter > 10000) {
      throw new Error(
        'Google Calendar events 페이지네이션이 과도하게 반복되었습니다 (안전망 초과).'
      )
    }

    const url = buildEventsUrl(baseParams, pageToken)
    const response = await client.fetch(url)
    if (!response.ok) {
      // 본문은 베스트 에포트 — JSON 아니어도 디버깅 단서는 status 만으로 충분.
      const rawBody = await response.text().catch(() => '')
      throw new Error(
        `Google Calendar events.list 실패: status=${response.status} body=${rawBody.slice(0, 200)}`
      )
    }
    const page = (await response.json()) as EventsListPage
    if (page.items && page.items.length > 0) {
      // push(...items) 는 스프레드 스택 오버플로(~100k+) 위험이 있어 for-of 로 안전하게 누적.
      for (const item of page.items) collected.push(item)
    }

    const nextToken = page.nextPageToken
    if (!nextToken) break
    if (nextToken === pageToken) {
      throw new Error(
        `Google Calendar events 응답에서 동일한 pageToken(${nextToken}) 이 반복되었습니다.`
      )
    }
    pageToken = nextToken
  }

  return collected
}

/**
 * base 파라미터 + (선택적) pageToken 으로 최종 URL 을 조립한다.
 * URLSearchParams 를 그대로 직렬화해 키 순서/인코딩이 안정적으로 재현되도록 한다.
 */
function buildEventsUrl(
  baseParams: Record<string, string>,
  pageToken: string | undefined
): string {
  const params = new URLSearchParams(baseParams)
  if (pageToken) params.set('pageToken', pageToken)
  return `${EVENTS_ENDPOINT}?${params.toString()}`
}
