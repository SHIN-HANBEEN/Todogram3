import { Container } from '@/components/layout/container'
import { Badge } from '@/components/ui/badge'

export function HeroSection() {
  return (
    <section className="relative py-20 md:py-32">
      <Container>
        <div className="mx-auto max-w-4xl text-center">
          <Badge variant="secondary" className="mb-6">
            ✨ Next.js 15 기반 스타터킷
          </Badge>

          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
            모던 웹 개발을 위한
            <span className="text-primary mt-2 block"> 완벽한 스타터킷</span>
          </h1>

          <p className="text-muted-foreground mx-auto mt-6 max-w-2xl text-lg">
            Next.js 15, TypeScript, TailwindCSS, ShadcnUI로 구축된 프로덕션
            준비가 완료된 웹 애플리케이션 템플릿입니다. 빠른 개발과 확장성을
            위해 설계되었습니다.
          </p>

          <div className="mt-12 grid grid-cols-2 gap-4 text-center md:grid-cols-4">
            <div>
              <div className="text-2xl font-bold">Next.js 15</div>
              <div className="text-muted-foreground text-sm">App Router</div>
            </div>
            <div>
              <div className="text-2xl font-bold">TypeScript</div>
              <div className="text-muted-foreground text-sm">타입 안정성</div>
            </div>
            <div>
              <div className="text-2xl font-bold">TailwindCSS</div>
              <div className="text-muted-foreground text-sm">유틸리티 CSS</div>
            </div>
            <div>
              <div className="text-2xl font-bold">ShadcnUI</div>
              <div className="text-muted-foreground text-sm">
                컴포넌트 라이브러리
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  )
}
