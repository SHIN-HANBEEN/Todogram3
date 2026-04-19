'use client'

import { useEffect } from 'react'

/**
 * Todogram PWA Service Worker 등록 컴포넌트
 *
 * 역할:
 *   - 브라우저가 Service Worker API 를 지원할 때만 `/sw.js` 를 등록한다.
 *   - 개발 모드(Turbopack 핫 리로드) 에서는 SW 캐시가 HMR 을 방해할 수 있어
 *     `process.env.NODE_ENV === 'production'` 인 경우에만 등록한다.
 *   - 등록된 SW 는 installability(홈 화면에 추가) 요건만 충족. 캐시 전략 없음.
 *
 * 배치:
 *   - `src/app/layout.tsx` 의 body 최상단에 mount. Client Component 이므로 Server layout 과 공존.
 *   - 한 번만 register 하면 되므로 useEffect deps 는 빈 배열.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    // SSR/구형 브라우저 가드
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return
    // 개발 모드에서는 등록 skip — Turbopack HMR 과 SW 캐시의 충돌 방지
    if (process.env.NODE_ENV !== 'production') return

    // 페이지 load 이후 등록 → 초기 렌더 성능 영향 최소화
    const register = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch((error) => {
          // 등록 실패는 치명적이지 않음(PWA 설치만 못 할 뿐). 콘솔 경고만 남긴다.
          console.warn('[Todogram] Service Worker 등록 실패:', error)
        })
    }

    if (document.readyState === 'complete') {
      register()
    } else {
      window.addEventListener('load', register, { once: true })
      return () => window.removeEventListener('load', register)
    }
  }, [])

  // DOM 에 아무 것도 렌더하지 않는다 — 사이드 이펙트 전용 컴포넌트
  return null
}
