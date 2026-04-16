import type { Metadata, Viewport } from 'next'
import { Instrument_Serif, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { RouteProvider } from '@/components/providers/route-provider'
import { ThemeProvider } from '@/components/providers/theme-provider'

// Todogram v3 Quiet Layer 폰트 스택
// - Body: Pretendard Variable (globals.css에서 self-hosted CSS import)
// - Display: Instrument Serif (display/moments 전용, DESIGN §3)
// - Mono: JetBrains Mono (tabular-nums 시간/데이터 표기)
// 각 변수명은 theme.css의 --font-display / --font-mono fallback 체인과 일치해야 함
const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  variable: '--font-instrument-serif',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
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
      className={`${instrumentSerif.variable} ${jetbrainsMono.variable} scroll-smooth`}
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
