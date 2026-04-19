'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X as CloseX, Trash01, Check } from '@untitledui/icons'

import { cx } from '@/utils/cx'
import {
  Dialog,
  Modal,
  ModalOverlay,
} from '@/components/application/modals/modal'
import { LABEL_NAME_MAX_LENGTH } from '@/lib/validators/labels'
import {
  USER_LABEL_COLOR_OPTIONS,
  DEFAULT_LABEL_COLOR_OPTION,
  findColorOptionByHex,
  findColorOptionByGoogleId,
  type LabelColorOption,
} from '@/components/settings/label-color-options'
import { LivePreviewBoard } from '@/components/settings/live-preview-board'

/* --------------------------------------------------------------------------
 * LabelEditorSheet — Phase 4 U4 라벨 편집/생성 시트
 *
 * approved.json: designs/settings-labels-20260419/variant-C (Editor Sheet)
 *   - "strip 리스트 + 풀높이 디테일 시트" 가 선정된 핵심 이유는 LivePreviewBoard
 *     를 시트 안에 탑재할 공간이 확보된다는 것. 그 프리뷰가 핵심이므로 구성은
 *     다음 순서로 고정:
 *       1) LivePreviewBoard (상단, 제일 먼저 시선이 가는 위치)
 *       2) 이름 input
 *       3) 색상 5칸 그리드 (Google colorId 라벨 포함)
 *       4) Sticky footer: [삭제(편집 모드)] / [저장]
 *
 * 모달 재활용: task-form-sheet 가 이미 쓰는 ModalOverlay/Modal/Dialog 패턴을
 * 그대로 사용 (애니메이션·접근성·모바일 바텀 시트 전환이 동일하게 동작).
 * -------------------------------------------------------------------------- */

const formSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, '라벨 이름은 1자 이상이어야 합니다.')
    .max(
      LABEL_NAME_MAX_LENGTH,
      `라벨 이름은 ${LABEL_NAME_MAX_LENGTH}자 이내여야 합니다.`
    ),
})

type LabelFormValues = z.infer<typeof formSchema>

/* --------------------------------------------------------------------------
 * LabelFormPayload — onSubmit 콜백이 넘길 실제 값.
 * name + 선택된 색상 옵션(hex + googleColorId) 을 함께 전달해
 * 부모(server action) 가 두 컬럼을 원자 교체할 수 있게 한다.
 * -------------------------------------------------------------------------- */
export interface LabelFormPayload {
  name: string
  /** #RRGGBB, DB label.color */
  color: string
  /** '1'~'11', DB label.google_color_id */
  googleColorId: LabelColorOption['googleColorId']
}

export interface LabelEditorSheetInitialData {
  /** 편집 대상 라벨 id. edit 모드에서만 의미 있음. */
  id: number
  name: string
  /** 기존 hex. 팔레트와 매치 안 되면 첫 옵션으로 폴백. */
  color: string
  /** 기존 google_color_id. nullable. */
  googleColorId: string | null
}

export interface LabelEditorSheetProps {
  mode: 'create' | 'edit'
  open: boolean
  onOpenChange: (open: boolean) => void
  /** edit 모드 초깃값. create 모드에선 무시. */
  initial?: LabelEditorSheetInitialData | null
  /** 저장 버튼 눌렀을 때 호출. 서버 액션 호출은 부모 책임 — 에러 throw 하면 내부에서 처리. */
  onSubmit: (payload: LabelFormPayload) => Promise<void>
  /** 편집 모드에서 삭제 — 확인 다이얼로그는 부모가 처리하거나 여기서 window.confirm. */
  onDelete?: () => Promise<void>
}

export function LabelEditorSheet({
  mode,
  open,
  onOpenChange,
  initial,
  onSubmit,
  onDelete,
}: LabelEditorSheetProps) {
  const [isPending, startTransition] = useTransition()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  /* --- 선택된 색 상태. RHF 밖에서 관리 — select 는 버튼 그리드라 Controller 필요성 ↓ --- */
  const [selectedOption, setSelectedOption] = useState<LabelColorOption>(
    DEFAULT_LABEL_COLOR_OPTION
  )

  /* --- RHF: name 전용 --- */
  const defaultValues = useMemo<LabelFormValues>(
    () => ({
      name: mode === 'edit' && initial ? initial.name : '',
    }),
    [mode, initial]
  )

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<LabelFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
    mode: 'onChange',
  })

  /* open 전환 시 form + 색상 + 에러 전부 초기화. */
  useEffect(() => {
    if (!open) return
    reset(defaultValues)
    setSubmitError(null)
    setDeleteError(null)

    if (mode === 'edit' && initial) {
      // hex 우선 매치, 없으면 googleColorId 로 재시도, 그마저 없으면 기본값.
      const match =
        findColorOptionByHex(initial.color) ??
        findColorOptionByGoogleId(initial.googleColorId) ??
        DEFAULT_LABEL_COLOR_OPTION
      setSelectedOption(match)
    } else {
      setSelectedOption(DEFAULT_LABEL_COLOR_OPTION)
    }
  }, [open, mode, initial, defaultValues, reset])

  /* --- 이름 필드 autofocus (시트 열자마자 타이핑 가능). --- */
  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const nameRegister = register('name')
  useEffect(() => {
    if (!open) return
    // React Aria Modal 의 기본 focus 경합을 피하려고 requestAnimationFrame.
    const raf = requestAnimationFrame(() => nameInputRef.current?.focus())
    return () => cancelAnimationFrame(raf)
  }, [open])

  const nameValue = watch('name')

  /* --- 제출 --- */
  const handleSave = useCallback(
    (values: LabelFormValues) => {
      setSubmitError(null)
      startTransition(async () => {
        try {
          await onSubmit({
            name: values.name,
            color: selectedOption.hex,
            googleColorId: selectedOption.googleColorId,
          })
          onOpenChange(false)
        } catch (err) {
          console.error('[LabelEditorSheet] 저장 실패:', err)
          // 서버가 "이미 같은 이름의 라벨" 같은 친절한 한국어 메시지를 내려주면 그대로 노출.
          const message =
            err instanceof Error ? err.message : '저장에 실패했어요.'
          setSubmitError(message)
        }
      })
    },
    [onSubmit, onOpenChange, selectedOption]
  )

  /* --- 삭제 --- */
  const handleDelete = useCallback(() => {
    if (mode !== 'edit' || !onDelete) return
    if (
      !window.confirm(
        '이 라벨을 삭제할까요? 이 라벨이 달린 태스크에서는 자동으로 해제됩니다.'
      )
    )
      return
    setDeleteError(null)
    startTransition(async () => {
      try {
        await onDelete()
        onOpenChange(false)
      } catch (err) {
        console.error('[LabelEditorSheet] 삭제 실패:', err)
        const message =
          err instanceof Error ? err.message : '삭제에 실패했어요.'
        setDeleteError(message)
      }
    })
  }, [mode, onDelete, onOpenChange])

  /* Cmd/Ctrl+Enter 저장 단축키 — name input 에서 Enter 가 submit 이라 조합키만 보조. */
  const handleFormKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLFormElement>) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        event.currentTarget.requestSubmit()
      }
    },
    []
  )

  const headerTitle = mode === 'create' ? '새 라벨' : '라벨 편집'
  const busy = isPending

  return (
    <ModalOverlay isOpen={open} onOpenChange={onOpenChange} isDismissable>
      <Modal className="w-full sm:max-w-[520px]">
        <Dialog
          aria-labelledby="label-editor-sheet-title"
          className={cx(
            'flex w-full flex-col bg-bg-primary text-text-primary',
            'rounded-t-3xl sm:rounded-2xl',
            'max-h-[90vh] sm:max-h-[85vh]',
            'shadow-2xl overflow-hidden'
          )}
        >
          {/* 모바일 grab handle */}
          <div
            aria-hidden="true"
            className="flex justify-center pt-2 pb-1 sm:hidden"
          >
            <span className="block h-1 w-10 rounded-full bg-border-primary" />
          </div>

          <form
            onSubmit={handleSubmit(handleSave)}
            onKeyDown={handleFormKeyDown}
            className="flex min-h-0 flex-1 flex-col"
          >
            {/* Sticky header */}
            <div
              className={cx(
                'sticky top-0 z-10 flex items-center justify-between gap-2',
                'px-3 py-2 border-b border-border-secondary bg-bg-primary'
              )}
            >
              <button
                type="button"
                aria-label="닫기"
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
                id="label-editor-sheet-title"
                className="flex-1 text-center text-[15px] font-semibold text-text-primary"
              >
                {headerTitle}
              </h2>

              <button
                type="submit"
                disabled={busy}
                aria-label="저장"
                className={cx(
                  'inline-flex min-h-12 items-center justify-center rounded-full',
                  'px-4 text-[14px] font-semibold',
                  'bg-bg-brand-solid text-text-primary_on-brand',
                  'hover:bg-bg-brand-solid_hover',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  'focus-visible:outline focus-visible:outline-2',
                  'focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
                  'transition duration-100 ease-linear'
                )}
              >
                {busy ? '저장 중…' : '저장'}
              </button>
            </div>

            {/* Body — single scroll */}
            <div
              className={cx(
                'flex-1 min-h-0 overflow-y-auto px-4 pb-6 pt-4',
                '[scrollbar-gutter:stable]'
              )}
            >
              {/* 1) Live Preview Board */}
              <LivePreviewBoard
                name={nameValue}
                slug={selectedOption.slug}
              />

              {/* 2) 이름 input */}
              <div className="mt-5">
                <label
                  htmlFor="label-editor-name"
                  className="mb-1.5 block text-[12px] font-medium text-text-tertiary"
                >
                  라벨 이름
                </label>
                <input
                  id="label-editor-name"
                  type="text"
                  {...nameRegister}
                  ref={el => {
                    nameRegister.ref(el)
                    nameInputRef.current = el
                  }}
                  placeholder="예) 직장, 운동, 책 읽기"
                  maxLength={LABEL_NAME_MAX_LENGTH}
                  className={cx(
                    'w-full rounded-[10px] border border-border-secondary',
                    'bg-bg-primary px-3.5 py-3 outline-none',
                    'text-[14px] text-text-primary',
                    'placeholder:text-text-placeholder',
                    'focus:border-border-brand',
                    'transition-colors duration-100 ease-linear'
                  )}
                />
                {errors.name && (
                  <p className="mt-1 text-[12px] text-text-error-primary">
                    {errors.name.message}
                  </p>
                )}
              </div>

              {/* 3) 색상 그리드 */}
              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[12px] font-medium text-text-tertiary">
                    색상
                  </span>
                  <span className="text-[11px] font-mono tabular-nums text-text-quaternary">
                    {selectedOption.googleName} ·{' '}
                    {selectedOption.hex.toUpperCase()}
                  </span>
                </div>
                <div
                  role="radiogroup"
                  aria-label="라벨 색상"
                  className={cx(
                    'grid gap-2',
                    /* 5칸이라 5열로 균등 분할. 좁은 화면에서도 각 셀이 48px 터치 타겟을 지킴 */
                    'grid-cols-5'
                  )}
                >
                  {USER_LABEL_COLOR_OPTIONS.map(option => {
                    const isSelected =
                      option.googleColorId ===
                      selectedOption.googleColorId
                    return (
                      <button
                        key={option.googleColorId}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        aria-label={`${option.googleName} (${option.localizedName})`}
                        onClick={() => setSelectedOption(option)}
                        className={cx(
                          'group relative flex flex-col items-center justify-center',
                          'min-h-[64px] rounded-xl border-2 transition duration-100 ease-linear',
                          'focus-visible:outline focus-visible:outline-2',
                          'focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
                          isSelected
                            ? 'border-border-brand'
                            : 'border-transparent hover:border-border-secondary'
                        )}
                      >
                        {/* 색 스웨치 — inline style 로 hex 직접 지정 (Tailwind JIT 우회) */}
                        <span
                          aria-hidden="true"
                          className="block size-8 rounded-full"
                          style={{ backgroundColor: option.hex }}
                        />
                        <span className="mt-1 text-[10px] font-mono tabular-nums text-text-tertiary">
                          {option.googleColorId}
                        </span>
                        {isSelected && (
                          <span
                            aria-hidden="true"
                            className={cx(
                              'absolute top-1.5 right-1.5 inline-flex size-4 items-center justify-center',
                              'rounded-full bg-bg-brand-solid text-text-primary_on-brand'
                            )}
                          >
                            <Check className="size-3" />
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
                <p className="mt-2 text-[11px] text-text-quaternary">
                  Google Calendar 의 이벤트 색상과 1:1 로 매핑돼요. 캘린더
                  전용 색(Peacock)은 제외됩니다.
                </p>
              </div>
            </div>

            {/* Sticky footer — 편집 모드에서만 삭제 버튼 */}
            {mode === 'edit' && onDelete && (
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
                  {busy ? '삭제 중…' : '이 라벨 삭제'}
                </button>
              </div>
            )}

            {/* 비인라인 에러 공지 */}
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
