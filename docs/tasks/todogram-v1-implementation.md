# Todogram v1 구현 체크리스트

> **생성일**: 2026-04-14
> **출처**: `/plan-eng-review` 결과 (B'++ 설계 기반)
> **참조 문서**: `docs/design/todogram-v2-design.md` v1.1
> **목표**: 본인 dogfooding 1개월 → 와이프 gate 조건 충족 → v1.5/v2로 확장
> **예상 기간**: ~7일 (CC+gstack 집중) / 4~5주 (human 기준)

작업을 다시 시작할 때 이 파일을 먼저 열어서 어디까지 진행됐는지 확인하고,
완료한 항목은 `- [ ]` → `- [x]`로 체크한다.

---

## 🎯 확정된 아키텍처 결정 (Day 1 이전 확정, 변경 금지)

| # | 결정 | 선택 | 근거 |
|---|---|---|---|
| 1 | Server 통신 방식 | **역할 분리** | CRUD/UI 인터랙션 = Server Action, OAuth 콜백/cron/외부 훅 = API Route |
| 2 | Refresh token 저장 | **v1부터 AES-256-GCM 암호화** | `ENCRYPTION_KEY` env + Node crypto. 보일 더 레이크 원칙 |
| 3 | Google Cal 쓰기 토글 (Lane I) | **v1.5로 이월** | v1 dogfooding 1주 후 가치 재평가. v1은 read-only core에 집중 |
| 4 | 테스트 스택 | **Vitest + Playwright** | Day 1에 세팅. 핵심 로직은 반드시 테스트로 보호 |

---

## 📦 Phase 0: Foundation (Day 1)

환경 세팅. 이 단계가 끝나야 실제 기능 개발을 시작할 수 있다.

- [x] **F1. Drizzle ORM + schema 정의**
  - 파일: `src/db/schema/{users,labels,tasks,task_labels,rollover_logs}.ts`, `drizzle.config.ts`
  - 설계 §8-2 DDL 기반. **`users.timezone TEXT NOT NULL DEFAULT 'Asia/Seoul'` 반드시 추가** (§8-4 cron이 사용)
  - `users.google_auth_status ENUM('active','revoked','expired')` 추가 (revoked 전이용)
  - `users.task_card_style ENUM('compact','comfortable') NOT NULL DEFAULT 'comfortable'` 추가 (Phase 4 U6 TaskCard 뷰 선택용)
  - `drizzle-kit` migration 파이프라인 구성
- [x] **F2. Supabase 프로젝트 생성 + 연결**
  - Supabase 대시보드에서 신규 프로젝트 생성 (무료 티어, ap-northeast-2 Seoul)
  - `src/db/index.ts`에 `drizzle(postgres(process.env.DATABASE_URL!))` 클라이언트 — pgBouncer 호환 `prepare: false`, HMR 캐싱, schema 배럴 등록
  - `drizzle.config.ts` 에서 `@next/env.loadEnvConfig()` 로 `.env.local` 자동 로드 (런타임/CLI env 통일)
  - `.env.example` + `.env.local` 스캐폴드 (Phase 0~5 env 전부 문서화)
  - `npm run db:migrate` 실행 → `__drizzle_migrations` + `users` + `labels` + `tasks` + `task_labels` + `rollover_logs` 6 테이블 생성 확인
- [ ] **F3. 테스트 프레임워크 세팅 (Vitest + Playwright)**
  - `vitest.config.ts` + `test/unit/`, `test/integration/`
  - `playwright.config.ts` + `test/e2e/`
  - `npm run test`, `npm run test:e2e` 스크립트 추가
  - 샘플 테스트 1개씩 (smoke check)
- [ ] **F4. 환경변수 Zod 검증**
  - `src/env.ts`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `ENCRYPTION_KEY`, `CRON_SECRET`
  - 서버 시작 시 누락되면 throw (런타임 오류 방지)
- [ ] **F5. 스타터 잔재 제거**
  - `src/app/smart-farm/` 디렉터리 삭제
  - `src/app/page.tsx` 랜딩을 Todogram 로그인 안내로 교체

**완료 기준**: `npm run typecheck && npm run test && npm run test:e2e` 전부 통과. Supabase에 빈 테이블 5개 존재.

---

## 🔐 Phase 1: Auth (Day 2)

- [ ] **A1. NextAuth v5 + Google Provider (readonly scope)**
  - 파일: `src/lib/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`
  - Scope: `openid email profile https://www.googleapis.com/auth/calendar.events.readonly`
  - Refresh token 받도록 `access_type: 'offline'`, `prompt: 'consent'`
- [ ] **A2. Refresh token AES-256-GCM 암호화 저장**
  - 파일: `src/lib/crypto.ts` (encrypt/decrypt 헬퍼)
  - NextAuth JWT/Session 콜백에서 refresh token을 DB `users.google_refresh_token`에 암호화 저장
  - 테스트: encrypt → decrypt round-trip
- [ ] **A3. 세션 미들웨어 + 보호 라우트**
  - 파일: `src/middleware.ts`
  - `/calendar`, `/list`, `/settings/*` 세션 없으면 `/login`으로 리다이렉트
- [ ] **A4. Timezone 수집 + users.timezone 저장**
  - 로그인 시 클라이언트에서 `Intl.DateTimeFormat().resolvedOptions().timeZone` 전송
  - NextAuth signIn 콜백에서 DB에 저장 (최초 1회)

**완료 기준**: Google 로그인 → users 테이블에 본인 레코드 생성 (email, timezone, 암호화된 refresh_token). 로그아웃 → 보호 라우트 접근 차단.

---

## 🗄️ Phase 2: Data Layer (Day 3)

- [ ] **D1. Labels Server Actions + Zod 검증**
  - 파일: `src/actions/labels.ts`
  - `createLabel`, `updateLabel`, `deleteLabel`, `listLabels`
  - 라벨 색상 `#RRGGBB` 형식 검증, `google_color_id` 1~11 범위
- [ ] **D2. Tasks Server Actions + Zod 검증**
  - 파일: `src/actions/tasks.ts`
  - `createTask`, `updateTask`, `toggleTaskStatus`, `deleteTask`, `listTasks`
  - **⚠️ 보안 테스트 필수**: `WHERE user_id = session.userId` 가드 없으면 남의 task 수정 가능
  - `position` 정수 + 정렬 로직
- [ ] **D3. task_labels junction 작업**
  - 파일: `src/actions/task-labels.ts`
  - task 생성/수정 시 라벨 연결 트랜잭션
  - Drizzle relational query `with: { labels: true }` 강제 (N+1 방지)

**완료 기준**: 
- Vitest에서 CRUD round-trip 통과
- 보안 테스트: user A 세션으로 user B task id 수정 시도 → 차단 확인
- Drizzle 쿼리에 N+1 없음 (쿼리 로그 점검)

---

## 📅 Phase 3: Google Cal Read Integration (Day 4) — 와이프 Q1 Gate 🚦

여기가 와이프 gate 조건이다. 이 단계가 끝나면 v1 핵심 가치가 증명된다.

- [ ] **G1. Google Cal client + 토큰 자동 갱신**
  - 파일: `src/lib/google-cal/client.ts`
  - `googleapis` 패키지 활용
  - Access token 만료 시 refresh token으로 자동 갱신
  - 테스트: mock으로 401 → refresh → 재시도 시나리오
- [ ] **G2. events.list fetch + 페이지네이션**
  - 파일: `src/lib/google-cal/events.ts`
  - `timeMin`/`timeMax` 파라미터로 뷰 범위만 요청 (전체 캘린더 금지)
  - `singleEvents=true` (서버 측 반복 이벤트 expand)
  - `pageToken` 루프로 250+ 이벤트 전부 수집
  - `maxResults=250`
- [ ] **G3. In-memory LRU 캐시 + debounce**
  - 파일: `src/lib/google-cal/cache.ts`
  - 캐시 키: `${userId}:${timeMin}:${timeMax}`
  - 월 네비게이션 debounce 300ms
  - TTL 5분 (설계 §8-3 백그라운드 refresh 주기)
- [ ] **G4. 401 revoked → user status 전이**
  - 파일: `src/lib/google-cal/client.ts` 확장
  - 토큰 취소 감지 시 `users.google_auth_status = 'revoked'` 업데이트
  - 테스트: mock 401 invalid_grant → DB 상태 전이 확인

**완료 기준**: 로그인한 사용자의 현재 월 Google Cal 이벤트를 서버에서 가져와서 console.log로 출력 가능. 권한 해제 시뮬레이트 → DB 상태 전이.

---

## 🎨 Phase 4: UI — Views (Day 5~6)

Lane F1 (U1)과 Lane F2 (U2)는 병렬 워크트리 가능.

- [ ] **U1. Calendar View (월간, merge 표시)** 🚦 와이프 gate UI
  - 파일: `src/app/(app)/calendar/page.tsx`, `src/components/calendar/`
  - 같은 날짜 내 시간순 병합
  - **외부 이벤트**: `border-border-secondary` + opacity-70, 클릭 비활성
  - **Todogram task**: `border-brand` solid, 클릭 시 편집 모달
  - 월 네비게이션 debounce (G3 캐시 활용)
- [ ] **U2. List View (드래그 정렬 + 필터 + 검색)**
  - 파일: `src/app/(app)/list/page.tsx`, `src/components/task-list/`
  - 리스트 아이템 = `<TaskCard variant={user.taskCardStyle} />` (U6 컴포넌트 소비)
  - `@dnd-kit/sortable` 또는 유사 라이브러리로 드래그
  - 필터: 상태(pending/in_progress/done) + 라벨 multiselect
  - 검색: title + notes full-text (v1은 단순 ILIKE)
- [ ] **U3. Task 생성/편집 모달**
  - 파일: `src/components/task-form/`
  - React Hook Form + Zod (설계 §9 기존 스타터 활용)
  - 필드: title, notes, location, due_at, labels[], rollover_enabled
  - UntitledUI `Modal` + `Input` + `Select.MultiSelect` + `DatePicker`
- [ ] **U4. Label 관리 화면**
  - 파일: `src/app/(app)/settings/labels/page.tsx`
  - CRUD UI, 색상 피커 (Google colorId 11개 고정 선택)
- [ ] **U5. 모바일 퍼스트 레이아웃 + 네비게이션**
  - 파일: `src/app/(app)/layout.tsx`
  - **성공 기준**: 모바일에서 콘텐츠 영역 ≥ 65% (설계 §12)
  - UntitledUI sidebar-navigation 또는 header-navigation 선택
- [x] **U0. LabelChip 컴포넌트 (4 variant × 3 size × 6 color)** 🎨 `/design-shotgun` A+B+C+D 승인
  - 파일: `src/components/todogram/label-chip.tsx`
  - **참조 프리뷰**: `~/.gstack/projects/SHIN-HANBEEN-Todogram3/designs/labelchip-variants-20260416/board.html`
  - **전략**: 맥락별 다른 variant, **default = 'dot' (Things-style)**
  - **Variant `pill`** — DESIGN.md §4-3 canonical. rounded-full + bg 12%/20% 알파 + full color text. Pretendard 11px/600 uppercase + 0.08em letter-spacing. 용도: 라벨 관리·알림·배지.
  - **Variant `dot`** (default) — 배경 없음. 6px colored dot + Pretendard 13px/500 sentence case (text-secondary). 용도: TaskCard 인라인 메타. Quiet Layer 정신에 가장 충실.
  - **Variant `outline`** — rounded-full + 1px solid label-color + 라벨색 텍스트. selected=true 시 bg 12%/20% + weight 600. 용도: 필터바의 탭 가능한 칩.
  - **Variant `pill-dot`** — pill + 6px leading dot. 색맹 접근성 강화. 용도: 필터바에서 "이 색 = 이 라벨" 두 번 확인.
  - **공통 props**: `color: 'sage' | 'terracotta' | 'dust-blue' | 'amber' | 'plum' | 'moss'`, `variant`, `size: 'sm' | 'md' | 'lg'`, `selected?`, `onRemove?`, `disabled?`.
  - **보조 컴포넌트**: `LabelChipButton` (필터바용 interactive wrapper, 터치 타겟 44px+), `LabelChipOverflow` (+N 표시, JetBrains Mono tabular-nums).
  - **접근성**: `aria-selected` (outline), `aria-pressed` (button), `aria-label="라벨 제거"` (close button), focus-visible outline, `prefers-reduced-motion` 자동 대응(transition 150ms).
  - **approved.json**: `~/.gstack/projects/SHIN-HANBEEN-Todogram3/designs/labelchip-variants-20260416/approved.json` 에 spec 전문 저장.
- [x] **U0.5. TodayHeader 컴포넌트 (Serif Datestamp + Monolith Tabs)** 🎨 `/design-shotgun` A×D 하이브리드 승인
  - 파일: `src/components/todogram/today-header.tsx`
  - **참조 프리뷰**: `~/.gstack/projects/SHIN-HANBEEN-Todogram3/designs/today-header-20260417/board.html` (A/B/C/D 비교), `iteration-1.html` (확정안)
  - **Layout (A)**: eyebrow "TODAY"(Pretendard 11px/600/0.08em uppercase) → Instrument Serif 26px 날짜(`text-display-xs`, font-display, 로케일별 포맷 ko="4월 17일 (금)" / en="Friday, 17 April") → 하단 row
  - **Tabs (D)**: 텍스트 탭 `오늘 · 내일 · 이번 주` / `Today · Tomorrow · This Week`. 비활성 = text-tertiary 500, 활성 = fg-brand-primary 600 + sage underline 1.5px (bottom:12px). 48px 터치 타겟 (DESIGN §5). dot separator `·` 는 aria-hidden.
  - **Count**: JetBrains Mono 13px tabular-nums `{done}/{total}` (예: `3/7`), text-tertiary. aria-label 로 문장형 전달.
  - **Props**: `{ date: Date; scope: 'today'|'tomorrow'|'week'; onScopeChange: (s)=>void; completed: number; total: number; locale?: 'ko'|'en'; eyebrow?: string }`
  - **접근성**: `role="tablist"` + `role="tab"` + `aria-selected` + `aria-controls` (부모가 `id=today-header-panel-{scope}` 패널 렌더 전제), focus-visible outline, `motion-reduce:transition-none` (prefers-reduced-motion 대응 DESIGN §9-9).
  - **approved.json**: `~/.gstack/projects/SHIN-HANBEEN-Todogram3/designs/today-header-20260417/approved.json` 에 spec 전문 저장. rejected variants (A_pure, B, C, D_pure) 사유 기록.
- [x] **U0.6. BottomNav 컴포넌트 (Monolith Underline)** 🎨 `/design-shotgun` C 승인
  - 파일: `src/components/todogram/bottom-nav.tsx`
  - **참조 프리뷰**: `~/.gstack/projects/SHIN-HANBEEN-Todogram3/designs/bottomnav-variants-20260417/board.html` (A/B/C/D 비교), `iteration-1.html` (확정안 스펙 + props sketch)
  - **Layout**: `fixed inset-x-0 bottom-0 z-40 md:hidden` · 72px 높이 + `env(safe-area-inset-bottom)` · `bg-bg-primary` + `border-t border-border-primary` + shadow-nav. 태블릿 이상은 sidebar 로 대체(`md:hidden`).
  - **Tabs (C)**: 4탭 `오늘 · 캘린더 · 라벨 · 설정` / `Today · Calendar · Labels · Settings`. 아이콘 22px stroke 1.75 + 라벨 Pretendard 11px/500. 비활성 = text-tertiary, 활성 = fg-brand-primary 600 + sage underline 28×1.5px (bottom:-2px, `scaleX(0→1)` 220ms ease-in-out). TodayHeader 와 동일한 활성 언어 계승.
  - **아이콘** (`@untitledui/icons`): `CalendarCheck01`(Today), `Calendar`(Calendar), `Tag01`(Labels), `Settings01`(Settings).
  - **Props**: `{ locale?: 'ko'|'en'; activeTab?: BottomNavTabId; className?: string }`. activeTab 미지정 시 `usePathname()` + startsWith 매칭으로 자동 판별 — 외부 상태 관리 불필요.
  - **접근성**: `nav[aria-label="주요 네비게이션"]`, 활성 `aria-current="page"`, 터치 타겟 48×48 (§9-10), focus-visible sage 링, `motion-reduce:transition-none` (§9-9), 아이콘 `aria-hidden`.
  - **Open questions (v1 구현 중 해결)**: Today 탭 미완료 카운트 뱃지(v1.5로 이월), Today 재탭 시 상단 탭 리셋 여부(기본 리셋 안 함), arrow key 순환(v2 고려).
  - **approved.json**: `~/.gstack/projects/SHIN-HANBEEN-Todogram3/designs/bottomnav-variants-20260417/approved.json` 에 spec 전문 저장. rejected variants (A Quiet Icons, B Sage Dot Anchor, D Floating Pill) 사유 기록.
- [ ] **U0.7. Today View 스크린 (Unified Ledger Layout)** 🎨 `/design-shotgun` D refined v3 승인
  - 파일: `src/components/todogram/today-view.tsx`, `today-row.tsx`, `filter-rail.tsx`, `rollover-banner.tsx`, `labels.ts`
  - **참조 프리뷰**: `~/.gstack/projects/SHIN-HANBEEN-Todogram3/designs/today-view-20260417/iteration-3.html` (확정안), `iteration-1.html` · `iteration-2.html` (진행 기록)
  - **approved.json**: `~/.gstack/projects/SHIN-HANBEEN-Todogram3/designs/today-view-20260417/approved.json` — 전체 spec + decisions log + open questions
  - **핵심 결정**: 카드 대신 **통합 row ledger**. 내 태스크와 외부 이벤트가 동일한 geometry 를 공유하고, 좌측 3px 색 틱으로 라벨 색을 계승. DESIGN.md §2 "Context-scoped 해석 — Today View row" 참조.
  - **레이아웃**: `[TodayHeader] → [FilterRail sticky] → [RolloverBanner?] → [stream: TodayRow × n with mid-gap dividers] → [Fab] → [BottomNav]`
  - **TodayView (container)**:
    - Props: `{ date: Date; scope: 'today'|'tomorrow'|'week'; items: TodayItem[]; activeFilter: LabelId | 'all' | 'calendar'; rolloverCount?: number; onScopeChange; onFilterChange; onToggleTask; onRolloverAction }`
    - 스트림은 `items.flatMap((item, i) => i === 0 ? [<TodayRow ... />] : [<Divider />, <TodayRow ... />])` 패턴으로 row 사이에 1px divider 삽입.
    - divider: `<div class="row-divider" aria-hidden="true" />` — `flex: 0 0 1px; min-height: 1px; background: var(--border-default); margin-left: 3px` (3px 색 틱 공간 스킵). flex-shrink 이슈 때문에 `height:1px` 단독 지정은 금지.
    - stream 컨테이너: `flex: 1; overflow: hidden auto; padding: 10px 16px 120px; display: flex; flex-direction: column; gap: 4px;` — 4px gap + 1px divider = 9px 중앙 정렬 리듬.
  - **TodayRow** (내부·외부 공용):
    - Props: `{ kind: 'mine' | 'ext'; time: string; title: string; label: LabelId | 'calendar'; completed?: boolean; onToggle?: () => void; note?: string }`
    - Geometry: `[time 56px · check 18px · title flex · chip auto]`, min-height 56px, padding `12px 10px 12px 11px`, `border-left: 3px solid var(--label-color)`, `border-radius: 0 6px 6px 0`.
    - 내부 / 외부 구분 신호 2개뿐: (a) `kind === 'ext'` 면 체크박스 `visibility: hidden` (공간은 유지), (b) 제목 색 `ext → text-secondary`, `mine → text-primary`.
    - 시간: JetBrains Mono tabular-nums 13px text-muted.
    - chip: LabelChip `dot` variant (모바일) — 6px colored dot + 12px 라벨명.
    - **금지**: dashed border · opacity 0.88 · bg-muted — 이건 카드 형태(ExternalEventCard)에만 유지.
  - **FilterRail**:
    - Props: `{ labels: Label[]; active: LabelId | 'all' | 'calendar'; onChange: (v) => void }`
    - `position: sticky; top: 0; z-index: 5; display: flex; gap: 6px; padding: 10px 16px; overflow-x: auto; background: var(--bg-page); border-bottom: 1px solid var(--border-default); scrollbar-width: none;` + `::-webkit-scrollbar { display: none; }`.
    - 칩: LabelChip `outline` variant, `selected` 시 `bg 12% + weight 600`. 전체/캘린더/사용자 라벨 순서. `calendar` 는 reserved dust-blue.
    - 터치 타겟 44px (§5).
  - **RolloverBanner**:
    - Props: `{ count: number; onKeep: () => void; onArchive: () => void; onDismiss?: () => void }`
    - Amber tint 배경 (`bg: #FDF4E2` light / `rgba(217,172,112,0.12)` dark), amber left 3px tick, ⟲ 아이콘.
    - 2 액션: "오늘 유지" (primary outline sage) / "보관" (ghost text-muted). 카운트 0 이면 렌더 안 함.
  - **Labels 상수**: `src/components/todogram/labels.ts` 에 `CALENDAR_LABEL_ID = 'calendar'`, `LABEL_COLOR_MAP`, `DEFAULT_USER_LABEL_PRESET = ['work','home','study','personal']` (plum-assigned personal 반영).
  - **접근성**: row 는 `role="listitem"` + 부모 `role="list" aria-label="오늘 할 일"`, 체크박스 `aria-checked`, FilterRail `role="tablist"` + 칩 `role="tab" aria-selected`, RolloverBanner `role="status" aria-live="polite"`.
  - **모션**: row hover 시 배경 `bg-bg-primary-hover` 150ms linear. 체크 토글 시 DESIGN.md §7 체크 완료 모션 계승. `motion-reduce:transition-none`.
  - **Open questions** (구현 중 해결): (1) week scope 시 row 에 날짜 그룹 헤더 필요? (기본 yes), (2) 외부 이벤트 long-press 시 세부 시트 vs 원본 캘린더 앱 deeplink? (v1 = 아무 것도 안 함), (3) filter=calendar 일 때 내 태스크 숨김 여부? (기본 숨김).
- [ ] **U6. TaskCard 컴포넌트 (듀얼 뷰: compact / comfortable)** 🎨 `/design-shotgun` A+B 승인
  - 파일: `src/components/task-card/task-card.tsx`, `task-card-compact.tsx`, `task-card-comfortable.tsx`, `index.ts`
  - **참조 프리뷰**: `~/.gstack/projects/SHIN-HANBEEN-Todogram3/designs/taskcard-variants-20260416/compare.html`
  - **Variant A — Compact (Minimal Strip)**: 카드 chrome 없음, 4px 좌측 라벨 스트립 + hairline 구분선, 행 높이 56px. 정보 밀도 최고. Things 3 / iOS 네이티브 리스트 느낌.
  - **Variant B — Comfortable (Soft Card)**: `shadow-card` + `radius-xl(12px)` + 16px padding, 라벨칩 + due time 메타 라인 포함. Noteplan / Sunsama 차분함. **기본값(default).**
  - **공통 props**: `task: Task & { labels: Label[] }`, `onToggle: (id, status) => void`, `onClick?: (id) => void`
  - **공통 상태 3종**: `pending` (체크박스 빈칸) / `done` (체크박스 sage 채움 + 제목 취소선) / `rollover` (⟲ 아이콘 + "어제에서 이월" 배지, `task.rolled_from_date` 있을 때)
  - **공통 접근성**: 카드 전체 클릭 타겟 48px 이상 (DESIGN.md §5 터치 타겟), 체크박스 `aria-checked`, role=button, 키보드 Enter/Space 토글
  - **밀도 선택 방식**: parent가 `users.task_card_style` 값 읽어 `<TaskCard variant="compact" />` 또는 `variant="comfortable"` prop 전달. default=`'comfortable'`.
  - **Storybook/테스트**: Vitest snapshot 각 variant × 각 상태 조합 (2 × 3 = 6개), Playwright E2E에서 밀도 토글 → 카드 렌더 변화 검증
- [ ] **U7. Settings > 뷰 밀도 토글**
  - 파일: `src/app/(app)/settings/view/page.tsx` (또는 기존 settings 페이지 내 섹션)
  - UntitledUI `Toggle` 또는 `RadioButtons` (compact / comfortable)
  - 변경 시 Server Action으로 `users.task_card_style` 업데이트 + `router.refresh()`
  - 설정 변경 즉시 List View / Calendar View 반영 확인 (SSR 값 전달)

---

## ⏰ Phase 5: Auto-rollover (Day 6, Lane H 병렬)

- [ ] **R1. Cron endpoint + CRON_SECRET 검증**
  - 파일: `src/app/api/cron/rollover/route.ts`
  - `Authorization: Bearer $CRON_SECRET` 체크 (없으면 401)
  - Todogram task만 대상 (외부 이벤트 건드리지 않음)
- [ ] **R2. Per-user timezone 해소**
  - 파일: `src/lib/rollover.ts`
  - 각 user의 `timezone`으로 "오늘 00:00" 계산 (date-fns-tz 또는 Intl)
  - `user별 try/catch + Promise.allSettled` (한 유저 실패가 다른 유저 차단 금지)
- [ ] **R3. rollover_logs 중복 방지**
  - `(task_id, rolled_at)` PK 기반 dedup
  - `FOR UPDATE SKIP LOCKED` 또는 `updated_at` 낙관적 락 (동시 편집 방지)
- [ ] **R4. vercel.json cron 설정**
  - `{ "crons": [{ "path": "/api/cron/rollover", "schedule": "5 0 * * *" }] }`
  - ⚠️ Vercel Cron은 UTC 기준이라 실제 user timezone 계산은 R2에서 해결

**완료 기준**: Playwright E2E — 어제 날짜 pending task 생성 → cron 엔드포인트 수동 호출 → task가 오늘로 이동 + rollover_logs 기록 확인.

---

## 🚀 Phase 6: PWA + Polish (Day 7)

- [ ] **P1. PWA manifest + service worker**
  - `public/manifest.json`, `src/app/layout.tsx`에 `<link>`
  - iOS/Android 홈 화면 추가 테스트
- [ ] **P2. Dark mode audit**
  - 이미 `next-themes` + UntitledUI 토큰 시스템 존재
  - 모든 신규 페이지가 시맨틱 토큰(`bg-bg-primary` 등)만 사용하는지 확인
- [ ] **P3. 한국어 localization audit**
  - 하드코딩된 영어 문자열 제거 (설계 "한국어만" 원칙)
- [ ] **P4. Vercel 배포**
  - GitHub → Vercel 연동
  - 환경변수 전부 설정 (F4 env.ts 기준)
  - 도메인 `todogram.vercel.app` 확인
  - 프로덕션에서 첫 로그인 → Calendar View 렌더 확인

**완료 기준**: 프로덕션 URL에서 본인 계정으로 로그인 → 본인 Google Cal 이벤트 보임 → task 추가 → 다음날 rollover 확인 (cron 24시간 대기).

---

## ⚠️ 반드시 커버해야 할 Critical Test Gaps

구현 중 각 단계에서 놓치면 나중에 디버깅 지옥행. 테스트가 없으면 해당 Phase 완료 금지.

| # | 갭 | Phase | 상태 |
|---|---|---|---|
| 1 | 다른 user의 task 수정 차단 (403) | D2 | - [ ] |
| 2 | Google 토큰 revoked 401 → status 전이 | G4 | - [ ] |
| 3 | Rollover cron user-level try/catch + lock | R2/R3 | - [ ] |
| 4 | Rollover 중복 실행 방지 (rollover_logs PK) | R3 | - [ ] |
| 5 | Write toggle primary calendar 가드 (v1.5) | Lane I | ⏸️ v1.5 |

---

## 🚫 NOT in scope (v1 제외 — 건드리지 말 것)

| 항목 | 이월 버전 | 사유 |
|---|---|---|
| Google Cal 쓰기 토글 (Lane I: W1~W5) | v1.5 | dogfooding 후 가치 재평가 |
| Archive/대시보드 뷰 | v1.5 | 설계 §8-6 |
| AI 주간 요약/자연어 검색/이직서 draft | v2 | 설계 §8-6 |
| iCloud CalDAV | v2 | 와이프 onboarding gate |
| Bidirectional sync | 영구 제외 | 설계 §8-6 |
| Push 알림 | YAGNI | Google Cal 자체 알림 활용 |
| 오프라인 PWA 편집 | v2+ | 설계 §13 Q4 |
| Sentry/APM | v2 verification | 1인 사용자 과도 |
| 다국어 | YAGNI | 한국어만 |
| Google OAuth verification 제출 | v2 진입 시 | 2~6주 소요, v1은 unverified (100 user 한도) |

---

## 🎯 v1 성공 지표 (설계 §12)

- [ ] 본인이 30일 연속 매일 앱 오픈 (앱 분석 이벤트)
- [ ] "Samsung 캘린더 앱을 여는 빈도가 절반 이하" 정성 확인
- [ ] Auto-rollover 실행 task 중 실패율 < 1%
- [ ] 모바일 Calendar View 콘텐츠 영역 ≥ 65%

---

## 📝 재개 시 체크리스트

새 세션을 시작할 때:

1. 이 파일을 먼저 연다.
2. 마지막으로 체크된 항목 다음부터 재개.
3. `git log --oneline -10`으로 최근 커밋 확인.
4. `docs/design/todogram-v2-design.md` §16에 이번 주 변경사항 반영 여부 확인.
5. 테스트 먼저 작성 후 구현 (TDD 권장, 특히 Phase 2/3/5의 critical paths).

---

**다음 작업**: Phase 0 Day 1 시작 → F1 (Drizzle schema) 부터.
