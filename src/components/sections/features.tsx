import { Container } from '@/components/layout/container'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Zap,
  Shield,
  Palette,
  Code,
  Smartphone,
  Globe,
  Settings,
  Users,
  Database,
} from 'lucide-react'

const features = [
  {
    icon: Zap,
    title: '빠른 성능',
    description:
      'Next.js 15의 최적화된 빌드로 빠른 로딩 속도와 뛰어난 사용자 경험을 제공합니다.',
  },
  {
    icon: Shield,
    title: '타입 안정성',
    description:
      'TypeScript로 런타임 에러를 방지하고 개발 생산성을 크게 향상시킵니다.',
  },
  {
    icon: Palette,
    title: '아름다운 디자인',
    description:
      'ShadcnUI와 TailwindCSS로 구성된 모던하고 일관된 디자인 시스템을 제공합니다.',
  },
  {
    icon: Code,
    title: '개발자 경험',
    description:
      '최고의 DX를 위한 ESLint, Prettier, Husky 등 개발 도구가 미리 설정되어 있습니다.',
  },
  {
    icon: Smartphone,
    title: '반응형 디자인',
    description:
      'usehooks-ts를 활용한 완벽한 반응형 디자인으로 모든 디바이스에서 최적화됩니다.',
  },
  {
    icon: Globe,
    title: 'SEO 최적화',
    description:
      '검색 엔진 최적화와 메타데이터 관리가 기본으로 설정되어 있습니다.',
  },
  {
    icon: Settings,
    title: '확장 가능',
    description:
      '모듈화된 구조로 새로운 기능을 쉽게 추가하고 커스터마이징할 수 있습니다.',
  },
  {
    icon: Users,
    title: '프로덕션 준비',
    description:
      '실제 서비스 운영에 필요한 모든 설정과 보안 기능이 포함되어 있습니다.',
  },
  {
    icon: Database,
    title: '상태 관리',
    description:
      '검증된 라이브러리들을 활용한 효율적인 상태 관리 솔루션을 제공합니다.',
  },
]

export function FeaturesSection() {
  return (
    <section className="bg-muted/50 py-20">
      <Container>
        <div className="mb-16 text-center">
          <h2 className="mb-4 text-3xl font-bold">주요 기능</h2>
          <p className="text-muted-foreground mx-auto max-w-2xl">
            프로덕션 준비가 완료된 강력한 기능들로 빠르고 안정적인 웹
            애플리케이션을 구축하세요.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map(feature => (
            <Card
              key={feature.title}
              className="bg-background border-0 shadow-none"
            >
              <CardHeader>
                <feature.icon className="text-primary mb-2 h-10 w-10" />
                <CardTitle className="text-xl">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base leading-relaxed">
                  {feature.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </Container>
    </section>
  )
}
