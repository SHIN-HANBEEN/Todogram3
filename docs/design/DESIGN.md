# Design System — Todogram v3 (*Quiet Layer*)

> 이 문서는 Todogram v3의 디자인 시스템 single source of truth 입니다.
> UI/시각 관련 결정을 하기 전에 반드시 이 문서를 먼저 읽습니다. 색상, 타이포그래피, 간격, 모서리, 모션 — 모두 여기에서 정의됩니다.
> 예외 없음. 이 문서에 없는 결정은 임의로 내리지 말고 합의 후 추가합니다.

- **버전:** 1.0
- **생성일:** 2026-04-16
- **방식:** `/design-consultation` (Quiet Layer 방향 승인)
- **프리뷰 아카이브:** `C:/Users/user/.gstack/projects/SHIN-HANBEEN-Todogram3/designs/design-system-20260416/preview.html`

---

## 1. 제품 컨텍스트

- **무엇:** 기존 Google Calendar / Apple Calendar "위에 얹는" 얇은 할일 레이어. 캘린더를 대체하지 않고, 덜 멍청하게 만듭니다.
- **누구:** v1 본인(Android + Google Cal), v2 와이프(iPhone + Apple Cal), v3+ 크로스 에코시스템 부부
- **카테고리:** Calendar-layer productivity (경쟁자: Sunsama, Motion, Notion Calendar, Fantastical, Amie, Reclaim.ai)
- **프로젝트 타입:** Mobile-first PWA, 한국어 + 영어, 다크모드 필수
- **핵심 UX 순간:** 아침 눈뜨자마자 모바일에서 오늘 할 일 확인. 직장/가정 라벨로 역할 전환. 어제 못 끝낸 일의 auto-rollover 확인.

---

## 2. 디자인 방향 (Quiet Layer)

- **Direction:** Quiet Layer — 침착하고 따뜻한 일상 루틴 도구
- **Decoration level:** *intentional* (Sunsama 온기 + Things 3 절제 사이)
- **Mood:** 새벽에 켜는 작은 램프. 조용하고 따뜻하고 믿음직함. 생산성 전쟁의 공격적 도구가 아님.
- **명시적 배척:** Motion / Reclaim.ai 류 "AI 생산성 전쟁" 미학. Violet/purple 그라디언트. "Built for X" 식 자랑 카피.

### 핵심 시각 은유 — 레이어드 위계

제품의 문자적 은유가 시각적으로 표현되어야 합니다.

| 요소 | 시각 처리 | 의미 |
|---|---|---|
| **Todogram task** (내 것) | 순백 배경, 좌측 3px sage 실선 보더, 1px 보더 전체, soft shadow | "위에 앉아있다 — 내가 만들고 내가 처리한다" |
| **External Cal event** (외부) | 오프화이트 배경, 1px dashed 보더, no shadow, opacity 0.85 | "유리 뒤에 있다 — 읽기만 한다, 건드리지 않는다" |

이 구분은 사용자가 2초 안에 "아 이건 내 거, 이건 원래 있던 거"를 이해하게 만듭니다. **이 위계는 시스템 전체의 중심 결정이며, 다른 모든 선택이 이를 보조합니다.**

### 참고 제품

- **Things 3** (`culturedcode.com/things`) — 절제와 여백의 참조
- **Sunsama** (`sunsama.com`) — 따뜻한 웜톤 배경의 참조
- **Amie** (`amie.so`) — 레이아웃 디시플린의 참조
- **배척:** Motion / Reclaim.ai 의 공격적 생산성 미학

---

## 3. Typography

### 폰트 구성

| Role | Font | Source | Rationale |
|---|---|---|---|
| **Body / UI (Primary)** | **Pretendard Variable** | `cdn.jsdelivr.net/gh/orioncactus/pretendard` | 한국인 타입 디자이너가 설계. 한글+라틴 혼용 시 자간/크기 균형이 Inter와 비교 불가. Korean UX의 필수 선택. |
| **Display / Moments** | **Instrument Serif** | Google Fonts | 빈 상태·온보딩·영감 순간 전용. 경쟁사 어디도 안 하는 "따뜻한 인간미". italic variant의 우아함 활용. |
| **Data / Time** | **JetBrains Mono** | Google Fonts | 시간(`09:30`), 카운터(`3/7`), 날짜(`2026-04-16`). `tabular-nums` 필수. |

### 로딩

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500;600&display=swap">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.css">
```

`next/font` 로 옮길 때도 동일 3종. Pretendard은 self-host 권장(bundle size/CLS 최소화).

### 스케일

모바일 기준. 데스크탑도 동일 스케일 유지(크기 안 바뀜 — 그대로 커짐).

| Token | Size | Line-height | Letter-spacing | Font | Use |
|---|---|---|---|---|---|
| `text-xs` | 12px | 1.5 | 0 | Pretendard | 마이크로 라벨, 힌트 |
| `text-sm` | 14px | 1.55 | 0 | Pretendard | 메타, 보조 텍스트 |
| `text-md` | 16px | 1.6 | 0 | Pretendard | **본문 기본** |
| `text-lg` | 18px | 1.55 | -0.1px | Pretendard | 카드 제목 |
| `text-xl` | 20px | 1.4 | -0.2px | Pretendard | 섹션 헤더 |
| `text-display-xs` | 26px | 1.2 | -0.4px | Instrument Serif | 모바일 페이지 타이틀 |
| `text-display-sm` | 32px | 1.15 | -0.6px | Instrument Serif | 데스크탑 페이지 타이틀 |
| `text-display-md` | 40px | 1.1 | -0.8px | Instrument Serif | 섹션 히어로 |
| `text-display-lg` | 56px | 1.05 | -1.2px | Instrument Serif | 마케팅/온보딩 히어로 |
| `text-display-xl` | 72px | 1.0 | -1.8px | Instrument Serif | 랜딩 |

### 특수 스타일

- **Uppercase label**: 11px / 600 / `letter-spacing: 0.08em` / Pretendard (섹션 구분, eyebrow)
- **Tabular**: `.tabular { font-variant-numeric: tabular-nums; font-feature-settings: 'tnum'; }` — 시간, 수량, 비율 모두
- **Italic emphasis**: display 텍스트에서만 `Instrument Serif italic`로 감정 강조 (본문 italic은 쓰지 않음)

### 블랙리스트

- Inter / Roboto / Arial / Helvetica — 일반 UI에서 쓰지 않음 (Pretendard로 대체)
- Papyrus / Comic Sans / Lobster / Impact / Courier New (body) — 금지
- Clash Display — 너무 유행하는 SaaS 히어로 폰트 (피할 것)

---

## 4. Color

### 4-1. 브랜드 (Sage Green)

UntitledUI 스타터 기본값 violet/purple은 **버림**. "AI 슬롭"의 대표 색상. Sage green은 거의 아무 SaaS도 안 쓰는 색이라 카테고리에서 즉시 구분됨.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--brand` | `#3A6E5B` | `#6FA58C` | 로고, FAB, 활성 탭, 체크 완료, 태스크 좌측 보더, primary 버튼 |
| `--brand-hover` | `#2E5849` | `#8BB9A3` | 호버 상태 |
| `--brand-subtle` | `#E8F0EC` | `#223530` | 콜아웃 배경, 포커스 링, alert(success) |
| `--brand-text` | `#25463A` | `#A8D1BD` | brand-subtle 위에 올리는 텍스트 |

### 4-2. 웜톤 뉴트럴

순백 대신 따뜻한 오프화이트. 갈색 언더톤의 그레이.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg-page` | `#FAFAF7` | `#0E0F0C` | 페이지 배경 |
| `--bg-surface` | `#FFFFFF` | `#1A1C17` | 태스크 카드 (내 것) |
| `--bg-muted` | `#F5F4EE` | `#15171329` (15% 알파) | 외부 이벤트 카드 |
| `--bg-subtle` | `#EFEDE5` | `#202220` | 섹션 구분 배경 |
| `--border-default` | `#E8E6DE` | `#2B2D28` | 일반 보더 |
| `--border-muted` | `#D9D6CC` | `#3A3C37` | 파선(dashed), 비활성 |
| `--text-primary` | `#1A1A17` | `#F0EEE7` | 본문, 제목 (웜 블랙) |
| `--text-secondary` | `#4A4945` | `#C8C6BF` | 보조 텍스트 |
| `--text-muted` | `#6B6A63` | `#8C8A84` | 메타, 타임스탬프 |
| `--text-tertiary` | `#9B9992` | `#6B6A63` | 힌트, 플레이스홀더, 비활성 |

### 4-3. 라벨 팔레트 (역할 구분 6색)

Google Cal colorId에 매핑 가능하며 서로 충분히 구분되는 6색. 모두 채도 제어(눈 피로 최소화).

| Label | Hex (Light) | Hex (Dark) | Google Cal colorId | Default Use |
|---|---|---|---|---|
| Sage | `#3A6E5B` | `#6FA58C` | 10 (Basil) | 직장 (기본) |
| Terracotta | `#B3573A` | `#D68966` | 11 (Tomato) | 가정 |
| Dust Blue | `#5A7A99` | `#87A4BE` | 9 (Blueberry) | 개인 |
| Amber | `#C08A3E` | `#D9AC70` | 5 (Banana) | 학습 / 사이드 프로젝트 |
| Plum | `#8C5A6E` | `#B18597` | 3 (Grape) | 건강 / 병원 |
| Moss | `#7A8B4A` | `#A5B57E` | 2 (Sage) | 취미 / 예비 |

칩 스타일: 배경 = hex 12% 알파, 텍스트 = hex full. 다크모드 배경 = hex 20% 알파.

### 4-4. 시맨틱 색상

얼럿 / 상태 표시용. 라벨 팔레트와 재활용.

| Semantic | Color | Token |
|---|---|---|
| Success | Sage | `var(--brand)` |
| Warning | Amber | Amber label |
| Error | Terracotta | Terracotta label |
| Info | Dust Blue | Dust Blue label |

### 4-5. 다크모드 전환 규칙

- 순수 반전 금지. `#1A1A17` ↔ `#F0EEE7` 식 웜 반전
- 모든 색의 채도 10~15% 감소, sage는 반대로 명도 상승 (다크에서 읽히도록)
- 그림자는 opacity 0.3~0.4로 증가 (다크에서 그림자가 약해 보이는 문제 보정)

### 4-6. Hard Rules

1. 절대 raw Tailwind 색상(`text-gray-900`, `bg-white`) 쓰지 않음. 항상 시맨틱 토큰.
2. 절대 violet / purple / indigo 계열 브랜드 컬러로 쓰지 않음.
3. 그라디언트는 사용 금지 (solid color만). 예외: 다크모드 깊이감을 위한 2% 이하 미묘한 linear-gradient는 허용.
4. 라벨 색상 7번째 이상 필요 시: 색상 11개 모두 할당 후 이벤트 제목 앞에 `[라벨명] ` prefix.

---

## 5. Spacing

4px base. 모바일은 *comfortable-spacious*, 데스크탑은 *comfortable*.

| Token | Value | Use |
|---|---|---|
| `2xs` | 2 | 아이콘 내부 gap |
| `xs` | 4 | 칩 내부 padding |
| `sm` | 8 | 작은 gap |
| `md` | 12 | 카드 내부 gap, 리스트 아이템 사이 |
| `lg` | 16 | 카드 padding, 페이지 side padding (모바일) |
| `xl` | 24 | 섹션 내부 gap |
| `2xl` | 32 | 섹션 간 gap, 페이지 side padding (데스크탑) |
| `3xl` | 48 | 페이지 상하 padding (데스크탑) |
| `4xl` | 64 | 히어로 상하 여백 |

### 터치 타겟

- 최소 44x44px (iOS HIG), 실제로는 **48x48** 권장 (Android + 손가락 실제 크기)
- 리스트 아이템 세로 padding 최소 14px
- FAB 56px, 하단 네비 높이 72px (아이콘+라벨+여백)

---

## 6. Layout

- **Approach:** *grid-disciplined* (모바일) → *hybrid* (데스크탑). 편집/데이터 영역은 그리드, 히어로 영역은 창의적.
- **모바일 (390px~767px):** 단일 컬럼, 하단 네비 (4탭), 페이지 side padding 16px, 상단 safe-area 준수
- **태블릿 (768px~1023px):** 단일 컬럼 유지, 최대폭 640px 중앙 정렬
- **데스크탑 (1024px+):** 3컬럼 — 사이드바 240px / 메인 (달력+리스트) / 우측 디테일 패널 320px (lazy — 항목 선택 시에만)
- **최대 컨텐츠 폭:** 1200px (그 이상은 여백)
- **그리드 간격:** 24px gap (데스크탑), 16px gap (태블릿)

### Breakpoints

| Name | Value | Scope |
|---|---|---|
| `xs` | 390px | iPhone SE~13 mini 기준 |
| `sm` | 640px | 일반 모바일 (가로) / 작은 태블릿 |
| `md` | 768px | 태블릿 (iPad mini) |
| `lg` | 1024px | 태블릿 가로 / 작은 랩탑 |
| `xl` | 1280px | 데스크탑 |
| `2xl` | 1536px | 와이드 데스크탑 |

### Border Radius (하이어라키)

| Token | Value | Use |
|---|---|---|
| `rounded-sm` | 4px | 체크박스, 작은 chip 일부 |
| `rounded-md` | 8px | - |
| `rounded-lg` | 10px | **버튼, 인풋** |
| `rounded-xl` | 12px | **카드 (기본)** |
| `rounded-2xl` | 16px | 섹션 박스, 큰 모달 |
| `rounded-3xl` | 24px | 바텀 시트, 슬라이드업 |
| `rounded-full` | 9999px | **칩, FAB, 아바타, 토글** |

### Shadows

- **카드 기본** (`shadow-card`): `0 1px 2px rgba(26,26,23,0.04), 0 2px 8px rgba(26,26,23,0.04)` — 거의 안 보이는 수준, 레이어 구분용
- **플로팅 요소** (`shadow-float`): `0 4px 16px rgba(58,110,91,0.18), 0 2px 4px rgba(26,26,23,0.06)` — FAB, 토스트
- **모달** (`shadow-modal`): `0 20px 60px rgba(26,26,23,0.08), 0 8px 20px rgba(26,26,23,0.04)` — 깊은 층위
- 다크모드: 모든 그림자 opacity 3~4배 증가

---

## 7. Motion

*minimal-functional.* 모션이 정보 전달에 기여할 때만 씀. "celebrate" 금지.

| Event | Duration | Easing | Transform |
|---|---|---|---|
| 태스크 체크 완료 | 180ms | ease-out | scale(0.97) → scale(1) + 체크 페이드인 |
| 카드 호버 (데스크탑) | 150ms | ease-linear | translateY(-1px) + shadow 약간 강화 |
| View 전환 (오늘/내일/이번 주) | 220ms | ease-in-out | opacity 0 → 1 (수평 슬라이드 없음) |
| 모달/시트 진입 | 260ms | ease-out | translateY(16px → 0) + fade |
| FAB 호버 | 150ms | ease-linear | scale(1.05) |
| 토스트/얼럿 등장 | 240ms | ease-out | translateY(-8px → 0) + fade |
| Auto-rollover 표시 | 400ms | ease-out | 아이콘 페이드인 only (애니메이션 없음) |

### 명시적 금지

- 태스크 완료 시 컨페티, 반짝임, 사운드 (생산성 게이미피케이션 X)
- 스크롤 기반 애니메이션 (마케팅 페이지 제외)
- 자동 재생 loop 애니메이션
- parallax

### prefers-reduced-motion

모든 motion은 `@media (prefers-reduced-motion: reduce)` 조건에서 `duration: 1ms`로 무력화.

---

## 8. 컴포넌트 구현 지침

### 현재 스택 상황

- 프로젝트는 **듀얼 컴포넌트 시스템**: UntitledUI (신규, `src/components/base/`) + shadcn (레거시, `src/components/ui/`)
- 신규 Todogram 화면은 **UntitledUI 우선** 사용
- shadcn은 기존 login/signup 페이지 유지 (마이그레이션은 점진적)

### UntitledUI 테마 마이그레이션 (필수)

`src/app/theme.css` 는 현재 UntitledUI 스타터 기본값(violet brand). 이 문서의 색상으로 교체 필요:

- `--color-brand-*` 스케일을 sage green으로 재매핑
- `--color-bg-*`, `--color-text-*`, `--color-border-*`, `--color-fg-*` 시맨틱 토큰을 위 §4-2 값으로 교체
- `--color-utility-*` 팔레트에서 `brand` / `purple` / `indigo` / `violet` / `fuchsia` / `pink` 제거, §4-3 라벨 팔레트로 대체
- 다크모드 블록(`.dark-mode`) 도 위 §4-5 규칙으로 재작성

### 신규 컴포넌트 작성 규칙

1. `src/components/base/*` UntitledUI 패턴 따름
2. `react-aria-components` import 시 `Aria*` prefix 필수
3. `sortCx` 로 스타일 조직
4. 시맨틱 토큰만 사용 (raw Tailwind 색 금지)
5. 터치 타겟 48px 기본
6. `prefers-reduced-motion` 대응

### Todogram 특화 컴포넌트

| Component | Path (신규) | 설명 |
|---|---|---|
| `TaskCard` | `src/components/todogram/task-card.tsx` | 내 태스크 카드 — 좌측 sage 3px 보더, shadow-card, 체크박스, 라벨 칩 |
| `ExternalEventCard` | `src/components/todogram/external-event-card.tsx` | 외부 캘린더 이벤트 — dashed 보더, opacity 0.85, 시계 아이콘 |
| `LabelChip` | `src/components/todogram/label-chip.tsx` | 6색 라벨 칩 — 배경 12% 알파 + 텍스트 full |
| `TodayHeader` | `src/components/todogram/today-header.tsx` | Instrument Serif로 렌더한 날짜 + 오늘/내일/이번 주 토글 |
| `BottomNav` | `src/components/todogram/bottom-nav.tsx` | 4탭 하단 네비 (Today / Calendar / Labels / Settings) |
| `Fab` | `src/components/todogram/fab.tsx` | 플로팅 + 버튼, 하단 네비 위 |

---

## 9. Hard Rules (모든 UI 코드가 지켜야 할 것)

1. **시맨틱 토큰 필수** — `text-text-primary`, `bg-bg-primary` 등. raw 색상(`text-gray-900`, `bg-white`) 절대 금지.
2. **Violet / purple 브랜드 색상 금지** — UntitledUI 기본값은 AI 슬롭 신호.
3. **그라디언트 브랜드 색상 금지** — solid만.
4. **레이어드 위계 유지** — 내 태스크와 외부 이벤트는 항상 시각적으로 구분된 두 층.
5. **Pretendard로 한글 렌더** — Inter / Noto Sans KR / system font 금지 (마이그레이션 후).
6. **Instrument Serif는 display에만** — 본문·UI에 쓰지 않음.
7. **JetBrains Mono + tabular-nums** — 모든 시간·수량 표시.
8. **다크모드 dark: 프리픽스 금지** — `@custom-variant dark` + `.dark-mode` 클래스 사용.
9. **모든 모션은 `prefers-reduced-motion` 대응.**
10. **터치 타겟 48px 이상** (모바일 퍼스트).

---

## 10. Decisions Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-04-16 | 초기 디자인 시스템 v1.0 확정 | `/design-consultation` 세션. 경쟁 제품 6개(Sunsama, Motion, Notion Cal, Amie, Fantastical, Reclaim, Things 3, TimeTree) 시각 리서치 후 "Quiet Layer" 방향 승인. Sage green + Pretendard + Instrument Serif 콤보로 카테고리에서 차별화. |
| 2026-04-16 | AI 목업 대신 HTML 프리뷰 사용 | gstack design 바이너리가 OpenAI org verification 요구. `/c/Users/user/.gstack/projects/SHIN-HANBEEN-Todogram3/designs/design-system-20260416/preview.html` 로 실제 렌더 + 라이트/다크 토글 확인 후 승인. |

---

## 11. 다음 단계 (구현)

이 시스템을 코드로 옮기는 순서(권장):

1. **`src/app/theme.css` 교체** — 이 문서 §4 값으로 UntitledUI 테마 덮어쓰기. **가장 먼저.**
2. **Pretendard + Instrument Serif + JetBrains Mono 로드** — `next/font` 또는 `src/app/layout.tsx`의 `<head>`
3. **기존 페이지 시각 회귀 체크** — shadcn 페이지들이 새 토큰에서 여전히 작동하는지 (`npm run dev` + 눈으로)
4. **Todogram 핵심 컴포넌트 6종 구현** (§8)
5. **Today View 스크린 구현** (모바일 기준) — preview.html 레이아웃 그대로
6. **실기기 테스트** — 본인 Android + Samsung 캘린더 위에서 dogfooding
