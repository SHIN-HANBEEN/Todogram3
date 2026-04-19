'use client'

import type { CSSProperties, HTMLAttributes } from 'react'
import { Check, DotsGrid } from '@untitledui/icons'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cx, sortCx } from '@/utils/cx'
import { LabelChip, type LabelChipColor } from '@/components/todogram/label-chip'
import type { TaskStatus } from '@/db/schema'

/* --------------------------------------------------------------------------
 * TaskRow — Todogram v3 List View compact row
 *
 * approved.json list-view-20260419 · spec.row 근거.
 *
 * Geometry: [grip 16 · check 18 · title flex · time · chip-meta]
 *   - min-height 48px · padding 10 10 10 11 · gap 10px
 *   - border-left 3px = 라벨 색 (calendar 예외 — List View 는 calendar 미노출)
 *   - border-radius 0 6 6 0
 *
 * 3-state checkbox:
 *   - pending      : border + transparent
 *   - in_progress  : border-brand + half-fill (linear-gradient brand 50%)
 *   - done         : bg-brand + white check
 *   클릭 시 pending → in_progress → done → pending 순환.
 *
 * DnD:
 *   - useSortable 로 드래그 트랜스폼/트랜지션 결합.
 *   - activation 은 상위 DndContext 의 PointerSensor 가 관리 (250ms long-press
 *     모바일, 즉시 데스크톱 — 상위 컴포넌트 책임).
 *   - grip 영역에만 listeners 를 바인딩해 카드 전체 탭과 드래그가 충돌하지 않게 한다.
 *
 * 접근성:
 *   - role="listitem"
 *   - 체크박스 role="checkbox" aria-checked="true|false|mixed"
 *     ('mixed' = in_progress — WAI-ARIA 삼단 상태 표준)
 *   - grip 버튼 aria-label='재정렬 핸들'
 *   - 드래그 announcement 는 DndContext 가 screenReaderInstructions 로 제공
 * -------------------------------------------------------------------------- */

export interface TaskRowProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'onToggle' | 'id'> {
  /** DnD 고유 id — SortableContext items 배열과 일치해야 한다. */
  id: string | number
  /** 태스크 상태 — check 모양과 클릭 순환 계산에 사용. */
  status: TaskStatus
  /** 표시 제목. */
  title: string
  /** 라벨 색 — border-left tick 과 chip-meta 의 색을 결정. 없으면 tick 회색. */
  labelColor?: LabelChipColor
  /** 라벨 텍스트 — chip-meta 에 표시. undefined 면 chip 자체 렌더 안 함. */
  labelText?: string
  /**
   * 표시 시각 문자열 (예: "09:30", "—").
   * due_at 이 없으면 approved.json 대로 '—' 를 전달.
   */
  time?: string
  /**
   * 상태 전이 콜백. 다음 상태를 계산해 전달 — 상위에서 Server Action 호출.
   * 낙관적 업데이트를 원하면 상위에서 로컬 state 도 함께 갱신.
   */
  onStatusCycle?: (nextStatus: TaskStatus) => void
  /**
   * 행 탭 → 편집 모달 오픈 콜백.
   * grip / check 영역의 클릭은 data-no-edit 속성으로 제외된다.
   */
  onEdit?: () => void
}

/* --------------------------------------------------------------------------
 * borderLeftColorClass — LabelChipColor → Tailwind 의 border-l-label-* 클래스.
 * calendar(dust-blue) 도 포함 — 현 List View 는 안 쓰지만 타입 커버.
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
 * nextStatus — 3-state 순환: pending → in_progress → done → pending.
 * 명시 함수로 빼서 테스트하기 쉽고, 버튼 핸들러 가독성도 살린다.
 * -------------------------------------------------------------------------- */
function nextStatus(current: TaskStatus): TaskStatus {
  if (current === 'pending') return 'in_progress'
  if (current === 'in_progress') return 'done'
  return 'pending'
}

const styles = sortCx({
  root: {
    /* 48px 최소 높이 · flex row · 중앙 정렬 · 10px gap · 3px 좌측 틱 · 우측만 6px 반경.
     * hover 시 배경 강조 (동일 언어 — Today View 와 공유). */
    base:
      'group/task-row relative flex items-center gap-2.5 min-h-[48px]' +
      ' pl-[11px] pr-2.5 py-2.5 border-l-[3px] rounded-r-md' +
      ' transition-colors duration-100 ease-linear motion-reduce:transition-none' +
      ' hover:bg-bg-primary_hover' +
      ' data-[dragging=true]:opacity-50 data-[dragging=true]:shadow-lg',
  },
  grip: {
    /* 16px 폭 grip — margin-left -4 로 시각상 3px 틱과 붙어 보이게. cursor grab.
     * hover 시 불투명도 1. 마우스에서만 의미있고 터치에서는 전체 row 가 long-press
     * 대상이지만, 스타일은 일관되게. */
    base:
      'flex-none inline-flex items-center justify-center -ml-1 size-4' +
      ' text-text-tertiary opacity-50 cursor-grab active:cursor-grabbing' +
      ' hover:opacity-100 focus-visible:opacity-100' +
      ' focus-visible:outline focus-visible:outline-2' +
      ' focus-visible:outline-offset-2 focus-visible:outline-focus-ring' +
      ' rounded',
  },
  check: {
    /* 18px square · 1.5px border · 4px radius. 기본 transparent/border.
     * in_progress: border-brand + 배경 그라디언트 (approved.json status.in_progress).
     * done: bg-brand-solid + 흰색 check 표시. */
    base:
      'flex-none inline-flex items-center justify-center size-[18px]' +
      ' rounded-[4px] border-[1.5px] border-border-primary bg-transparent' +
      ' transition duration-100 ease-linear motion-reduce:transition-none' +
      ' hover:border-border-brand' +
      ' focus-visible:outline focus-visible:outline-2' +
      ' focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
    inProgress:
      'border-border-brand' +
      ' [background-image:linear-gradient(to_right,var(--color-bg-brand-solid)_50%,transparent_50%)]',
    done:
      'border-bg-brand-solid bg-bg-brand-solid text-white' +
      ' hover:border-bg-brand-solid_hover hover:bg-bg-brand-solid_hover',
  },
  title: {
    /* Pretendard 14px/500 · truncate single-line. done 시 line-through + muted. */
    base:
      'flex-1 min-w-0 truncate text-[14px] leading-[1.4] font-medium text-text-primary',
    done: 'line-through text-text-tertiary',
  },
  time: {
    /* JetBrains Mono 12px tabular-nums · text-tertiary. '—' fallback 은 동일 스타일로 회색. */
    base:
      'flex-none font-mono tabular-nums text-[12px] leading-none' +
      ' text-text-tertiary [font-feature-settings:"tnum"]',
  },
  chipSlot: {
    /* flex-none — chip 내용 폭만큼. */
    base: 'flex-none inline-flex items-center',
  },
})

/* --------------------------------------------------------------------------
 * TaskRow — 행 단위 primitive. SortableContext items 로 이 컴포넌트를 묶어 쓴다.
 * -------------------------------------------------------------------------- */
export function TaskRow({
  id,
  status,
  title,
  labelColor,
  labelText,
  time,
  onStatusCycle,
  onEdit,
  className,
  ...props
}: TaskRowProps) {
  /* --- @dnd-kit sortable wiring ---
   * attributes : role/aria/describedby — grip 버튼에 전개.
   * listeners  : pointer/keyboard 드래그 바인딩 — grip 에만 걸어 row 전체 탭/포커스와 분리.
   * setNodeRef : 최상위 DOM 에 연결.
   * transform  : 드래그 중 시각 translate (CSS transform 으로 변환).
   * transition : 드래그 종료 시 smooth snap.
   * isDragging : data-dragging 으로 스타일 훅 (opacity 0.5 + shadow-lg). */
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const isDone = status === 'done'
  const isInProgress = status === 'in_progress'

  /* aria-checked 3단 상태: 'mixed' 가 in_progress 의 WAI-ARIA 표준 표기. */
  const ariaChecked: boolean | 'mixed' = isDone
    ? true
    : isInProgress
      ? 'mixed'
      : false

  const checkAriaLabel = isDone
    ? '완료 취소'
    : isInProgress
      ? '완료로 표시'
      : '진행 중으로 표시'

  const handleCheckClick = () => {
    if (onStatusCycle) onStatusCycle(nextStatus(status))
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-slot="task-list-row"
      data-task-id={id}
      data-status={status}
      data-dragging={isDragging || undefined}
      role="listitem"
      onClick={event => {
        /* grip / checkbox 등 data-no-edit 을 가진 내부 요소 클릭은 편집 오픈을 막는다.
         * closest 로 상위 체인을 훑어 버튼 내부의 아이콘/자식 클릭까지 안전하게 흡수. */
        if (
          onEdit &&
          !(event.target as HTMLElement).closest('[data-no-edit="true"]')
        ) {
          onEdit()
        }
      }}
      className={cx(
        styles.root.base,
        onEdit && 'cursor-pointer',
        labelColor ? borderLeftColorClass[labelColor] : 'border-l-border-primary',
        className,
      )}
      {...props}
    >
      {/* Grip — 드래그 listener 전용 영역. 키보드 접근은 attributes 가 role="button" + aria 를 주입. */}
      <button
        type="button"
        aria-label="재정렬 핸들"
        data-no-edit="true"
        className={styles.grip.base}
        {...attributes}
        {...listeners}
      >
        <DotsGrid aria-hidden="true" className="size-3" strokeWidth={2} />
      </button>

      {/* 3-state checkbox */}
      <button
        type="button"
        role="checkbox"
        aria-checked={ariaChecked}
        aria-label={checkAriaLabel}
        data-no-edit="true"
        onClick={handleCheckClick}
        className={cx(
          styles.check.base,
          isInProgress && styles.check.inProgress,
          isDone && styles.check.done,
        )}
      >
        {isDone && (
          <Check aria-hidden="true" className="size-3" strokeWidth={2.25} />
        )}
      </button>

      {/* Title */}
      <span className={cx(styles.title.base, isDone && styles.title.done)}>
        {title}
      </span>

      {/* Time — JetBrains Mono. '—' fallback 은 호출자가 전달. */}
      {time !== undefined && (
        <span className={styles.time.base} aria-label={`예정 시각 ${time}`}>
          {time}
        </span>
      )}

      {/* Chip-meta (라벨 이름) — labelText 가 주어진 경우에만. labelColor 가 없으면
          chip 색이 결정되지 않으므로 chip 도 생략. */}
      {labelText && labelColor && (
        <span className={styles.chipSlot.base}>
          <LabelChip color={labelColor} variant="dot" size="md">
            {labelText}
          </LabelChip>
        </span>
      )}
    </div>
  )
}
