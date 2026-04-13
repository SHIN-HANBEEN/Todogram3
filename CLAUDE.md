# 🤖 Claude Code 개발 지침

## gstack

- For all web browsing, use the `/browse` skill from gstack. Never use `mcp__claude-in-chrome__*` tools.
- Available skills: `/office-hours`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`, `/design-consultation`, `/design-shotgun`, `/design-html`, `/review`, `/ship`, `/land-and-deploy`, `/canary`, `/benchmark`, `/browse`, `/connect-chrome`, `/qa`, `/qa-only`, `/design-review`, `/setup-browser-cookies`, `/setup-deploy`, `/retro`, `/investigate`, `/document-release`, `/codex`, `/cso`, `/autoplan`, `/plan-devex-review`, `/devex-review`, `/careful`, `/freeze`, `/guard`, `/unfreeze`, `/gstack-upgrade`, `/learn`
- If gstack skills aren't working, run `cd .claude/skills/gstack && ./setup` to build the binary and register skills.

**claude-nextjs-starters**는 Next.js 15.5.3 + React 19 기반 모던 웹 애플리케이션 스타터 템플릿입니다.
UntitledUI 공식 컴포넌트 라이브러리 + shadcn/ui 듀얼 컴포넌트 시스템을 포함합니다.

## 🛠️ 핵심 기술 스택

- **Framework**: Next.js 15.5.3 (App Router + Turbopack)
- **Runtime**: React 19.1.0 + TypeScript 5
- **Styling**: TailwindCSS v4 (CSS-first `@theme {}` 방식) + UntitledUI 디자인 시스템
- **Component Foundation**: React Aria Components (UntitledUI) + Radix UI (shadcn/ui 레거시)
- **Forms**: React Hook Form + Zod + Server Actions
- **Icons**: `@untitledui/icons` (기본), `lucide-react` (보조)
- **Animation**: `motion` (Framer Motion), `tailwindcss-animate`
- **Charts**: Recharts
- **Development**: ESLint + Prettier + Husky + lint-staged

## 📁 컴포넌트 구조

```
src/components/
├── base/              # UntitledUI 핵심 UI 컴포넌트 (React Aria 기반)
│   ├── avatar/        # Avatar, AvatarLabelGroup
│   ├── badges/        # Badge, BadgeWithDot, BadgeWithIcon
│   ├── buttons/       # Button (10가지 color 변형), ButtonUtility, CloseButton
│   ├── button-group/  # ButtonGroup
│   ├── checkbox/      # Checkbox
│   ├── dropdown/      # Dropdown (8가지 변형)
│   ├── input/         # Input, InputGroup, InputDate, InputNumber, PinInput 등
│   ├── progress-indicators/ # ProgressIndicators, ProgressCircles
│   ├── radio-buttons/ # RadioButtons
│   ├── select/        # Select, ComboBox, MultiSelect
│   ├── slider/        # Slider
│   ├── tags/          # Tags
│   ├── textarea/      # Textarea
│   ├── toggle/        # Toggle
│   └── tooltip/       # Tooltip
├── application/       # 복잡한 애플리케이션 컴포넌트
│   ├── app-navigation/ # Header/Sidebar Navigation (5가지 변형)
│   ├── carousel/      # Carousel
│   ├── charts/        # Charts (Recharts 기반)
│   ├── date-picker/   # DatePicker, DateRangePicker
│   ├── empty-state/   # EmptyState
│   ├── file-upload/   # FileUpload (드래그앤드롭)
│   ├── loading-indicator/ # LoadingIndicator
│   ├── modals/        # Modal
│   ├── pagination/    # Pagination (4가지 변형)
│   ├── slideout-menus/ # SlideoutMenu
│   ├── table/         # Table
│   └── tabs/          # Tabs
├── foundations/       # 디자인 파운데이션
│   ├── featured-icon/ # FeaturedIcon (6가지 테마)
│   ├── integration-icons/ # 17개 브랜드 아이콘
│   ├── logo/          # UntitledUI 로고
│   ├── payment-icons/ # 50개+ 결제 아이콘
│   └── social-icons/  # 20개+ 소셜 플랫폼 아이콘
├── marketing/         # 마케팅 컴포넌트
│   └── header-navigation/ # 마케팅 헤더 (메가메뉴 포함)
├── shared-assets/     # 공유 에셋
│   ├── background-patterns/ # 배경 패턴 (4가지)
│   ├── credit-card/   # 신용카드 비주얼
│   ├── illustrations/ # 일러스트레이션
│   ├── iphone-mockup/ # iPhone 목업
│   ├── qr-code/       # QR 코드 생성
│   └── section-divider/ # 섹션 구분선
├── ui/                # shadcn/ui 레거시 컴포넌트 (Radix UI 기반)
│   └── *.tsx          # 18개 shadcn 컴포넌트 (기존 페이지와 호환)
├── layout/            # 레이아웃 컴포넌트
├── navigation/        # 네비게이션 컴포넌트
├── providers/         # ThemeProvider, RouteProvider
└── sections/          # 페이지 섹션 컴포넌트
```

## 🔧 핵심 아키텍처 원칙

### React Aria Components import 규칙 (UntitledUI 컴포넌트 작성 시)

**CRITICAL**: `react-aria-components`에서 import 시 반드시 `Aria*` 프리픽스를 사용합니다.

```typescript
// ✅ 올바름
import { Button as AriaButton, TextField as AriaTextField } from 'react-aria-components'

// ❌ 잘못됨
import { Button, TextField } from 'react-aria-components'
```

### 듀얼 컴포넌트 시스템

- **신규 컴포넌트**: `src/components/base/`, `src/components/application/` 등 UntitledUI 컴포넌트 우선 사용
- **기존 페이지 레거시**: `src/components/ui/` shadcn 컴포넌트 (login, signup, header 등이 사용 중)
- 두 시스템은 경로가 다르므로 충돌 없음. 점진적으로 UntitledUI로 마이그레이션 예정.

### 유틸리티 함수

```typescript
// UntitledUI 컴포넌트는 @/utils/cx 에서 import (브릿지 파일)
import { cx, sortCx } from '@/utils/cx'

// 기존 코드/shadcn 컴포넌트는 @/lib/utils 에서 import
import { cn, cx } from '@/lib/utils'
```

### sortCx 스타일 조직 패턴

```typescript
export const styles = sortCx({
  common: {
    root: 'base-classes-here',
    icon: 'icon-classes-here',
  },
  sizes: {
    sm: { root: 'small-size-classes' },
    md: { root: 'medium-size-classes' },
  },
  colors: {
    primary: { root: 'primary-color-classes' },
    secondary: { root: 'secondary-color-classes' },
  },
})
```

## 🎨 스타일링 규칙

### 색상 클래스 - 반드시 시맨틱 토큰 사용

```typescript
// ✅ 올바름 - 시맨틱 토큰 (다크모드 자동 대응)
<div className="bg-bg-primary text-text-primary border border-border-primary">

// ❌ 절대 금지 - raw Tailwind 색상
<div className="bg-white text-gray-900 border-gray-200">
```

### CSS 기본 트랜지션

```typescript
// 기본 hover 상태, 색상 변경 등의 트랜지션
className = 'transition duration-100 ease-linear'
```

### Disabled 상태

```typescript
// ✅ 올바름 (v8 패턴)
'disabled:cursor-not-allowed disabled:opacity-50'

// ❌ 잘못됨 (v7 패턴, 사용 금지)
'disabled:bg-disabled_subtle disabled:text-disabled'
```

## 🔵 UntitledUI 컴포넌트 사용법

### Button

```typescript
import { Button } from '@/components/base/buttons/button'

// color: primary | secondary | tertiary | link-gray | link-color | primary-destructive | ...
// size: xs | sm | md | lg | xl
<Button size="md" color="primary">저장</Button>
<Button iconLeading={Check} color="primary">저장</Button>
<Button isLoading showTextWhileLoading>처리 중...</Button>
<Button href="/dashboard" color="link-color">대시보드로</Button>
```

### Input

```typescript
import { Input } from '@/components/base/input/input'

<Input label="이메일" placeholder="user@example.com" />
<Input icon={Mail01} label="이메일" isRequired isInvalid hint="유효한 이메일을 입력하세요" />
```

### Select

```typescript
import { Select } from '@/components/base/select/select'

<Select label="팀원" placeholder="선택" items={users}>
  {item => <Select.Item id={item.id} supportingText={item.email}>{item.name}</Select.Item>}
</Select>

// 검색 가능한 Select
<Select.ComboBox label="검색" placeholder="검색어 입력" items={users}>
  {item => <Select.Item id={item.id}>{item.name}</Select.Item>}
</Select.ComboBox>
```

### FeaturedIcon

```typescript
import { FeaturedIcon } from '@/components/foundations/featured-icon/featured-icon'

// theme: light | gradient | dark | modern | modern-neue | outline
// color: brand | gray | error | warning | success
<FeaturedIcon icon={CheckCircle} color="success" theme="light" size="lg" />

// ⚠️ modern/modern-neue 테마는 gray 색상만 지원
<FeaturedIcon icon={Settings} color="gray" theme="modern" size="lg" />
```

### Badge

```typescript
import { Badge, BadgeWithDot, BadgeWithIcon } from '@/components/base/badges/badges'

<Badge color="brand" size="md">신규</Badge>
<BadgeWithDot color="success" type="pill-color">활성</BadgeWithDot>
<BadgeWithIcon iconLeading={ArrowUp} color="success">12%</BadgeWithIcon>
```

### Avatar

```typescript
import { Avatar, AvatarLabelGroup } from '@/components/base/avatar/avatar'
import { AvatarLabelGroup } from '@/components/base/avatar/avatar-label-group'

// size: xs | sm | md | lg | xl | 2xl
<Avatar src="/avatar.jpg" alt="사용자" size="md" status="online" />
<AvatarLabelGroup src="/avatar.jpg" title="홍길동" subtitle="hong@example.com" size="md" />
```

## 🔷 아이콘 시스템

```typescript
// 기본 아이콘: @untitledui/icons (tree-shaking 지원)
import { Home01, Settings01, ChevronDown } from '@untitledui/icons'

// 컴포넌트 prop으로 전달 (권장)
<Button iconLeading={ChevronDown}>옵션</Button>

// JSX로 전달 시 data-icon 필수
<Button iconLeading={<ChevronDown data-icon className="size-4" />}>옵션</Button>

// 단독 사용
<Home01 className="size-5 text-fg-secondary" aria-hidden="true" />

// 보조 아이콘: lucide-react
import { EyeIcon } from 'lucide-react'
<EyeIcon className="size-4 text-fg-tertiary" />
```

## 📦 컴포넌트 패턴 (UntitledUI 스타일)

```typescript
'use client'
import { cx, sortCx } from '@/utils/cx'
import { Button as AriaButton } from 'react-aria-components'
import type { ButtonProps as AriaButtonProps } from 'react-aria-components'

const styles = sortCx({
  common: {
    root: 'flex items-center justify-center transition duration-100 ease-linear',
  },
  sizes: {
    sm: { root: 'h-9 px-3.5 gap-1.5 text-sm' },
    md: { root: 'h-10 px-4 gap-2 text-md' },
  },
})

interface MyButtonProps extends AriaButtonProps {
  size?: 'sm' | 'md'
}

export const MyButton = ({ size = 'md', className, ...props }: MyButtonProps) => {
  return (
    <AriaButton
      {...props}
      className={cx(styles.common.root, styles.sizes[size].root, className as string)}
    />
  )
}
```

## 📚 개발 가이드

- **🗺️ 개발 로드맵**: `docs/ROADMAP.md`
- **📋 프로젝트 요구사항**: `docs/PRD.md`
- **📁 프로젝트 구조**: `docs/guides/project-structure.md`
- **🎨 스타일링 가이드**: `docs/guides/styling-guide.md`
- **🧩 컴포넌트 패턴**: `docs/guides/component-patterns.md`
- **⚡ Next.js 15.5.3 전문 가이드**: `docs/guides/nextjs-15.md`
- **📝 폼 처리 완전 가이드**: `docs/guides/forms-react-hook-form.md`

## ⚡ 자주 사용하는 명령어

```bash
# 개발
npm run dev         # 개발 서버 실행 (Turbopack)
npm run build       # 프로덕션 빌드
npm run check-all   # 모든 검사 통합 실행 (권장)

# 타입/린트/포맷 개별 실행
npm run typecheck   # TypeScript 타입 체크
npm run lint        # ESLint
npm run format      # Prettier 포맷팅
```

## ✅ 작업 완료 체크리스트

```bash
npm run check-all   # 모든 검사 통과 확인
npm run build       # 빌드 성공 확인
```

## 🎨 색상 토큰 빠른 참조

### Text 색상
| 클래스 | 용도 |
|--------|------|
| `text-text-primary` | 주요 텍스트 (제목 등) |
| `text-text-secondary` | 보조 텍스트 |
| `text-text-tertiary` | 설명 텍스트, 단락 |
| `text-text-quaternary` | 미묘한 텍스트 |
| `text-text-placeholder` | 입력 필드 플레이스홀더 |
| `text-text-brand-primary` | 브랜드 강조 텍스트 |
| `text-text-error-primary` | 에러 텍스트 |

### Background 색상
| 클래스 | 용도 |
|--------|------|
| `bg-bg-primary` | 기본 배경 (흰색) |
| `bg-bg-secondary` | 보조 배경 (gray-50) |
| `bg-bg-tertiary` | 3차 배경 |
| `bg-bg-brand-solid` | 브랜드 배경 (버튼 등) |
| `bg-bg-brand-section` | 브랜드 섹션 배경 |
| `bg-bg-error-primary` | 에러 배경 |

### Border 색상
| 클래스 | 용도 |
|--------|------|
| `border-border-primary` | 기본 테두리 |
| `border-border-secondary` | 보조 테두리 (가장 많이 사용) |
| `border-border-brand` | 브랜드 테두리 (포커스 등) |
| `border-border-error` | 에러 테두리 |

### Foreground (아이콘) 색상
| 클래스 | 용도 |
|--------|------|
| `text-fg-primary` | 주요 아이콘 |
| `text-fg-secondary` | 보조 아이콘 |
| `text-fg-tertiary` | 3차 아이콘 |
| `text-fg-quaternary` | 버튼 아이콘 등 |
| `text-fg-brand-primary` | 브랜드 아이콘 |

💡 **상세 규칙은 위 개발 가이드 문서들을 참조하세요**
