# 스타일링 가이드

이 문서는 TailwindCSS v4 + UntitledUI React를 활용한 스타일링 규칙과 모범 사례를 제공합니다.

## 🎨 기술 스택 개요

### 핵심 스타일링 도구

- **TailwindCSS v4**: 유틸리티 기반 CSS 프레임워크
- **UntitledUI React**: React Aria 기반 오픈소스 컴포넌트 라이브러리
- **next-themes**: 다크모드 지원 (`.light-mode` / `.dark-mode` 클래스 방식)
- **tailwindcss-animate**: 애니메이션 플러그인
- **tailwindcss-react-aria-components**: React Aria 컴포넌트 Tailwind 연동
- **CSS Variables**: UntitledUI 디자인 토큰 시스템 (`src/app/theme.css`)
- **prettier-plugin-tailwindcss**: 자동 클래스 정렬

## 🚀 TailwindCSS v4 사용 규칙

### 기본 원칙

```tsx
// ✅ 올바른 Tailwind 클래스 사용 (UntitledUI 색상 토큰)
<div className="flex items-center justify-between rounded-lg bg-bg-primary p-4 shadow-md">
  <h2 className="text-lg font-semibold text-text-primary">제목</h2>
  <Button color="primary" size="sm">버튼</Button>
</div>

// ❌ 인라인 스타일 사용 금지
<div style={{ display: 'flex', padding: '16px' }}>
  <h2 style={{ fontSize: '18px' }}>제목</h2>
</div>
```

### 클래스 작성 순서

Prettier 플러그인이 자동으로 정렬하지만, 수동 작성 시 다음 순서를 따르세요:

```tsx
<div className={cn(
  // 1. 레이아웃 (display, position)
  "flex absolute",

  // 2. 크기 (width, height, padding, margin)
  "w-full h-auto p-4 m-2",

  // 3. 타이포그래피 (font, text)
  "text-lg font-medium text-center",

  // 4. 배경 및 테두리
  "bg-background border border-border rounded-md",

  // 5. 효과 (shadow, opacity, transform)
  "shadow-lg opacity-90 hover:scale-105",

  // 6. 상호작용 (hover, focus, active)
  "hover:bg-accent focus:ring-2 active:scale-95",

  // 조건부 클래스
  isActive && "bg-primary text-primary-foreground",
  className
)}>
```

### 반응형 디자인

```tsx
// ✅ 모바일 우선 접근법
<div className={cn(
  // 기본 (모바일)
  "flex flex-col space-y-4 p-4",

  // 태블릿 (768px+)
  "md:flex-row md:space-y-0 md:space-x-6 md:p-6",

  // 데스크톱 (1024px+)
  "lg:max-w-6xl lg:mx-auto lg:p-8",

  // 대형 화면 (1280px+)
  "xl:max-w-7xl"
)}>

// ❌ 데스크톱 우선 접근법 지양
<div className="hidden lg:block md:hidden">
```

### 커스텀 클래스 최소화

```tsx
// ✅ Tailwind 유틸리티 클래스 우선 사용
<button className="rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90">

// ❌ 커스텀 CSS 클래스 지양
<button className="custom-button">
```

## 🎭 UntitledUI React 컴포넌트 활용

### 기본 사용법

```tsx
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// ✅ UntitledUI React 컴포넌트 활용
export function UserCard({ user }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{user.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <Button variant="outline">프로필 보기</Button>
      </CardContent>
    </Card>
  )
}
```

### 컴포넌트 변형 (Variants)

UntitledUI React는 `variant` 대신 `color`와 `hierarchy` props를 사용합니다.

```tsx
// Button color 변형
<Button color="primary">Primary 버튼</Button>
<Button color="secondary">Secondary 버튼</Button>
<Button color="tertiary">Tertiary 버튼</Button>
<Button color="error">에러 버튼</Button>
<Button color="success">성공 버튼</Button>

// 크기 변형
<Button size="sm">작은 크기</Button>
<Button size="md">기본 크기</Button>
<Button size="lg">큰 크기</Button>
<Button size="xl">특대 크기</Button>

// 아이콘 버튼
<Button iconLeading={PlusIcon}>아이콘 포함</Button>
<Button iconOnly={PlusIcon} />
```

### 컴포넌트 커스터마이징

```tsx
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ✅ 기존 컴포넌트 확장
export function CustomButton({ className, ...props }) {
  return (
    <Button
      className={cn(
        'transition-all duration-200',
        'hover:-translate-y-0.5 hover:shadow-lg',
        className
      )}
      {...props}
    />
  )
}

// ❌ 처음부터 새로 만들기
export function MyButton({ className, ...props }) {
  return (
    <button
      className="bg-blue-500... px-4 py-2" // 긴 클래스 나열
      {...props}
    />
  )
}
```

### 새 UntitledUI React 컴포넌트 추가

```bash
# 프로젝트 초기화 (최초 1회)
npx untitledui@latest init --nextjs

# 컴포넌트 추가
npx untitledui@latest add button
npx untitledui@latest add card
npx untitledui@latest add dialog
```

## 🌓 다크모드 구현

UntitledUI는 `.light-mode` / `.dark-mode` 클래스 기반 다크모드를 사용합니다.
`globals.css`의 `@custom-variant dark (&:where(.dark-mode, .dark-mode *))` 설정으로 동작합니다.

### next-themes 활용

```tsx
// src/components/providers/theme-provider.tsx
// attribute="class" + value 매핑으로 .light-mode/.dark-mode 클래스 주입
export function ThemeProvider({ children }: PropsWithChildren) {
  return (
    <NextThemeProvider
      disableTransitionOnChange
      attribute="class"
      value={{ light: 'light-mode', dark: 'dark-mode' }}
    >
      {children}
    </NextThemeProvider>
  )
}
```

### 테마 토글 컴포넌트

```tsx
'use client'

import { useTheme } from 'next-themes'
import { Button } from '@/components/base/buttons/button'
import { Moon01, Sun } from '@untitledui/icons'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <Button
      aria-label="테마 전환"
      color="tertiary"
      size="sm"
      iconLeading={theme === 'light' ? Moon01 : Sun}
      onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
    />
  )
}
```

### 다크모드 대응 스타일링

UntitledUI의 `theme.css`가 `.dark-mode` 클래스 기반으로 변수값을 자동 교체합니다.

```tsx
// ✅ UntitledUI 시맨틱 토큰 사용 → 다크모드 자동 대응
<div className="bg-bg-primary text-text-primary">
  <h1 className="text-text-brand-primary">제목</h1>
  <p className="text-text-tertiary">설명</p>
  <button className="bg-bg-brand-solid text-white">버튼</button>
</div>

// ❌ 하드코딩된 색상 사용
<div className="bg-white text-black dark:bg-black dark:text-white">
  <h1 className="text-blue-600 dark:text-blue-400">제목</h1>
</div>
```

## 🎨 색상 시스템

### UntitledUI 디자인 토큰 구조

`src/app/theme.css`에 정의된 색상 토큰 체계:

```
--color-brand-*       : 브랜드 원색 (50~950)
--color-text-*        : 텍스트 색상 (primary, secondary, tertiary...)
--color-bg-*          : 배경 색상 (primary, secondary, brand-solid...)
--color-border-*      : 테두리 색상 (primary, secondary, error...)
--color-fg-*          : 아이콘/전경 색상
--color-utility-*     : 상태 표시용 (blue, red, green, yellow...)
```

Figma PRO VARIABLES의 토큰 이름과 1:1 대응합니다.

### 색상 사용 예시

```tsx
// ✅ UntitledUI 시맨틱 토큰 사용
<div className="bg-bg-primary border border-border-primary">
  <h1 className="text-text-primary">메인 텍스트</h1>
  <p className="text-text-tertiary">보조 텍스트</p>
  <span className="text-text-brand-secondary">브랜드 텍스트</span>
</div>

// ✅ 상태별 배경색
<div className="bg-bg-error-primary text-text-error-primary">에러</div>
<div className="bg-bg-success-primary text-text-success-primary">성공</div>
<div className="bg-bg-warning-primary text-text-warning-primary">경고</div>
<div className="bg-bg-brand-solid text-white">브랜드 강조</div>

// ❌ 직접 색상 지정
<div className="bg-white border-gray-200">
  <h1 className="text-gray-900">메인 텍스트</h1>
</div>
```

### 브랜드 색상 커스터마이징

Figma에서 브랜드 색상을 변경한 경우 `src/app/theme.css`의 `--color-brand-*` 값만 업데이트:

```css
/* src/app/theme.css - @theme {} 블록 내 */
--color-brand-600: rgb(127 86 217); /* 기본값: violet */
/* → rgb(59 130 246) 등으로 교체하면 전체 컴포넌트에 반영 */
```

## ✨ 애니메이션 가이드

### tailwindcss-animate 활용

`globals.css`에 `@plugin "tailwindcss-animate"` 로 등록되어 있습니다.

```tsx
// ✅ 내장 애니메이션 사용
<div className="animate-in fade-in">페이드 인</div>
<div className="animate-in slide-in-from-bottom">슬라이드 업</div>
<div className="animate-bounce">바운스</div>

// ✅ Tailwind transition 활용
<button className="transition-all duration-200 hover:scale-105 hover:shadow-lg">
  호버 효과
</button>

// ✅ 복합 애니메이션
<div className="transform transition-transform duration-300 hover:scale-110 hover:rotate-3">
  복합 효과
</div>
```

### 성능 고려사항

```tsx
// ✅ will-change 사용으로 성능 최적화
<div className="will-change-transform transition-transform hover:scale-105">

// ✅ 애니메이션 종료 후 will-change 제거
<div className="hover:will-change-transform transition-transform hover:scale-105">
```

## 📱 반응형 디자인 패턴

### 컨테이너 패턴

```tsx
// ✅ 반응형 컨테이너
<div className="container mx-auto px-4 sm:px-6 lg:px-8">
  <div className="max-w-7xl mx-auto">
    {/* 컨텐츠 */}
  </div>
</div>

// ✅ 그리드 레이아웃
<div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
  {items.map(item => (
    <Card key={item.id}>...</Card>
  ))}
</div>
```

### 네비게이션 패턴

```tsx
// ✅ 반응형 네비게이션
<nav className="flex items-center justify-between p-4">
  <div className="flex items-center space-x-4">
    <Logo />
    <div className="hidden md:flex md:space-x-6">
      <NavLink href="/about">소개</NavLink>
      <NavLink href="/contact">연락처</NavLink>
    </div>
  </div>

  {/* 모바일 메뉴 */}
  <div className="md:hidden">
    <MobileMenu />
  </div>
</nav>
```

## 🛠️ 유틸리티 함수

### cn() 헬퍼 함수

```tsx
import { cn } from '@/lib/utils'

// ✅ cn() 함수로 클래스 조합
<div className={cn(
  "base-classes",
  condition && "conditional-classes",
  variant === 'primary' && "primary-classes",
  className // props에서 받은 추가 클래스
)}>

// ❌ 수동 문자열 조합
<div className={`base-classes ${condition ? 'conditional-classes' : ''} ${className || ''}`}>
```

### 조건부 스타일링

```tsx
// ✅ 조건부 클래스 적용
<Button
  className={cn(
    "base-button-styles",
    isLoading && "opacity-50 cursor-not-allowed",
    variant === 'destructive' && "bg-destructive text-destructive-foreground",
    size === 'sm' && "px-2 py-1 text-sm"
  )}
  disabled={isLoading}
>

// ❌ 복잡한 삼항 연산자
<Button
  className={
    isLoading
      ? "opacity-50 cursor-not-allowed"
      : variant === 'destructive'
        ? "bg-red-500 text-white"
        : "bg-blue-500 text-white"
  }
>
```

## 🚫 금지사항

### ❌ 피해야 할 패턴

```tsx
// 인라인 스타일 사용
<div style={{ backgroundColor: 'red' }}>

// 긴 클래스명 하드코딩
<div className="w-full h-screen flex items-center justify-center bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-white font-bold text-2xl shadow-2xl rounded-lg border-4 border-white">

// 중복된 스타일 정의
<div className="p-4 padding-4 pt-4 pb-4 pl-4 pr-4">

// !important 남용
<div className="!text-red-500 !bg-blue-500">

// Tailwind와 CSS 모듈 혼재
<div className={`${styles.customClass} flex items-center`}>
```

### ❌ 잘못된 색상 사용

```tsx
// 하드코딩된 색상
<div className="bg-gray-100 text-gray-900">

// 다크모드 미고려
<div className="bg-white text-black">

// 접근성 미고려
<button className="bg-red-200 text-red-300">저대비 버튼</button>
```

## ✅ 스타일링 체크리스트

새 컴포넌트 작성 시 확인사항:

### 기본 사항

- [ ] TailwindCSS 유틸리티 클래스 우선 사용
- [ ] cn() 함수로 클래스 조합
- [ ] 시맨틱 색상 변수 사용
- [ ] 반응형 디자인 적용

### 다크모드

- [ ] 다크모드 대응 색상 사용
- [ ] 하드코딩된 색상 없음
- [ ] 테마 전환 시 깨짐 없음

### 성능

- [ ] 불필요한 애니메이션 없음
- [ ] will-change 적절히 사용
- [ ] 인라인 스타일 없음

### 접근성

- [ ] 충분한 색상 대비
- [ ] 포커스 상태 스타일링
- [ ] 스크린 리더 고려

### 유지보수

- [ ] 일관된 클래스 순서
- [ ] 재사용 가능한 컴포넌트 활용
- [ ] 의미있는 클래스 조합

이 가이드를 따라 일관성 있고 아름다운 UI를 구현해보세요!
