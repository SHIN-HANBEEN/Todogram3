# Figma MCP 디자인 시스템 규칙

이 문서는 Figma MCP가 디자인을 코드로 변환할 때 참조하는 규칙입니다.
`src/app/theme.css`에 정의된 UntitledUI 디자인 토큰 시스템을 기반으로 합니다.

---

## 1. 프로젝트 스택

- **Framework**: Next.js 15.5.3 (App Router)
- **Runtime**: React 19 + TypeScript 5
- **Styling**: TailwindCSS v4 (CSS-first, `@theme {}` in `src/app/theme.css`)
- **Design System**: UntitledUI (violet/purple 브랜드 팔레트)
- **Components (신규)**: UntitledUI React Aria 기반 (`src/components/base/`, `application/`, `foundations/`, `marketing/`, `shared-assets/`)
- **Components (레거시)**: shadcn/ui 패턴 (`src/components/ui/` - 기존 login/signup/sections 페이지 사용 중)
- **Icons**: `@untitledui/icons` (기본), `lucide-react` (보조)
- **유틸리티**: `cx()` / `cn()` from `@/lib/utils` 또는 `@/utils/cx`

---

## 2. 타이포그래피 매핑

**폰트**: `--font-body` / `--font-display` 모두 Inter (Google Fonts)

| Figma 텍스트 스타일 | CSS 변수             | Tailwind 클래스    | 크기 (px)                     |
| ------------------- | -------------------- | ------------------ | ----------------------------- |
| Text xs             | `--text-xs`          | `text-xs`          | 12px                          |
| Text sm             | `--text-sm`          | `text-sm`          | 14px                          |
| Text md             | `--text-md`          | `text-md`          | 16px                          |
| Text lg             | `--text-lg`          | `text-lg`          | 18px                          |
| Text xl             | `--text-xl`          | `text-xl`          | 20px                          |
| Display xs          | `--text-display-xs`  | `text-display-xs`  | 24px                          |
| Display sm          | `--text-display-sm`  | `text-display-sm`  | 30px                          |
| Display md          | `--text-display-md`  | `text-display-md`  | 36px, letter-spacing: -0.72px |
| Display lg          | `--text-display-lg`  | `text-display-lg`  | 48px, letter-spacing: -0.96px |
| Display xl          | `--text-display-xl`  | `text-display-xl`  | 60px, letter-spacing: -1.2px  |
| Display 2xl         | `--text-display-2xl` | `text-display-2xl` | 72px, letter-spacing: -1.44px |

> **중요**: `cn()` / `cx()`는 `display-*` 텍스트 클래스를 인식하도록 확장되어 있음.
> `src/lib/utils.ts`의 `extendTailwindMerge`로 등록되어 정상 병합 가능.

```tsx
// ✅ 올바른 사용
<h1 className="text-display-2xl font-semibold text-text-primary">제목</h1>
<p className="text-md text-text-secondary">본문</p>
```

---

## 3. 색상 시스템 매핑

모든 색상은 `src/app/theme.css`의 `@theme {}` 블록에 CSS 변수로 정의.
TailwindCSS v4가 이 변수들을 유틸리티 클래스로 자동 노출.

### 3-1. 브랜드 원색 (Primitive)

violet/purple 팔레트:

| CSS 변수            | 값                 | Tailwind 예시  |
| ------------------- | ------------------ | -------------- |
| `--color-brand-50`  | `rgb(249 245 255)` | `bg-brand-50`  |
| `--color-brand-100` | `rgb(244 235 255)` | `bg-brand-100` |
| `--color-brand-500` | `rgb(158 119 237)` | `bg-brand-500` |
| `--color-brand-600` | `rgb(127 86 217)`  | `bg-brand-600` |
| `--color-brand-700` | `rgb(105 65 198)`  | `bg-brand-700` |
| `--color-brand-950` | `rgb(44 28 95)`    | `bg-brand-950` |

> 브랜드 색상 변경: `src/app/theme.css`의 `--color-brand-*` 값만 수정하면 전체 반영.

### 3-2. 시맨틱 텍스트 색상

| CSS 변수                          | 라이트 모드 기반값 | Tailwind 클래스                | 용도                       |
| --------------------------------- | ------------------ | ------------------------------ | -------------------------- |
| `--color-text-primary`            | neutral-900        | `text-text-primary`            | 주요 텍스트                |
| `--color-text-secondary`          | neutral-700        | `text-text-secondary`          | 보조 텍스트                |
| `--color-text-tertiary`           | neutral-600        | `text-text-tertiary`           | 3차 텍스트                 |
| `--color-text-quaternary`         | neutral-500        | `text-text-quaternary`         | 4차 텍스트                 |
| `--color-text-placeholder`        | neutral-500        | `text-text-placeholder`        | 플레이스홀더               |
| `--color-text-white`              | white              | `text-text-white`              | 흰색 텍스트                |
| `--color-text-brand-primary`      | brand-900          | `text-text-brand-primary`      | 브랜드 강조                |
| `--color-text-brand-secondary`    | brand-700          | `text-text-brand-secondary`    | 브랜드 보조                |
| `--color-text-brand-tertiary`     | brand-600          | `text-text-brand-tertiary`     | 브랜드 3차                 |
| `--color-text-error-primary`      | red-600            | `text-text-error-primary`      | 에러 텍스트                |
| `--color-text-warning-primary`    | yellow-600         | `text-text-warning-primary`    | 경고 텍스트                |
| `--color-text-success-primary`    | green-600          | `text-text-success-primary`    | 성공 텍스트                |
| `--color-text-primary_on-brand`   | white              | `text-text-primary_on-brand`   | 브랜드 배경 위 텍스트      |
| `--color-text-secondary_on-brand` | brand-200          | `text-text-secondary_on-brand` | 브랜드 배경 위 보조 텍스트 |

### 3-3. 시맨틱 배경 색상

| CSS 변수                       | 라이트 모드 기반값 | Tailwind 클래스           | 용도               |
| ------------------------------ | ------------------ | ------------------------- | ------------------ |
| `--color-bg-primary`           | white              | `bg-bg-primary`           | 기본 배경          |
| `--color-bg-secondary`         | neutral-50         | `bg-bg-secondary`         | 보조 배경          |
| `--color-bg-tertiary`          | neutral-100        | `bg-bg-tertiary`          | 3차 배경           |
| `--color-bg-quaternary`        | neutral-200        | `bg-bg-quaternary`        | 4차 배경           |
| `--color-bg-primary_hover`     | neutral-50         | `bg-bg-primary_hover`     | 호버 배경          |
| `--color-bg-secondary_hover`   | neutral-100        | `bg-bg-secondary_hover`   | 보조 호버 배경     |
| `--color-bg-active`            | neutral-50         | `bg-bg-active`            | 활성 배경          |
| `--color-bg-brand-primary`     | brand-50           | `bg-bg-brand-primary`     | 브랜드 연한 배경   |
| `--color-bg-brand-secondary`   | brand-100          | `bg-bg-brand-secondary`   | 브랜드 보조 배경   |
| `--color-bg-brand-solid`       | brand-600          | `bg-bg-brand-solid`       | 브랜드 채워진 배경 |
| `--color-bg-brand-solid_hover` | brand-700          | `bg-bg-brand-solid_hover` | 브랜드 채워진 호버 |
| `--color-bg-brand-section`     | brand-800          | `bg-bg-brand-section`     | 브랜드 섹션 배경   |
| `--color-bg-error-primary`     | red-50             | `bg-bg-error-primary`     | 에러 배경          |
| `--color-bg-error-secondary`   | red-100            | `bg-bg-error-secondary`   | 에러 보조 배경     |
| `--color-bg-error-solid`       | red-600            | `bg-bg-error-solid`       | 에러 채워진 배경   |
| `--color-bg-warning-primary`   | yellow-50          | `bg-bg-warning-primary`   | 경고 배경          |
| `--color-bg-success-primary`   | green-50           | `bg-bg-success-primary`   | 성공 배경          |
| `--color-bg-overlay`           | neutral-950        | `bg-bg-overlay`           | 오버레이 배경      |
| `--color-bg-primary-solid`     | neutral-950        | `bg-bg-primary-solid`     | 진한 기본 배경     |
| `--color-bg-secondary-solid`   | neutral-600        | `bg-bg-secondary-solid`   | 진한 보조 배경     |

### 3-4. 시맨틱 테두리 색상

| CSS 변수                      | 라이트 모드 기반값 | Tailwind 클래스              | 용도               |
| ----------------------------- | ------------------ | ---------------------------- | ------------------ |
| `--color-border-primary`      | neutral-300        | `border-border-primary`      | 기본 테두리        |
| `--color-border-secondary`    | neutral-200        | `border-border-secondary`    | 보조 테두리        |
| `--color-border-tertiary`     | neutral-100        | `border-border-tertiary`     | 3차 테두리         |
| `--color-border-error`        | red-500            | `border-border-error`        | 에러 테두리        |
| `--color-border-error_subtle` | red-300            | `border-border-error_subtle` | 연한 에러 테두리   |
| `--color-border-brand`        | brand-500          | `border-border-brand`        | 브랜드 테두리      |
| `--color-border-brand_alt`    | brand-600          | `border-border-brand_alt`    | 브랜드 테두리 대안 |

### 3-5. 시맨틱 전경/아이콘 색상

| CSS 변수                     | 라이트 모드 기반값 | Tailwind 클래스           | 용도               |
| ---------------------------- | ------------------ | ------------------------- | ------------------ |
| `--color-fg-primary`         | neutral-900        | `text-fg-primary`         | 기본 아이콘        |
| `--color-fg-secondary`       | neutral-700        | `text-fg-secondary`       | 보조 아이콘        |
| `--color-fg-tertiary`        | neutral-600        | `text-fg-tertiary`        | 3차 아이콘         |
| `--color-fg-quaternary`      | neutral-400        | `text-fg-quaternary`      | 4차 아이콘         |
| `--color-fg-white`           | white              | `text-fg-white`           | 흰색 아이콘        |
| `--color-fg-brand-primary`   | brand-600          | `text-fg-brand-primary`   | 브랜드 기본 아이콘 |
| `--color-fg-brand-secondary` | brand-500          | `text-fg-brand-secondary` | 브랜드 보조 아이콘 |
| `--color-fg-error-primary`   | red-600            | `text-fg-error-primary`   | 에러 아이콘        |
| `--color-fg-warning-primary` | yellow-600         | `text-fg-warning-primary` | 경고 아이콘        |
| `--color-fg-success-primary` | green-600          | `text-fg-success-primary` | 성공 아이콘        |

### 3-6. 유틸리티 색상 (상태 배지/태그용)

12개 팔레트, 각 50-700 스케일. 다크모드에서 스케일이 반전됨 (50↔950).

사용 가능한 팔레트: `blue`, `brand`, `neutral`, `red`, `yellow`, `green`, `orange`, `indigo`, `fuchsia`, `pink`, `purple`, `sky`, `slate`, `emerald`, `amber`

```tsx
// 예: 상태 배지
<span className="bg-utility-green-50 text-utility-green-700">성공</span>
<span className="bg-utility-red-50 text-utility-red-700">에러</span>
<span className="bg-utility-yellow-50 text-utility-yellow-700">경고</span>
<span className="bg-utility-blue-50 text-utility-blue-700">정보</span>
```

### 3-7. 색상 사용 원칙

```tsx
// ✅ 시맨틱 토큰 사용 (다크모드 자동 대응)
<div className="bg-bg-primary border border-border-primary">
  <h1 className="text-text-primary">제목</h1>
  <p className="text-text-tertiary">설명</p>
</div>

// ❌ 절대 금지: raw Tailwind 색상 (다크모드 미대응)
<div className="bg-white border-gray-200">
  <h1 className="text-gray-900">제목</h1>
</div>
```

---

## 4. 컴포넌트 매핑

> **신규 코드 작성 시**: `src/components/base/`, `src/components/application/` 등 UntitledUI 컴포넌트 우선 사용.
> `src/components/ui/`는 기존 login/signup/sections 페이지 레거시용입니다.

### 4-0. UntitledUI 핵심 컴포넌트 (`src/components/base/`)

| Figma 컴포넌트 | Import 경로 | 주요 Props |
|---|---|---|
| Button | `@/components/base/buttons/button` | `color: primary\|secondary\|tertiary\|link-gray\|link-color\|...-destructive`, `size: xs\|sm\|md\|lg\|xl`, `iconLeading`, `iconTrailing`, `isLoading`, `href` |
| Badge | `@/components/base/badges/badges` | `Badge`, `BadgeWithDot`, `BadgeWithIcon`. `color: gray\|brand\|error\|warning\|success\|...`, `type: pill-color\|color\|modern` |
| Avatar | `@/components/base/avatar/avatar` | `size: xs\|sm\|md\|lg\|xl\|2xl`, `src`, `initials`, `status: online\|offline`, `verified` |
| AvatarLabelGroup | `@/components/base/avatar/avatar-label-group` | `title`, `subtitle`, `size` |
| Input | `@/components/base/input/input` | `label`, `hint`, `icon`, `isRequired`, `isInvalid`, `isDisabled`, `size: sm\|md\|lg` |
| InputGroup | `@/components/base/input/input-group` | Input with addons |
| Checkbox | `@/components/base/checkbox/checkbox` | `label`, `hint`, `isIndeterminate`, `size: sm\|md` |
| RadioButtons | `@/components/base/radio-buttons/radio-buttons` | React Aria RadioGroup 기반 |
| Select | `@/components/base/select/select` | `Select.Item`, `Select.ComboBox` (검색 가능). `label`, `items`, `icon` |
| MultiSelect | `@/components/base/select/multi-select` | 다중 선택 드롭다운 |
| Textarea | `@/components/base/textarea/textarea` | `label`, `hint`, `isRequired`, `isInvalid` |
| Toggle | `@/components/base/toggle/toggle` | React Aria Switch 기반 |
| Slider | `@/components/base/slider/slider` | React Aria Slider 기반 |
| Tooltip | `@/components/base/tooltip/tooltip` | `TooltipTrigger`, `Tooltip` |
| Tags | `@/components/base/tags/tags` | 태그/칩 컴포넌트 |
| Dropdown | `@/components/base/dropdown/dropdown` | React Aria Menu 기반 |
| PinInput | `@/components/base/input/pin-input` | OTP/PIN 코드 입력 (`input-otp` 기반) |
| FeaturedIcon | `@/components/foundations/featured-icon/featured-icon` | `icon`, `color: brand\|gray\|error\|warning\|success`, `theme: light\|gradient\|dark\|modern\|modern-neue\|outline`, `size: sm\|md\|lg\|xl` |

### 4-1. UntitledUI 애플리케이션 컴포넌트 (`src/components/application/`)

| Figma 컴포넌트 | Import 경로 | 설명 |
|---|---|---|
| DatePicker | `@/components/application/date-picker/date-picker` | 단일 날짜 선택 |
| DateRangePicker | `@/components/application/date-picker/date-range-picker` | 날짜 범위 선택 |
| Modal | `@/components/application/modals/modal` | React Aria Modal 기반 |
| Pagination | `@/components/application/pagination/pagination` | 번호 페이지네이션 |
| Table | `@/components/application/table/table` | 데이터 테이블 |
| Tabs | `@/components/application/tabs/tabs` | 탭 네비게이션 |
| Charts | `@/components/application/charts/charts-base` | Recharts 기반 차트 |
| FileUpload | `@/components/application/file-upload/file-upload-base` | 드래그앤드롭 파일 업로드 |
| EmptyState | `@/components/application/empty-state/empty-state` | 빈 상태 플레이스홀더 |
| SlideoutMenu | `@/components/application/slideout-menus/slideout-menu` | 슬라이드 패널/드로어 |
| SidebarNavigation | `@/components/application/app-navigation/sidebar-navigation/` | 5가지 사이드바 변형 |
| HeaderNavigation | `@/components/application/app-navigation/header-navigation` | 앱 헤더 네비게이션 |

### 4-2. 레거시 shadcn/ui 컴포넌트 (`src/components/ui/`) — 기존 페이지 전용

| Figma 컴포넌트 | Import 경로 | 주요 Props |
|---|---|---|
| Button | `@/components/ui/button` | `variant: default\|destructive\|outline\|secondary\|ghost\|link`, `size: default\|sm\|lg\|icon` |
| Badge | `@/components/ui/badge` | `variant: default\|secondary\|destructive\|outline` |
| Card | `@/components/ui/card` | Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter |
| Input | `@/components/ui/input` | `React.ComponentProps<'input'>` |
| Select | `@/components/ui/select` | Select, SelectTrigger, SelectValue, SelectContent, SelectItem |
| Dialog | `@/components/ui/dialog` | Dialog, DialogTrigger, DialogContent |
| Sheet | `@/components/ui/sheet` | 슬라이드 패널, `side: top\|right\|bottom\|left` |
| DropdownMenu | `@/components/ui/dropdown-menu` | Radix DropdownMenu |
| Form | `@/components/ui/form` | React Hook Form 통합 |
| Sonner (Toast) | `@/components/ui/sonner` | sonner 라이브러리 기반 |

### 4-3. 레이아웃 컴포넌트

| Figma 컴포넌트 | Import 경로                       | 주요 Props                                                                                                           |
| -------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Button         | `@/components/ui/button`          | `variant: default\|destructive\|outline\|secondary\|ghost\|link`, `size: default\|sm\|lg\|icon`, `asChild?: boolean` |
| Badge          | `@/components/ui/badge`           | `variant: default\|secondary\|destructive\|outline`                                                                  |
| Card           | `@/components/ui/card`            | 복합 컴포넌트: Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, CardAction                     |
| Input          | `@/components/ui/input`           | `React.ComponentProps<'input'>` 전체 지원                                                                            |
| Label          | `@/components/ui/label`           | Radix Label 기반                                                                                                     |
| Checkbox       | `@/components/ui/checkbox`        | Radix Checkbox 기반                                                                                                  |
| Select         | `@/components/ui/select`          | 복합: Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroup, SelectLabel                        |
| Dialog         | `@/components/ui/dialog`          | 복합: Dialog, DialogTrigger, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription               |
| Sheet          | `@/components/ui/sheet`           | 슬라이드 패널, `side: top\|right\|bottom\|left`                                                                      |
| DropdownMenu   | `@/components/ui/dropdown-menu`   | 복합: DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator 등             |
| NavigationMenu | `@/components/ui/navigation-menu` | Radix NavigationMenu 기반                                                                                            |
| Avatar         | `@/components/ui/avatar`          | 복합: Avatar, AvatarImage, AvatarFallback                                                                            |
| Alert          | `@/components/ui/alert`           | 복합: Alert, AlertTitle, AlertDescription. `variant: default\|destructive`                                           |
| Progress       | `@/components/ui/progress`        | `value?: number`                                                                                                     |
| Separator      | `@/components/ui/separator`       | `orientation: horizontal\|vertical`                                                                                  |
| Skeleton       | `@/components/ui/skeleton`        | 로딩 플레이스홀더                                                                                                    |
| Form           | `@/components/ui/form`            | React Hook Form 통합: Form, FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage                |
| Sonner (Toast) | `@/components/ui/sonner`          | `sonner` 라이브러리 기반                                                                                             |

### 4-2. 레이아웃 컴포넌트

| Figma 패턴 | Import 경로                          | 주요 Props                               |
| ---------- | ------------------------------------ | ---------------------------------------- |
| Container  | `@/components/layout/container`      | `size: sm\|md\|lg\|xl\|full`             |
| Header     | `@/components/layout/header`         | 사이트 헤더 (데스크톱 + 모바일 nav 통합) |
| Footer     | `@/components/layout/footer`         | 사이트 푸터                              |
| MainNav    | `@/components/navigation/main-nav`   | 데스크톱 네비게이션                      |
| MobileNav  | `@/components/navigation/mobile-nav` | 모바일 Sheet 기반 네비게이션             |

### 4-3. 섹션 컴포넌트

| Figma 섹션       | Import 경로                      |
| ---------------- | -------------------------------- |
| Hero Section     | `@/components/sections/hero`     |
| Features Section | `@/components/sections/features` |
| CTA Section      | `@/components/sections/cta`      |

### 4-4. 컴포넌트 패턴 예시

```tsx
// ✅ 기본 컴포넌트 사용
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export function ExampleCard({ className }: { className?: string }) {
  return (
    <Card className={cn('shadow-md', className)}>
      <CardHeader>
        <CardTitle className="text-display-xs text-text-primary">
          제목
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-md text-text-secondary">내용</p>
        <Button variant="default" size="sm" className="mt-4">
          확인
        </Button>
      </CardContent>
    </Card>
  )
}

// ✅ CVA 기반 커스텀 컴포넌트 작성 패턴
import { cva, type VariantProps } from 'class-variance-authority'

const myVariants = cva('base-class', {
  variants: {
    variant: {
      primary: 'bg-bg-brand-solid text-white',
      secondary: 'bg-bg-secondary',
    },
    size: { sm: 'p-2 text-sm', md: 'p-4 text-md' },
  },
  defaultVariants: { variant: 'primary', size: 'md' },
})

function MyComponent({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof myVariants>) {
  return (
    <div
      data-slot="my-component"
      className={cn(myVariants({ variant, size, className }))}
      {...props}
    />
  )
}
```

---

## 5. 아이콘 시스템

### 기본 아이콘 (`@untitledui/icons`) — 신규 코드 표준

```tsx
// 1,100개+ 라인 스타일 아이콘 (tree-shaking 최적화)
import { Home01, Settings01, ChevronDown, Mail01 } from '@untitledui/icons'

// UntitledUI 컴포넌트 prop으로 전달 (권장)
<Button iconLeading={ChevronDown}>옵션</Button>

// JSX로 전달 시 data-icon 속성 필수
<Button iconLeading={<ChevronDown data-icon className="size-4" />}>옵션</Button>

// 단독 사용
<Home01 className="size-5 text-fg-secondary" aria-hidden="true" />
<Mail01 className="size-4 text-fg-tertiary" strokeWidth={2} />
```

### 파일 아이콘 (`@untitledui/file-icons`)

```tsx
import { PdfIcon } from '@untitledui/file-icons'
<PdfIcon className="size-8" />
```

### 보조 아이콘 (`lucide-react`)

```tsx
import { EyeIcon, EyeOffIcon, CheckIcon } from 'lucide-react'
<EyeIcon className="size-4 text-fg-tertiary" />
```

### 아이콘 크기 기준

| 크기 클래스 | 픽셀 | 용도 |
|---|---|---|
| `size-3` | 12px | 배지 내부 |
| `size-3.5` | 14px | 작은 버튼 |
| `size-4` | 16px | 기본 버튼/인풋 |
| `size-5` | 20px | 네비게이션 |
| `size-6` | 24px | 독립 아이콘 |

---

## 6. 간격, 반경, 그림자

### 6-1. 브레이크포인트

| 이름  | 값     | 용도               |
| ----- | ------ | ------------------ |
| `xxs` | 320px  | 극소형 모바일      |
| `xs`  | 600px  | Sonner 토스트 기준 |
| `sm`  | 640px  | Tailwind 기본      |
| `md`  | 768px  | Tailwind 기본      |
| `lg`  | 1024px | Tailwind 기본      |
| `xl`  | 1280px | Tailwind 기본      |
| `2xl` | 1536px | Tailwind 기본      |

### 6-2. 반경 (Border Radius)

| CSS 변수           | 값       | Tailwind 클래스 |
| ------------------ | -------- | --------------- |
| `--radius-none`    | 0px      | `rounded-none`  |
| `--radius-xs`      | 0.125rem | `rounded-xs`    |
| `--radius-sm`      | 0.25rem  | `rounded-sm`    |
| `--radius-DEFAULT` | 0.25rem  | `rounded`       |
| `--radius-md`      | 0.375rem | `rounded-md`    |
| `--radius-lg`      | 0.5rem   | `rounded-lg`    |
| `--radius-xl`      | 0.75rem  | `rounded-xl`    |
| `--radius-2xl`     | 1rem     | `rounded-2xl`   |
| `--radius-3xl`     | 1.5rem   | `rounded-3xl`   |
| `--radius-full`    | 9999px   | `rounded-full`  |

### 6-3. 그림자

| CSS 변수                   | Tailwind 클래스          | 용도                 |
| -------------------------- | ------------------------ | -------------------- |
| `--shadow-xs`              | `shadow-xs`              | 미세한 그림자        |
| `--shadow-sm`              | `shadow-sm`              | 작은 그림자          |
| `--shadow-md`              | `shadow-md`              | 중간 그림자          |
| `--shadow-lg`              | `shadow-lg`              | 큰 그림자            |
| `--shadow-xl`              | `shadow-xl`              | 매우 큰 그림자       |
| `--shadow-2xl`             | `shadow-2xl`             | 최대 그림자          |
| `--shadow-3xl`             | `shadow-3xl`             | 초대형 그림자        |
| `--shadow-skeuomorphic`    | `shadow-skeuomorphic`    | 스큐어모픽 효과      |
| `--shadow-xs-skeuomorphic` | `shadow-xs-skeuomorphic` | 스큐어모픽 + xs 조합 |

### 6-4. 컨테이너 크기

`@/components/layout/container`의 `size` prop:

| Size   | Max Width         | 용도             |
| ------ | ----------------- | ---------------- |
| `sm`   | max-w-3xl (48rem) | 좁은 콘텐츠      |
| `md`   | max-w-5xl (64rem) | 중간 콘텐츠      |
| `lg`   | max-w-7xl (80rem) | 넓은 콘텐츠      |
| `xl`   | max-w-[1400px]    | 매우 넓은 콘텐츠 |
| `full` | max-w-full        | 전체 너비        |

공통 패딩: `px-4 sm:px-6 lg:px-8`

---

## 7. 다크모드 규칙

### 구현 방식

```tsx
// src/components/providers/theme-provider.tsx
// next-themes → .light-mode / .dark-mode 클래스를 <html>에 주입
<NextThemeProvider attribute="class" value={{ light: 'light-mode', dark: 'dark-mode' }}>
```

```css
/* src/app/globals.css */
/* .dark-mode 클래스 기반 dark variant 정의 */
@custom-variant dark (&:where(.dark-mode, .dark-mode *));
```

### 다크모드 토큰 전환 원리

`src/app/theme.css`의 `@layer base { .dark-mode { ... } }` 블록이 모든 시맨틱 토큰을 자동 재정의.
유틸리티 색상 스케일은 완전히 반전 (50↔950, 100↔900, 200↔800 등).

### 다크모드 규칙

```tsx
// ✅ 시맨틱 토큰 → 자동으로 라이트/다크 전환
<div className="bg-bg-primary text-text-primary border border-border-primary">

// ❌ 절대 금지: dark: 프리픽스 수동 사용
<div className="bg-white dark:bg-gray-900 text-black dark:text-white">

// ❌ 절대 금지: raw 색상 하드코딩
<div className="bg-gray-50 text-gray-900">
```

---

## 8. 코드 생성 규칙

### 필수 규칙

1. **시맨틱 토큰 필수**: `text-text-primary`, `bg-bg-primary` 등 시맨틱 변수 사용. raw 색상(`text-gray-900`, `bg-white`) 절대 금지.

2. **컴포넌트 재사용**: `src/components/base/*` (UntitledUI) 컴포넌트를 우선 사용. 레거시 `src/components/ui/*`(shadcn)는 기존 페이지에만 유지.

3. **cx() 사용**: UntitledUI 컴포넌트는 `@/utils/cx`에서 import. 레거시/shadcn 코드는 `@/lib/utils`에서 import.

   ```tsx
   import { cn } from '@/lib/utils'
   className={cn('base-class', condition && 'conditional-class', className)}
   ```

4. **Server Components 우선**: React hook, 브라우저 API 사용 시에만 `'use client'` 추가.

5. **모바일 우선 반응형**: 기본 스타일은 모바일 기준, `sm:`, `md:`, `lg:` 순으로 확장.

   ```tsx
   <div className="flex flex-col p-4 md:flex-row md:p-6 lg:p-8">
   ```

6. **파일 명명**: 파일명 kebab-case (`my-component.tsx`), 컴포넌트명 PascalCase (`MyComponent`), named export.

7. **data-slot 속성**: 모든 컴포넌트 루트 요소에 `data-slot="component-name"` 추가.

8. **한국어**: 사용자 표시 텍스트와 코드 주석 모두 한국어.

9. **Props 타이핑**: UI 기본 컴포넌트는 `React.ComponentProps<'element'>` 확장. CVA 변형은 `VariantProps<typeof variants>`.

10. **className 전달**: 모든 컴포넌트는 `className` prop을 받아 `cn()`으로 병합.

### 아이콘 사용

```tsx
// 현재 표준: lucide-react
import { CheckCircle, AlertCircle, Info } from 'lucide-react'
;<CheckCircle className="text-fg-success-primary size-4" />

// 미래 표준: @untitledui/icons (신규 작성 시 우선 고려)
import { CheckCircle, AlertCircle } from '@untitledui/icons'
```

### 폼 패턴 (React Hook Form + Zod)

```tsx
'use client'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

const schema = z.object({
  email: z.string().email('유효한 이메일을 입력하세요'),
})

export function ExampleForm() {
  const form = useForm({ resolver: zodResolver(schema) })
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(data => console.log(data))}>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>이메일</FormLabel>
              <FormControl>
                <Input placeholder="이메일 입력" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">제출</Button>
      </form>
    </Form>
  )
}
```

### 애니메이션

```tsx
// tailwindcss-animate 플러그인 사용
<div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
// 커스텀 애니메이션: marquee, caret-blink (theme.css에 정의)
<div className="animate-marquee">
<input className="animate-caret-blink">
```

---

## 9. 관련 파일 참조

| 파일                                   | 내용                                                         |
| -------------------------------------- | ------------------------------------------------------------ |
| `src/app/theme.css`                    | 전체 디자인 토큰 정의 (colors, typography, spacing, shadows) |
| `src/app/globals.css`                  | TailwindCSS v4 진입점, 다크모드 variant, 커스텀 유틸리티     |
| `src/lib/utils.ts`                     | cn/cx 함수 (display-\* 텍스트 클래스 확장 포함)              |
| `src/components/ui/button.tsx`         | 컴포넌트 패턴 표준 예시 (CVA + Radix + data-slot)            |
| `components.json`                      | 컴포넌트 경로 alias, iconLibrary 설정                        |
| `docs/guides/styling-guide.md`         | 상세 스타일링 가이드 (한국어)                                |
| `docs/guides/component-patterns.md`    | 컴포넌트 설계 패턴 (한국어)                                  |
| `docs/guides/forms-react-hook-form.md` | 폼 처리 가이드 (한국어)                                      |
