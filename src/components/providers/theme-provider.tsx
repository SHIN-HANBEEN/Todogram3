'use client'

// UntitledUI dark mode: attribute="class", value 매핑을 통해
// light → "light-mode" 클래스, dark → "dark-mode" 클래스로 적용
// globals.css의 @custom-variant dark (&:where(.dark-mode, .dark-mode *))와 연동
import { ThemeProvider as NextThemeProvider } from 'next-themes'
import { type PropsWithChildren } from 'react'

export function ThemeProvider({ children }: PropsWithChildren) {
  return (
    <NextThemeProvider
      disableTransitionOnChange
      attribute="class"
      value={{ light: 'light-mode', dark: 'dark-mode' }}
    >
      {children}
    </NextThemeProvider>
  )
}
