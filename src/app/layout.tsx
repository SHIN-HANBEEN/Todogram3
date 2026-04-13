import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { RouteProvider } from '@/components/providers/route-provider'
import { ThemeProvider } from '@/components/providers/theme-provider'

// UntitledUI는 Inter 폰트를 기반으로 설계됨
// --font-inter CSS 변수로 theme.css의 --font-body에 연결됨
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'NextJS Starter - 모던 웹 스타터킷',
  description:
    'Next.js 15, TypeScript, TailwindCSS, UntitledUI React로 구축된 프로덕션 준비가 완료된 웹 애플리케이션 스타터킷',
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="ko"
      className={`${inter.variable} scroll-smooth`}
      suppressHydrationWarning
    >
      <body className="bg-bg-primary antialiased">
        {/* RouteProvider: React Aria 컴포넌트가 next/navigation 라우터를 사용하도록 연결 */}
        <RouteProvider>
          {/* ThemeProvider: .light-mode / .dark-mode 클래스 기반 다크모드 */}
          <ThemeProvider>{children}</ThemeProvider>
        </RouteProvider>
      </body>
    </html>
  )
}
