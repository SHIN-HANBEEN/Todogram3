'use client'

import { useCallback, useState } from 'react'

const DEFAULT_TIMEOUT = 2000

type UseClipboardReturnType = {
  /**
   * 텍스트가 복사되었는지 여부.
   * 문자열이 제공되면 복사된 상태의 식별자로 사용됩니다.
   */
  copied: string | boolean
  /**
   * 클립보드에 텍스트를 복사하는 함수.
   * 최신 Clipboard API를 시도하고, 실패 시 폴백 방식으로 복사합니다.
   */
  copy: (
    text: string,
    id?: string
  ) => Promise<{ success: boolean; error?: Error }>
}

/**
 * 클립보드 복사 기능을 제공하는 커스텀 훅.
 */
export const useClipboard = (): UseClipboardReturnType => {
  const [copied, setCopied] = useState<string | boolean>(false)

  // 구형 브라우저 폴백 함수
  const fallback = (text: string, id?: string) => {
    try {
      const textArea = document.createElement('textarea')
      textArea.value = text
      textArea.style.position = 'absolute'
      textArea.style.left = '-99999px'

      document.body.appendChild(textArea)
      textArea.select()

      const success = document.execCommand('copy')
      textArea.remove()

      setCopied(id || true)
      setTimeout(() => setCopied(false), DEFAULT_TIMEOUT)

      return success
        ? { success: true }
        : { success: false, error: new Error('execCommand returned false') }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err : new Error('Fallback copy failed'),
      }
    }
  }

  const copy = useCallback(async (text: string, id?: string) => {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text)

        setCopied(id || true)
        setTimeout(() => setCopied(false), DEFAULT_TIMEOUT)

        return { success: true }
      } catch {
        return fallback(text, id)
      }
    }
    return fallback(text)
  }, [])

  return { copied, copy }
}
