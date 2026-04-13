'use client'

// React Aria 컴포넌트가 Next.js 라우터와 연동되도록 하는 Provider
// Link, Breadcrumb 등 네비게이션 컴포넌트가 next/navigation을 통해 동작함
import type { PropsWithChildren } from 'react'
import { useRouter } from 'next/navigation'
import { RouterProvider } from 'react-aria-components'

declare module 'react-aria-components' {
  interface RouterConfig {
    routerOptions: NonNullable<
      Parameters<ReturnType<typeof useRouter>['push']>[1]
    >
  }
}

export function RouteProvider({ children }: PropsWithChildren) {
  const router = useRouter()

  return <RouterProvider navigate={router.push}>{children}</RouterProvider>
}
