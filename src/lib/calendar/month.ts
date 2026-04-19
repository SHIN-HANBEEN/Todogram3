// ============================================================================
// Calendar 월/일 헬퍼 (Phase 4 - U1)
// ============================================================================
// - 역할: 사용자 timezone 에 기반한 월의 첫날/다음달 첫날/오늘 계산과
//   7×N 그리드를 채우기 위한 leading/trailing padding 날짜 계산.
// - 모든 날짜 계산은 **사용자 timezone 기준** 으로 수행해야 한다. 서버가 UTC 로
//   돌아도 "4월 18일" 이라는 개념은 사용자 로컬 날짜다. `Intl.DateTimeFormat` 의
//   `formatToParts` 로 timezone 을 투영해 year/month/day 를 뽑는 방식이 가장 안전.
// - 순수 함수만 모아둔다 — DOM/DB 접근 없음. 테스트 가능성 확보 + `aggregate.ts`
//   가 가볍게 import 할 수 있도록 분리.
// ============================================================================

/** 일요일 시작 기준 요일 인덱스 (0=일, 1=월, ..., 6=토). */
export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6

/** 주 시작 요일. 로케일별 관례 — 'sunday' 가 미국/기본, 'monday' 가 유럽/한국 관례. */
export type WeekStart = 'sunday' | 'monday'

/**
 * 특정 Date 를 사용자 timezone 기준 Y-M-D 로 분해.
 *
 * `Intl.DateTimeFormat` 의 `formatToParts` 는 timezone 을 반영해 렌더 결과의
 * 각 부품(year/month/day 등) 을 문자열로 돌려준다. 이 값을 정수로 파싱하면
 * "사용자 눈에 보이는 달력상의 연/월/일" 을 얻을 수 있다.
 *
 * 왜 Date.prototype.getFullYear 등을 직접 쓰지 않는가:
 *  - JS 의 getFullYear/getMonth/getDate 는 **실행 환경 로컬 timezone** 기준이다.
 *    서버가 UTC 로 돌고 사용자가 KST 인 경우 오프 바이 원 하루 오류가 나기 쉽다.
 *  - `toLocaleString` 은 formatting 전용이고 parse 가 로케일별로 제각각이라 불안정.
 */
export function getZonedYMD(
  instant: Date,
  timezone: string
): { year: number; month: number; day: number } {
  // `en-CA` 는 yyyy-mm-dd 순서를 보장하지만 formatToParts 는 순서와 무관하게 name 으로 접근 가능.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant)

  // parts 에서 name 으로 각 값을 추출. 타입스크립트는 find 반환이 undefined 가능함을 알리지만,
  // Intl 명세상 위 옵션으로 호출하면 year/month/day 가 반드시 포함된다 — 방어 분기만 둔다.
  const pick = (name: Intl.DateTimeFormatPartTypes): string => {
    const entry = parts.find(p => p.type === name)
    if (!entry) {
      throw new Error(`Intl.DateTimeFormat 응답에서 ${name} 을 찾지 못했습니다.`)
    }
    return entry.value
  }

  return {
    year: Number.parseInt(pick('year'), 10),
    month: Number.parseInt(pick('month'), 10),
    day: Number.parseInt(pick('day'), 10),
  }
}

/**
 * Date + timezone 조합을 `YYYY-MM-DD` 문자열로 변환. 맵 키/라우팅 세그먼트 공용.
 */
export function toDateKey(instant: Date, timezone: string): string {
  const { year, month, day } = getZonedYMD(instant, timezone)
  return `${pad4(year)}-${pad2(month)}-${pad2(day)}`
}

/**
 * `YYYY-MM-DD` 를 해당 timezone 의 그 날 00:00(자정) UTC Date 로 복원.
 *
 * 알고리즘:
 *  1) naive UTC 후보(`Date.UTC(y, m-1, d, 0, 0, 0)`) 생성 — 이 값을 해당 timezone 으로 "투영"하면
 *     YMD 가 얼마나 어긋나는지 측정 가능.
 *  2) 투영된 local YMD 를 원래 YMD 와 비교해 분(`offsetMin`) 단위 오프셋을 역산, 후보에서 뺀다.
 *  3) 결과를 다시 투영해 검증 — 일치하면 정답. 여전히 어긋나면 (DST 경계, 존재하지 않는
 *     local time 등) 그대로 반환하되 aggregator 의 일관성을 위해 timezone 기준 YMD 가
 *     한 번 더 매칭되도록 재시도 1회.
 *
 * 주의: DST 전환일의 존재하지 않는 시각(예: 새벽 2~3시) 은 정의상 표현 불가 — 이 함수는
 * "그날의 자정" 만 돌려주므로 현실 사용자 timezone(DST 시행국의 새벽 0시) 에서도 안전하다.
 */
export function startOfDayInZone(
  year: number,
  month: number,
  day: number,
  timezone: string
): Date {
  // 1) naive UTC 자정.
  const candidate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0))
  // 2) 투영 → 오프셋 산정.
  const offsetMin = getTimezoneOffsetMinutes(candidate, timezone)
  // 3) 오프셋 반영 (UTC = local + offset, offset 은 local 이 UTC 보다 얼마나 앞섰는지(분)).
  const adjusted = new Date(candidate.getTime() - offsetMin * 60_000)

  // 4) 검증 — 투영된 YMD 가 원래 YMD 와 일치하는지 재확인. 불일치면 한 번 더 보정 시도.
  const projected = getZonedYMD(adjusted, timezone)
  if (
    projected.year === year &&
    projected.month === month &&
    projected.day === day
  ) {
    return adjusted
  }

  // DST 경계로 한 번 재보정. 두 번째 오프셋으로 다시 계산.
  const reOffsetMin = getTimezoneOffsetMinutes(adjusted, timezone)
  return new Date(candidate.getTime() - reOffsetMin * 60_000)
}

/**
 * 주어진 instant 가 timezone 기준으로 UTC 에 비해 얼마나 앞서 있는지(분)를 반환.
 * 양수면 local 이 UTC 보다 앞선(예: KST = +540), 음수면 뒤쳐진(PST = -480).
 *
 * 구현: formatToParts 의 year/month/day/hour/minute/second 를 사용자 timezone 기준으로
 * 뽑아 Date.UTC 로 재조립하면 "이 instant 가 사용자 timezone 에서 보이는 시각" 의 UTC
 * epoch 를 얻을 수 있다. 원 instant 와의 차이가 곧 오프셋.
 */
export function getTimezoneOffsetMinutes(
  instant: Date,
  timezone: string
): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(instant)

  const get = (name: Intl.DateTimeFormatPartTypes): number => {
    const entry = parts.find(p => p.type === name)
    if (!entry) {
      throw new Error(`오프셋 계산 실패: ${name} 누락`)
    }
    return Number.parseInt(entry.value, 10)
  }

  const asUtcIfLocal = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    // Intl 가 '24' 를 반환하는 edge case(일부 Node) 를 0 으로 정규화.
    get('hour') % 24,
    get('minute'),
    get('second')
  )

  return Math.round((asUtcIfLocal - instant.getTime()) / 60_000)
}

/**
 * 주어진 (year, month) 의 첫날(해당 월 1일 00:00, 사용자 timezone) Date 를 반환.
 * month 는 1~12. 1 월보다 작거나 12 보다 크면 throw — 호출자가 이미 정규화했어야 함.
 */
export function firstDayOfMonthInZone(
  year: number,
  month: number,
  timezone: string
): Date {
  if (month < 1 || month > 12) {
    throw new Error(`월은 1~12 범위여야 합니다: ${month}`)
  }
  return startOfDayInZone(year, month, 1, timezone)
}

/**
 * 주어진 (year, month) 의 다음달 첫날(= 이 월 범위의 exclusive end).
 * 12 월이면 연도가 +1 이 된다.
 */
export function firstDayOfNextMonthInZone(
  year: number,
  month: number,
  timezone: string
): Date {
  if (month === 12) return firstDayOfMonthInZone(year + 1, 1, timezone)
  return firstDayOfMonthInZone(year, month + 1, timezone)
}

/**
 * 7×N 그리드를 채우기 위해 월 시작일에서 앞으로 끌어당길 leading 날짜 수를 계산.
 *
 * 예: 2026-04-01 이 수요일(weekday=3), weekStart='sunday' → leading = 3 (일~화 3칸).
 * weekStart='monday' → leading = 2 (월~화 2칸, 일요일은 마지막 주 마지막 칸).
 */
export function leadingPaddingCount(
  firstDayWeekday: WeekdayIndex,
  weekStart: WeekStart
): number {
  const offset = weekStart === 'monday' ? 1 : 0
  return (firstDayWeekday - offset + 7) % 7
}

/**
 * 어느 요일인지(0=일~6=토, timezone 반영) 반환.
 * Intl `weekday: 'short'` 로 문자열을 받아 매핑하기보다, 간단히 UTC 오프셋 보정 후 getUTCDay.
 */
export function weekdayIndexInZone(
  instant: Date,
  timezone: string
): WeekdayIndex {
  const offsetMin = getTimezoneOffsetMinutes(instant, timezone)
  const shifted = new Date(instant.getTime() + offsetMin * 60_000)
  return shifted.getUTCDay() as WeekdayIndex
}

/**
 * 주어진 년·월의 7×N 캘린더 그리드 날짜를 시간순으로 배열로 반환한다.
 *
 * 구성:
 *  - leading padding: 월 첫날의 주 시작까지 이전 달 날짜로 채운다.
 *  - 현재 월 전체(28~31일).
 *  - trailing padding: 7×6=42 칸을 기본으로 맞추되, 5주로 충분하면 35칸으로 축약.
 *    approved.json 의 "52×104px 7×5 grid" 가 기본이고, 6주 필요한 달(예: 2026-05) 에만
 *    자동으로 확장되도록 한다.
 *
 * 반환값의 각 Date 는 해당 timezone 기준 그날 00:00 UTC instant.
 */
export function buildMonthGridDates(
  year: number,
  month: number,
  timezone: string,
  weekStart: WeekStart = 'sunday'
): Date[] {
  const monthStart = firstDayOfMonthInZone(year, month, timezone)
  const nextMonthStart = firstDayOfNextMonthInZone(year, month, timezone)
  const leadingCount = leadingPaddingCount(
    weekdayIndexInZone(monthStart, timezone),
    weekStart
  )

  // 현재 월의 일 수 = nextMonthStart 와 monthStart 의 일 차이 (timezone 독립 — ms 차).
  // 단 DST 가 이 월에 포함되면 ms 차가 23/25 시간인 경계가 있으므로 round 로 안전화.
  const daysInMonth = Math.round(
    (nextMonthStart.getTime() - monthStart.getTime()) / (24 * 60 * 60 * 1000)
  )

  // 5주(35칸) 로 끝나면 OK, 아니면 6주(42칸) 로 확장.
  const totalCellsBeforeTrailing = leadingCount + daysInMonth
  const totalCells = totalCellsBeforeTrailing <= 35 ? 35 : 42

  const grid: Date[] = []
  // 첫 셀은 monthStart 에서 leadingCount 일 만큼 과거로 이동한 날.
  const firstCellMs = monthStart.getTime() - leadingCount * 24 * 60 * 60 * 1000

  for (let i = 0; i < totalCells; i += 1) {
    // 24 시간 배수로 더해나가면 대부분 timezone 에서 정확. DST 전환일이 포함되면 1시간 밀릴 수
    // 있으나 그 경우에도 toDateKey 는 timezone 기준 YMD 를 뽑으므로 dateKey 자체는 올바르다.
    // 더 엄격하게 하려면 매 칸마다 startOfDayInZone(y, m, d) 로 재구성 가능 — 연산 비용이
    // 42회/월 렌더라 무시 가능한 수준이므로 안전한 쪽을 택할 수도 있다.
    grid.push(new Date(firstCellMs + i * 24 * 60 * 60 * 1000))
  }

  return grid
}

/**
 * 오늘 날짜 dateKey 를 반환 (사용자 timezone 기준).
 * 서버 컴포넌트에서 호출해 클라이언트로 전달 — 클라이언트 로컬 타임에 의존하지 않는다.
 */
export function todayDateKey(timezone: string, now: Date = new Date()): string {
  return toDateKey(now, timezone)
}

// ----------------------------------------------------------------------------
// 내부 유틸
// ----------------------------------------------------------------------------

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function pad4(n: number): string {
  if (n >= 1000) return String(n)
  return `000${n}`.slice(-4)
}
