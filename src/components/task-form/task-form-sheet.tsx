'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X as CloseX, Trash01 } from '@untitledui/icons'

import { cx } from '@/utils/cx'
import {
  Dialog,
  Modal,
  ModalOverlay,
} from '@/components/application/modals/modal'
import { LabelChip, type LabelChipColor } from '@/components/todogram/label-chip'
import { createTask, deleteTask, updateTask } from '@/actions/tasks'
import { setTaskLabels } from '@/actions/task-labels'
import {
  TASK_LOCATION_MAX_LENGTH,
  TASK_NOTES_MAX_LENGTH,
  TASK_TITLE_MAX_LENGTH,
} from '@/lib/validators/tasks'
import { TASK_LABELS_MAX_COUNT } from '@/lib/validators/task-labels'
import type { Task } from '@/db/schema'

/* --------------------------------------------------------------------------
 * TaskFormSheet — Phase 4 U3 (Task 생성/편집 모달)
 *
 * approved.json: designs/task-form-modal-20260419 (Variant A · Quiet Sheet) 근거.
 *
 * 형태:
 *   - 모바일: 바텀 시트 (rounded 24px 24px 0 0). ModalOverlay 가 max-sm:items-end
 *     로 기본값 제공 → 여기서는 시트 모서리만 커스터마이즈.
 *   - 데스크탑: 중앙 모달 560px · max-height 85vh.
 *
 * 스크롤 정책:
 *   - 시트 body 단일 스크롤. chip-row 만 예외적으로 가로 스크롤 (한 줄 유지).
 *   - title / memo 는 autosize 로 내용만큼 커짐 — 각 필드에 내부 스크롤 없음.
 *     → 승인 근거: 사용자가 직접 확인한 두 번째 리파인먼트.
 *   - title-wrap 은 sticky 아님 — 일반 콘텐츠와 함께 스크롤.
 *
 * 폼 검증:
 *   - RHF + Zod. 폼 로컬 스키마(formSchema) 가 UI 제약 전담, 제출 시 서버 Zod 가
 *     재검증 → 이중 보호.
 *   - labelIds 는 TASK_LABELS_MAX_COUNT 에서 잘림. 중복은 Set 으로 제거.
 *
 * 키보드:
 *   - Esc: Modal 가 처리 (React Aria 기본).
 *   - Cmd/Ctrl+Enter: 저장 (title textarea 는 Enter 가 줄바꿈이라 단축키는 meta 필수).
 *   - Cmd/Ctrl+Del: 편집 모드에서 삭제 (approved.json).
 *
 * 접근성:
 *   - Modal dialog 에 aria-labelledby → 헤더 제목과 연결.
 *   - 터치 타겟 48px ↑ (닫기/저장 버튼, 토글).
 *   - prefers-reduced-motion 준수 (ModalOverlay 의 animate-in 은 motion-safe 스코프).
 * -------------------------------------------------------------------------- */

/* --------------------------------------------------------------------------
 * 폼 로컬 스키마
 *
 * - Server Action 의 Zod (createTaskInputSchema / updateTaskInputSchema) 와 한 군데
 *   모양이 어긋나면 사용자가 클라이언트를 통과한 값으로도 서버에서 에러가 난다.
 *   그래서 여기 스키마는 서버 스키마보다 "동일 수준 또는 더 엄격" 하게 유지한다.
 * - dueAt 은 datetime-local 입력값(YYYY-MM-DDTHH:mm) 그대로 문자열로 받는다.
 *   빈 문자열은 "마감 없음" 의도 → 서버 스키마가 null 로 정규화한다.
 * -------------------------------------------------------------------------- */
const formSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, '제목은 1자 이상이어야 합니다.')
    .max(
      TASK_TITLE_MAX_LENGTH,
      `제목은 ${TASK_TITLE_MAX_LENGTH}자 이내여야 합니다.`
    ),
  notes: z
    .string()
    .max(
      TASK_NOTES_MAX_LENGTH,
      `메모는 ${TASK_NOTES_MAX_LENGTH}자 이내여야 합니다.`
    ),
  location: z
    .string()
    .max(
      TASK_LOCATION_MAX_LENGTH,
      `장소는 ${TASK_LOCATION_MAX_LENGTH}자 이내여야 합니다.`
    ),
  dueAt: z.string(),
  rolloverEnabled: z.boolean(),
  labelIds: z
    .array(z.string())
    .max(
      TASK_LABELS_MAX_COUNT,
      `라벨은 최대 ${TASK_LABELS_MAX_COUNT}개까지 선택할 수 있습니다.`
    ),
})

type TaskFormValues = z.infer<typeof formSchema>

/* --------------------------------------------------------------------------
 * Props 타입
 *
 * - mode: 'create' | 'edit'. create 는 initialTask 를 무시.
 * - open / onOpenChange: 제어형. 부모(List View)가 상태 소유.
 * - initialTask: edit 모드 초깃값. DB Task 행 그대로.
 * - initialLabelIds: edit 모드 태스크에 연결된 라벨 id (문자열) 배열.
 * - availableLabels: chip-row 에 표시할 사용자 라벨 전체 (calendar reserved 제외 필요 —
 *   호출자 책임. List View 는 이미 filter rail 용으로 걸러진 배열을 갖고 있음).
 * - onSaved: 저장 완료 후 부모 콜백. revalidatePath 와 별개로 즉시 UI 갱신 훅.
 * - onDeleted: 삭제 완료 후 부모 콜백.
 * -------------------------------------------------------------------------- */

export interface TaskFormLabelOption {
  id: string
  name: string
  color: LabelChipColor
}

export interface TaskFormSheetProps {
  mode: 'create' | 'edit'
  open: boolean
  onOpenChange: (open: boolean) => void
  initialTask?: Task | null
  initialLabelIds?: string[]
  availableLabels: TaskFormLabelOption[]
  onSaved?: (task: Task) => void
  onDeleted?: (taskId: number) => void
  locale?: 'ko' | 'en'
}

/* --------------------------------------------------------------------------
 * 날짜 <-> datetime-local 문자열 유틸
 *
 * <input type="datetime-local"> 은 'YYYY-MM-DDTHH:mm' 형식의 로컬 시간만 주고받는다.
 * DB/서버는 UTC Date 로 저장하므로 여기서 로컬 타임존 기준으로 양방향 변환.
 * -------------------------------------------------------------------------- */
function dateToLocalInputValue(date: Date | null | undefined): string {
  if (!date) return ''
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  // YYYY-MM-DDTHH:mm (초 단위 버림). padStart 로 한 자리 월/일/시/분 보정.
  const pad = (n: number) => String(n).padStart(2, '0')
  const yyyy = d.getFullYear()
  const mm = pad(d.getMonth() + 1)
  const dd = pad(d.getDate())
  const hh = pad(d.getHours())
  const mi = pad(d.getMinutes())
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`
}

/* --------------------------------------------------------------------------
 * autosize — textarea 내용 높이만큼 확장 (승인 근거: 사용자 리파인먼트 #1).
 *
 * CSS 만으로 처리하려면 field-sizing: content 를 쓰면 되지만 브라우저 지원이
 * 아직 불균일(Chrome 123+, Safari 미지원). 안전하게 JS autosize 로 내린다.
 *
 * 호출자 책임: textarea CSS 에 overflow: hidden 필수. 그래야 스크롤바가 뜨지 않고
 * scrollHeight 기반 계산이 '내용 전체 높이' 와 정확히 일치한다.
 * -------------------------------------------------------------------------- */
function autosize(el: HTMLTextAreaElement) {
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

/* --------------------------------------------------------------------------
 * useAutoResize — 마운트 직후 + value 변화 때마다 autosize 를 호출하는 훅.
 * polyfill 레이어. 부모가 textarea ref 와 watch 한 value 를 넘겨주면
 * 재계산을 책임진다.
 * -------------------------------------------------------------------------- */
function useAutoResize(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string
) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    autosize(el)
  }, [ref, value])
}

/* --------------------------------------------------------------------------
 * 로케일 문자열 테이블
 * -------------------------------------------------------------------------- */
const copy = {
  ko: {
    createTitle: '새 할 일',
    editTitle: '할 일 편집',
    titlePlaceholder: '무엇을 할까요?',
    memoLabel: '메모',
    memoPlaceholder: '추가 설명 (선택)',
    labelsLabel: '라벨',
    labelsNone: '사용할 라벨이 없어요',
    dueAtLabel: '예정 시각',
    dueAtClear: '지우기',
    rolloverLabel: '자동 이월',
    rolloverHint: '미완료 시 다음 날로 넘기기',
    locationLabel: '장소',
    locationPlaceholder: '+ 추가',
    close: '닫기',
    save: '저장',
    saving: '저장 중…',
    delete: '이 할 일 삭제',
    deleting: '삭제 중…',
    confirmDelete: '이 할 일을 삭제할까요? 되돌릴 수 없습니다.',
    saveError: '저장에 실패했어요. 잠시 후 다시 시도해 주세요.',
    deleteError: '삭제에 실패했어요. 잠시 후 다시 시도해 주세요.',
  },
  en: {
    createTitle: 'New task',
    editTitle: 'Edit task',
    titlePlaceholder: 'What needs doing?',
    memoLabel: 'Notes',
    memoPlaceholder: 'Additional details (optional)',
    labelsLabel: 'Labels',
    labelsNone: 'No labels available',
    dueAtLabel: 'Due',
    dueAtClear: 'Clear',
    rolloverLabel: 'Auto rollover',
    rolloverHint: 'Carry to next day if incomplete',
    locationLabel: 'Location',
    locationPlaceholder: '+ Add',
    close: 'Close',
    save: 'Save',
    saving: 'Saving…',
    delete: 'Delete this task',
    deleting: 'Deleting…',
    confirmDelete: 'Delete this task? This cannot be undone.',
    saveError: 'Save failed. Please try again.',
    deleteError: 'Delete failed. Please try again.',
  },
} as const

/* --------------------------------------------------------------------------
 * TaskFormSheet — 메인 컴포넌트
 * -------------------------------------------------------------------------- */
export function TaskFormSheet({
  mode,
  open,
  onOpenChange,
  initialTask,
  initialLabelIds,
  availableLabels,
  onSaved,
  onDeleted,
  locale = 'ko',
}: TaskFormSheetProps) {
  const text = copy[locale]
  const [isPending, startTransition] = useTransition()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  /* --- 초깃값 계산 --- */
  const defaultValues = useMemo<TaskFormValues>(() => {
    if (mode === 'edit' && initialTask) {
      return {
        title: initialTask.title ?? '',
        notes: initialTask.notes ?? '',
        location: initialTask.location ?? '',
        dueAt: dateToLocalInputValue(initialTask.dueAt),
        rolloverEnabled: initialTask.rolloverEnabled ?? true,
        labelIds: initialLabelIds ?? [],
      }
    }
    return {
      title: '',
      notes: '',
      location: '',
      dueAt: '',
      rolloverEnabled: true,
      labelIds: [],
    }
  }, [mode, initialTask, initialLabelIds])

  const {
    control,
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
    mode: 'onChange',
  })

  /* --- RHF register 의 ref 콜백과 로컬 ref 를 병합 ---
   * textarea 는 autosize 를 위해 우리 ref 가 필요한데, RHF 도 자체 ref 를 쓴다.
   * 둘 다 콜백으로 받아 한 번에 주입한다. register() 호출은 매 렌더마다 새 객체를
   * 반환하지만 여기서 고정 참조로 보관할 필요 없이 ref 콜백만 꺼내 쓰면 충분. */
  const titleRegister = register('title')
  const notesRegister = register('notes')

  /* open 전환 때마다 defaultValues 로 리셋 — 같은 모달을 다른 row 로 재사용할 때 필요. */
  useEffect(() => {
    if (open) {
      reset(defaultValues)
      setSubmitError(null)
      setDeleteError(null)
    }
  }, [open, defaultValues, reset])

  /* --- autosize 대상: title + memo --- */
  const titleRef = useRef<HTMLTextAreaElement | null>(null)
  const memoRef = useRef<HTMLTextAreaElement | null>(null)
  const titleValue = watch('title')
  const memoValue = watch('notes')
  useAutoResize(titleRef, titleValue)
  useAutoResize(memoRef, memoValue)

  /* title textarea 는 Enter 로 줄바꿈 허용, Cmd/Ctrl+Enter 는 저장. */
  const handleTitleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        // RHF handleSubmit 을 직접 트리거하려면 form element submit 이 편하다.
        // 부모 form 에 id 를 두고 여기서 requestSubmit 호출.
        const form = event.currentTarget.form
        form?.requestSubmit()
      }
    },
    []
  )

  /* --- 라벨 토글 (chip-row). 선택 상태는 labelIds 배열로 관리. --- */
  const labelIds = watch('labelIds')
  const toggleLabel = useCallback(
    (id: string) => {
      const current = getValues('labelIds')
      if (current.includes(id)) {
        setValue(
          'labelIds',
          current.filter(x => x !== id),
          { shouldDirty: true }
        )
      } else {
        if (current.length >= TASK_LABELS_MAX_COUNT) return
        setValue('labelIds', [...current, id], { shouldDirty: true })
      }
    },
    [getValues, setValue]
  )

  /* --- 제출 로직 --- */
  const onSubmit = useCallback(
    (values: TaskFormValues) => {
      setSubmitError(null)
      startTransition(async () => {
        try {
          /* datetime-local 문자열(로컬 타임존) → Date 로 변환.
           * Server Action 시그니처(CreateTaskInput / UpdateTaskInput) 가
           * zod 의 .transform 결과 타입(Date|null) 을 쓰므로 문자열을 그대로 넘기면
           * 런타임은 통과해도 TypeScript 가 거부한다. */
          const dueAtDate: Date | null =
            values.dueAt === '' ? null : new Date(values.dueAt)
          if (dueAtDate && Number.isNaN(dueAtDate.getTime())) {
            setSubmitError(text.saveError)
            return
          }

          const payload = {
            title: values.title,
            notes: values.notes.trim() === '' ? null : values.notes,
            location:
              values.location.trim() === '' ? null : values.location,
            dueAt: dueAtDate,
            rolloverEnabled: values.rolloverEnabled,
          }

          let savedTask: Task
          if (mode === 'create') {
            /* createTask 의 타입은 zod .transform() 결과(output) 기준이라
             * status 가 non-optional string 으로 추론된다. UI 에서 직접 바꾸는
             * 필드는 아니므로 서버 DEFAULT 와 동일한 'pending' 을 명시 전달. */
            savedTask = await createTask({
              title: payload.title,
              notes: payload.notes,
              location: payload.location,
              status: 'pending',
              dueAt: payload.dueAt,
              rolloverEnabled: payload.rolloverEnabled,
            })
          } else {
            if (!initialTask) throw new Error('편집할 태스크가 없습니다.')
            savedTask = await updateTask(initialTask.id, {
              title: payload.title,
              notes: payload.notes,
              location: payload.location,
              dueAt: payload.dueAt,
              rolloverEnabled: payload.rolloverEnabled,
            })
          }

          // 라벨은 별도 Server Action 으로 원자 교체.
          // labelIds 는 string 배열(UI) → 서버 schema 는 정수 coerce 지원.
          await setTaskLabels(savedTask.id, {
            labelIds: values.labelIds.map(id => Number(id)),
          })

          onSaved?.(savedTask)
          onOpenChange(false)
        } catch (err) {
          console.error('[TaskFormSheet] 저장 실패:', err)
          setSubmitError(text.saveError)
        }
      })
    },
    [mode, initialTask, onSaved, onOpenChange, text.saveError]
  )

  /* --- 삭제 로직 (edit 모드 전용) --- */
  const handleDelete = useCallback(() => {
    if (mode !== 'edit' || !initialTask) return
    if (!window.confirm(text.confirmDelete)) return

    setDeleteError(null)
    startTransition(async () => {
      try {
        await deleteTask(initialTask.id)
        onDeleted?.(initialTask.id)
        onOpenChange(false)
      } catch (err) {
        console.error('[TaskFormSheet] 삭제 실패:', err)
        setDeleteError(text.deleteError)
      }
    })
  }, [
    mode,
    initialTask,
    onDeleted,
    onOpenChange,
    text.confirmDelete,
    text.deleteError,
  ])

  /* Cmd/Ctrl+Del 전역 단축키 — edit 모드 한정. */
  const handleFormKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLFormElement>) => {
      if (
        mode === 'edit' &&
        (event.metaKey || event.ctrlKey) &&
        (event.key === 'Delete' || event.key === 'Backspace')
      ) {
        // 텍스트필드에서 실수로 트리거되는 것 방지 — meta 키 조합만 허용되므로 안전.
        event.preventDefault()
        handleDelete()
      }
    },
    [mode, handleDelete]
  )

  const titleLabel = mode === 'create' ? text.createTitle : text.editTitle
  const busy = isPending || isSubmitting

  /* --- 카운터 경고 표시 기준 (approved.json 대응) --- */
  const titleCounterVisible = titleValue.length >= 100
  const memoCounterVisible = memoValue.length >= 1800

  return (
    <ModalOverlay isOpen={open} onOpenChange={onOpenChange} isDismissable>
      <Modal className="w-full sm:max-w-[560px]">
        <Dialog
          aria-labelledby="task-form-sheet-title"
          className={cx(
            /* 바텀시트(모바일) / 중앙 모달(데스크탑) 공용. */
            'flex w-full flex-col bg-bg-primary text-text-primary',
            'rounded-t-3xl sm:rounded-2xl',
            'max-h-[85vh] sm:max-h-[85vh]',
            'shadow-2xl',
            'overflow-hidden'
          )}
        >
          {/* Grab handle — 모바일 전용 시각 힌트. sticky 아님. */}
          <div
            aria-hidden="true"
            className="flex justify-center pt-2 pb-1 sm:hidden"
          >
            <span className="block h-1 w-10 rounded-full bg-border-primary" />
          </div>

          <form
            onSubmit={handleSubmit(onSubmit)}
            onKeyDown={handleFormKeyDown}
            className="flex min-h-0 flex-1 flex-col"
          >
            {/* Sticky header: 닫기 / 제목 / 저장 */}
            <div
              className={cx(
                'sticky top-0 z-10 flex items-center justify-between gap-2',
                'px-3 py-2 border-b border-border-secondary bg-bg-primary'
              )}
            >
              <button
                type="button"
                aria-label={text.close}
                onClick={() => onOpenChange(false)}
                className={cx(
                  'inline-flex size-12 items-center justify-center rounded-full',
                  'text-text-tertiary hover:bg-bg-primary_hover',
                  'focus-visible:outline focus-visible:outline-2',
                  'focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
                  'transition duration-100 ease-linear'
                )}
              >
                <CloseX className="size-5" aria-hidden="true" />
              </button>

              <h2
                id="task-form-sheet-title"
                className="flex-1 text-center text-[15px] font-semibold text-text-primary"
              >
                {titleLabel}
              </h2>

              <button
                type="submit"
                disabled={busy}
                aria-label={text.save}
                className={cx(
                  'inline-flex min-h-12 items-center justify-center rounded-full',
                  'px-4 text-[14px] font-semibold',
                  'bg-bg-brand-solid text-white',
                  'hover:bg-bg-brand-solid_hover',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  'focus-visible:outline focus-visible:outline-2',
                  'focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
                  'transition duration-100 ease-linear'
                )}
              >
                {busy ? text.saving : text.save}
              </button>
            </div>

            {/* Body — 단일 스크롤. title / memo / labels / dueAt / rollover / location 순. */}
            <div
              className={cx(
                'flex-1 min-h-0 overflow-y-auto px-4 pb-6 pt-3',
                '[scrollbar-gutter:stable]'
              )}
            >
              {/* 제목 — sticky 아님 (승인 리파인먼트 #2). autosize + overflow:hidden. */}
              <div className="pb-3">
                <textarea
                  {...titleRegister}
                  ref={el => {
                    titleRegister.ref(el)
                    titleRef.current = el
                  }}
                  rows={1}
                  placeholder={text.titlePlaceholder}
                  maxLength={TASK_TITLE_MAX_LENGTH}
                  onKeyDown={handleTitleKeyDown}
                  className={cx(
                    'w-full resize-none border-0 bg-transparent p-0 outline-none',
                    'text-[20px] font-medium leading-[1.35] text-text-primary',
                    'placeholder:text-text-placeholder',
                    /* 내용만큼 커진다. scrollbar 자체를 숨겨야 scrollHeight 가 항상 정확. */
                    'overflow-hidden [word-break:keep-all] [overflow-wrap:anywhere]'
                  )}
                />
                {/* 카운터 — approved.json 경고 기준(100+). */}
                {titleCounterVisible && (
                  <div className="mt-1 flex justify-end text-[11px] font-mono tabular-nums text-text-tertiary">
                    {titleValue.length} / {TASK_TITLE_MAX_LENGTH}
                  </div>
                )}
                {errors.title && (
                  <p className="mt-1 text-[12px] text-text-error-primary">
                    {errors.title.message}
                  </p>
                )}
              </div>

              {/* 메모 — autosize + overflow:hidden. softLimit 2000 으로 하드 차단. */}
              <div className="pb-4">
                <label
                  htmlFor="task-form-memo"
                  className="mb-1.5 block text-[12px] font-medium text-text-tertiary"
                >
                  {text.memoLabel}
                </label>
                <textarea
                  id="task-form-memo"
                  {...notesRegister}
                  ref={el => {
                    notesRegister.ref(el)
                    memoRef.current = el
                  }}
                  placeholder={text.memoPlaceholder}
                  /* approved.json hardLimit 2000 (서버 schema 상한 10000 보다 보수적). */
                  maxLength={2000}
                  className={cx(
                    'w-full resize-none rounded-[10px] border border-border-secondary',
                    'bg-bg-primary px-3.5 py-3 outline-none',
                    'text-[14px] leading-[1.6] text-text-primary',
                    'placeholder:text-text-placeholder',
                    'focus:border-border-brand',
                    'min-h-[80px] overflow-hidden',
                    '[white-space:pre-wrap] [word-break:keep-all] [overflow-wrap:anywhere]',
                    'transition-colors duration-100 ease-linear'
                  )}
                />
                {memoCounterVisible && (
                  <div className="mt-1 flex justify-end text-[11px] font-mono tabular-nums text-text-tertiary">
                    {memoValue.length} / 2000
                  </div>
                )}
                {errors.notes && (
                  <p className="mt-1 text-[12px] text-text-error-primary">
                    {errors.notes.message}
                  </p>
                )}
              </div>

              {/* 라벨 — chip-row (가로 스크롤). 선택/해제 토글. */}
              <div className="pb-4">
                <div className="mb-1.5 text-[12px] font-medium text-text-tertiary">
                  {text.labelsLabel}
                </div>
                {availableLabels.length === 0 ? (
                  <p className="text-[13px] text-text-quaternary">
                    {text.labelsNone}
                  </p>
                ) : (
                  <div
                    className={cx(
                      'flex items-center gap-2 overflow-x-auto',
                      '[scrollbar-width:thin] -mx-1 px-1 py-1'
                    )}
                  >
                    {availableLabels.map(label => {
                      const selected = labelIds.includes(label.id)
                      return (
                        <button
                          key={label.id}
                          type="button"
                          onClick={() => toggleLabel(label.id)}
                          aria-pressed={selected}
                          className={cx(
                            'flex-none inline-flex items-center',
                            'focus-visible:outline focus-visible:outline-2',
                            'focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
                            'rounded-full'
                          )}
                        >
                          <LabelChip
                            color={label.color}
                            variant="outline"
                            size="md"
                            selected={selected}
                          >
                            {label.name}
                          </LabelChip>
                        </button>
                      )
                    })}
                  </div>
                )}
                {errors.labelIds && (
                  <p className="mt-1 text-[12px] text-text-error-primary">
                    {errors.labelIds.message}
                  </p>
                )}
              </div>

              {/* 예정 시각 — native datetime-local. mono 포맷은 브라우저 기본에 맡긴다. */}
              <MetaRow
                label={text.dueAtLabel}
                right={
                  <div className="flex items-center gap-2">
                    <input
                      type="datetime-local"
                      {...register('dueAt')}
                      className={cx(
                        'bg-transparent outline-none',
                        'text-[13px] font-mono tabular-nums text-text-primary',
                        'border-0 px-0 py-0'
                      )}
                    />
                    {watch('dueAt') !== '' && (
                      <button
                        type="button"
                        onClick={() =>
                          setValue('dueAt', '', { shouldDirty: true })
                        }
                        className={cx(
                          'text-[11px] text-text-tertiary hover:text-text-primary',
                          'underline-offset-2 hover:underline',
                          'transition-colors duration-100 ease-linear'
                        )}
                      >
                        {text.dueAtClear}
                      </button>
                    )}
                  </div>
                }
              />

              {/* 자동 이월 토글 */}
              <MetaRow
                label={text.rolloverLabel}
                hint={text.rolloverHint}
                right={
                  <Controller
                    control={control}
                    name="rolloverEnabled"
                    render={({ field }) => (
                      <ToggleSwitch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        ariaLabel={text.rolloverLabel}
                      />
                    )}
                  />
                }
              />

              {/* 장소 — 인라인 텍스트. */}
              <MetaRow
                label={text.locationLabel}
                right={
                  <input
                    type="text"
                    {...register('location')}
                    placeholder={text.locationPlaceholder}
                    maxLength={TASK_LOCATION_MAX_LENGTH}
                    className={cx(
                      'min-w-0 flex-1 bg-transparent outline-none',
                      'text-right text-[13px] text-text-primary',
                      'placeholder:text-text-placeholder'
                    )}
                  />
                }
              />
            </div>

            {/* Sticky footer — 편집 모드 전용 "이 할 일 삭제". */}
            {mode === 'edit' && (
              <div
                className={cx(
                  'sticky bottom-0 z-10 flex items-center justify-center',
                  'px-3 py-2 border-t border-border-secondary bg-bg-primary'
                )}
              >
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={busy}
                  className={cx(
                    'inline-flex min-h-12 items-center justify-center gap-1.5',
                    'rounded-full px-4 text-[13px] font-medium',
                    'text-text-error-primary',
                    'hover:bg-bg-error-primary',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                    'focus-visible:outline focus-visible:outline-2',
                    'focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
                    'transition-colors duration-100 ease-linear'
                  )}
                >
                  <Trash01 className="size-4" aria-hidden="true" />
                  {busy ? text.deleting : text.delete}
                </button>
              </div>
            )}

            {/* 비인라인 에러 공지. 토스트 시스템이 없어도 화면에 남아 사용자가 원인을 알 수 있다. */}
            {(submitError || deleteError) && (
              <div
                role="alert"
                className={cx(
                  'px-4 py-2 border-t border-border-error_subtle',
                  'bg-bg-error-primary text-[12px] text-text-error-primary'
                )}
              >
                {submitError ?? deleteError}
              </div>
            )}
          </form>
        </Dialog>
      </Modal>
    </ModalOverlay>
  )
}

/* --------------------------------------------------------------------------
 * MetaRow — 라벨 | 힌트 | 오른쪽 컨트롤 의 단일 행 패턴.
 * 시각 언어는 approved.json meta-row 설계 근거.
 * -------------------------------------------------------------------------- */
function MetaRow({
  label,
  hint,
  right,
}: {
  label: string
  hint?: string
  right: React.ReactNode
}) {
  return (
    <div
      className={cx(
        'flex items-center justify-between gap-3',
        'min-h-[48px] py-1 border-t border-border-tertiary'
      )}
    >
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-text-secondary">
          {label}
        </div>
        {hint && (
          <div className="mt-0.5 text-[11px] text-text-quaternary">
            {hint}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 min-w-0">{right}</div>
    </div>
  )
}

/* --------------------------------------------------------------------------
 * ToggleSwitch — 간이 토글. UntitledUI Toggle 이 React Aria Switch 래퍼지만
 * 폼 통합 오버헤드 대비 이 모달에서는 네이티브 span 으로 충분 (Quiet Layer · 48px
 * 터치 타겟만 확보).
 * -------------------------------------------------------------------------- */
function ToggleSwitch({
  checked,
  onCheckedChange,
  ariaLabel,
}: {
  checked: boolean
  onCheckedChange: (next: boolean) => void
  ariaLabel: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onCheckedChange(!checked)}
      className={cx(
        /* 48px 터치 타겟 확보(외부 영역은 투명). 내부 트랙은 44x24. */
        'inline-flex h-12 w-12 items-center justify-center',
        'focus-visible:outline focus-visible:outline-2',
        'focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
        'rounded-full'
      )}
    >
      <span
        className={cx(
          'relative block h-6 w-11 rounded-full transition-colors duration-150 ease-linear',
          checked ? 'bg-bg-brand-solid' : 'bg-border-primary'
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 left-0.5 block size-5 rounded-full bg-white shadow-sm',
            'transition-transform duration-150 ease-linear',
            checked && 'translate-x-5'
          )}
        />
      </span>
    </button>
  )
}
