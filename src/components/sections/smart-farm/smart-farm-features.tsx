'use client'

import type { FC } from 'react'
import { Bell01, BookOpen01, Settings01, Stars02 } from '@untitledui/icons'
import { FeaturedIcon } from '@/components/foundations/featured-icon/featured-icon'

// 기능 카드 데이터 타입 정의
type Feature = {
  icon: FC<{ className?: string }>
  color: 'brand' | 'success' | 'warning' | 'error' | 'gray'
  title: string
  description: string
  highlights: string[]
}

// 4가지 핵심 기능 데이터
const features: Feature[] = [
  {
    icon: Bell01,
    color: 'brand',
    title: '실시간 환경 모니터링',
    description:
      '온도, 습도, CO₂, 조도, 토양 수분을 24시간 자동 측정합니다. 이상 감지 시 즉시 알림을 발송하여 피해를 최소화하세요.',
    highlights: ['이상 감지 즉시 알림', '대시보드 실시간 현황', '7년치 이력 데이터 보관'],
  },
  {
    icon: Stars02,
    color: 'success',
    title: 'AI 작물 건강 분석',
    description:
      '카메라 이미지와 센서 데이터를 결합한 딥러닝 모델로 작물 상태를 진단합니다. 병충해를 최대 14일 전에 사전 감지하세요.',
    highlights: ['병충해 14일 전 예측', '98.7% 진단 정확도', '100개+ 작물 품종 지원'],
  },
  {
    icon: Settings01,
    color: 'warning',
    title: '스마트 자동화 제어',
    description:
      'AI 추천에 따라 관개, 환기, 조명, 난방 시스템이 자동으로 최적화됩니다. 수작업 없이 최적의 재배 환경을 유지하세요.',
    highlights: ['관개·환기·조명 자동화', '에너지 사용량 최적화', '원격 수동 제어 지원'],
  },
  {
    icon: BookOpen01,
    color: 'brand',
    title: '데이터 기반 의사결정',
    description:
      '수확량 예측, 재배 일정 최적화, 수익성 분석 리포트를 제공합니다. 데이터 기반으로 더 나은 영농 계획을 수립하세요.',
    highlights: ['수확량 예측 정확도 95%', '월간 수익성 분석 리포트', '경쟁 농장 벤치마크'],
  },
]

export const SmartFarmFeatures = () => {
  return (
    <section id="features" className="bg-bg-primary py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        {/* 섹션 헤더 */}
        <div className="mb-16 text-center">
          <p className="text-text-brand-tertiary mb-3 text-sm font-semibold uppercase tracking-widest">
            핵심 기능
          </p>
          <h2 className="text-text-primary mb-4 text-display-sm font-bold md:text-display-md">
            스마트팜을 위한 모든 기능
          </h2>
          <p className="text-text-tertiary mx-auto max-w-xl text-lg">
            농업 운영을 혁신하는 4가지 핵심 기술로 더 효율적이고 수익성 높은
            농장을 만드세요.
          </p>
        </div>

        {/* 기능 카드 그리드 — 2×2 레이아웃 */}
        <div className="grid gap-8 md:grid-cols-2">
          {features.map(feature => (
            <div
              key={feature.title}
              className="border-border-secondary hover:border-border-primary rounded-2xl border bg-bg-primary p-8 transition duration-200 ease-linear hover:shadow-md"
            >
              {/* 아이콘 + 제목 */}
              <div className="mb-4 flex items-start gap-4">
                <FeaturedIcon
                  icon={feature.icon}
                  color={feature.color}
                  theme="light"
                  size="md"
                />
                <h3 className="text-text-primary mt-1 text-xl font-bold">
                  {feature.title}
                </h3>
              </div>

              {/* 설명 */}
              <p className="text-text-tertiary mb-6 leading-relaxed">
                {feature.description}
              </p>

              {/* 하이라이트 목록 */}
              <ul className="flex flex-col gap-2">
                {feature.highlights.map(highlight => (
                  <li key={highlight} className="flex items-center gap-2">
                    <div className="bg-bg-brand-solid size-1.5 shrink-0 rounded-full" />
                    <span className="text-text-secondary text-sm font-medium">
                      {highlight}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
