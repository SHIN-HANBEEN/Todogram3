'use client'

import { useState } from 'react'
import { useMediaQuery } from 'usehooks-ts'
import { Menu } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { MainNav } from '@/components/navigation/main-nav'
import { MobileNav } from '@/components/navigation/mobile-nav'
import { Container } from './container'
import { ThemeToggle } from '@/components/theme-toggle'

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const isMobile = useMediaQuery('(max-width: 768px)')

  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 w-full border-b backdrop-blur">
      <Container>
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center space-x-2">
              <span className="text-xl font-bold">NextJS Starter</span>
            </Link>

            {/* Desktop Navigation */}
            {!isMobile && <MainNav />}
          </div>

          {/* Right Side */}
          <div className="flex items-center gap-4">
            {!isMobile && (
              <Link href="/login">
                <Button variant="outline" size="sm">
                  로그인
                </Button>
              </Link>
            )}
            <ThemeToggle />

            {/* Mobile Menu Button */}
            {isMobile && (
              <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <Menu className="h-5 w-5" />
                    <span className="sr-only">메뉴 열기</span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[300px] sm:w-[400px]">
                  <MobileNav onClose={() => setMobileMenuOpen(false)} />
                </SheetContent>
              </Sheet>
            )}
          </div>
        </div>
      </Container>
    </header>
  )
}
