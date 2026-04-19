'use client'

import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, InputHTMLAttributes } from 'react'
import { SearchLg, X as CloseX } from '@untitledui/icons'
import { cx, sortCx } from '@/utils/cx'

/* --------------------------------------------------------------------------
 * SearchBox — Todogram v3 List View 검색 인풋
 *
 * approved.json list-view-20260419 · spec.search_box 근거.
 *   - 높이 40px, 좌측 14px 자리에 magnifier(14px) 아이콘 고정, 좌패딩 38px.
 *   - 우측 X 버튼(값이 있을 때만 렌더) 으로 한 번에 비우기.
 *   - debounce 200ms — value 입력과 onDebouncedChange 호출 사이에 지연을 두어
 *     ILIKE 서버 호출이 폭주하지 않도록 한다.
 *
 * 접근성: role="searchbox" + aria-label. 아이콘은 aria-hidden (장식). X 버튼은
 * aria-label="검색어 지우기" + focus-visible outline.
 *
 * 모션: prefers-reduced-motion 자동 대응 (transition 100ms ease-linear 만 사용).
 * -------------------------------------------------------------------------- */

export interface SearchBoxProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'onChange' | 'value' | 'defaultValue' | 'type'
  > {
  /** 현재 controlled 값 (상위에서 상태 관리). */
  value: string
  /** 키 입력 즉시 호출 (UI 가 인풋 표시를 갱신하기 위함). */
  onChange: (value: string) => void
  /**
   * debounce 이후 호출. 서버 액션(`searchTasks`) 호출 트리거로 사용.
   * 지연값은 `debounceMs` prop 으로 조절 가능 (기본 200ms).
   */
  onDebouncedChange?: (value: string) => void
  /** debounce 간격(ms). 기본 200. 0 이면 onChange 와 동일하게 즉시 호출. */
  debounceMs?: number
  /** 플레이스홀더. 기본 '제목·메모에서 찾기'. */
  placeholder?: string
  /** aria-label. 기본 '할 일 검색'. */
  ariaLabel?: string
}

const styles = sortCx({
  wrapper: {
    /* 감싸는 container — relative 로 아이콘/버튼 절대 위치. padding 은 부모 responsibility. */
    base: 'relative flex items-center',
  },
  input: {
    /* 40px 높이 · 좌패딩 38(아이콘 공간) · 우패딩 36(X 버튼 공간).
     * radius 10px · 1px solid border-primary · bg-primary (surface).
     * focus 시 brand border + focus ring. */
    base:
      'w-full h-10 pl-[38px] pr-9 rounded-[10px] bg-bg-primary' +
      ' border border-border-primary text-[14px] leading-none' +
      ' text-text-primary placeholder:text-text-quaternary' +
      ' outline-none transition-colors duration-100 ease-linear' +
      ' motion-reduce:transition-none' +
      ' focus:border-border-brand' +
      ' focus-visible:outline focus-visible:outline-2' +
      ' focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
  },
  icon: {
    /* 14px magnifier · 좌측 14px 고정. pointer-events-none 으로 클릭 시 인풋 포커스 유지. */
    base:
      'pointer-events-none absolute left-[14px] top-1/2 -translate-y-1/2' +
      ' size-[14px] text-text-tertiary',
  },
  clear: {
    /* X 버튼 — 우측 8px. 터치 타겟은 시각 28px 이나 hit area 는 padding 포함 40px 확보.
     * 내부 CloseX 아이콘 14px. focus-visible ring 동일 규칙. */
    base:
      'absolute right-2 top-1/2 -translate-y-1/2 inline-flex' +
      ' items-center justify-center size-7 rounded-full' +
      ' text-text-tertiary hover:text-text-primary' +
      ' transition-colors duration-100 ease-linear' +
      ' motion-reduce:transition-none' +
      ' focus-visible:outline focus-visible:outline-2' +
      ' focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
  },
})

/* --------------------------------------------------------------------------
 * SearchBox — 디바운스 내장. onDebouncedChange 가 없으면 순수 controlled input.
 * -------------------------------------------------------------------------- */
export function SearchBox({
  value,
  onChange,
  onDebouncedChange,
  debounceMs = 200,
  placeholder = '제목·메모에서 찾기',
  ariaLabel = '할 일 검색',
  className,
  ...rest
}: SearchBoxProps) {
  /* 마지막으로 onDebouncedChange 에 전달한 값 추적 — 동일 값이면 중복 호출 생략.
   * (부모가 다른 이유로 리렌더되어 value 가 바뀌지 않았는데도 useEffect 가 도는 상황 방지) */
  const lastDispatched = useRef<string>(value)

  /* 로컬 캐시 — 순전히 effect 의 의존성을 안정화하기 위한 용도. controlled 모드의
   * value 를 그대로 dependency 로 쓰면 된다. */
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!onDebouncedChange) return
    if (debounceMs <= 0) {
      if (lastDispatched.current !== value) {
        lastDispatched.current = value
        onDebouncedChange(value)
      }
      return
    }
    const timer = setTimeout(() => {
      if (lastDispatched.current !== value) {
        lastDispatched.current = value
        onDebouncedChange(value)
        /* setTick 은 의미 없는 상태 갱신 아님 — React 가 effect cleanup 후 이
         * 컴포넌트가 unmount 되면 setTimeout 이 이미 해제되므로 안전. 여기서
         * 굳이 setTick 을 부르지 않음 (리렌더 유발하지 않기 위해). */
      }
    }, debounceMs)
    return () => clearTimeout(timer)
  }, [value, debounceMs, onDebouncedChange])

  /* 입력 변화 — controlled. onChange 로 부모에 즉시 전달. */
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value)
  }

  /* X 버튼 — 값 비우기. onChange 로 '' 전달 후 debounce effect 가 검색 해제 트리거. */
  const handleClear = () => {
    onChange('')
    /* 즉시 debounce 콜백도 비어있는 값으로 내보내도록 강제 flush.
     * 사용자가 X 를 누른 시점은 명확한 의도 표현이라 debounce 대기 없이 반영. */
    if (onDebouncedChange && lastDispatched.current !== '') {
      lastDispatched.current = ''
      onDebouncedChange('')
    }
    setTick(t => t + 1) /* 포커스 유지·리렌더 트리거 — 접근성상 X 누른 뒤 인풋에 포커스가 남도록. */
  }

  const hasValue = value.length > 0

  return (
    <div data-slot="task-list-search-box" className={cx(styles.wrapper.base, className)}>
      <SearchLg aria-hidden="true" className={styles.icon.base} strokeWidth={2} />
      <input
        {...rest}
        type="search"
        role="searchbox"
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        className={styles.input.base}
      />
      {hasValue && (
        <button
          type="button"
          aria-label="검색어 지우기"
          onClick={handleClear}
          className={styles.clear.base}
        >
          <CloseX aria-hidden="true" className="size-[14px]" strokeWidth={2} />
        </button>
      )}
    </div>
  )
}
