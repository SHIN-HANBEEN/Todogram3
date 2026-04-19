import type { Metadata, Viewport } from 'next'
import { Instrument_Serif, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { RouteProvider } from '@/components/providers/route-provider'
import { ServiceWorkerRegister } from '@/components/providers/service-worker-register'
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
  // 앱 이름 / 설명 — PWA 설치 다이얼로그, 브라우저 탭, 검색 결과 노출
  title: 'Todogram — 조용한 할 일·캘린더',
  description:
    'Todogram은 매일의 작은 다짐을 위한 Quiet Layer. Google Calendar 와 함께 Todogram task 를 같은 시간 축에서 바라봅니다.',
  applicationName: 'Todogram',
  // Next.js Metadata API 가 <link rel="manifest" href="/manifest.webmanifest"> 를 자동 주입
  manifest: '/manifest.webmanifest',
  // iOS Safari "홈 화면에 추가" 전용 메타 — standalone 실행, 상태 바 반투명
  appleWebApp: {
    capable: true,
    title: 'Todogram',
    statusBarStyle: 'default',
    // 홈 화면 아이콘 (iOS 는 apple-touch-icon 별도 요구)
    startupImage: ['/icons/apple-touch-icon.svg'],
  },
  // 파비콘/런처 아이콘 — 표준 rel 과 apple-touch-icon rel 모두 커버
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icons/icon-192.svg', type: 'image/svg+xml', sizes: '192x192' },
      { url: '/icons/icon-512.svg', type: 'image/svg+xml', sizes: '512x512' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.svg', sizes: '180x180' }],
  },
  // Open Graph / formatDetection — 전화번호 자동 링크 off (Quiet Layer 의 시각 노이즈 최소화)
  formatDetection: {
    telephone: false,
  },
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  // 상단 주소창 / iOS 홈 화면 standalone 타이틀 바 색상 — 라이트/다크 모두 브랜드 sage 유지
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#3A6E5B' },
    { media: '(prefers-color-scheme: dark)', color: '#1F2A26' },
  ],
  // 모바일에서 사용자 확대/축소 허용 (접근성) — 하지만 초기 확대는 1.0 유지
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  // iOS 노치/홈인디케이터 safe-area 확보 (CSS env(safe-area-inset-*) 와 연동)
  viewportFit: 'cover',
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
        {/* ServiceWorkerRegister: PWA 설치 가능성 요건(/sw.js) 등록 — 프로덕션 전용 */}
        <ServiceWorkerRegister />
        {/* RouteProvider: React Aria 컴포넌트가 next/navigation 라우터를 사용하도록 연결 */}
        <RouteProvider>
          {/* ThemeProvider: .light-mode / .dark-mode 클래스 기반 다크모드 */}
          <ThemeProvider>{children}</ThemeProvider>
        </RouteProvider>
      </body>
    </html>
  )
}
