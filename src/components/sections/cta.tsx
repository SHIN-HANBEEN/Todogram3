import { Button } from '@/components/ui/button'
import { Container } from '@/components/layout/container'

export function CTASection() {
  return (
    <section className="py-20">
      <Container>
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="mb-4 text-3xl font-bold">지금 바로 시작하세요</h2>
          <p className="text-muted-foreground mb-8 text-lg">
            몇 분 안에 모던한 웹 애플리케이션을 구축할 수 있습니다. 복잡한 설정
            없이 바로 개발을 시작하세요.
          </p>

          <div className="flex flex-col justify-center gap-4 sm:flex-row">
            <Button size="lg" className="px-8 text-base">
              무료로 시작하기
            </Button>
            <Button size="lg" variant="outline" className="px-8 text-base">
              문서 보기
            </Button>
          </div>

          <div className="bg-muted mt-12 rounded-lg p-6">
            <div className="text-muted-foreground mb-2 text-sm">빠른 설치</div>
            <code className="bg-background rounded border px-4 py-2 font-mono text-sm">
              git clone https://github.com/your-repo/nextjs-starter.git
            </code>
          </div>
        </div>
      </Container>
    </section>
  )
}
