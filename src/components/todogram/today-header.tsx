'use client'

import type { HTMLAttributes } from 'react'
import { cx, sortCx } from '@/utils/cx'

/* --------------------------------------------------------------------------
 * TodayHeader — Todogram v3 (Quiet Layer) 오늘 탭 상단 헤더
 *
 * DESIGN.md §3 (타이포) + §4 (컬러) + §5 (48px 터치 타겟) + §8 (컴포넌트) 근거.
 * approved.json: today-header-20260417 — A×D 하이브리드 ("Serif Datestamp + Monolith Tabs")
 *   - A(Serif Datestamp) layout 유지: eyebrow → Instrument Serif 26px 날짜
 *   - D(Moment Monolith) tab 스타일 적용: 텍스트 · dot separator · sage underline
 *   - count(3/7) 는 JetBrains Mono tabular-nums 로 유지 (rejected D_pure)
 *
 * 접근성:
 *   - 탭은 role="tablist"/"tab" + aria-selected. 부모가 tabpanel 을 렌더.
 *   - dot separator 는 aria-hidden (스크린리더가 읽지 않음)
 *   - count 는 aria-label 로 "N of M tasks done" 의미 전달
 *   - prefers-reduced-motion: underline transition 1ms (DESIGN.md §9-9)
 *   - 각 탭 min-height 48px (DESIGN.md §5 터치 타겟)
 * -------------------------------------------------------------------------- */

export type TodayHeaderScope = 'today' | 'tomorrow' | 'week'

export type TodayHeaderLocale = 'ko' | 'en'

export interface TodayHeaderProps
  extends Omit<HTMLAttributes<HTMLElement>, 'children' | 'onChange'> {
  /** 표시할 기준 날짜. scope='today' 일 때만 사용 */
  date: Date
  /** 현재 활성 스코프 */
  scope: TodayHeaderScope
  /** 스코프 전환 콜백 (탭 클릭 시 호출) */
  onScopeChange: (scope: TodayHeaderScope) => void
  /** 완료된 태스크 수 */
  completed: number
  /** 전체 태스크 수 (0 허용 — 쉬는 날 상태) */
  total: number
  /** 로케일. 기본 'ko' (Todogram v1 주 사용자가 한국어). */
  locale?: TodayHeaderLocale
  /** eyebrow 라벨 커스터마이즈. 기본 'TODAY' */
  eyebrow?: string
}

/* 탭 라벨 i18n 맵. 순서 = scope 순서 (today → tomorrow → week). */
const tabLabels: Record<TodayHeaderLocale, Record<TodayHeaderScope, string>> = {
  ko: {
    today: '오늘',
    tomorrow: '내일',
    week: '이번 주',
  },
  en: {
    today: 'Today',
    tomorrow: 'Tomorrow',
    week: 'This Week',
  },
}

/* 탭 순서 고정. 배열 index 를 키로 쓰지 않고 명시. */
const tabOrder: TodayHeaderScope[] = ['today', 'tomorrow', 'week']

/* --------------------------------------------------------------------------
 * 날짜 포맷터
 *   - ko: "4월 17일 (금)"   — month + day + 요일 축약(괄호)
 *   - en: "Friday, 17 April" — en-GB 스타일 (weekday, d month)
 * Intl.DateTimeFormat.formatToParts 로 구성해 로케일별 자연스러운 형태 보장.
 * -------------------------------------------------------------------------- */
function formatDate(date: Date, locale: TodayHeaderLocale): string {
  if (locale === 'ko') {
    /* ko-KR 부분 추출: month='4월', day='17일', weekday='금'. */
    const parts = new Intl.DateTimeFormat('ko-KR', {
      month: 'long',
      day: 'numeric',
      weekday: 'short',
    }).formatToParts(date)
    const find = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find(p => p.type === type)?.value ?? ''
    const month = find('month') /* '4월' */
    const day = find('day') /* '17일' */
    const weekday = find('weekday') /* '금' */
    return `${month} ${day} (${weekday})`
  }

  /* en-GB: "Friday, 17 April" 자연 출력. */
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date)
}

/* --------------------------------------------------------------------------
 * 스타일 — sortCx 로 common/eyebrow/date/row/tab/count 로 그룹핑.
 * 색상은 시맨틱 토큰(text-fg-brand-primary 등)만 사용 (DESIGN.md §9-1).
 * -------------------------------------------------------------------------- */
const styles = sortCx({
  wrapper: {
    /* DESIGN §5: 모바일 side padding 16px 를 기본, 상하 20px (spec.wrapper.padding=20px) */
    base: 'px-5 pt-5 pb-4 bg-bg-primary border-b border-border-primary',
  },
  eyebrow: {
    /* DESIGN §3 특수 스타일: 11px / 600 / 0.08em / uppercase */
    base: 'text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary leading-none',
  },
  date: {
    /* text-display-xs = 26px / 1.2 / -0.4px. font-display 로 Instrument Serif 강제. */
    base: 'mt-1.5 mb-5 font-display text-display-xs font-normal text-text-primary',
  },
  row: {
    /* baseline 정렬로 tabs 텍스트와 count 모노 숫자가 같은 기준선 공유 */
    base: 'flex items-baseline justify-between gap-3',
  },
  tabs: {
    /* 순수 텍스트 탭 컨테이너 — D(Moment Monolith) 스타일 */
    list: 'inline-flex items-baseline text-[13px] font-medium leading-none',
    /* dot separator: 탭 사이 ' · '. user-select none, aria-hidden 로 스크린리더 스킵. */
    separator: 'px-2 text-text-tertiary select-none pointer-events-none',
    /* 각 탭 버튼 래퍼. 48px 터치 타겟(DESIGN §5) + 하단 underline 공간 12px 확보. */
    button:
      'relative inline-flex items-start justify-center min-h-[48px] pt-0 pb-3' +
      ' focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring' +
      ' rounded-sm',
    /* 비활성: tertiary + weight 500 */
    inactive: 'text-text-tertiary font-medium',
    /* 활성: brand + weight 600 */
    active: 'text-fg-brand-primary font-semibold',
    /* underline — 베이스라인 12px 아래에 1.5px sage 라인.
       transition: transform 220ms ease-in-out (scale) + opacity 220ms.
       prefers-reduced-motion: 전역 motion-reduce:transition-none 로 축약. */
    underline:
      'absolute left-0 right-0 bottom-[12px] h-[1.5px] rounded-full bg-fg-brand-primary' +
      ' origin-center transition-[opacity,transform] duration-[220ms] ease-in-out' +
      ' motion-reduce:transition-none',
    underlineActive: 'opacity-100 scale-x-100',
    underlineInactive: 'opacity-0 scale-x-50',
  },
  count: {
    /* DESIGN §3: JetBrains Mono + tabular-nums. color = text-muted (웜 뉴트럴 600). */
    base:
      'font-mono tabular-nums text-[13px] leading-none text-text-tertiary' +
      ' [font-feature-settings:"tnum"]',
  },
})

export function TodayHeader({
  date,
  scope,
  onScopeChange,
  completed,
  total,
  locale = 'ko',
  eyebrow = 'TODAY',
  className,
  ...props
}: TodayHeaderProps) {
  const labels = tabLabels[locale]
  const dateText = formatDate(date, locale)

  /* count a11y 문구 — 스크린리더용. 로케일별 간결 문구. */
  const countAriaLabel =
    locale === 'ko'
      ? `총 ${total}개 중 ${completed}개 완료`
      : `${completed} of ${total} tasks done`

  return (
    <header
      data-slot="today-header"
      data-scope={scope}
      className={cx(styles.wrapper.base, className)}
      {...props}
    >
      {/* eyebrow — 섹션 의미 표식 (TODAY). uppercase + 자간으로 '조용한 라벨' */}
      <p className={styles.eyebrow.base}>{eyebrow}</p>

      {/* date — Instrument Serif 26px. 오늘 날짜는 '아침의 한 줄 감성 모멘트'(DESIGN §3) */}
      <h1 className={styles.date.base}>{dateText}</h1>

      {/* 하단 row: 탭 + 카운트 */}
      <div className={styles.row.base}>
        {/* 탭 그룹 — role=tablist. 부모가 tabpanel(task list) 을 렌더하는 것을 가정. */}
        <div
          role="tablist"
          aria-label={locale === 'ko' ? '할 일 범위' : 'Task scope'}
          className={styles.tabs.list}
        >
          {tabOrder.map((s, i) => {
            const isActive = s === scope
            return (
              <div key={s} className="inline-flex items-baseline">
                {/* 첫 탭 앞에는 separator 없음. 이후 탭 앞에만 ' · ' 삽입. */}
                {i > 0 && (
                  <span aria-hidden="true" className={styles.tabs.separator}>
                    ·
                  </span>
                )}
                <button
                  type="button"
                  role="tab"
                  id={`today-header-tab-${s}`}
                  aria-selected={isActive}
                  aria-controls={`today-header-panel-${s}`}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => onScopeChange(s)}
                  className={cx(
                    styles.tabs.button,
                    isActive ? styles.tabs.active : styles.tabs.inactive
                  )}
                >
                  <span className="relative">
                    {labels[s]}
                    {/* underline — 활성 시 불투명 + scale-100, 비활성 시 투명 + scale-50 */}
                    <span
                      aria-hidden="true"
                      className={cx(
                        styles.tabs.underline,
                        isActive
                          ? styles.tabs.underlineActive
                          : styles.tabs.underlineInactive
                      )}
                    />
                  </span>
                </button>
              </div>
            )
          })}
        </div>

        {/* count — "3/7" 포맷. tabular-nums 로 숫자 width 고정 → 변화 시 CLS 없음. */}
        <span className={styles.count.base} aria-label={countAriaLabel}>
          <span aria-hidden="true">
            {completed}/{total}
          </span>
        </span>
      </div>
    </header>
  )
}
