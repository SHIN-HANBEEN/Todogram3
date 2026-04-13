// 푸터 네비게이션 컬럼 데이터
const footerColumns = [
  {
    heading: '제품',
    links: [
      { label: '기능 소개', href: '#features' },
      { label: '요금제', href: '#pricing' },
      { label: '보안', href: '#security' },
      { label: '업데이트 노트', href: '#changelog' },
    ],
  },
  {
    heading: '회사',
    links: [
      { label: '회사 소개', href: '#about' },
      { label: '고객 사례', href: '#cases' },
      { label: '블로그', href: '#blog' },
      { label: '채용', href: '#careers' },
    ],
  },
  {
    heading: '지원',
    links: [
      { label: '고객센터', href: '#support' },
      { label: '설치 가이드', href: '#install' },
      { label: 'API 문서', href: '#api' },
      { label: '문의하기', href: '#contact' },
    ],
  },
  {
    heading: '법적 고지',
    links: [
      { label: '개인정보처리방침', href: '#privacy' },
      { label: '이용약관', href: '#terms' },
      { label: '쿠키 정책', href: '#cookies' },
    ],
  },
]

// 브랜드 로고 아이콘 — nav와 동일한 인라인 SVG
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

export const SmartFarmFooter = () => {
  return (
    <footer className="border-border-secondary border-t bg-bg-primary">
      <div className="mx-auto max-w-7xl px-4 py-12 md:px-8 md:py-16">
        {/* 상단 — 로고/설명 + 네비게이션 컬럼 */}
        <div className="mb-12 grid gap-8 md:grid-cols-5">
          {/* 브랜드 영역 */}
          <div className="md:col-span-1">
            <a
              href="/smart-farm"
              className="mb-4 flex items-center gap-2"
              aria-label="AgriSense AI 홈으로 이동"
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-bg-brand-solid">
                <LeafIcon className="size-4 text-white" />
              </div>
              <span className="text-text-primary text-base font-bold tracking-tight">
                AgriSense
              </span>
            </a>
            <p className="text-text-tertiary text-sm leading-relaxed">
              AI와 IoT로 농업의 미래를 만들어가는 스마트팜 솔루션 기업입니다.
            </p>
          </div>

          {/* 네비게이션 컬럼 그리드 */}
          <div className="grid grid-cols-2 gap-8 md:col-span-4 md:grid-cols-4">
            {footerColumns.map(column => (
              <div key={column.heading}>
                <h3 className="text-text-primary mb-3 text-sm font-semibold">
                  {column.heading}
                </h3>
                <ul className="flex flex-col gap-2.5">
                  {column.links.map(link => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        className="text-text-tertiary hover:text-text-primary text-sm transition duration-100 ease-linear"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* 하단 — 저작권 및 소셜 링크 */}
        <div className="border-border-secondary flex flex-col items-center justify-between gap-4 border-t pt-8 md:flex-row">
          <p className="text-text-quaternary text-sm">
            © {new Date().getFullYear()} AgriSense AI. 모든 권리 보유.
          </p>
          <div className="flex items-center gap-4">
            <a
              href="#"
              aria-label="AgriSense AI 카카오채널"
              className="text-text-quaternary hover:text-text-secondary transition duration-100 ease-linear"
            >
              <svg className="size-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3C6.48 3 2 6.48 2 10.8c0 2.69 1.48 5.07 3.73 6.56l-.95 3.54 4.1-2.73A11.7 11.7 0 0 0 12 18.6c5.52 0 10-3.48 10-7.8S17.52 3 12 3z" />
              </svg>
            </a>
            <a
              href="#"
              aria-label="AgriSense AI 인스타그램"
              className="text-text-quaternary hover:text-text-secondary transition duration-100 ease-linear"
            >
              <svg className="size-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
              </svg>
            </a>
            <a
              href="#"
              aria-label="AgriSense AI 유튜브"
              className="text-text-quaternary hover:text-text-secondary transition duration-100 ease-linear"
            >
              <svg className="size-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
