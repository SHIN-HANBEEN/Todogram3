import { SmartFarmCta } from '@/components/sections/smart-farm/smart-farm-cta'
import { SmartFarmFeatures } from '@/components/sections/smart-farm/smart-farm-features'
import { SmartFarmFooter } from '@/components/sections/smart-farm/smart-farm-footer'
import { SmartFarmHero } from '@/components/sections/smart-farm/smart-farm-hero'
import { SmartFarmHowItWorks } from '@/components/sections/smart-farm/smart-farm-how-it-works'
import { SmartFarmNav } from '@/components/sections/smart-farm/smart-farm-nav'
import { SmartFarmStats } from '@/components/sections/smart-farm/smart-farm-stats'

export const metadata = {
  title: 'AgriSense AI — 스마트팜 솔루션',
  description:
    'AI와 IoT로 농업을 혁신하세요. 실시간 모니터링, AI 작물 분석, 스마트 자동화로 수확량을 32% 높이고 비용을 45% 절감하세요.',
}

export default function SmartFarmPage() {
  return (
    <div className="flex min-h-screen flex-col bg-bg-primary">
      <SmartFarmNav />
      <main className="flex-1">
        <SmartFarmHero />
        <SmartFarmStats />
        <SmartFarmFeatures />
        <SmartFarmHowItWorks />
        <SmartFarmCta />
      </main>
      <SmartFarmFooter />
    </div>
  )
}
