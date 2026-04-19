'use client'

// ============================================================================
// CalendarDayDetail — Screen B 전체 (Phase 4 - U1)
// ============================================================================
// - 역할: "Ribbon Month + Ledger" 2단 레이아웃을 한 컴포넌트로 조립.
//     · 상단 리본 (≈45%): 요일 헤더 + CalendarCompactGrid + Instrument Serif 날짜
//       + StatusCountBadge.
//     · 중단 divider: 날짜 + status count 가 들어가는 bg-muted 바 (1px 경계선).
//     · 하단 ledger (≈55%): CalendarDayRow 의 스트림. 비어있으면 Quiet Empty 상태.
// - 상위에서는 `month`/`cells`/`selectedDateKey`/`onSelectDay` 를 그대로 전달하면 된다.
//   상태 전이 콜백 `onStatusChange` 은 CalendarDayRow 를 통과한다.
// - 빈 상태 처리: 해당 날짜에 item 이 0 건이면 Instrument Serif ornament + 안내 메시지.
//   DESIGN.md Quiet Layer: 게이미피케이션 없음, 일러스트 대신 타이포로 여백을 채운다.
// - 일자 라벨 포맷: 한국어 기본 — "4월 18일 토요일" (Intl.DateTimeFormat 으로 타임존 반영).
//   영어 로케일도 옵션으로 지원 — "Apr 18, Saturday".
// ============================================================================

import { useMemo } from 'react'
import { cx } from '@/utils/cx'
import type { CalendarDay, CalendarGridCell } from '@/lib/calendar/types'
import type { CalendarItem, TaskStatus } from '@/lib/calendar/types'
import type { WeekStart } from '@/lib/calendar/month'
import { CalendarCompactGrid } from './calendar-compact-grid'
import { CalendarDayRow, CalendarDayRowDivider } from './calendar-day-row'
import { StatusCountBadge } from './status-count-badge'

export interface CalendarDayDetailProps {
  /** 현재 월의 grid cells (압축 그리드와 공유). */
  cells: CalendarGridCell[]
  /** 선택된 날짜의 CalendarDay. null 이면 빈 상태. */
  day: CalendarDay | null
  /** 선택된 dateKey — 압축 그리드 하이라이트에 사용. */
  selectedDateKey: string
  /** 압축 그리드에서 다른 날짜를 탭했을 때 호출. */
  onSelectDay?: (dateKey: string) => void
  /** 태스크 상태 전이 — ledger row 의 TaskStatusIndicator 탭. */
  onStatusChange?: (item: CalendarItem, next: TaskStatus) => void
  /** ledger row 본문 클릭 → 상세(Screen C) 이동. 외부 event 는 호출되지 않는다. */
  onSelectItem?: (item: CalendarItem) => void
  /** 상태 전이 in-flight 시 해당 item id 를 넘겨주면 row 가 disabled 렌더. */
  pendingItemId?: string
  /** 타임존 — 상단 날짜 라벨 포맷에 사용. IANA 식별자. */
  timezone: string
  /** 로케일. 기본 'ko'. */
  locale?: 'ko' | 'en'
  /** 주 시작 요일 — 상단 요일 헤더 순서. */
  weekStart?: WeekStart
  /** 라벨 id → 표시명 매핑. 제공되면 LabelChip 의 칩 텍스트가 이 값으로 대체. */
  labelNameMap?: Map<string, string>
  /** 추가 클래스. */
  className?: string
  /** 상단 네비게이션 영역(뒤로가기/월 이동 등) 을 끼워 넣는 슬롯. 상위 ViewportSwitcher 에서 주입. */
  header?: React.ReactNode
  /** 하단 영역(바텀 네비 등) 을 끼워 넣는 슬롯. */
  footer?: React.ReactNode
}

/**
 * 요일 라벨 (sunday-first). CalendarMonthGrid 와 동일 테이블 — import 대신 복제해
 * 두 컴포넌트의 결합도를 낮춘다 (미니 분리 원칙, 파일 7KB 이내 목표).
 */
const WEEKDAYS: Record<'ko' | 'en', readonly string[]> = {
  ko: ['일', '월', '화', '수', '목', '금', '토'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
}

function rotateWeekdays(
  labels: readonly string[],
  weekStart: WeekStart
): readonly string[] {
  if (weekStart === 'sunday') return labels
  return [...labels.slice(1), labels[0] ?? '']
}

export function CalendarDayDetail({
  cells,
  day,
  selectedDateKey,
  onSelectDay,
  onStatusChange,
  onSelectItem,
  pendingItemId,
  timezone,
  locale = 'ko',
  weekStart = 'sunday',
  labelNameMap,
  className,
  header,
  footer,
}: CalendarDayDetailProps) {
  const weekdayLabels = rotateWeekdays(WEEKDAYS[locale], weekStart)

  /* 상단 큰 날짜 라벨 — Intl.DateTimeFormat 으로 timezone 반영된 "4월 18일 토요일". */
  const headerDateLabel = useMemo(
    () => formatHeaderDateLabel(selectedDateKey, timezone, locale),
    [selectedDateKey, timezone, locale]
  )

  const items = day?.items ?? []
  const statusCount = day?.statusCount ?? { pending: 0, in_progress: 0, done: 0 }

  return (
    <div
      data-slot="calendar-day-detail"
      className={cx('flex h-full min-h-0 flex-col bg-bg-primary', className)}
    >
      {header}

      {/* 요일 헤더 (압축 그리드와 공유) */}
      <div
        aria-hidden="true"
        className="grid flex-none grid-cols-7 px-2 pt-1.5 pb-1 h-8"
      >
        {weekdayLabels.map((label, index) => {
          const isSun = index === (weekStart === 'sunday' ? 0 : 6)
          const isSat = index === (weekStart === 'sunday' ? 6 : 5)
          return (
            <span
              key={label + index}
              className={cx(
                'text-center text-[10px] font-semibold uppercase tracking-[0.08em]',
                !isSun && !isSat && 'text-text-tertiary',
                isSun &&
                  'text-[color-mix(in_srgb,var(--color-label-terracotta)_85%,var(--color-text-tertiary))]',
                isSat &&
                  'text-[color-mix(in_srgb,var(--color-label-dust-blue)_85%,var(--color-text-tertiary))]'
              )}
            >
              {label}
            </span>
          )
        })}
      </div>

      {/* 압축 월 그리드 */}
      <div className="flex-none">
        <CalendarCompactGrid
          cells={cells}
          selectedDateKey={selectedDateKey}
          onSelectDay={onSelectDay}
        />
      </div>

      {/* 날짜 + 상태 카운트 divider */}
      <div
        className={cx(
          'flex flex-none items-baseline justify-between gap-2.5 px-4 py-2.5',
          'bg-bg-secondary border-y border-border-secondary'
        )}
      >
        <span
          className="font-display text-[20px] leading-none text-text-primary"
          aria-live="polite"
        >
          {headerDateLabel}
        </span>
        <StatusCountBadge counts={statusCount} />
      </div>

      {/* ledger stream — 빈 상태면 Quiet Empty, 아니면 row 목록 */}
      {items.length === 0 ? (
        <CalendarDayEmpty locale={locale} />
      ) : (
        <div
          className="flex flex-1 flex-col gap-0 overflow-y-auto overflow-x-hidden px-3 pb-1.5 pt-1"
          data-slot="calendar-day-detail-stream"
        >
          {items.map((item, index) => {
            const labelText =
              labelNameMap?.get(item.labelId) ??
              (item.kind === 'event'
                ? locale === 'ko'
                  ? '캘린더'
                  : 'Calendar'
                : undefined)
            return (
              <RowWithDivider
                key={item.id}
                isFirst={index === 0}
                item={item}
                labelText={labelText}
                pending={pendingItemId === item.id}
                onStatusChange={onStatusChange}
                onSelect={onSelectItem}
              />
            )
          })}
        </div>
      )}

      {footer}
    </div>
  )
}

/**
 * 첫 번째 row 앞에는 divider 를 넣지 않는 래퍼. React.Fragment 로 묶어 key 를 단일화.
 */
function RowWithDivider({
  isFirst,
  item,
  labelText,
  pending,
  onStatusChange,
  onSelect,
}: {
  isFirst: boolean
  item: CalendarItem
  labelText?: string
  pending: boolean
  onStatusChange?: (item: CalendarItem, next: TaskStatus) => void
  onSelect?: (item: CalendarItem) => void
}) {
  return (
    <>
      {!isFirst && <CalendarDayRowDivider />}
      <CalendarDayRow
        item={item}
        labelText={labelText}
        pending={pending}
        onStatusChange={onStatusChange}
        onSelect={onSelect}
      />
    </>
  )
}

/**
 * Quiet Empty 상태 — Instrument Serif ornament + 안내 문구 중앙 정렬.
 * approved.json: 일러스트 금지, 타이포로 여백 채우기.
 */
function CalendarDayEmpty({ locale }: { locale: 'ko' | 'en' }) {
  return (
    <div
      data-slot="calendar-day-detail-empty"
      role="status"
      aria-live="polite"
      className="flex flex-1 flex-col items-center justify-center gap-3 px-10 py-8 text-center"
    >
      <span
        aria-hidden="true"
        className="font-display text-[60px] italic leading-none text-text-tertiary"
      >
        ·
      </span>
      <span className="text-[14px] leading-[1.55] text-text-muted">
        {locale === 'ko'
          ? '이 날엔 예정된 일정이 없어요'
          : 'Nothing scheduled for this day'}
      </span>
    </div>
  )
}

/**
 * `YYYY-MM-DD` + timezone 에서 "4월 18일 토요일" 포맷을 만든다.
 * Intl.DateTimeFormat 으로 요일 추출해 한국어/영어 공통 처리.
 */
function formatHeaderDateLabel(
  dateKey: string,
  timezone: string,
  locale: 'ko' | 'en'
): string {
  const [yStr, mStr, dStr] = dateKey.split('-')
  const year = Number.parseInt(yStr ?? '0', 10)
  const month = Number.parseInt(mStr ?? '0', 10)
  const day = Number.parseInt(dStr ?? '0', 10)
  /* timezone 반영용 — 자정 UTC 를 대략적으로 찍고 Intl 로 요일만 뽑는다.
   * startOfDayInZone 을 import 해서 쓰면 더 정확하지만, 요일 추출에는 1h 이내 오차가
   * 영향을 주지 않으므로 여기서는 UTC 자정 근사를 사용. */
  const instant = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
  const weekday = new Intl.DateTimeFormat(
    locale === 'ko' ? 'ko-KR' : 'en-US',
    { weekday: 'long', timeZone: timezone }
  ).format(instant)
  if (locale === 'ko') {
    return `${month}월 ${day}일 ${weekday}`
  }
  const monthShort = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    timeZone: timezone,
  }).format(instant)
  return `${monthShort} ${day}, ${weekday}`
}
