import { Footer } from '@/components/layout/footer'
import { Header } from '@/components/layout/header'
import { CTASection } from '@/components/sections/cta'
import { FeaturesSection } from '@/components/sections/features'
import { HeroSection } from '@/components/sections/hero'

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <HeroSection />
        <FeaturesSection />
        <CTASection />
      </main>
      <Footer />
    </div>
  )
}
