'use client'

import { ArrowRight, CheckCircle } from '@untitledui/icons'
import { Button } from '@/components/base/buttons/button'
import { BackgroundPattern } from '@/components/shared-assets/background-patterns'

// CTA 섹션 하단 보증 항목
const guarantees = [
  '14일 무료 체험',
  '신용카드 불필요',
  '전담 온보딩 지원',
  '언제든 해지 가능',
]

export const SmartFarmCta = () => {
  return (
    <section className="bg-bg-brand-section relative overflow-hidden py-24 md:py-32">
      {/* 배경 장식 패턴 */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-10">
        <BackgroundPattern pattern="grid-check" size="md" className="text-white" />
      </div>

      <div className="relative mx-auto max-w-4xl px-4 text-center md:px-8">
        {/* 상단 레이블 */}
        <p className="text-text-secondary_on-brand mb-4 text-sm font-semibold uppercase tracking-widest">
          지금 시작하세요
        </p>

        {/* 메인 헤드라인 */}
        <h2 className="text-text-primary_on-brand mb-6 text-display-md font-bold md:text-display-lg">
          스마트팜으로
          <br />
          농업의 미래를 경험하세요
        </h2>

        {/* 서브 카피 */}
        <p className="text-text-secondary_on-brand mx-auto mb-10 max-w-xl text-lg leading-relaxed">
          전국 500개 농장이 이미 AgriSense AI로 수확량을 높이고 있습니다.
          지금 바로 14일 무료 체험을 시작하세요.
        </p>

        {/* CTA 버튼 그룹 */}
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button
            color="primary"
            size="xl"
            href="/signup"
            iconTrailing={ArrowRight}
          >
            무료 체험 시작하기
          </Button>
          <Button
            color="secondary"
            size="xl"
            href="/contact"
          >
            영업팀 문의
          </Button>
        </div>

        {/* 보증 항목 */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          {guarantees.map(item => (
            <div key={item} className="flex items-center gap-1.5">
              <CheckCircle className="text-text-secondary_on-brand size-4 shrink-0 opacity-80" />
              <span className="text-text-secondary_on-brand text-sm font-medium opacity-80">
                {item}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
