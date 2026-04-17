'use client'

import { useMemo } from 'react'
import type { HTMLAttributes } from 'react'
import { cx, sortCx } from '@/utils/cx'
import { Fab } from './fab'
import {
  FilterRail,
  buildDefaultFilterItems,
  type FilterRailItem,
  type FilterableLabel,
} from './filter-rail'
import { CALENDAR_LABEL_ID, FILTER_ALL, type FilterValue } from './labels'
import { RolloverBanner } from './rollover-banner'
import { TodayHeader, type TodayHeaderScope } from './today-header'
import {
  buildTodayStream,
  type TodayStreamItem,
} from './today-row'

/* --------------------------------------------------------------------------
 * TodayView — Todogram v3 (Quiet Layer) 오늘 탭 스크린 컨테이너
 *
 * DESIGN.md §2 (Context-scoped 해석) + §6 (모바일 단일 컬럼) + §8 (컴포넌트) 근거.
 * approved.json: today-view-20260417 — "Unified Ledger" 스크린 조합.
 *
 * 수직 구성:
 *   [ TodayHeader ]
 *   [ FilterRail (sticky) ]
 *   [ RolloverBanner? (count > 0 일 때만) ]
 *   [ stream: TodayRow × n  + 중앙 정렬 1px divider ]
 *   [ Fab? (onCreateTask 가 있을 때만 렌더) ]
 *
 * BottomNav 는 layout 차원의 주요 네비게이션이므로 여기서 렌더하지 않음.
 * 일반적으로 `src/app/(app)/layout.tsx` 가 BottomNav 를 sibling 으로 고정 렌더.
 *
 * 필터링 책임:
 *   - 이 컴포넌트가 items + activeFilter 를 받아 **내부에서 필터링**.
 *   - 'all' → 모든 항목. 'calendar' → kind==='ext' 또는 label==='calendar' 만.
 *     특정 라벨 id → 해당 label 만.
 *   - 외부에서 미리 필터링된 items 를 넘기고 싶다면 activeFilter='all' 로 고정.
 *
 * 접근성:
 *   - stream 을 role="list" + aria-label (각 row 는 listitem)
 *   - FilterRail 의 aria-controls 는 stream panel id (tablist ↔ tabpanel 연결)
 *   - TodayHeader 의 role="tablist" 는 scope(오늘/내일/이번주) 전용 — 별도 panel 연결
 * -------------------------------------------------------------------------- */

export type TodayViewLocale = 'ko' | 'en'

export interface TodayViewProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  /** 기준 날짜 — TodayHeader 에 전달. */
  date: Date
  /** 현재 scope — 오늘/내일/이번 주. */
  scope: TodayHeaderScope
  /** scope 변경 콜백 — TodayHeader 탭 클릭 시. */
  onScopeChange: (scope: TodayHeaderScope) => void

  /** 사용자 라벨 목록 — FilterRail 에 칩으로 렌더 (calendar reserved 는 자동 삽입). */
  userLabels: FilterableLabel[]
  /** 현재 활성 필터. 내부에서 items 를 이 값으로 필터링. */
  activeFilter: FilterValue
  /** 필터 변경 콜백 — FilterRail 칩 클릭 시. */
  onFilterChange: (value: FilterValue) => void
  /** filter rail items 를 직접 override 하고 싶을 때. 미지정 시 buildDefaultFilterItems 사용. */
  filterItems?: FilterRailItem[]

  /** 전체 스트림 아이템 (내부 태스크 + 외부 이벤트 혼합). 부모가 이미 시간순 정렬. */
  items: TodayStreamItem[]
  /** TodayRow 체크박스 토글 — id 는 TodayStreamItem.id 그대로. */
  onToggleTask?: (id: string) => void

  /** 이월된 태스크 수 — 0 또는 undefined 이면 RolloverBanner 렌더 안 함. */
  rolloverCount?: number
  /** 이월 유지 액션. */
  onRolloverKeep?: () => void
  /** 이월 보관 액션. */
  onRolloverArchive?: () => void
  /** 이월 배너 닫기 (선택). */
  onRolloverDismiss?: () => void

  /**
   * Fab 클릭 핸들러. 지정 시 화면에 + 버튼 고정 배치.
   * 미지정 시 Fab 렌더 안 함 (페이지 레벨에서 자체 배치하려는 경우).
   */
  onCreateTask?: () => void

  /** TodayHeader 의 완료 카운트 (기본: items 에서 자동 계산). */
  completed?: number
  /** TodayHeader 의 전체 카운트 (기본: items.length). */
  total?: number

  /** 로케일. 기본 'ko'. */
  locale?: TodayViewLocale
}

/* --------------------------------------------------------------------------
 * 스타일 — sortCx 로 wrapper/stream/list 그룹핑.
 * 전체는 column flex · 높이 100% · overflow hidden (stream 이 내부 스크롤).
 * -------------------------------------------------------------------------- */
const styles = sortCx({
  wrapper: {
    /* 단일 컬럼 · 높이 100dvh - safe area(top) · bg-page.
     * BottomNav 가 fixed 로 아래 72px 를 덮으므로 stream padding-bottom 으로 여백 확보. */
    base:
      'relative flex flex-col h-full min-h-dvh bg-bg-page text-text-primary',
  },
  stream: {
    /* flex: 1 으로 남은 공간을 모두 차지 · 세로 스크롤 only.
     * padding: 10 side 16 bottom 120(= BottomNav 72 + Fab gap 16 + buffer)
     * gap: 4 — divider 1px 가 끼어 중앙 정렬 9px 리듬 만들기.
     * approved.json stream spec 그대로. */
    base:
      'flex-1 flex flex-col gap-1 px-4 pt-2.5 pb-[120px]' +
      ' overflow-x-hidden overflow-y-auto',
  },
  list: {
    /* 스트림 내부 list wrapper. gap 은 stream 이 관리. */
    base: 'flex flex-col gap-1',
  },
  empty: {
    /* 빈 상태 — items 0개일 때. 가벼운 플레이스홀더. Quiet Layer 정신. */
    base:
      'flex flex-col items-center justify-center py-16 text-center' +
      ' text-text-tertiary',
  },
})

/* --------------------------------------------------------------------------
 * matchesFilter — activeFilter 기준으로 item 을 포함할지 결정.
 *   - 'all' : 전부
 *   - 'calendar' : kind==='ext' 또는 label==='calendar'
 *   - 특정 id : item.label === id
 * -------------------------------------------------------------------------- */
function matchesFilter(
  item: TodayStreamItem,
  filter: FilterValue,
): boolean {
  if (filter === FILTER_ALL) return true
  if (filter === CALENDAR_LABEL_ID) {
    return item.kind === 'ext' || item.label === CALENDAR_LABEL_ID
  }
  return item.label === filter
}

/* --------------------------------------------------------------------------
 * TodayView — 스크린 컨테이너. 상태는 외부(부모)가 관리, 이 컴포넌트는 presenter.
 * -------------------------------------------------------------------------- */
export function TodayView({
  date,
  scope,
  onScopeChange,

  userLabels,
  activeFilter,
  onFilterChange,
  filterItems,

  items,
  onToggleTask,

  rolloverCount = 0,
  onRolloverKeep,
  onRolloverArchive,
  onRolloverDismiss,

  onCreateTask,

  completed,
  total,

  locale = 'ko',
  className,
  ...props
}: TodayViewProps) {
  /* 내부 필터링 — activeFilter 기준. useMemo 로 의존 변경 시에만 재계산. */
  const filteredItems = useMemo(
    () => items.filter(item => matchesFilter(item, activeFilter)),
    [items, activeFilter],
  )

  /* TodayHeader 카운트 기본값 — 외부 override 없으면 items 에서 자동 계산.
   * (전체 items 기준, 필터 후가 아님 — '3/7' 은 오늘 전체 진행률) */
  const mineItems = useMemo(
    () => items.filter(item => item.kind === 'mine'),
    [items],
  )
  const autoCompleted = mineItems.filter(i => i.completed).length
  const autoTotal = mineItems.length
  const completedCount = completed ?? autoCompleted
  const totalCount = total ?? autoTotal

  /* FilterRail 아이템 — 외부 override 허용. */
  const rail = filterItems ?? buildDefaultFilterItems(userLabels, locale)

  /* stream 을 TodayRow + Divider 조합으로 변환. */
  const streamNodes = useMemo(
    () => buildTodayStream(filteredItems, onToggleTask),
    [filteredItems, onToggleTask],
  )

  /* stream panel id — FilterRail 의 aria-controls 에 연결. */
  const panelId = `today-view-panel-${scope}`

  const emptyCopy =
    locale === 'ko'
      ? '표시할 항목이 없어요. 조용한 하루가 되기를.'
      : 'Nothing here yet. Enjoy the quiet.'

  return (
    <div
      data-slot="today-view"
      data-scope={scope}
      data-filter={String(activeFilter)}
      className={cx(styles.wrapper.base, className)}
      {...props}
    >
      <TodayHeader
        date={date}
        scope={scope}
        onScopeChange={onScopeChange}
        completed={completedCount}
        total={totalCount}
        locale={locale}
      />

      <FilterRail
        items={rail}
        active={activeFilter}
        onChange={onFilterChange}
        panelId={panelId}
        ariaLabel={locale === 'ko' ? '라벨 필터' : 'Label filter'}
      />

      {/* 이월 배너 — count === 0 이면 내부에서 null 반환. */}
      {rolloverCount > 0 && onRolloverKeep && onRolloverArchive && (
        <RolloverBanner
          count={rolloverCount}
          onKeep={onRolloverKeep}
          onArchive={onRolloverArchive}
          onDismiss={onRolloverDismiss}
          locale={locale}
        />
      )}

      {/* stream — 스크롤 영역. 필터 후 items 를 divider 와 조합하여 렌더. */}
      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={`today-header-tab-${scope}`}
        className={styles.stream.base}
      >
        {filteredItems.length === 0 ? (
          <p className={styles.empty.base}>{emptyCopy}</p>
        ) : (
          <div
            role="list"
            aria-label={locale === 'ko' ? '오늘 할 일' : "Today's items"}
            className={styles.list.base}
          >
            {streamNodes}
          </div>
        )}
      </div>

      {/* Fab — 새 태스크 추가. 지정된 경우에만 렌더 (fixed positioning 은 Fab 이 자체 처리). */}
      {onCreateTask && <Fab onClick={onCreateTask} locale={locale} />}
    </div>
  )
}
