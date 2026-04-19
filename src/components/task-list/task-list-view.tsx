'use client'

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react'
import type { HTMLAttributes } from 'react'
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'

import { cx, sortCx } from '@/utils/cx'
import { Fab } from '@/components/todogram/fab'
import {
  FILTER_ALL,
  type FilterValue,
  type LabelId,
} from '@/components/todogram/labels'
import type { LabelChipColor } from '@/components/todogram/label-chip'
import type { Task, TaskStatus } from '@/db/schema'
import { toggleTaskStatus, updateTaskPosition } from '@/actions/tasks'

import { SearchBox } from './search-box'
import {
  LabelFilterRail,
  buildListFilterItems,
  type FilterableUserLabel,
} from './label-filter-rail'
import { sectionDroppableId, StatusSection } from './status-section'
import { TaskRow } from './task-row'

/* --------------------------------------------------------------------------
 * TaskListView — Todogram v3 List View 스크린 컨테이너 (Phase 4 U2)
 *
 * approved.json list-view-20260419 (Variant C — Status Sections / Kanban-lite) 근거.
 *
 * 수직 구성:
 *   [ SearchBox (sticky top) ]
 *   [ LabelFilterRail (sticky, 검색 아래) ]
 *   [ StatusSection × 3 (pending → in_progress → done) ]
 *   [ Fab (+ 새 태스크) ]
 *
 * 상태:
 *   - tasks:        현재 사용자 태스크 전량 (라벨 배열 포함).
 *                   낙관적 업데이트를 위해 부모가 서버에서 받은 초기값을
 *                   그대로 로컬 state 로 다룬다. mutation 성공 후에도 revalidatePath
 *                   가 서버 컴포넌트를 다시 렌더해 props 가 갱신되므로 메모리 상
 *                   stale 은 짧다.
 *   - activeFilter: 라벨 필터 (전체 / 특정 라벨 id).
 *   - searchQuery:  검색 박스 입력값 (client-side ILIKE-like 매칭).
 *   - collapsedBy:  섹션별 접힘 상태. 기본 { pending:false, in_progress:false, done:true }.
 *
 * 필터링 파이프라인:
 *   1) activeFilter 적용 — 'all' 이면 모든 태스크, 특정 id 면 해당 라벨 포함 태스크.
 *   2) searchQuery 적용 — title OR notes 에 대소문자 무시 substring.
 *   3) status 별 bucket — 3 섹션으로 분리. 각 섹션 내부는 position 오름차순.
 *
 * v1 정책: 검색이 비어있든 아니든 섹션 구조를 유지 (approved.json 결정).
 * 검색어가 해당 섹션 모두에서 0건이면 emptyCopy 플레이스홀더 표시.
 *
 * DnD 모델:
 *   - 단일 <DndContext> 가 3 섹션의 SortableContext 를 모두 커버 → 섹션 간 드래그 가능.
 *   - PointerSensor: activation constraint { distance: 4 } — 4px 이상 이동해야 드래그 시작.
 *                    탭/클릭과 충돌 방지. 모바일 long-press 는 grip 버튼의 터치 지연
 *                    대신 distance 로 처리 (단순성 우선).
 *   - KeyboardSensor: sortableKeyboardCoordinates — space 로 pick up, 화살표로 이동, enter 로 drop.
 *   - closestCorners: 섹션 간 이동 시 비어있는 영역에서도 적절한 타겟을 찾기 쉬움.
 *   - onDragEnd:
 *       active.id = 이동할 task id (string — TaskRow 에 string 으로 넘기기 때문)
 *       over.id   = 드롭 타겟. task id 이거나 `section-{status}` (useDroppable)
 *       → 두 경우로 분기해서 destination status / position 계산 후 서버 호출.
 *       낙관적 업데이트: 로컬 tasks 를 즉시 재배치, 실패 시 롤백.
 * -------------------------------------------------------------------------- */

/* --------------------------------------------------------------------------
 * 타입
 * -------------------------------------------------------------------------- */

/**
 * TaskListView 가 소비하는 라벨 정보 — DB Label 의 축소판.
 * - id: 라벨 DB id (string 화된 값). LabelId 와 동일.
 * - name: 화면 표시명.
 * - color: 이미 LabelChipColor slug 로 변환된 값 (hex→slug 변환은 서버 페이지 책임).
 */
export interface TaskListLabel {
  id: LabelId
  name: string
  color: LabelChipColor
}

/**
 * TaskListView 가 소비하는 태스크 뷰 모델.
 * - task: DB Task 행 (status, position, title, notes, dueAt 등 포함).
 * - labelIds: 이 태스크에 부착된 라벨 id 배열 (v1 은 0 또는 1 개).
 */
export interface TaskListItem {
  task: Task
  labelIds: LabelId[]
}

export interface TaskListViewProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  /** 초기 태스크 목록 — 부모 서버 페이지가 로드해 주입. */
  initialTasks: TaskListItem[]
  /** 사용자 라벨 목록 — filter rail 과 row 라벨 렌더에 사용. */
  userLabels: TaskListLabel[]
  /** 새 태스크 추가 FAB 클릭. 지정 시 Fab 렌더. */
  onCreateTask?: () => void
  /** 로케일. 기본 'ko'. */
  locale?: 'ko' | 'en'
}

/* --------------------------------------------------------------------------
 * 스타일 — wrapper/stream/header 그룹핑.
 * -------------------------------------------------------------------------- */
const styles = sortCx({
  wrapper: {
    /* 단일 컬럼 · 높이 100dvh · bg-page. BottomNav 가 아래 72px 덮음 → stream padding-bottom 으로 여백 확보.
     * overflow-x-hidden 은 섹션 내부 스크롤과 독립. */
    base:
      'relative flex flex-col h-full min-h-dvh bg-bg-primary text-text-primary',
  },
  searchWrapper: {
    /* search 박스 래퍼 — 좌우 16 padding 상 12 하 6. 상단 sticky 는 내부에서 담당하지 않고
     * 단순히 흐름 상 상단 고정. 부모 컨테이너 스크롤 전제. */
    base: 'px-4 pt-3 pb-1.5 bg-bg-primary',
  },
  stream: {
    /* flex: 1 남는 공간 · 세로 스크롤 only.
     * padding 좌우 16 상 4 하 120 (= BottomNav 72 + Fab gap 16 + buffer 32). */
    base:
      'flex-1 flex flex-col gap-1 px-4 pt-1 pb-[120px]' +
      ' overflow-x-hidden overflow-y-auto',
  },
  emptyAll: {
    /* 전체 빈 상태 — 아무 태스크도 없을 때. */
    base:
      'flex flex-col items-center justify-center py-20 text-center' +
      ' text-text-tertiary text-[13px]',
  },
})

/* --------------------------------------------------------------------------
 * 내부 유틸
 * -------------------------------------------------------------------------- */

/** 섹션 접힘 상태. done 은 기본 접힘 (approved.json 정책). */
type CollapsedState = Record<TaskStatus, boolean>
const DEFAULT_COLLAPSED: CollapsedState = {
  pending: false,
  in_progress: false,
  done: true,
}

/** 섹션 순서 — 고정. */
const STATUS_ORDER: readonly TaskStatus[] = ['pending', 'in_progress', 'done']

/* --------------------------------------------------------------------------
 * DB 의 tasks.status 컬럼은 `text()` 라서 Drizzle 이 string 으로만 추론한다.
 * 앱 레이어는 TASK_STATUSES(3종) 로 집합을 강제하므로 실제 값은 반드시 TaskStatus.
 * 중간에서 한 번만 좁히고 나머지 파이프라인은 안전하게 TaskStatus 로 흐르게 한다.
 * -------------------------------------------------------------------------- */
function asTaskStatus(value: string): TaskStatus {
  return value as TaskStatus
}

/** over.id 가 섹션 droppable id 인지 판별. */
function parseSectionId(id: string | number): TaskStatus | null {
  if (typeof id !== 'string') return null
  if (!id.startsWith('section-')) return null
  const rest = id.slice('section-'.length) as TaskStatus
  if (rest === 'pending' || rest === 'in_progress' || rest === 'done') {
    return rest
  }
  return null
}

/** 섹션 타이틀/빈문구 locale 매핑. */
const copy: Record<
  'ko' | 'en',
  { pending: string; in_progress: string; done: string; emptyPending: string; emptyInProgress: string; emptyDone: string; emptyAll: string; search: string }
> = {
  ko: {
    pending: '할 일',
    in_progress: '진행 중',
    done: '완료',
    emptyPending: '아직 할 일이 없어요.',
    emptyInProgress: '진행 중인 항목이 없어요.',
    emptyDone: '완료한 항목이 없어요.',
    emptyAll: '검색 결과가 없어요.',
    search: '제목·메모에서 찾기',
  },
  en: {
    pending: 'To do',
    in_progress: 'In progress',
    done: 'Done',
    emptyPending: 'Nothing to do yet.',
    emptyInProgress: 'Nothing in progress.',
    emptyDone: 'No completed items.',
    emptyAll: 'No matches.',
    search: 'Search title or notes',
  },
}

/* --------------------------------------------------------------------------
 * TaskListView — presenter + DnD orchestrator.
 * -------------------------------------------------------------------------- */
export function TaskListView({
  initialTasks,
  userLabels,
  onCreateTask,
  locale = 'ko',
  className,
  ...props
}: TaskListViewProps) {
  const text = copy[locale]

  /* --- 로컬 상태 ------------------------------------------------------- */
  const [items, setItems] = useState<TaskListItem[]>(initialTasks)
  const [activeFilter, setActiveFilter] = useState<FilterValue>(FILTER_ALL)
  const [searchQuery, setSearchQuery] = useState('')
  const [collapsed, setCollapsed] = useState<CollapsedState>(DEFAULT_COLLAPSED)
  const [, startTransition] = useTransition()

  /* 드래그 중 관찰용 — 현재는 active id 저장만. DragOverlay 구현 시 확장. */
  const [, setActiveId] = useState<string | null>(null)

  /* 서버 mutation 이 경합할 때 낙관적 업데이트를 롤백할 스냅샷. */
  const snapshotRef = useRef<TaskListItem[] | null>(null)

  /* 라벨 id → 메타 (이름/색) 빠른 조회. 필터/row 둘 다 사용. */
  const labelLookup = useMemo(() => {
    const map = new Map<LabelId, TaskListLabel>()
    for (const l of userLabels) map.set(l.id, l)
    return map
  }, [userLabels])

  /* FilterRail 아이템 구성 — calendar reserved 제외. */
  const filterItems = useMemo(
    () =>
      buildListFilterItems(
        userLabels.map<FilterableUserLabel>(l => ({
          id: l.id,
          name: l.name,
          color: l.color,
        })),
        locale,
      ),
    [userLabels, locale],
  )

  /* --- 필터/검색 파이프라인 -------------------------------------------- */
  const normalizedQuery = searchQuery.trim().toLowerCase()

  const visibleItems = useMemo(() => {
    return items.filter(({ task, labelIds }) => {
      /* 1) 라벨 필터. */
      if (activeFilter !== FILTER_ALL) {
        if (!labelIds.includes(activeFilter as LabelId)) return false
      }
      /* 2) 검색어. title 또는 notes 서브스트링 (대소문자 무시). */
      if (normalizedQuery.length > 0) {
        const inTitle = task.title.toLowerCase().includes(normalizedQuery)
        const inNotes =
          typeof task.notes === 'string' &&
          task.notes.toLowerCase().includes(normalizedQuery)
        if (!inTitle && !inNotes) return false
      }
      return true
    })
  }, [items, activeFilter, normalizedQuery])

  /* 섹션별 분리 + position 정렬. 동일 position 은 id 로 tiebreak (서버 정렬과 동일). */
  const bySection = useMemo(() => {
    const buckets: Record<TaskStatus, TaskListItem[]> = {
      pending: [],
      in_progress: [],
      done: [],
    }
    for (const entry of visibleItems) {
      buckets[asTaskStatus(entry.task.status)].push(entry)
    }
    for (const s of STATUS_ORDER) {
      buckets[s].sort((a, b) => {
        if (a.task.position !== b.task.position) {
          return a.task.position - b.task.position
        }
        return a.task.id - b.task.id
      })
    }
    return buckets
  }, [visibleItems])

  /* task id → 현재 section 빠른 조회 (onDragEnd 에서 사용). */
  const statusOf = useMemo(() => {
    const map = new Map<string, TaskStatus>()
    for (const { task } of items)
      map.set(String(task.id), asTaskStatus(task.status))
    return map
  }, [items])

  /* --- DnD 센서 -------------------------------------------------------- */
  const sensors = useSensors(
    useSensor(PointerSensor, {
      /* 4px 이상 움직여야 드래그 시작 — row 탭/체크박스 클릭과 충돌 방지. */
      activationConstraint: { distance: 4 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  /* --- 핸들러 ---------------------------------------------------------- */

  const toggleCollapsed = useCallback((status: TaskStatus) => {
    setCollapsed(prev => ({ ...prev, [status]: !prev[status] }))
  }, [])

  const handleStatusCycle = useCallback(
    (taskId: number, nextStatus: TaskStatus) => {
      /* 낙관적 업데이트 — 로컬 상태 즉시 반영. 실패 시 snapshotRef 로 롤백. */
      snapshotRef.current = items
      setItems(prev =>
        prev.map(entry =>
          entry.task.id === taskId
            ? {
                ...entry,
                task: {
                  ...entry.task,
                  status: nextStatus,
                  doneAt: nextStatus === 'done' ? new Date() : null,
                },
              }
            : entry,
        ),
      )

      startTransition(async () => {
        try {
          await toggleTaskStatus(taskId, { status: nextStatus })
          snapshotRef.current = null
        } catch (err) {
          console.error('[TaskListView] toggleTaskStatus 실패:', err)
          if (snapshotRef.current) {
            setItems(snapshotRef.current)
            snapshotRef.current = null
          }
        }
      })
    },
    [items, startTransition],
  )

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id))
  }, [])

  const handleDragCancel = useCallback(() => {
    setActiveId(null)
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null)
      const { active, over } = event
      if (!over) return

      const activeIdStr = String(active.id)
      const overIdStr = String(over.id)
      if (activeIdStr === overIdStr) return

      const activeTaskId = Number(activeIdStr)
      if (!Number.isFinite(activeTaskId)) return

      const fromStatus = statusOf.get(activeIdStr)
      if (!fromStatus) return

      /* 목적지 status 결정. over 가 섹션 droppable 이면 해당 status, 아니면 taskId 로 찾기. */
      const overSectionStatus = parseSectionId(over.id)
      const toStatus = overSectionStatus ?? statusOf.get(overIdStr)
      if (!toStatus) return

      /* 전역 position 계산:
       *   서버의 updateTaskPosition 은 "전체 태스크 정렬 리스트 내 1-based index" 를 받는다.
       *   클라이언트도 동일한 정렬 기준(position ASC → id ASC)으로 index 를 계산해야
       *   optimistic update 와 서버 결과가 일치한다. */
      const globalOrdered = [...items].sort((a, b) => {
        if (a.task.position !== b.task.position) {
          return a.task.position - b.task.position
        }
        return a.task.id - b.task.id
      })
      const currentGlobalIdx = globalOrdered.findIndex(
        e => e.task.id === activeTaskId,
      )
      if (currentGlobalIdx === -1) return

      /* 목적지 global index 를 over 로부터 계산. */
      let destGlobalIdx: number
      if (overSectionStatus) {
        /* 섹션 드롭 — 해당 섹션의 마지막 요소 바로 뒤 (또는 빈 섹션이면 섹션 경계). */
        const lastInSection = [...globalOrdered]
          .reverse()
          .findIndex(e => e.task.status === overSectionStatus)
        if (lastInSection === -1) {
          /* 섹션이 비어있음 — 가까운 경계에 삽입. STATUS_ORDER 기준으로 pending < in_progress < done.
           * 섹션 순서상 해당 섹션 앞뒤의 경계를 찾아 index 결정. */
          const sectionRank = STATUS_ORDER.indexOf(overSectionStatus)
          let boundary = 0
          for (let i = 0; i < globalOrdered.length; i += 1) {
            const item = globalOrdered[i]
            if (!item) continue
            const itemRank = STATUS_ORDER.indexOf(asTaskStatus(item.task.status))
            if (itemRank >= sectionRank) {
              boundary = i
              break
            }
            boundary = i + 1
          }
          destGlobalIdx = boundary
        } else {
          destGlobalIdx = globalOrdered.length - 1 - lastInSection + 1
        }
      } else {
        /* 태스크 위로 드롭 — 그 태스크의 index. */
        const overIdx = globalOrdered.findIndex(
          e => e.task.id === Number(overIdStr),
        )
        if (overIdx === -1) return
        destGlobalIdx = overIdx
      }

      /* splice 시뮬레이션: 현재 원소를 빼낸 뒤 dest 에 삽입. */
      const working = [...globalOrdered]
      const [moved] = working.splice(currentGlobalIdx, 1)
      if (!moved) return
      /* splice 로 원소를 뺐으므로 dest 가 뒤에 있었다면 index 가 1 밀림.
       * overSectionStatus 가 있고 currentGlobalIdx < destGlobalIdx 면 -1 보정. */
      const adjustedDest =
        currentGlobalIdx < destGlobalIdx ? destGlobalIdx - 1 : destGlobalIdx
      const clampedDest = Math.max(0, Math.min(adjustedDest, working.length))
      working.splice(clampedDest, 0, moved)

      /* 낙관적 업데이트: 로컬 items 를 새 순서 + 새 status + 새 position 으로 교체. */
      const newPosition = clampedDest + 1 /* 1-based */
      snapshotRef.current = items
      const nextItems = working.map((entry, idx) => {
        const isMoved = entry.task.id === activeTaskId
        const newStatusForMoved = isMoved ? toStatus : entry.task.status
        const newDoneAtForMoved = isMoved
          ? newStatusForMoved === 'done'
            ? new Date()
            : null
          : entry.task.doneAt
        return {
          ...entry,
          task: {
            ...entry.task,
            position: idx + 1,
            status: newStatusForMoved,
            doneAt: newDoneAtForMoved,
          },
        }
      })
      setItems(nextItems)

      /* 서버 호출 — 실패 시 스냅샷으로 롤백. */
      startTransition(async () => {
        try {
          await updateTaskPosition(activeTaskId, {
            newPosition,
            newStatus: toStatus !== fromStatus ? toStatus : undefined,
          })
          snapshotRef.current = null
        } catch (err) {
          console.error('[TaskListView] updateTaskPosition 실패:', err)
          if (snapshotRef.current) {
            setItems(snapshotRef.current)
            snapshotRef.current = null
          }
        }
      })
    },
    [items, statusOf, startTransition],
  )

  /* --- 렌더 ------------------------------------------------------------ */

  const sectionTitle: Record<TaskStatus, string> = {
    pending: text.pending,
    in_progress: text.in_progress,
    done: text.done,
  }
  const emptyCopy: Record<TaskStatus, string> = {
    pending: text.emptyPending,
    in_progress: text.emptyInProgress,
    done: text.emptyDone,
  }

  /* dueAt → "HH:mm" (locale 에 상관없이 24h). null 이면 '—'. */
  const formatTime = (dueAt: Date | null): string => {
    if (!dueAt) return '—'
    const d = dueAt instanceof Date ? dueAt : new Date(dueAt)
    if (Number.isNaN(d.getTime())) return '—'
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return `${hh}:${mm}`
  }

  const totalVisible =
    bySection.pending.length +
    bySection.in_progress.length +
    bySection.done.length

  return (
    <div
      data-slot="task-list-view"
      data-filter={String(activeFilter)}
      data-search={normalizedQuery.length > 0 || undefined}
      className={cx(styles.wrapper.base, className)}
      {...props}
    >
      {/* 검색 박스 — 최상단. sticky 는 LabelFilterRail 이 담당(필터 rail 기준 상단 0). */}
      <div className={styles.searchWrapper.base}>
        <SearchBox
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder={text.search}
          debounceMs={0 /* 클라이언트 필터링이라 디바운스 불필요 */}
        />
      </div>

      {/* 라벨 필터 rail — calendar 제외. */}
      <LabelFilterRail
        items={filterItems}
        active={activeFilter}
        onChange={setActiveFilter}
        ariaLabel={locale === 'ko' ? '라벨 필터' : 'Label filter'}
      />

      {/* 스트림 — 3 섹션. DndContext 는 단일 인스턴스로 전체 섹션을 감싸야
          섹션 간 드래그가 가능하다. */}
      <div className={styles.stream.base}>
        {totalVisible === 0 && (
          <p className={styles.emptyAll.base}>{text.emptyAll}</p>
        )}

        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          {STATUS_ORDER.map(status => {
            const sectionItems = bySection[status]
            const itemIds = sectionItems.map(e => String(e.task.id))
            return (
              <StatusSection
                key={status}
                status={status}
                title={sectionTitle[status]}
                itemIds={itemIds}
                count={sectionItems.length}
                collapsed={collapsed[status]}
                onToggleCollapsed={() => toggleCollapsed(status)}
                emptyCopy={emptyCopy[status]}
              >
                {sectionItems.map(({ task, labelIds }) => {
                  const firstLabelId = labelIds[0]
                  const labelMeta = firstLabelId
                    ? labelLookup.get(firstLabelId)
                    : undefined
                  return (
                    <TaskRow
                      key={task.id}
                      id={String(task.id)}
                      status={asTaskStatus(task.status)}
                      title={task.title}
                      time={formatTime(task.dueAt)}
                      labelColor={labelMeta?.color}
                      labelText={labelMeta?.name}
                      onStatusCycle={next =>
                        handleStatusCycle(task.id, next)
                      }
                      /* sectionDroppableId 가 status 에서만 파생되므로,
                         droppable section 쪽이 항상 TaskRow 보다 우선 확보되도록
                         data-section-droppable-id 를 부여. 접근성 영향은 없음. */
                      data-section-droppable-id={sectionDroppableId(status)}
                    />
                  )
                })}
              </StatusSection>
            )
          })}
        </DndContext>
      </div>

      {/* FAB — 새 태스크 추가. */}
      {onCreateTask && <Fab onClick={onCreateTask} locale={locale} />}
    </div>
  )
}
