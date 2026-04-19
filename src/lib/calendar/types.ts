import type { Task } from '@/db/schema'
import type { GoogleCalendarEvent } from '@/lib/google-cal/events'
import type { LabelId } from '@/components/todogram/labels'

// ============================================================================
// Calendar 도메인 타입 (Phase 4 - U1)
// ============================================================================
// - 역할: Screen A(월 그리드) / Screen B(하루 상세) 가 공통으로 소비하는
//   "merged calendar item" 의 모양을 한 곳에 모아둔다.
// - 이 파일은 **순수 타입 + 헬퍼 상수** 만 포함 — 런타임 로직은 `aggregate.ts` 가
//   담당한다 (테스트 가능성 + 번들 크기 분리 목적).
// - DB tasks + Google Calendar events 를 "화면이 읽는 모양" 으로 정규화해,
//   컴포넌트 레이어가 원본 엔티티 스키마(컬럼명/ID 체계 불일치)를 의식하지 않도록 한다.
// ============================================================================

/**
 * 캘린더 아이템의 분류.
 *  - 'task' : Todogram 내부 태스크. 3-state 상태 전이 + 행 클릭 시 상세 진입.
 *  - 'event': 외부 Google Calendar 이벤트 (read-only). 상태 토글 불가 + 행 클릭 비활성.
 */
export type CalendarItemKind = 'task' | 'event'

/**
 * 3-state 태스크 상태. DB enum(`pending`/`in_progress`/`done`) 과 1:1.
 * - 외부 이벤트에는 적용되지 않으므로 `CalendarItem.kind === 'event'` 이면 undefined.
 * - UI 는 이 값 그대로 `TaskStatusIndicator` / `StatusCountBadge` 에 전달.
 */
export type TaskStatus = 'pending' | 'in_progress' | 'done'

/**
 * 캘린더 뷰가 소비하는 단일 아이템의 정규화된 형태.
 *
 * 설계 원칙:
 *  - `id` 는 렌더 key 용으로만 쓰이는 string. 내부 태스크는 `'task-${dbId}'`, 외부 이벤트는
 *    `'event-${googleEventId}'` 패턴으로 네임스페이스를 구분해 충돌 방지.
 *  - `originalId` 는 상태 토글/상세 진입 시 서버에 전달할 "원본 식별자".
 *    task 는 number(tasks.id), event 는 string(GoogleCalendarEvent.id).
 *  - `startAt` / `endAt` 는 항상 Date. 종일 이벤트는 `isAllDay: true` + 시간은 00:00 로
 *    정규화해 시간순 정렬 규칙이 단순해지도록 한다.
 *  - `labelId` 는 LabelId. 외부 이벤트는 CALENDAR_LABEL_ID('calendar') 고정.
 *  - `status` 는 task 에만 존재. event 에서는 undefined.
 */
export interface CalendarItem {
  id: string
  originalId: number | string
  kind: CalendarItemKind
  title: string
  labelId: LabelId
  /** 로케일 포맷된 표시 문자열. 종일 이벤트는 '종일' 또는 'All day'. */
  timeLabel: string
  startAt: Date
  endAt: Date | null
  isAllDay: boolean
  status: TaskStatus | undefined
  /** 장소/메모 등 부가 정보 (optional). */
  note: string | undefined
  /** 외부 이벤트는 click-disabled — 행 클릭 금지 플래그. task 는 항상 false. */
  clickDisabled: boolean
}

/**
 * 하루치 집계된 아이템 묶음. Screen A 셀과 Screen B ledger 가 이 형태를 직접 소비.
 *
 *  - `dateKey`: `YYYY-MM-DD` (사용자 timezone 기준). 캐시/라우팅 키로도 사용.
 *  - `items`: 시간순(종일 먼저 → startAt 오름차순) 정렬된 아이템 목록.
 *  - `statusCount`: 내부 태스크 3-state 분포 카운트. b-split 헤더 `StatusCountBadge` 가 소비.
 *    외부 이벤트는 포함하지 않음 (task 전용 카운터라 외부 이벤트가 섞이면 의미가 흐려짐).
 */
export interface CalendarDay {
  dateKey: string
  date: Date
  items: CalendarItem[]
  statusCount: {
    pending: number
    in_progress: number
    done: number
  }
}

/**
 * 월 단위 집계 결과. Screen A 가 7×N 셀을 렌더할 때 `byDate.get(dateKey)` 로 조회.
 * Map 을 그대로 노출하는 이유: 조회 O(1) + key 누락 셀(= 이벤트 없는 날) 을 구분하려면
 * `undefined` 응답이 자연스럽다.
 */
export interface CalendarMonth {
  /** 기준 월의 첫날(해당 월 1일 00:00, 사용자 timezone). */
  monthStart: Date
  /** 기준 월의 다음달 첫날(범위의 exclusive end). */
  monthEnd: Date
  byDate: Map<string, CalendarDay>
  /** 월 전체 내부 태스크 3-state 합산. 상단 요약·뱃지 렌더 용도. */
  totalStatusCount: {
    pending: number
    in_progress: number
    done: number
  }
}

/**
 * aggregate 함수가 받을 입력. tasks 는 DB 에서 날짜 범위로 걸러진 row,
 * events 는 G3 가 반환한 원본 Google 이벤트. aggregator 가 이 두 배열을 합친다.
 */
export interface AggregateMonthInput {
  /** 기준 월의 첫날(해당 월 1일 00:00, 사용자 timezone 기준). */
  monthStart: Date
  /** 기준 월의 다음달 첫날(범위의 exclusive end). */
  monthEnd: Date
  /** DB 에서 `due_at ∈ [monthStart, monthEnd)` 로 걸러진 tasks. */
  tasks: Task[]
  /** Google Calendar events.list 가 반환한 동일 범위 events. */
  events: GoogleCalendarEvent[]
  /**
   * 사용자 라벨 매핑. `taskId → LabelId`. task 는 0 또는 1 개의 라벨을 가진다고 가정
   * (v1 단일 라벨 정책). 없으면 undefined — aggregator 는 DEFAULT_FALLBACK_LABEL 로 폴백.
   *
   * D3(task_labels junction) 가 상위에서 join 해 이 맵을 채워주면 된다. 라벨 로직이
   * aggregator 안에 들어오지 않도록 입력으로 받는 구조.
   */
  taskLabelMap?: Map<number, LabelId>
  /** 현재 사용자 timezone (IANA identifier, 예: 'Asia/Seoul'). dateKey 산정에 사용. */
  timezone: string
  /** 로케일. timeLabel 포맷 판정. 기본 'ko'. */
  locale?: 'ko' | 'en'
}

/**
 * 월의 캘린더 그리드(7×6) 를 구성하는 개별 셀. Screen A 가 이 배열을 그대로 렌더한다.
 *
 *  - `inCurrentMonth: false` 인 셀은 이전/다음달의 여유 날짜(leading/trailing). Muted 톤으로 렌더.
 *  - `day` 는 `CalendarMonth.byDate.get(dateKey)` 와 동일 객체 참조.
 *    aggregator 가 현재 월 밖의 날짜(=leading/trailing)는 집계하지 않으므로 그 셀은 day === undefined.
 */
export interface CalendarGridCell {
  dateKey: string
  date: Date
  /** 이 날짜가 기준 월에 속하는지 — leading/trailing padding 구분. */
  inCurrentMonth: boolean
  /** 오늘 날짜인지 — 렌더러가 sage solid circle 강조에 사용. */
  isToday: boolean
  /** 이 날짜의 집계 묶음. 없으면 이벤트가 0 건이거나 leading/trailing 셀. */
  day: CalendarDay | undefined
}

/**
 * 라벨 매핑이 비었을 때 적용할 기본 라벨. labels.ts 의 CALENDAR_LABEL_ID 와 충돌하지 않도록
 * 일반 사용자 색(`personal` = plum) 으로 폴백한다.
 */
export const DEFAULT_FALLBACK_LABEL: LabelId = 'personal'
