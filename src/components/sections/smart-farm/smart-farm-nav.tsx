'use client'

import { useState } from 'react'
import { Menu02, X } from '@untitledui/icons'
import { Button } from '@/components/base/buttons/button'
import { cx } from '@/utils/cx'

// 상단 네비게이션 링크 목록
const navLinks = [
  { label: '제품 소개', href: '#features' },
  { label: '요금제', href: '#pricing' },
  { label: '고객 사례', href: '#cases' },
  { label: '블로그', href: '#blog' },
]

// 브랜드 로고 아이콘 — 인라인 SVG로 외부 의존성 없이 렌더링
const LeafIcon = ({ className }: { className?: string }) => (
  <svg
    aria-hidden="true"
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z" />
    <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
  </svg>
)

export const SmartFarmNav = () => {
  // 모바일 메뉴 열림/닫힘 상태
  const [isOpen, setIsOpen] = useState(false)

  return (
    <header className="border-border-secondary sticky top-0 z-50 border-b bg-bg-primary/95 backdrop-blur-sm">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-8">
        {/* 브랜드 로고 */}
        <a
          href="/smart-farm"
          aria-label="AgriSense AI 홈으로 이동"
          className="flex items-center gap-2"
        >
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-bg-brand-solid">
            <LeafIcon className="size-4 text-white" />
          </div>
          <span className="text-text-primary text-lg font-bold tracking-tight">
            AgriSense
          </span>
          <span className="bg-bg-brand-secondary text-text-brand-secondary rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest">
            AI
          </span>
        </a>

        {/* 데스크탑 네비게이션 링크 */}
        <ul className="hidden items-center gap-0.5 md:flex">
          {navLinks.map(link => (
            <li key={link.label}>
              <a
                href={link.href}
                className={cx(
                  'text-text-secondary hover:text-text-primary rounded-lg px-3 py-2 text-sm font-semibold',
                  'hover:bg-bg-primary_hover transition duration-100 ease-linear'
                )}
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        {/* 데스크탑 액션 버튼 */}
        <div className="hidden items-center gap-3 md:flex">
          <Button color="secondary" size="sm" href="/login">
            로그인
          </Button>
          <Button color="primary" size="sm" href="/signup">
            무료 체험 시작
          </Button>
        </div>

        {/* 모바일 메뉴 토글 버튼 */}
        <button
          aria-label={isOpen ? '메뉴 닫기' : '메뉴 열기'}
          aria-expanded={isOpen}
          onClick={() => setIsOpen(prev => !prev)}
          className={cx(
            'text-text-secondary hover:bg-bg-primary_hover cursor-pointer rounded-lg p-2',
            'transition duration-100 ease-linear md:hidden'
          )}
        >
          {isOpen ? (
            <X className="size-5" />
          ) : (
            <Menu02 className="size-5" />
          )}
        </button>
      </nav>

      {/* 모바일 드롭다운 메뉴 */}
      {isOpen && (
        <div className="border-border-secondary border-t bg-bg-primary md:hidden">
          <ul className="flex flex-col px-4 py-2">
            {navLinks.map(link => (
              <li key={link.label}>
                <a
                  href={link.href}
                  onClick={() => setIsOpen(false)}
                  className={cx(
                    'text-text-secondary hover:text-text-primary block rounded-lg px-3 py-2.5 text-sm font-semibold',
                    'hover:bg-bg-primary_hover transition duration-100 ease-linear'
                  )}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2 px-4 pb-4 pt-1">
            <Button color="secondary" size="md" href="/login">
              로그인
            </Button>
            <Button color="primary" size="md" href="/signup">
              무료 체험 시작
            </Button>
          </div>
        </div>
      )}
    </header>
  )
}
