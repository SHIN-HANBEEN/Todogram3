'use client'

import type { HTMLAttributes, ReactNode } from 'react'
import { ChevronDown } from '@untitledui/icons'
import { useDroppable } from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { cx, sortCx } from '@/utils/cx'
import type { TaskStatus } from '@/db/schema'

/* --------------------------------------------------------------------------
 * sectionDroppableId — 섹션의 useDroppable 고유 id 를 생성.
 *
 * TaskListView 의 onDragEnd 에서 over.id 가 task id 인지 section id 인지
 * 구분하기 위해 `section-` prefix 를 부여한다. 섹션이 비어있을 때도 드롭 가능한
 * 영역을 확보하기 위한 장치 — SortableContext 는 items 가 0 이면 자체적으로
 * 드롭을 받지 않기 때문.
 * -------------------------------------------------------------------------- */
export function sectionDroppableId(status: TaskStatus): string {
  return `section-${status}`
}

/* --------------------------------------------------------------------------
 * StatusSection — Todogram v3 List View 상태별 섹션 컨테이너
 *
 * approved.json list-view-20260419 · spec.section 근거.
 *
 * 역할:
 *   - 3개 고정 섹션(pending / in_progress / done) 중 하나를 담는 래퍼.
 *   - 헤더 클릭으로 접기/펼치기. done 은 기본 접힘(외부가 제어).
 *   - 내부 items 를 SortableContext 로 감싸 TaskRow 의 useSortable 이
 *     같은 섹션 내 정렬 전략(수직)을 공유하도록 한다.
 *
 * 헤더 지오메트리:
 *   - sticky top 0 · bg-bg-primary · z-2(필터 rail 의 z-5 보다 낮게 유지)
 *   - padding 4 2 8 / border-b 1px (섹션 구분선, 접혔을 때도 유지)
 *   - 좌측: [caret 14px] [status-dot 8px] [이름 eyebrow]
 *   - 우측: [count JetBrains Mono tabular-nums]
 *
 * caret:
 *   - ChevronDown 을 기본(펼침)으로 두고 접히면 rotate(-90deg)
 *   - transition-transform 150ms ease-linear, reduced-motion 시 none
 *
 * status-dot:
 *   - 체크박스 시각 언어와 동일 — pending=테두리만, in_progress=절반 그라디언트,
 *     done=브랜드 solid. 8px 사이즈로 축소.
 *
 * 접근성:
 *   - 헤더는 button (role=button 암묵) · aria-expanded · aria-controls → 패널 id
 *   - 내부 rows wrapper 에 id + role="list"
 *   - 콘텐츠 영역은 접혔을 때 `hidden` 으로 숨김 — aria-expanded 와 정합
 *
 * DnD 접점:
 *   - items 배열의 id (string|number) 가 TaskRow 의 id 와 일치해야 useSortable
 *     트리가 정상 작동한다. 호출자가 id 를 섞지 않도록 보장할 책임.
 *   - 이 컴포넌트는 DndContext 를 생성하지 않는다 — 상위(TaskListView)가 단일
 *     DndContext 로 3섹션을 한 번에 관리해 섹션 간 드래그를 자연스럽게 허용한다.
 * -------------------------------------------------------------------------- */

export interface StatusSectionProps
  extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** 섹션의 상태 — 헤더/dot 색과 data-status 값에 사용. */
  status: TaskStatus
  /** 표시 이름 (예: '할 일', '진행 중', '완료'). */
  title: string
  /** 섹션에 속한 task id 배열 — SortableContext items 로 전달. */
  itemIds: Array<string | number>
  /** TaskRow 자식들. 호출자가 itemIds 와 동일 순서로 렌더. */
  children: ReactNode
  /** 접힘 여부. true → 콘텐츠 숨김. */
  collapsed: boolean
  /** 접힘 상태 토글 콜백. */
  onToggleCollapsed: () => void
  /** 헤더 우측 카운트. 없으면 itemIds.length 로 폴백. */
  count?: number
  /** aria-controls 용 고유 id. 기본값 "status-section-{status}". */
  panelId?: string
  /** items 가 0 개일 때 패널에 표시할 문구. 없으면 placeholder 생략. */
  emptyCopy?: string
}

/* --------------------------------------------------------------------------
 * statusDotClass — 상태별 도트 시각 매핑.
 *   - pending  : 1.5px 테두리만 (empty checkbox 느낌)
 *   - in_progress : 브랜드 테두리 + 좌측 50% 그라디언트 채움
 *   - done     : 브랜드 solid fill (완료 체크박스와 동일)
 * 8px 크기로 축소해 헤더 내에서 시각 비중이 크지 않도록.
 * -------------------------------------------------------------------------- */
const statusDotClass: Record<TaskStatus, string> = {
  pending: 'border-[1.5px] border-border-primary bg-transparent',
  in_progress:
    'border-[1.5px] border-border-brand' +
    ' [background-image:linear-gradient(to_right,var(--color-bg-brand-solid)_50%,transparent_50%)]',
  done: 'bg-bg-brand-solid border-[1.5px] border-bg-brand-solid',
}

const styles = sortCx({
  root: {
    /* 섹션 루트 — flex col · gap 0 (헤더와 패널 사이 간격은 헤더 하단 border 로 표시).
     * data-collapsed 로 조상 selectors 가 헤더 caret 회전 외에도 추가 스타일 걸 수 있게. */
    base: 'flex flex-col',
  },
  header: {
    /* sticky 44px 터치 타겟 · 풀폭 · bg-bg-primary · 하단 1px 구분선.
     * z-2 — 필터 rail(z-5) 아래, row 위. 좌우 16px 전체 인셋은 부모(stream)가 제공하므로
     * 여기서는 좌우 2px 여유만 (ChevronDown 의 시각 여백이 자연스러워지도록). */
    base:
      'sticky top-0 z-[2] flex items-center justify-between' +
      ' min-h-[44px] pl-0.5 pr-0.5 pt-1 pb-2' +
      ' bg-bg-primary border-b border-border-primary' +
      ' text-left select-none' +
      ' transition-colors duration-100 ease-linear motion-reduce:transition-none' +
      ' hover:bg-bg-primary_hover' +
      ' focus-visible:outline focus-visible:outline-2' +
      ' focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
  },
  headerLeft: {
    /* caret + dot + name. gap 8px · 좌측 6px inset 으로 row 좌측 3px tick 과 정렬. */
    base: 'flex items-center gap-2 pl-1.5',
  },
  caret: {
    /* 14px ChevronDown. 접히면 rotate(-90deg). 150ms 전환. */
    base:
      'size-3.5 text-text-tertiary' +
      ' transition-transform duration-150 ease-linear' +
      ' motion-reduce:transition-none',
    collapsed: '-rotate-90',
  },
  dot: {
    /* 8px 원형 — 체크박스 시각 언어 축소판. 4px radius 로 살짝 부드럽게. */
    base: 'inline-block size-2 rounded-[3px]',
  },
  name: {
    /* eyebrow — Pretendard 11px 600 · 0.08em tracking · uppercase-like 느낌.
     * 한글에서 uppercase 는 무의미하므로 letter-spacing 으로만 강조. */
    base:
      'text-[11px] leading-none font-semibold tracking-[0.06em]' +
      ' text-text-secondary',
  },
  count: {
    /* JetBrains Mono tabular-nums 12px · text-tertiary. 0 도 동일 스타일. */
    base:
      'flex-none font-mono tabular-nums text-[12px] leading-none' +
      ' text-text-tertiary [font-feature-settings:"tnum"] pr-1.5',
  },
  panel: {
    /* rows wrapper. gap 2px — row 간 호흡. padding 상하 4, 좌 0 (row 가 직접 inset 처리). */
    base: 'flex flex-col gap-0.5 pt-1 pb-2',
    collapsed: 'hidden',
  },
  empty: {
    /* 섹션이 비었을 때. center · 가벼운 회색. */
    base:
      'flex items-center justify-center py-6 text-[13px] leading-none' +
      ' text-text-quaternary',
  },
})

/* --------------------------------------------------------------------------
 * StatusSection — 섹션 헤더 + SortableContext + 패널 3단 구조.
 * -------------------------------------------------------------------------- */
export function StatusSection({
  status,
  title,
  itemIds,
  children,
  collapsed,
  onToggleCollapsed,
  count,
  panelId,
  emptyCopy,
  className,
  ...props
}: StatusSectionProps) {
  const resolvedPanelId = panelId ?? `status-section-${status}`
  const resolvedCount = count ?? itemIds.length
  const isEmpty = itemIds.length === 0

  /* 섹션 루트를 useDroppable 로 등록 — 빈 섹션도 드롭 타겟이 되도록.
   * isOver 로 드롭 하이라이트(bg-bg-brand-primary) 를 잠깐 표시. */
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: sectionDroppableId(status),
    data: { kind: 'section', status },
  })

  return (
    <section
      data-slot="task-list-status-section"
      data-status={status}
      data-collapsed={collapsed || undefined}
      className={cx(styles.root.base, className)}
      {...props}
    >
      <button
        type="button"
        aria-expanded={!collapsed}
        aria-controls={resolvedPanelId}
        onClick={onToggleCollapsed}
        className={styles.header.base}
      >
        <span className={styles.headerLeft.base}>
          <ChevronDown
            aria-hidden="true"
            className={cx(styles.caret.base, collapsed && styles.caret.collapsed)}
            strokeWidth={2}
          />
          <span
            aria-hidden="true"
            className={cx(styles.dot.base, statusDotClass[status])}
          />
          <span className={styles.name.base}>{title}</span>
        </span>
        <span className={styles.count.base} aria-label={`${title} ${resolvedCount}건`}>
          {resolvedCount}
        </span>
      </button>

      {/* SortableContext 는 상위 DndContext 가 설정한 센서/충돌 감지 위에서
          items 순서를 공유한다. itemIds 순서가 TaskRow 렌더 순서와 반드시 일치. */}
      <SortableContext
        items={itemIds}
        strategy={verticalListSortingStrategy}
      >
        <div
          ref={setDroppableRef}
          id={resolvedPanelId}
          role="list"
          aria-label={title}
          hidden={collapsed}
          data-drop-over={isOver || undefined}
          className={cx(
            styles.panel.base,
            collapsed && styles.panel.collapsed,
            isOver && 'bg-bg-brand-primary/40 rounded-md',
          )}
        >
          {isEmpty && emptyCopy ? (
            <p className={styles.empty.base}>{emptyCopy}</p>
          ) : (
            children
          )}
        </div>
      </SortableContext>
    </section>
  )
}
