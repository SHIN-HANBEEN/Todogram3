'use client'

import { useEffect, useState } from 'react'

const screens = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
}

/**
 * 특정 Tailwind CSS 뷰포트 크기가 적용되는지 확인합니다.
 *
 * @param size 확인할 크기. Tailwind CSS 기본 screen 크기 중 하나여야 합니다.
 * @returns 뷰포트 크기가 적용되는지 여부를 나타내는 boolean 값.
 */
export const useBreakpoint = (size: 'sm' | 'md' | 'lg' | 'xl' | '2xl') => {
  const [matches, setMatches] = useState(
    typeof window !== 'undefined'
      ? window.matchMedia(`(min-width: ${screens[size]})`).matches
      : true
  )

  useEffect(() => {
    const breakpoint = window.matchMedia(`(min-width: ${screens[size]})`)

    setMatches(breakpoint.matches)

    const handleChange = (value: MediaQueryListEvent) =>
      setMatches(value.matches)

    breakpoint.addEventListener('change', handleChange)
    return () => breakpoint.removeEventListener('change', handleChange)
  }, [size])

  return matches
}
