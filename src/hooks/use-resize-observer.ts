import { useEffect } from 'react'
import type { RefObject } from '@react-types/shared'

/**
 * ResizeObserver API 지원 여부를 확인합니다.
 */
function hasResizeObserver() {
  return typeof window.ResizeObserver !== 'undefined'
}

type UseResizeObserverOptionsType<T> = {
  /** 관찰할 요소의 ref */
  ref: RefObject<T | undefined | null> | undefined
  /** 관찰할 박스 유형 */
  box?: ResizeObserverBoxOptions
  /** 크기가 변경될 때 호출할 콜백 함수 */
  onResize: () => void
}

/**
 * 요소의 크기를 관찰하고 크기가 변경되면 콜백을 호출하는 훅.
 */
export function useResizeObserver<T extends Element>(
  options: UseResizeObserverOptionsType<T>
) {
  const { ref, box, onResize } = options

  useEffect(() => {
    const element = ref?.current
    if (!element) {
      return
    }

    if (!hasResizeObserver()) {
      window.addEventListener('resize', onResize, false)

      return () => {
        window.removeEventListener('resize', onResize, false)
      }
    } else {
      const resizeObserverInstance = new window.ResizeObserver(entries => {
        if (!entries.length) {
          return
        }

        onResize()
      })

      resizeObserverInstance.observe(element, { box })

      return () => {
        if (element) {
          resizeObserverInstance.unobserve(element)
        }
      }
    }
  }, [onResize, ref, box])
}
