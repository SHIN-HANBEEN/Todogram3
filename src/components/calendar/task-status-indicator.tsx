'use client'

// ============================================================================
// TaskStatusIndicator — 3-state 태스크 상태 인디케이터 (Phase 4 - U1)
// ============================================================================
// - 역할: DB `tasks.status` enum (`pending` | `in_progress` | `done`) 을 시각적으로
//   즉시 분별 가능한 3 상태 위젯으로 표시하고, 단일 탭으로 다음 상태로 순환 전이.
// - 시각 매핑 (approved.json: calendar-view-20260418 + DESIGN.md Quiet Layer):
//     pending      → 20×20 빈 사각 (border 1.5px · border-primary 톤 · transparent)
//     in_progress  → 하단 50% sage 채움 water-level + 진한 sage 2px 테두리 + 외곽 soft ring
//     done         → sage 꽉 채움 + 흰 체크 (Untitled Check)
//   보조 신호는 부모 row 가 담당(행 배경 tint, 제목 font-weight / 취소선).
// - 상호작용: 체크박스 영역만 이벤트 타겟. onClick 에서 stopPropagation 을 걸어 부모
//   row 의 클릭(상세 진입) 과 확실히 분리한다. 순환 규칙은 CYCLE 상수 참고:
//     pending → in_progress → done → pending
// - 접근성: role="checkbox" 로 승격하되 3-state 가 없는 한계(`aria-checked` 는 true/false/mixed).
//   `done` 은 true, 나머지는 mixed/false 로 매핑해 SR 사용자가 "일부 완료" 로 인식하게 한다.
//   aria-label 에는 현재 상태 한국어 텍스트와 "탭하여 다음 상태로" 힌트를 포함.
// - Quiet Layer 규칙: 이 컴포넌트만 예외적으로 시각 weight 구배를 "강하게" 준다 (memory
//   feedback_quiet_layer_status: 미묘함보다 명확성 우선). 그 외 장식(모션/그림자 과잉)은 금지.
// ============================================================================

import type { KeyboardEvent, MouseEvent } from 'react'
import { Check } from '@untitledui/icons'
import { cx } from '@/utils/cx'
import type { TaskStatus } from '@/lib/calendar/types'

export interface TaskStatusIndicatorProps {
  /** 현재 상태 (DB enum 과 1:1). */
  status: TaskStatus
  /**
   * 상태 전이 콜백. 사용자가 위젯을 탭하면 CYCLE 상 다음 상태로 전이된 값이 전달된다.
   * 미전달 시 위젯은 read-only 로 렌더 (커서/호버 효과 제거).
   */
  onStatusChange?: (next: TaskStatus) => void
  /** true 면 클릭 비활성 + 투명도 감소. Pending 서버 액션 in-flight 시 사용. */
  disabled?: boolean
  /**
   * 사이즈 변형.
   *  - md (기본): 20×20 — Screen B ledger row, Screen C 서브 아이템 등 본 컨텍스트.
   *  - sm: 16×16 — Screen A compact grid / 미니 썸네일용 예비 슬롯.
   */
  size?: 'sm' | 'md'
  /** 추가 클래스. 루트 button 에 merge. */
  className?: string
}

/**
 * 단일 탭 순환 규칙. finalized.html 스펙 + approved.json 확인 완료.
 */
const CYCLE: Record<TaskStatus, TaskStatus> = {
  pending: 'in_progress',
  in_progress: 'done',
  done: 'pending',
}

/**
 * aria-label / tooltip 에 쓸 한국어 상태 텍스트.
 * Todogram v1 은 ko 단일 로케일 — 필요 시 상위에서 번역 prop 으로 교체.
 */
const STATUS_LABEL_KO: Record<TaskStatus, string> = {
  pending: '시작 전',
  in_progress: '진행 중',
  done: '완료',
}

export function TaskStatusIndicator({
  status,
  onStatusChange,
  disabled = false,
  size = 'md',
  className,
}: TaskStatusIndicatorProps) {
  /* 사이즈 상수 — CSS 값을 JS 에서 재사용할 수 있도록 분리. */
  const boxClass = size === 'md' ? 'size-5' : 'size-4'
  /* 체크 아이콘 크기: md 는 13px (finalized.html) / sm 은 11px. */
  const checkSize = size === 'md' ? 'size-[13px]' : 'size-[11px]'

  const interactive = !!onStatusChange && !disabled

  /* 이벤트 핸들러 — stopPropagation 으로 부모 row 의 onClick 을 분리.
   * read-only 모드에서는 아무 일도 일어나지 않는다(부모 row 만 클릭 이벤트 획득). */
  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    if (!interactive) return
    onStatusChange?.(CYCLE[status])
  }

  /* 키보드: Space/Enter 모두 동작. preventDefault 로 버튼 기본 클릭과 중복 이벤트 방지. */
  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!interactive) return
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      onStatusChange?.(CYCLE[status])
    }
  }

  /* aria-checked 매핑: done=true / in_progress=mixed / pending=false
   * 3-state 의 공식 매핑 (W3C ARIA spec `tri-state checkbox`). */
  const ariaChecked: boolean | 'mixed' =
    status === 'done' ? true : status === 'in_progress' ? 'mixed' : false

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={ariaChecked}
      aria-label={`태스크 상태: ${STATUS_LABEL_KO[status]}${
        interactive ? ' (탭하여 다음 상태로)' : ''
      }`}
      data-slot="task-status-indicator"
      data-status={status}
      disabled={disabled || !onStatusChange}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cx(
        'relative inline-flex flex-none items-center justify-center rounded-[6px]',
        'transition duration-150 ease-linear motion-reduce:transition-none',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        !disabled && interactive && 'cursor-pointer',
        !disabled && !interactive && 'cursor-default',
        boxClass,
        /* pending: 1.5px 중립 테두리 + 호버 시 브랜드 강조 */
        status === 'pending' &&
          'border-[1.5px] border-border-primary bg-transparent' +
            (interactive ? ' hover:border-border-brand' : ''),
        /* in_progress: 2px 브랜드 테두리. 배경 그라디언트 + 외곽 soft ring 은 inline style.  */
        status === 'in_progress' && 'border-2 border-border-brand',
        /* done: 꽉 찬 브랜드 + 흰 체크 (다크모드: sage 명도 상승 + warm cream 체크) */
        status === 'done' &&
          'border-2 border-border-brand bg-bg-brand-solid text-text-primary_on-brand',
        className
      )}
      style={
        status === 'in_progress'
          ? {
              // water-level 메타포: 하단 절반만 sage 로 채워 "진행 중" 임을 직관적으로 전달.
              // Tailwind 에 해당 그라디언트 유틸이 없어 inline 으로 지정 — 시맨틱 토큰 사용으로
              // 다크모드에서 sage 명도 상승을 따라간다(--color-bg-brand-solid).
              background:
                'linear-gradient(to top, var(--color-bg-brand-solid) 50%, transparent 50%)',
              // 외곽 20% sage soft ring — 목록에서 "진행 중" row 가 한 번에 눈에 띄도록.
              boxShadow:
                '0 0 0 1px color-mix(in srgb, var(--color-bg-brand-solid) 20%, transparent)',
            }
          : undefined
      }
    >
      {/* 완료 상태에서만 체크 마크 표시. stroke 두께 2.5 로 선명하게. */}
      {status === 'done' && (
        <Check aria-hidden="true" className={checkSize} strokeWidth={2.5} />
      )}
    </button>
  )
}
