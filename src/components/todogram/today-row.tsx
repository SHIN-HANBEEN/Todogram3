'use client'

import type { HTMLAttributes, ReactNode } from 'react'
import { Check } from '@untitledui/icons'
import { cx, sortCx } from '@/utils/cx'
import { LabelChip, type LabelChipColor } from './label-chip'
import { CALENDAR_LABEL_ID, getLabelColor, type LabelId } from './labels'

/* --------------------------------------------------------------------------
 * TodayRow — Todogram v3 (Quiet Layer) Today View 통합 row (ledger cell)
 *
 * DESIGN.md §2 (Context-scoped 해석 — Today View row) + §4 (컬러) +
 * §5 (48px 터치 타겟) + §7 (모션) 근거.
 * approved.json: today-view-20260417 — "Unified Ledger" 의 row primitive.
 *
 * 핵심: 내 태스크(mine)와 외부 이벤트(ext)가 **동일한 geometry** 를 공유.
 *   [ time 56px · check 18px · title flex · chip auto ]
 *   min-height 56px · padding 12px 10px 12px 11px
 *   border-left 3px = 해당 라벨 색 (calendar → dust-blue)
 *   border-radius 0 6px 6px 0
 *
 * 내부 / 외부 구분은 단 2 신호:
 *   (a) 체크박스 visibility — ext 는 hidden (공간 유지)
 *   (b) 제목 텍스트 색 — ext → text-secondary · mine → text-primary
 *
 * 카드 형태의 dashed border · opacity · bg-muted 신호는 여기서 사용 X.
 * 그것들은 주간 뷰 등 카드 맥락의 ExternalEventCard 에만 적용 (DESIGN §2).
 *
 * 접근성:
 *   - role="listitem" (부모 role="list" aria-label="오늘 할 일" 전제)
 *   - 체크박스 역할 버튼 aria-checked (완료/미완료)
 *   - ext row 는 체크박스 자체를 aria-hidden + tabindex -1 로 흐름 제외
 *   - title 에 취소선(line-through)은 시각만, 스크린리더는 별도 aria-label
 * -------------------------------------------------------------------------- */

/** row 의 종류 — 내 태스크(내부)인가, 외부 Cal 이벤트인가. */
export type TodayRowKind = 'mine' | 'ext'

export interface TodayRowProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'onToggle'> {
  /** row 종류 — 체크박스 표시 여부와 타이틀 톤을 결정. */
  kind: TodayRowKind
  /** 시간 문자열 — 이미 포맷된 "09:30" 형태 전달. JetBrains Mono 로 렌더. */
  time: string
  /** 제목 — 완료 시 line-through. */
  title: string
  /** 라벨 id. 외부 이벤트는 CALENDAR_LABEL_ID 를 그대로 넘기면 됨. */
  label: LabelId
  /** 사용자에게 표시될 라벨 텍스트 (LabelChip 안에 들어감). ext 는 '캘린더'. */
  labelText: string
  /**
   * LabelChip 색상을 직접 지정하고 싶을 때 override.
   *
   * 배경: LABEL_COLOR_MAP 은 `calendar`/`work`/`home`/`study`/`personal` 같은
   * 슬러그 기반 하드코딩 매핑만 보유한다. 사용자가 DB 에서 새로 만든 라벨의
   * 숫자 id(`'42'` 등) 는 여기에 없으므로 `getLabelColor` 는 'moss' 폴백을 돌려줘
   * 라벨이 항상 회색으로만 찍히게 된다. 서버가 이미 hex→slug 변환을 마친 경우
   * 그 결과 slug 를 이 prop 으로 주면 정확한 색으로 렌더된다.
   *
   * 미지정 시에는 `getLabelColor(label)` 로 폴백(후방 호환).
   */
  labelColor?: LabelChipColor
  /** 체크박스 상태. ext 에서는 무시됨(항상 시각적으로 숨김). */
  completed?: boolean
  /** 체크박스 토글. mine 에서만 호출. */
  onToggle?: () => void
  /** 긴 제목에 부가 텍스트(장소·노트)가 있을 때 하단에 표기. */
  note?: string
}

/* --------------------------------------------------------------------------
 * borderLeftColorClass — LabelChipColor 를 border-left color 클래스로 매핑.
 * Tailwind v4 는 --color-label-{name} 을 border 유틸에도 자동 노출 (border-label-{name}).
 * -------------------------------------------------------------------------- */
const borderLeftColorClass: Record<LabelChipColor, string> = {
  sage: 'border-l-label-sage',
  terracotta: 'border-l-label-terracotta',
  'dust-blue': 'border-l-label-dust-blue',
  amber: 'border-l-label-amber',
  plum: 'border-l-label-plum',
  moss: 'border-l-label-moss',
}

/* --------------------------------------------------------------------------
 * 스타일 — sortCx 로 root/time/check/title/chip 그룹핑.
 * 색상은 시맨틱 토큰만 사용 (DESIGN §9-1). 색 커스터마이징은 border-l-label-* 만.
 * -------------------------------------------------------------------------- */
const styles = sortCx({
  root: {
    /* flex row · 중앙 정렬 · 12px gap · 좌측 3px 보더(색은 라벨 별도 주입) ·
     * 최소 높이 56px · 우측 상·하단만 6px 둥근 모서리.
     * hover 시 부드러운 배경 강조 (motion-reduce 자동 대응). */
    base:
      'group/today-row relative flex items-center gap-3 min-h-[56px]' +
      ' pl-[11px] pr-[10px] py-3 border-l-[3px] rounded-r-md' +
      ' transition-colors duration-150 ease-linear motion-reduce:transition-none' +
      ' hover:bg-bg-primary_hover',
  },
  time: {
    /* 56px 고정 폭 · JetBrains Mono + tabular-nums (DESIGN §3 특수 스타일).
     * text-muted 로 조용하게 — 시간은 정보지 강조점이 아님. */
    base:
      'flex-none w-14 font-mono tabular-nums text-[13px] leading-none' +
      ' text-text-muted [font-feature-settings:"tnum"]',
  },
  checkSlot: {
    /* 18px 정사각형 고정 공간. ext 에서는 visibility:hidden 으로 크기만 유지. */
    base: 'flex-none inline-flex items-center justify-center size-[18px]',
    hidden: 'invisible',
  },
  check: {
    /* 미완료: 중립 보더 · 투명 배경. 완료: sage solid · 흰색 체크. */
    base:
      'inline-flex items-center justify-center size-[18px] rounded-[4px]' +
      ' border border-border-primary bg-transparent' +
      ' transition duration-100 ease-linear motion-reduce:transition-none' +
      ' focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring' +
      ' hover:border-border-brand',
    completed:
      'bg-bg-brand-solid border-bg-brand-solid text-text-primary_on-brand' +
      ' hover:bg-bg-brand-solid_hover hover:border-bg-brand-solid_hover',
  },
  titleWrap: {
    /* 제목 + 노트 2단 — 노트가 없을 땐 그냥 한 줄. min-w-0 로 truncate 활성화. */
    base: 'flex-1 min-w-0 inline-flex flex-col gap-0.5',
  },
  title: {
    /* 기본 — mine: text-primary / ext: text-secondary. 완료 시 취소선 + muted. */
    base: 'truncate text-[15px] leading-[1.35] font-medium',
    mine: 'text-text-primary',
    ext: 'text-text-secondary',
    completed: 'line-through text-text-muted',
  },
  note: {
    /* 부가 텍스트 — 장소/노트. 한 줄 truncate 유지. */
    base: 'truncate text-[12px] leading-none text-text-tertiary',
  },
  chipSlot: {
    /* 우측 고정 폭 없음 — 내용에 맞게. flex-none 으로 shrink 방지. */
    base: 'flex-none inline-flex items-center',
  },
})

/* --------------------------------------------------------------------------
 * TodayRow — 화면 단위 primitive. 부모 TodayView 에서 flatMap 으로 dividers 와 조합.
 * -------------------------------------------------------------------------- */
export function TodayRow({
  kind,
  time,
  title,
  label,
  labelText,
  labelColor,
  completed = false,
  onToggle,
  note,
  className,
  ...props
}: TodayRowProps) {
  /* labelColor prop 이 있으면 그걸 우선 사용 — 서버에서 이미 hex→slug 로 변환한
   * 사용자 라벨 색을 안전하게 주입할 수 있다. 없으면 기존 슬러그 매핑 폴백. */
  const color = labelColor ?? getLabelColor(label)
  const isExt = kind === 'ext'
  const isDone = !isExt && completed

  /* 체크박스 aria-label — 로케일 문구는 상위에서 번역하기보단 간단한 ko 고정 기본값
   * (Todogram v1 주 사용자 한국어). 필요 시 prop 으로 override 고려. */
  const checkAriaLabel = isDone ? '완료 취소' : '완료로 표시'

  /* 이벤트 핸들러 — ext 는 체크박스 자체를 렌더 안하므로 여기 닿지 않음. */
  const handleToggle = () => {
    if (!isExt && onToggle) onToggle()
  }

  return (
    <div
      data-slot="today-row"
      data-kind={kind}
      data-label={label}
      data-completed={isDone || undefined}
      role="listitem"
      className={cx(
        styles.root.base,
        borderLeftColorClass[color],
        className,
      )}
      {...props}
    >
      {/* 시간 — 모노 + tabular-nums. ext/mine 동일. */}
      <span className={styles.time.base} aria-hidden={false}>
        {time}
      </span>

      {/* 체크박스 슬롯 — ext 는 invisible 로 공간만 유지 (geometry 통일). */}
      <div
        className={cx(
          styles.checkSlot.base,
          isExt && styles.checkSlot.hidden,
        )}
        aria-hidden={isExt}
      >
        {!isExt && (
          <button
            type="button"
            role="checkbox"
            aria-checked={isDone}
            aria-label={checkAriaLabel}
            onClick={handleToggle}
            className={cx(
              styles.check.base,
              isDone && styles.check.completed,
            )}
          >
            {/* 완료 시에만 체크 마크 표시. 미완료 시 빈 상자. */}
            {isDone && (
              <Check aria-hidden="true" className="size-3" strokeWidth={2.25} />
            )}
          </button>
        )}
      </div>

      {/* 제목 + 선택적 노트 */}
      <span className={styles.titleWrap.base}>
        <span
          className={cx(
            styles.title.base,
            isExt ? styles.title.ext : styles.title.mine,
            isDone && styles.title.completed,
          )}
        >
          {title}
        </span>
        {note && <span className={styles.note.base}>{note}</span>}
      </span>

      {/* 라벨 칩 — dot variant (DESIGN §4-3 · LabelChip approved.json default) */}
      <span className={styles.chipSlot.base}>
        <LabelChip color={color} variant="dot" size="md">
          {labelText}
        </LabelChip>
      </span>
    </div>
  )
}

/* --------------------------------------------------------------------------
 * TodayRowDivider — row 와 row 사이 중앙에 놓이는 1px 구분선.
 *
 * flex column 컨테이너에서 `height: 1px` 단독으로 주면 default flex-shrink 에
 * 의해 0px 로 collapse 됨 (approved.json open_issues 에 기록된 이슈).
 * → flex: 0 0 1px + min-height: 1px 로 명시적으로 폭 확보.
 * margin-left: 3px — row 의 3px 색 틱 공간을 건너뛰어 divider 가 본문 영역만 덮도록.
 * -------------------------------------------------------------------------- */
export function TodayRowDivider({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>): ReactNode {
  return (
    <div
      aria-hidden="true"
      data-slot="today-row-divider"
      className={cx(
        'flex-none min-h-px h-px ml-[3px] bg-border-default',
        className,
      )}
      style={{ flex: '0 0 1px' }}
      {...props}
    />
  )
}

/* --------------------------------------------------------------------------
 * buildTodayStream — items 배열을 TodayRow 와 TodayRowDivider 가 번갈아 나오는
 * ReactNode 배열로 변환. 부모 컨테이너에서 그대로 렌더하면 됨.
 *
 * 패턴: items.flatMap((item, i) => i === 0 ? [<TodayRow/>] : [<Divider/>, <TodayRow/>])
 * -------------------------------------------------------------------------- */
export interface TodayStreamItem {
  /** 고유 키. 서버의 taskId / eventId 를 그대로 쓰면 됨. */
  id: string
  kind: TodayRowKind
  time: string
  title: string
  label: LabelId
  labelText: string
  /** LabelChip 색상 override. 서버에서 hex→slug 로 변환한 값을 주입하면 정확한 색이 찍힌다. */
  labelColor?: LabelChipColor
  completed?: boolean
  note?: string
}

export function buildTodayStream(
  items: TodayStreamItem[],
  onToggle?: (id: string) => void,
): ReactNode[] {
  return items.flatMap((item, index) => {
    const row = (
      <TodayRow
        key={item.id}
        kind={item.kind}
        time={item.time}
        title={item.title}
        label={item.label}
        labelText={item.labelText}
        labelColor={item.labelColor}
        completed={item.completed}
        note={item.note}
        onToggle={onToggle ? () => onToggle(item.id) : undefined}
      />
    )

    /* 첫 row 앞에는 divider 없음. 이후 row 앞에만 divider 1 개씩. */
    if (index === 0) return [row]
    return [
      <TodayRowDivider key={`divider-${item.id}`} />,
      row,
    ]
  })
}

/* --------------------------------------------------------------------------
 * Re-export: TodayRow 소비자가 이 모듈만 import 해도 구분선과 헬퍼를 쓸 수 있도록.
 * CALENDAR_LABEL_ID 는 labels.ts 에서 import 해 쓰는 것을 권장하지만,
 * Today View 맥락에서만 쓸 때는 여기서도 가져올 수 있게 re-export.
 * -------------------------------------------------------------------------- */
export { CALENDAR_LABEL_ID }
