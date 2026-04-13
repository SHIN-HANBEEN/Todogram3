'use client'

import { ArrowRight, CheckCircle, PlayCircle } from '@untitledui/icons'
import { Badge } from '@/components/base/badges/badges'
import { Button } from '@/components/base/buttons/button'
import { BackgroundPattern } from '@/components/shared-assets/background-patterns'

// 히어로 하단 신뢰 지표 목록
const trustItems = [
  '신용카드 없이 시작',
  '14일 무료 체험',
  '언제든 해지 가능',
]

export const SmartFarmHero = () => {
  return (
    <section className="relative overflow-hidden bg-bg-primary py-20 md:py-28 lg:py-32">
      {/* 배경 패턴 — 우상단 장식 요소 */}
      <div className="pointer-events-none absolute -top-24 -right-24 opacity-50 md:opacity-70">
        <BackgroundPattern pattern="circle" size="lg" className="text-border-secondary" />
      </div>
      {/* 배경 패턴 — 좌하단 장식 요소 */}
      <div className="pointer-events-none absolute -bottom-24 -left-24 opacity-30">
        <BackgroundPattern pattern="circle" size="md" className="text-border-secondary" />
      </div>

      <div className="relative mx-auto max-w-4xl px-4 text-center md:px-8">
        {/* 상단 공지 배지 */}
        <div className="mb-6 flex justify-center">
          <a
            href="#features"
            className="group inline-flex items-center gap-2 rounded-full border border-border-secondary bg-bg-primary px-4 py-1.5 transition duration-100 ease-linear hover:border-border-primary"
          >
            <Badge color="success" size="sm">
              NEW
            </Badge>
            <span className="text-text-secondary group-hover:text-text-primary text-sm font-semibold transition duration-100 ease-linear">
              AI 수확량 예측 엔진 v2.0 출시
            </span>
            <ArrowRight className="text-text-tertiary group-hover:text-text-secondary size-4 transition duration-100 ease-linear" />
          </a>
        </div>

        {/* 메인 헤드라인 */}
        <h1 className="text-text-primary mb-6 text-display-lg font-bold tracking-tight md:text-display-xl lg:text-display-2xl">
          AI로 농장을{' '}
          <span className="text-text-brand-secondary">스마트하게</span>
          <br />
          관리하세요
        </h1>

        {/* 서브 헤드라인 */}
        <p className="text-text-tertiary mx-auto mb-10 max-w-2xl text-lg leading-relaxed md:text-xl">
          실시간 IoT 센서 데이터와 딥러닝 AI가 작물의 건강 상태를 24시간
          분석합니다. 수확량은 높이고, 운영 비용은 낮추세요.
        </p>

        {/* CTA 버튼 그룹 */}
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button
            color="primary"
            size="xl"
            href="/signup"
            iconTrailing={ArrowRight}
          >
            14일 무료 체험 시작
          </Button>
          <Button
            color="secondary"
            size="xl"
            href="#demo"
            iconLeading={PlayCircle}
          >
            데모 영상 보기
          </Button>
        </div>

        {/* 신뢰 지표 — 체크마크 리스트 */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          {trustItems.map(item => (
            <div key={item} className="flex items-center gap-1.5">
              <CheckCircle className="text-fg-success-primary size-4 shrink-0" />
              <span className="text-text-tertiary text-sm font-medium">{item}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
