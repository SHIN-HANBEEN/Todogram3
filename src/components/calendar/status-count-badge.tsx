// ============================================================================
// StatusCountBadge — 하루 태스크의 3-state 분포 미니 스워치 (Phase 4 - U1)
// ============================================================================
// - 역할: Screen B ribbon 헤더, Screen A 월 그리드 셀 하단 등에서 해당 날짜의 3-state
//   분포를 한 줄에 압축해 보여준다. 0/4 같은 단순 비율보다 ■1 ▓1 □2 처럼 상태별 숫자가
//   훨씬 빨리 읽힌다는 memory(feedback_quiet_layer_status) 에 따라 별도 위젯으로 분리.
// - 시각 매핑: TaskStatusIndicator 와 같은 언어 체계.
//     pending      → 9×9 빈 사각 (border 1.5px, 중립 톤)
//     in_progress  → 9×9 하단 50% sage 채움 + sage 테두리
//     done         → 9×9 sage 꽉 참 + sage 테두리
//   숫자는 JetBrains Mono + tabular-nums 로 흔들림 없이 정렬.
// - 외부 이벤트는 이 카운트에 포함되지 않는다(아래 `counts` 는 내부 task 전용).
//   이유: 외부 이벤트에는 상태 개념이 없어 섞이면 의미가 흐려진다 — DESIGN.md §2.
// - 0 건인 날짜는 `emptyLabel` 로 렌더 (기본 "—"). 부모는 렌더 여부만 결정, 여기서
//   "없음" 표기를 일관되게 처리한다.
// - 표시 순서는 done → in_progress → pending (완료를 먼저 노출해 "오늘 얼마나 처리했나"
//   를 왼쪽에서 읽히도록). finalized.html 와 동일 순서.
// ============================================================================

import type { HTMLAttributes } from 'react'
import { cx } from '@/utils/cx'
import type { TaskStatus } from '@/lib/calendar/types'

export interface StatusCounts {
  pending: number
  in_progress: number
  done: number
}

export interface StatusCountBadgeProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** 하루치 3-state 분포. `CalendarDay.statusCount` 를 그대로 넘기면 된다. */
  counts: StatusCounts
  /** 전체 0 건일 때 대신 표시할 텍스트. 기본 "—" (em-dash). */
  emptyLabel?: string
  /** 사이즈 변형. 기본 `md` = 9×9 스워치 / `sm` = 7×7. 월 그리드 셀에서는 `sm` 사용. */
  size?: 'sm' | 'md'
  /** 0 건 상태는 숨길지. 월 그리드 셀에서는 `true` 로 호출해 빈 날짜 노이즈를 없앤다. */
  hideWhenEmpty?: boolean
}

/**
 * Screen B ribbon 헤더 우측 등에서 사용. 부모에서 role 설정이 없으면 기본으로
 * 의미 있는 aria-label 을 생성해준다 ("완료 3건, 진행 중 1건, 시작 전 2건").
 */
export function StatusCountBadge({
  counts,
  emptyLabel = '—',
  size = 'md',
  hideWhenEmpty = false,
  className,
  'aria-label': ariaLabelOverride,
  ...rest
}: StatusCountBadgeProps) {
  const total = counts.pending + counts.in_progress + counts.done

  if (hideWhenEmpty && total === 0) return null

  /* 사이즈 별 스워치/텍스트 크기. 9px 이하로 내려가면 border 가 계산상 0에 가까워져
   * 렌더 품질이 떨어지므로 sm 도 7×7 + 1px 로 낮춰준다. */
  const swatchSize = size === 'md' ? 'size-[9px]' : 'size-[7px]'
  const swatchBorder = size === 'md' ? 'border-[1.5px]' : 'border'
  const textClass =
    size === 'md'
      ? 'text-[12px] leading-none'
      : 'text-[11px] leading-none'

  const ariaLabel =
    ariaLabelOverride ??
    `완료 ${counts.done}건, 진행 중 ${counts.in_progress}건, 시작 전 ${counts.pending}건`

  return (
    <span
      data-slot="status-count-badge"
      aria-label={ariaLabel}
      className={cx(
        'inline-flex items-center gap-2.5 font-mono tabular-nums text-text-tertiary',
        '[font-feature-settings:"tnum"]',
        textClass,
        className
      )}
      {...rest}
    >
      {total === 0 ? (
        /* 비어있음: 대시 하나만. aria-hidden=true 로 SR 중복 방지 (상위 aria-label 이 이미
         * "완료 0건 ..." 전체 정보를 전달). */
        <span aria-hidden="true">{emptyLabel}</span>
      ) : (
        <>
          {/* done — 순서 1위. 완료 진행도를 가장 먼저 노출 */}
          <StatusSegment
            status="done"
            count={counts.done}
            size={swatchSize}
            borderClass={swatchBorder}
          />
          {/* in_progress — 순서 2위 */}
          <StatusSegment
            status="in_progress"
            count={counts.in_progress}
            size={swatchSize}
            borderClass={swatchBorder}
          />
          {/* pending — 순서 3위 (아직 시작 안 한 것은 마지막) */}
          <StatusSegment
            status="pending"
            count={counts.pending}
            size={swatchSize}
            borderClass={swatchBorder}
          />
        </>
      )}
    </span>
  )
}

interface StatusSegmentProps {
  status: TaskStatus
  count: number
  size: string
  borderClass: string
}

/**
 * 내부 세그먼트 — 스워치(미니 체크박스 모양) + 숫자 쌍.
 * 0 이어도 표시(ui 일관성). 다만 부모에서 `hideWhenEmpty` 가 false 이면 이 줄은 그대로 노출.
 */
function StatusSegment({
  status,
  count,
  size,
  borderClass,
}: StatusSegmentProps) {
  return (
    <span
      data-status={status}
      title={SEGMENT_TITLE[status]}
      className="inline-flex items-center gap-1"
    >
      <span
        aria-hidden="true"
        data-slot="status-count-swatch"
        className={cx(
          'inline-block flex-none rounded-[3px]',
          size,
          borderClass,
          /* pending: 중립 톤. 스워치 크기가 작아 border 명도를 약간 높여준다. */
          status === 'pending' && 'border-border-primary bg-transparent',
          /* in_progress: 브랜드 테두리 + 하단 50% 채움 (water-level) */
          status === 'in_progress' && 'border-border-brand',
          /* done: 꽉 찬 브랜드 (다크: sage 명도 상승) */
          status === 'done' && 'border-border-brand bg-bg-brand-solid'
        )}
        style={
          status === 'in_progress'
            ? {
                background:
                  'linear-gradient(to top, var(--color-bg-brand-solid) 50%, transparent 50%)',
              }
            : undefined
        }
      />
      <span>{count}</span>
    </span>
  )
}

/**
 * 세그먼트에 hover 하면 뜨는 툴팁 텍스트. 스크린리더는 상위 aria-label 을 읽으므로
 * 여기서는 title 만 사용한다(마우스 사용자 전용 힌트).
 */
const SEGMENT_TITLE: Record<TaskStatus, string> = {
  pending: '시작 전',
  in_progress: '진행 중',
  done: '완료',
}
