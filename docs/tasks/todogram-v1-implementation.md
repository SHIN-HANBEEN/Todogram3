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
  - `drizzle-kit` migration 파이프라인 구성
- [x] **F2. Supabase 프로젝트 생성 + 연결**
  - Supabase 대시보드에서 신규 프로젝트 생성 (무료 티어, ap-northeast-2 Seoul)
  - `src/db/index.ts`에 `drizzle(postgres(process.env.DATABASE_URL!))` 클라이언트 — pgBouncer 호환 `prepare: false`, HMR 캐싱, schema 배럴 등록
  - `drizzle.config.ts` 에서 `@next/env.loadEnvConfig()` 로 `.env.local` 자동 로드 (런타임/CLI env 통일)
  - `.env.example` + `.env.local` 스캐폴드 (Phase 0~5 env 전부 문서화)
  - `npm run db:migrate` 실행 → `__drizzle_migrations` + `users` + `labels` + `tasks` + `task_labels` + `rollover_logs` 6 테이블 생성 확인
- [x] **F3. 테스트 프레임워크 세팅 (Vitest + Playwright)**
  - `vitest.config.ts` + `test/unit/`, `test/integration/` (jsdom + jest-dom matcher + `vite-tsconfig-paths` 로 `@/*` alias 인식)
  - `playwright.config.ts` + `test/e2e/` (chromium 1 프로젝트, `webServer` 자동 기동, `reuseExistingServer` 로컬 최적화)
  - `npm run test` / `test:watch` / `test:e2e` / `test:e2e:ui` 스크립트 추가
  - 샘플 smoke 테스트: `test/unit/smoke.test.ts` (산술 + jsdom), `test/integration/smoke.test.ts` (Drizzle 스키마 배럴 import), `test/e2e/smoke.spec.ts` (홈페이지 200 OK)
  - tsconfig: `types: ['vitest/globals', '@testing-library/jest-dom']` + `test/**` include
  - `.gitignore` 에 `test-results/`, `playwright-report/`, `playwright/.cache/` 추가
- [x] **F4. 환경변수 Zod 검증**
  - `src/env.ts`: F4 스펙 전체 키를 Zod 스키마로 일괄 검증 — `DATABASE_URL`(postgres 스킴), `NEXTAUTH_SECRET`(32자↑), `NEXTAUTH_URL`(절대 URL), `GOOGLE_CLIENT_ID/SECRET`, `ENCRYPTION_KEY`(base64 디코드 시 정확히 32바이트 = AES-256-GCM), `CRON_SECRET`(32자↑), `NODE_ENV`
  - 모듈 최초 import 시 `parseEnv()` 로 검증, 실패 시 모든 위반 키를 한 번의 `throw Error` 메시지에 나열 → 서버 기동을 중단시켜 잘못된 설정의 조용한 시작을 차단
  - `SKIP_ENV_VALIDATION=1` / `NEXT_PHASE=phase-production-build` 플래그로 빌드/테스트 스킵 (t3-env 관행)
  - `src/db/index.ts` 의 수동 `DATABASE_URL` 가드를 `import { env } from '@/env'` 로 교체, 스타터 잔재 `src/lib/env.ts` 삭제
  - `vitest.config.ts` 에 `env: { SKIP_ENV_VALIDATION: '1' }` 추가 → 테스트에서 `parseEnv(mockedSource)` 를 직접 호출해 검증 로직만 고립 테스트
  - 테스트: `test/unit/env.test.ts` — 정상 parse, 각 키별 실패 케이스(빈 값 / 잘못된 스킴 / 짧은 시크릿 / 16바이트 ENCRYPTION_KEY / 유효치 않은 URL), 다중 키 동시 에러 메시지 집계까지 8 케이스 전부 green
- [x] **F5. 스타터 잔재 제거**
  - `src/app/smart-farm/` 디렉터리 삭제 (+ 전용 소비처였던 `src/components/sections/smart-farm/` 7개 컴포넌트 동반 삭제)
  - `src/app/page.tsx` 를 `redirect('/login')` RSC 로 교체 — Quiet Lamp 로그인 화면이 v1 의 '로그인 안내' 역할을 겸함. 인증 분기(로그인 시 `/today`)는 A1 연결 후 `auth()` 세션 체크로 확장.
  - **남은 orphan (F5 범위 외, 별도 정리 필요)**: `src/components/sections/{hero,features,cta}.tsx`, `src/components/layout/{header,footer,container}.tsx`, `src/components/navigation/{main-nav,mobile-nav}.tsx` — 이제 랜딩에서만 쓰이던 스타터 컴포넌트들. `.claude/rules/figma-design-system.md` 표에도 문서화되어 있어 **문서와 함께 일괄 제거**하는 후속 클린업 필요.

**완료 기준**: `npm run typecheck && npm run test && npm run test:e2e` 전부 통과. Supabase에 빈 테이블 5개 존재.

---

## 🔐 Phase 1: Auth (Day 2)

- [x] **A0. 로그인 화면 Quiet Lamp 재작성** 🎨 `/design-shotgun` Variant A 승인 (2026-04-18)
  - 파일: `src/components/login-form.tsx` (재작성 완료), `src/app/login/page.tsx` (래퍼 단순화)
  - 카드 chrome 제거, 중앙 정렬 max-w-[360px], 상단 sage 램프 아이콘 + Instrument Serif 44px `Todogram` 워드마크 + italic 18px 인사말
  - OAuth 우선 흐름: Google(brand-solid sage) · Apple(black-solid), 각 min-h 52px
  - 이메일은 `ㆍ이메일로 계속 ▾` disclosure 로 접힘 — 펼치면 email / password(eye toggle) / remember / 로그인 / 비번찾기
  - 기존 email validate 로직 · shadcn Input/Checkbox/Label 임시 유지 (NextAuth 연결 후 단계적 교체)
  - 스펙: `~/.gstack/projects/SHIN-HANBEEN-Todogram3/designs/login-variants-20260418/approved.json`
  - **남은 작업 (A1 에서 연결)**: OAuth 버튼 onClick 을 현재 placeholder console.log 에서 `signIn('google' | 'apple', { callbackUrl })` 로 교체
- [x] **A1. NextAuth v5 + Google Provider (readonly scope)**
  - 파일: `src/lib/auth.ts` (신규), `src/app/api/auth/[...nextauth]/route.ts` (신규), `src/components/login-form.tsx` (수정 — Google 버튼 `signIn('google')` 연결)
  - 패키지: `next-auth@5.0.0-beta.31` 설치 (Next 15 / React 19 호환).
  - Provider: `next-auth/providers/google` — `authorization.params` 에 `access_type: 'offline'` + `prompt: 'consent'` + `response_type: 'code'` + `scope: 'openid email profile https://www.googleapis.com/auth/calendar.events.readonly'` 강제. refresh_token 발급 보장.
  - 세션 전략: JWT (Drizzle Adapter 미도입 — 설계 §8-2 기반 수동 upsert 예정, A4 에서 signIn 콜백에 통합). `trustHost: true` 로 프리뷰/서버리스 호스트 검증 통과, `secret` 은 F4 검증 env 에서 주입.
  - JWT 콜백: 최초 로그인 직후 `account.access_token` / `expires_at` / `refresh_token` 을 JWT 에 복사. A2(DB 암호화 저장) · G1(만료 시 refresh) · G4(revoked 전이) 훅 포인트를 TODO 주석으로 명시.
  - Session 콜백: access/refresh token 은 세션에 절대 노출하지 않고, Phase 3 G4 용 `session.error = 'RefreshTokenError'` 플래그만 전달.
  - 타입 augmentation: `declare module 'next-auth'` + `'next-auth/jwt'` 로 `JWT.access_token/expires_at/refresh_token/error` + `Session.error` 필드 확장 (side-effect `import 'next-auth/jwt'` 필수 — 없으면 TS2664).
  - 에러 페이지: `pages.signIn = '/login'`, `pages.error = '/login'` — Quiet Lamp 화면이 에러 쿼리도 함께 처리.
  - 라우트 핸들러: `app/api/auth/[...nextauth]/route.ts` 는 `@/lib/auth` 의 `handlers` 에서 `{ GET, POST }` 재-export 만 담당. 설정은 전부 `src/lib/auth.ts` 단일 지점.
  - LoginForm: `signIn` 을 `next-auth/react` 에서 import, Google 버튼 클릭 시 `signIn('google', { callbackUrl: redirectTo })` 호출 (기본 redirect=true 로 Google OAuth URL 로 즉시 이동). Apple 버튼은 Provider 미등록이라 콘솔 경고 유지 — Apple Developer 인증서 세팅 시 별도 태스크로 활성화.
  - 검증: `npm run typecheck` · `npm run test` (11 green) · 변경 파일 ESLint · Prettier 전부 통과.
  - **남은 작업 (A2 / A3 / A4)**: JWT 콜백에 담긴 `refresh_token` 을 AES-256-GCM 암호화 후 `users.google_refresh_token` 에 저장 (A2), `/calendar` `/list` `/settings/*` 보호 미들웨어 (A3), 로그인 시 클라이언트 TZ 수집해 `users.timezone` upsert (A4).
- [x] **A2. Refresh token AES-256-GCM 암호화 저장**
  - 파일: `src/lib/crypto.ts` (신규 — `encrypt(plaintext)` / `decrypt(ciphertext)`), `src/lib/auth.ts` (수정 — JWT 콜백에서 upsert), `test/unit/crypto.test.ts` (신규 — 9 케이스)
  - 알고리즘: **AES-256-GCM** (Node `crypto`, 대칭키). IV=12바이트 randomBytes, auth tag=16바이트. 저장 포맷 = `base64(IV || AUTH_TAG || CIPHERTEXT)` 단일 문자열 → Postgres `text` 한 컬럼으로 끝.
  - 키 소스: `env.ENCRYPTION_KEY` 를 **call-time 에 lazy read** (F4 에서 이미 base64 디코드 시 32바이트 검증됨). 모듈 로드 시점이 아니라 함수 호출 시점에 읽어서 테스트의 `beforeAll(process.env 주입)` 패턴을 지원.
  - NextAuth 통합: `jwt` 콜백이 `account` 객체가 존재하는 **최초 로그인 순간** (Google 이 refresh_token 을 내려주는 유일한 순간)에 `encrypt(account.refresh_token)` 후 `users` 테이블에 upsert. `target: users.email` + `ON CONFLICT DO UPDATE` 로 재로그인 시 최신 토큰으로 교체하고 `google_auth_status` 는 항상 `'active'` 로 reset (G4 의 revoked 상태에서 재동의한 유저도 복구). `username` 은 `profile.name → token.name → email` 순 fallback (NOT NULL 제약).
  - A4 와의 경계: timezone 은 `NOT NULL DEFAULT 'Asia/Seoul'` 로 DB 가 자동 채우므로 여기서는 건드리지 않고, A4 가 클라이언트 TZ 수집 후 별도 업데이트로 덮어쓴다.
  - 테스트 커버리지: (1) round-trip 일치, (2) ciphertext 가 평문을 포함하지 않음, (3) 랜덤 IV — 같은 평문도 매번 다른 ciphertext, (4) 빈 문자열, (5) Unicode(한글/이모지) 손실 없음, (6) **GCM auth tag 무결성** — ciphertext 중간 바이트 XOR 시 throw, (7) 너무 짧은 입력 방어, (8) 16바이트 키 주입 시 throw, (9) 키 누락 시 throw. `npm run test` 20 green / typecheck / 변경 파일 ESLint / Prettier 전부 통과.
  - **남은 작업 (Phase 3 G1/G4)**: 저장된 암호화 refresh_token 을 `decrypt` 해 Google access_token 재발급에 사용 (G1), invalid_grant 응답 시 `google_auth_status = 'revoked'` 전이 (G4).
- [x] **A3. 세션 미들웨어 + 보호 라우트**
  - 파일: `src/middleware.ts` (신규), `src/lib/auth.config.ts` (신규 — Edge-safe 기본 설정 분리), `src/lib/auth.ts` (수정 — authConfig 를 spread 로 확장), `playwright.config.ts` (수정 — webServer 에 테스트 전용 env 주입), `test/e2e/middleware.spec.ts` (신규 — 5 케이스)
  - **Split Config 패턴** (authjs.dev/guides/edge-compatibility): `auth.config.ts` 에 providers/secret/trustHost/pages/session 콜백 + JWT 타입 augmentation 을 모으고, DB(`postgres`) + Node crypto 를 건드리는 `jwt` 콜백은 `auth.ts` 가 spread 로 덮어쓴다. middleware 는 절대 `@/lib/auth` 를 import 하지 않음 — 그러면 Edge 번들에 postgres 드라이버가 딸려가 런타임이 깨지기 때문.
  - Middleware 구현: `NextAuth(authConfig).auth(req)` wrapper 로 `req.auth` 를 노출하고, 세션 없으면 `new URL('/login', nextUrl.origin)` 에 `callbackUrl=<pathname+search>` 를 실어 307 리다이렉트. 307 은 메서드 보존이라 추후 POST 보호 엔드포인트 추가 시에도 안전.
  - matcher: `['/calendar/:path*', '/list/:path*', '/settings/:path*']` — `:path*` 는 "0 개 이상 세그먼트" 라 `/calendar` 자체도 포함. `/`, `/login`, `/api/auth/*` 는 matcher 에서 제외되어 미들웨어 자체가 호출되지 않음.
  - **테스트 인프라 분리**: `.env.local` 의 Phase 1+ 시크릿 채움 상태와 독립적으로 e2e 가 동작하도록 `playwright.config.ts` 의 `webServer.env` 에 `SKIP_ENV_VALIDATION=1` + 테스트 전용 `NEXTAUTH_SECRET` 더미 주입 (`vitest.config.ts` 가 이미 적용하는 F4 스킵 플래그를 e2e 로 확장). 프로덕션 시크릿과 무관.
  - E2E 커버리지 (`test/e2e/middleware.spec.ts`): (1) `/calendar` 비로그인 → `/login?callbackUrl=/calendar`, (2) `/list` 동일, (3) `/settings/labels` 중첩 경로, (4) `/settings` prefix 자체, (5) `/login` 은 matcher 제외로 통과(리다이렉트 루프 방지 회귀). 5/5 green. 전체 e2e 6/6 (smoke 포함) green. `npm run typecheck` · `npm run test` 20 green · 변경 파일 ESLint 0 에러 · Prettier pass 전부 통과.
  - **남은 작업 (A4)**: 로그인 직후 클라이언트 TZ (`Intl.DateTimeFormat().resolvedOptions().timeZone`) 를 수집해 `users.timezone` 에 최초 1회 upsert.
- [x] **A4. Timezone 수집 + users.timezone 저장**
  - 파일: `src/lib/timezone.ts` (신규 — `isValidTimeZone` 검증 + `TZ_COOKIE_NAME` / `TZ_COOKIE_MAX_AGE_SECONDS` 상수), `src/lib/auth.ts` (수정 — JWT 콜백에서 쿠키 읽어 upsert), `src/components/login-form.tsx` (수정 — Google 버튼 클릭 시 쿠키 세팅), `test/unit/timezone.test.ts` (신규 — 8 케이스)
  - **전달 경로**: 브라우저 쿠키. NextAuth v5 `signIn` 의 `authorizationParams` 는 OAuth provider 쪽 URL 파라미터라 Google 이 콜백에 그대로 돌려준다는 보장이 없고, 별도 POST 엔드포인트는 추가 왕복 + "최초 1회" 판정을 서버에서 다시 해야 해 오버엔지니어링. 쿠키는 동일 출처 OAuth 왕복 후 자동으로 콜백에 실려오므로 최소 움직임으로 달성.
  - 클라이언트 (`login-form.tsx`): Google 버튼 클릭 직전 `Intl.DateTimeFormat().resolvedOptions().timeZone` 을 `td_tz` 쿠키에 `max-age=300; SameSite=Lax; Secure(https only)` 로 저장. 쿠키 이름/TTL 은 `@/lib/timezone` 상수로 공유해 컴포넌트-서버 계약이 한 곳에서 관리됨.
  - 서버 (`auth.ts` JWT 콜백): `account` 가 존재하는 최초 로그인 순간 `next/headers` 의 `cookies()` 로 `td_tz` 를 읽고 `isValidTimeZone()` 으로 재검증(헤더 인젝션/스크립트 등 오염 차단). 검증 통과 시에만 upsert 의 `values.timezone` 에 포함. **`set` 블록에는 포함하지 않음** — 재로그인 시 기존 DB 값이 유지되어 "최초 1회" 정책을 DB 레벨에서 자연스럽게 강제. 검증 실패 시 스키마 `DEFAULT 'Asia/Seoul'` 에 맡김.
  - 검증 로직 (`timezone.ts`): 1차 문자셋 화이트리스트(`[A-Za-z0-9_/+:-]+`, 길이 ≤ 64), 2차 `new Intl.DateTimeFormat({ timeZone })` 의 RangeError 여부. `Intl.supportedValuesOf('timeZone')` 는 canonical 만 반환해 `UTC` / `Etc/UTC` 같은 정식 alias 를 놓치므로 의도적으로 사용하지 않음.
  - 테스트 커버리지: (1) 표준 대륙/도시 식별자 통과, (2) UTC/Etc 계열 alias 통과, (3) 비문자열/빈/공백/숫자/객체 거절, (4) 가짜 TZ 거절, (5) 쿠키 인젝션·스크립트 등 악성 문자셋 거절, (6) 64자 초과 거절, (7) 쿠키 이름 상수 계약 잠금, (8) TTL 범위(60~600초) 잠금. 전체 `npm run test` 28 green / `npm run typecheck` / `npx playwright test` 6 green / 변경 파일 ESLint 0 에러 / Prettier pass.
  - **남은 작업**: Settings 화면에서 사용자가 TZ 를 수동 변경하는 UI 는 v1 범위 외(Phase 4 U4 Label 관리 외 범위). v1 dogfooding 에서 자동 감지로 충분한지 검증 후 v1.5 로 판단.

**완료 기준**: Google 로그인 → users 테이블에 본인 레코드 생성 (email, timezone, 암호화된 refresh_token). 로그아웃 → 보호 라우트 접근 차단.

---

## 🗄️ Phase 2: Data Layer (Day 3)

- [x] **D1. Labels Server Actions + Zod 검증**
  - 파일: `src/actions/labels.ts` (신규 — 4 Server Actions), `src/lib/validators/labels.ts` (신규 — Zod 스키마 + 상수), `src/lib/session.ts` (신규 — `requireUserId()` 헬퍼 + `UnauthenticatedError`), `src/lib/auth.config.ts` (수정 — Session/JWT augmentation 에 `dbUserId` / `userId` 추가), `src/lib/auth.ts` (수정 — JWT 콜백이 upsert 결과 `.returning({ id })` 로 `token.userId` 채움 + stale JWT backfill), `test/unit/validators/labels.test.ts` (신규 — 50 케이스)
  - **세션 → DB userId 파이프라인**: Phase 1 의 NextAuth 는 OAuth provider id 만 알 뿐 우리 `users.id`(SERIAL) 를 모른다. D1 부터 Server Action 들이 `WHERE user_id = ?` ownership 가드를 걸어야 하므로, JWT 콜백에서 upsert 시 `.returning({ id: users.id })` 로 PK 를 받아 `token.userId` 에 박아둔다. 세션 콜백이 이를 `session.dbUserId` 로 노출 → `requireUserId()` 가 단일 진입점이 된다.
  - **`dbUserId` 키 명명 이유**: NextAuth v5 의 session callback 시그니처는 JWT/Database 전략 타입 intersection 이라 `AdapterSession.userId: string` 이 끼어든다. Session 에 `userId: number` 를 augment 하면 `userId: never` 로 collapse 해 콜백에서 대입 불가. 키를 `dbUserId` 로 분리해 충돌을 원천 차단(JWT 쪽은 교차가 없어 그대로 `userId`).
  - **Stale JWT backfill**: 기존에 발급된 토큰(= `account` 없는 후속 요청)에도 `token.userId` 가 비어있을 수 있어, JWT 콜백 마지막에 `token.email` 로 한 번 조회해 채워둔다. 정상 흐름에서는 매 요청 DB 히트가 발생하지 않고, 마이그레이션 직후 1회만 발생.
  - **Zod 스키마 (`src/lib/validators/labels.ts`)**: `createLabelInputSchema` (name trim → 1~50자 / color `^#[0-9A-Fa-f]{6}$` / googleColorId `'1'~'11' | null`, 누락 시 null 정규화), `updateLabelInputSchema` (모든 필드 optional + refine 로 빈 객체 거부; `googleColorId` 는 transform 안 걸어 `undefined` = "변경 안 함" / `null` = "매핑 해제" 의미를 보존), `labelIdSchema` (`z.coerce.number().int().positive()` — string/number 양쪽 입력 수용). 한국어 메시지로 클라이언트 폼에서 그대로 재사용 가능.
  - **Server Actions (`src/actions/labels.ts`)**: 모든 함수 첫 줄에서 `requireUserId()` 호출 → 미인증 시 `UnauthenticatedError` throw. 모든 쿼리에 `eq(labels.userId, userId)` 가드 부착 (Critical Test Gap #1 회귀 차단). `createLabel` 은 트랜잭션 안에서 `(현재 사용자 라벨 max position) + 1` 자동 채번해 동시 생성 race 안전. UNIQUE(user_id, name) 위반(Postgres `23505`) 은 한국어 친화 메시지로 변환. `updateLabel` 은 0건 매치 시 (= 없거나 타 사용자 소유) "찾을 수 없음" 단일 에러로 묶어 enumeration 공격 방지. mutation 후 `/settings/labels`, `/list`, `/calendar`, `/today` 일괄 `revalidatePath` (미생성 라우트는 Next.js 가 무시).
  - **테스트 커버리지 (50/50 green)**: `createLabelInputSchema` 18 케이스 (name trim/경계값/누락 · color 대소문자/단축형/RGBA/CSS함수/공백 거부 · googleColorId 11개 허용값 + 잘못된 7개 거부 + 누락→null/명시null 통과), `updateLabelInputSchema` 5 케이스 (부분 수정 · 빈 객체 refine · 잘못된 값 섞임 거부), `labelIdSchema` 11 케이스 (양의 정수 coerce + 0/음수/소수/문자열 거부). 정규식 자체 잠금 테스트로 향후 회귀 차단.
  - **남은 작업 (D2/D3 시점)**: 실 DB 통합 테스트(다른 user 세션으로 createLabel/listLabels/updateLabel 권한 격리 검증)는 Phase 2 - D2/D3 가 DB 인프라(트랜잭션 롤백 fixture 등) 를 세팅할 때 같은 베이스를 공유해 추가. 현재는 ownership 가드 코드 경로만 단위 검증(스키마/세션 헬퍼 분리) 으로 닫았다.
  - 검증: `npm run typecheck` ✅ · `npm run test` 78 green (28 + 50) ✅ · `npx eslint` 0 에러 ✅ · `npx prettier --write` 통과 ✅
- [x] **D2. Tasks Server Actions + Zod 검증**
  - 파일: `src/actions/tasks.ts` (신규 — 5 Server Actions), `src/lib/validators/tasks.ts` (신규 — Zod 스키마 + 상수 + 상태 전이 규칙), `test/unit/validators/tasks.test.ts` (신규 — 78 케이스)
  - **Server Actions (`src/actions/tasks.ts`)**: `listTasks` / `createTask` / `updateTask` / `toggleTaskStatus` / `deleteTask` 5종. 모든 함수 첫 줄에서 `requireUserId()` 호출 → 미인증 시 `UnauthenticatedError` throw. 모든 쿼리에 `eq(tasks.userId, userId)` ownership 가드 부착 (Critical Test Gap #1 — A 사용자가 B 의 task id 로 수정 요청 보내도 매치 0건 → "찾을 수 없음" 단일 에러, enumeration 차단). `createTask` 는 D1 과 동일하게 트랜잭션 안에서 `(현재 사용자 task max position) + 1` 자동 채번해 동시 생성 race 안전. mutation 후 `/today`, `/list`, `/calendar` 일괄 `revalidatePath` (Phase 4 까지 미생성이라 Next.js 가 조용히 무시).
  - **상태 전이 일관성 (`resolveDoneAt` 헬퍼)**: `status === 'done'` 으로 바뀌는 순간 `doneAt = new Date()`, 다른 상태로 바뀔 때 `doneAt = null`. `createTask` · `updateTask` · `toggleTaskStatus` 세 경로가 전부 같은 헬퍼를 경유해 "status=done 인데 doneAt=null" 같은 중간 상태가 절대 DB 에 남지 않도록 보장. status 미변경 update 에서는 `doneAt` 을 SET 절에서 아예 제외해 기존 완료 스탬프를 덮어쓰지 않음.
  - **Zod 스키마 (`src/lib/validators/tasks.ts`)**: `createTaskInputSchema` (title trim → 1~200자 / notes·location nullable text trim 후 빈 문자열은 null 정규화 / status enum `TASK_STATUSES` 재-export / dueAt 은 Date|ISO문자열|null union + transform 으로 Invalid Date 명시 거부 / rolloverEnabled 누락 시 true — DB DEFAULT 와 정합), `updateTaskInputSchema` (모든 필드 optional + refine 로 빈 객체 거부; nullable 필드는 `undefined` = "변경 안 함" / `null` = "값 제거" 의미를 transform 없이 보존), `toggleTaskStatusInputSchema` (status 한 필드만 — 2-상태 flip 이 아니라 "목표 상태를 명시적으로 전달" 패턴이라 `in_progress` 전이도 자연스럽게 지원), `taskIdSchema` (D1 labelIdSchema 와 동일 coerce 패턴), `listTasksInputSchema` (status / dueFrom / dueTo 선택 필터 — 전체 필터 객체 자체도 optional 이라 인자 없이 호출 가능). 한국어 메시지 톤으로 클라이언트 폼에서 그대로 재사용.
  - **dueAt 설계 결정**: `z.coerce.date()` 를 쓰지 않은 이유 — `new Date(null)` 이 1970-01-01 로 coerce 되어 "마감 없음" 의도가 통째로 사라짐. 대신 `z.union([date, string, null]).transform(...)` 로 분기해 null 은 null 그대로, 빈 문자열은 null 로 정규화, 잘못된 문자열/Invalid Date 는 `z.NEVER` 로 명시 거부.
  - **테스트 커버리지 (78/78 green)**: `createTaskInputSchema` 가 대부분 (title trim·경계값·누락, notes/location 빈문자열 정규화·max+1 거부, status 3개 허용값 + 7개 잘못된 값 거부, dueAt Date/ISO/빈문자열/null/Invalid 각 분기, rolloverEnabled 불리언 + 4개 잘못된 타입 거부, 모든 optional 필드 누락 시 DB DEFAULT 와 정합한 기본값). `updateTaskInputSchema` 는 부분 수정 3가지 + nullable 필드 undefined/null 구별 3가지 + 빈 객체 refine + 혼합 실패. `toggleTaskStatusInputSchema` · `taskIdSchema` · `listTasksInputSchema` 는 D1 동등 수준의 경계값 락.
  - **D3 와의 경계**: task_labels junction 연결은 여기서 건드리지 않는다 — D3 가 `src/actions/task-labels.ts` 에서 별도 트랜잭션으로 처리하고, 필요 시 `createTaskInputSchema` / `updateTaskInputSchema` 에 `labelIds` 필드를 추가로 확장한다. 관심사 분리로 D2 구현이 junction 스키마 변경에 묶이지 않도록 한 선택.
  - **남은 작업 (D3 / 완료 기준 보완)**: 실 DB 통합 테스트(다른 user 세션으로 요청 보내 403 확인, N+1 쿼리 로그 점검) 는 D3 가 DB 인프라(트랜잭션 롤백 fixture 등) 를 세팅할 때 같은 베이스 위에서 추가. 현재 D2 는 ownership 가드 코드 경로만 단위 검증(스키마/세션 헬퍼) 으로 닫았다.
  - 검증: `npm run typecheck` ✅ · `npm run test` 156 green (78 기존 + 78 신규) ✅ · `npx eslint` 0 에러 ✅ · `npx prettier --check` 통과 ✅
- [x] **D3. task_labels junction 작업**
  - 파일: `src/actions/task-labels.ts` (신규 — 2 Server Actions), `src/lib/validators/task-labels.ts` (신규 — Zod 스키마 + 상수), `test/unit/validators/task-labels.test.ts` (신규 — 16 케이스)
  - **Server Actions (`src/actions/task-labels.ts`)**: `setTaskLabels` / `listTasksWithLabels` 2종. 모든 함수는 `requireUserId()` 첫 줄 호출 → 미인증 시 `UnauthenticatedError` throw. mutation 후 `/today`, `/list`, `/calendar` 일괄 `revalidatePath`. D2 의 캐시 무효화 스코프와 완전히 동일 — 라벨 연결 변화도 결국 태스크 카드 시각 갱신 이벤트라서.
  - **원자 교체 패턴 (`setTaskLabels`)**: "add/remove 부분 API" 는 의도적으로 제공하지 않는다. UI(U3 편집 모달) 가 다중 선택 체크박스를 통째로 교체하는 모델이라, 부분 API 를 주면 동시 요청이 순서 의존적으로 갈라져 race condition 을 만들 여지가 생긴다. 대신 단일 트랜잭션 안에서 `DELETE FROM task_labels WHERE task_id = ?` → `INSERT (task_id, label_id)` bulk 로 통째로 교체. 빈 배열 입력은 "모든 라벨 연결 해제" 의미로 허용(DELETE 만 수행).
  - **Ownership 가드 2단계 (Critical Test Gap #1 회귀 방지)**: (1) taskId 가 현재 사용자 소유인지 트랜잭션 안에서 `SELECT id FROM tasks WHERE id=? AND user_id=?` 로 검증, (2) 요청 labelIds 가 전부 현재 사용자 소유인지 `SELECT FROM labels WHERE user_id=? AND id IN (...)` 단일 쿼리로 일괄 검증. 하나라도 어긋나면 "찾을 수 없음" 단일 에러로 묶어 enumeration 공격 차단(D1/D2 와 동일 기조). 실패한 id 만 메시지에 포함 — 본인 세션 범위 안의 정보라 노출 안전.
  - **N+1 차단 (`listTasksWithLabels`)**: Drizzle relational query `db.query.tasks.findMany({ with: { taskLabels: { with: { label: true } } } })` 로 `tasks → task_labels → labels` 를 한 번의 JOIN 세트로 로드. 클라이언트가 task 당 별도 쿼리를 날릴 수 없도록 이 한 진입점만 export. 반환 시 junction 구조를 감추고 `{ ...task, labels: Label[] }` 로 평탄화 → UI 가 `task.labels.map(...)` 로 바로 칩 렌더. listTasks 와 동일한 `listTasksInputSchema` 재사용으로 두 API 사이에 필터 payload 모양이 통일된다.
  - **Zod 스키마 (`src/lib/validators/task-labels.ts`)**: `setTaskLabelsInputSchema` 단일 — `labelIds` 배열 + `TASK_LABELS_MAX_COUNT=10` 상한 + `labelIdSchema` 재사용으로 각 원소 양의 정수 coerce + **중복 제거 transform** (`Array.from(new Set(ids))`). 중복을 사전 제거하지 않으면 junction 복합 PK 위반(23505) 으로 트랜잭션이 통째로 롤백되는 사고가 발생. `Set` 의 삽입 순서 보존 속성으로 원본 순서도 유지 → UI 칩 렌더 순서를 신뢰 가능.
  - **반환 순서 정렬**: `setTaskLabels` 는 입력 labelIds 순서대로 `Label[]` 반환 (내부에서 `Map` 으로 재정렬). UI 가 입력한 순서를 그대로 칩 배열로 사용할 수 있도록.
  - **관심사 분리 (D2 와의 경계 유지)**: `createTaskInputSchema` / `updateTaskInputSchema` 는 D3 에서 확장하지 않았다. task 생성/수정 흐름에서 라벨을 함께 연결하고 싶으면 U3 모달이 `createTask` → `setTaskLabels` 를 순차 호출한다 (두 호출 모두 각자의 트랜잭션 경계 안에서 ownership 가드를 가짐). 미래에 "원샷 API" 가 필요해지면 그 때 `setTaskLabels` 를 내부에서 호출하는 얇은 래퍼를 따로 추가하면 된다.
  - **테스트 커버리지 (16/16 green)**: `setTaskLabelsInputSchema` 를 검증 — (1) 정상 배열 통과, (2) 빈 배열 허용("모든 연결 해제" 의미), (3) 문자열 id coerce (labelIdSchema 재사용 확인), (4) 중복 제거 + 원본 순서 보존, (5) 문자열/숫자 혼합 coerce 후 중복 제거, (6) 경계값 `TASK_LABELS_MAX_COUNT` 통과, (7) 상한 초과 거부 메시지 매칭, (8) 잘못된 원소(0/음수/소수/문자/빈문자/null) 6개 거부, (9) 배열 아님 거부, (10) 필드 누락 거부, (11) null 거부. 실 DB 통합 테스트(소유권 격리 + N+1 SQL 로그 점검) 는 Phase 2 완료 기준의 통합 인프라 단계에서 같은 베이스 위에서 추가.
  - 검증: `npm run typecheck` ✅ · `npm run test` 172 green (156 기존 + 16 신규) ✅ · `npx eslint` 0 에러 ✅ · `npx prettier --write` 통과 ✅

**완료 기준**: 
- Vitest에서 CRUD round-trip 통과
- 보안 테스트: user A 세션으로 user B task id 수정 시도 → 차단 확인
- Drizzle 쿼리에 N+1 없음 (쿼리 로그 점검)

---

## 📅 Phase 3: Google Cal Read Integration (Day 4) — 와이프 Q1 Gate 🚦

여기가 와이프 gate 조건이다. 이 단계가 끝나면 v1 핵심 가치가 증명된다.

- [x] **G1. Google Cal client + 토큰 자동 갱신**
  - 파일: `src/lib/google-cal/client.ts` (신규 — `createGoogleCalClient` 순수 팩토리 + `getGoogleCalClientForUser` DB 배선 진입점 + `GoogleAuthRevokedError` 도메인 에러), `test/unit/google-cal/client.test.ts` (신규 — 9 케이스)
  - **`googleapis` 패키지 스킵 결정**: 설계 문서는 패키지 사용을 권고했지만, 실제로 필요한 것은 (1) refresh_token → access_token 재발급(RFC6749 §6) (2) Bearer 헤더 단 fetch 두 가지뿐이다. Google OAuth token endpoint 는 form-urlencoded POST 20줄로 충분하고, 3rd-party SDK 를 mocking 하느니 `fetch` 를 직접 주입해 100% 단위 테스트하는 편이 훨씬 가볍다. G2(events.list) 에서 `OAuth2Client` 가 꼭 필요해지면 그 때 같은 access_token 을 꽂아 쓴다 — access_token 은 표준 Bearer 라 SDK 와 호환된다.
  - **아키텍처 (DI 우선 설계)**: `createGoogleCalClient({ store, httpFetch?, now? })` 가 순수 함수 팩토리. `store: TokenStore` 는 (a) 캐시 조회 `getCachedAccessToken` (b) 암호화된 refresh_token 로드 `loadRefreshToken` (c) 새 토큰 저장 `saveAccessToken` (d) revoked 전이 훅 `onRevoked` 4개 메서드 인터페이스. 테스트는 mock store + mock fetch 로 전부 커버, 프로덕션은 `getGoogleCalClientForUser(userId)` 가 DB + 모듈 레벨 `Map<userId, {token,expiresAt}>` 으로 store 를 wiring 한다. Phase 3 G4 의 DB 전이 로직은 `onRevoked` 훅에 주입만 하면 끝이라 수정 scope 최소화.
  - **Access token 캐시 설계**: 모듈 스코프 `inMemoryAccessTokenCache = new Map<number, { token, expiresAt }>`. DB 컬럼 추가 없음 — access_token 은 1시간 ephemeral 이라 Vercel 서버리스 콜드스타트 때 재발급해도 문제 없고, refresh_token 만 DB 에 있으면 복구 가능. 캐시 조회 시 `expiresAt <= now + EXPIRY_SKEW_SECONDS(60)` 이면 만료로 간주하고 preemptive refresh — 네트워크 왕복 중 만료되는 경계 레이스 차단.
  - **401 자동 재시도 루프**: `client.fetch(url, init)` 가 (1) 캐시 access_token 으로 1차 호출 (2) 401 반환 시 **정확히 1번만** refresh 후 재시도 (3) 재시도도 실패면 그대로 반환. 2회 연속 401 이면 토큰 교체로 해결 불가능한 상황(권한 변경·revoke)이라 루프 대신 호출자에게 위임. `withBearerAuth()` 헬퍼가 Headers 원본을 보존하면서 Authorization 만 교체해 기존 헤더(e.g. `If-Modified-Since`) 유실 방지.
  - **`invalid_grant` → `GoogleAuthRevokedError` 전이**: refresh 응답이 400 + body.error === 'invalid_grant' 인 경우만 도메인 에러 throw. `onRevoked()` 훅은 이 에러 경로에서만 호출되고, hook 자체의 예외는 swallow(catch 후 무시) 해 원래 `GoogleAuthRevokedError` 가 묻히지 않도록 보장. 다른 원인(네트워크/500/invalid_request)은 generic `Error` 로 남겨 호출자가 재시도 정책을 결정하게 한다.
  - **테스트 커버리지 (9/9 green)**: (1) 캐시 히트 시 refresh 생략, (2) 캐시 만료 시 refresh 후 Bearer 부착, (3) 60초 skew 선제 refresh, (4) refresh 후 access_token 캐시 저장, (5) 401 → refresh → 재시도 성공, (6) 2회 연속 401 시 재시도 1회만, (7) `invalid_grant` → `GoogleAuthRevokedError` + `onRevoked` 호출, (8) `onRevoked` 자체 예외는 swallow, 원래 에러 전파, (9) 커스텀 헤더 보존 검증. `vi.fn<typeof fetch>()` 제네릭으로 mock 타입 좁혀 `as unknown as typeof fetch` 캐스팅 제거.
  - **TDD 준수**: test 먼저 작성 → `Module not found` RED 확인 → 구현으로 GREEN 전환 → prettier 정리. Red-Green-Refactor 사이클 명시적으로 수행.
  - **남은 작업 (G2/G3/G4)**: `events.list` + 페이지네이션 루프는 G2 가 `src/lib/google-cal/events.ts` 에 별도 모듈로 추가(이 클라이언트의 `fetch` 만 소비). TTL 5분 LRU + 월 네비게이션 debounce 는 G3 가 `cache.ts` 로 분리. G4 는 `getGoogleCalClientForUser` 의 `onRevoked` 훅을 `db.update(users).set({ googleAuthStatus: 'revoked' })` 로 채우기만 하면 됨 — 현재는 `TODO(G4)` 주석으로 핀 박아둔 상태.
  - 검증: `npm run typecheck` ✅ · `npm run test` 181 green (172 기존 + 9 신규) ✅ · `npx eslint` 0 에러 ✅ · `npx prettier --write` 통과 ✅
- [x] **G2. events.list fetch + 페이지네이션**
  - 파일: `src/lib/google-cal/events.ts` (신규 — `listCalendarEvents` + `GoogleCalendarEvent` 타입), `test/unit/google-cal/events.test.ts` (신규 — 11 케이스)
  - **G1 과의 관심사 분리**: 인증/토큰 refresh/401 재시도/revoked 승격은 전부 G1 의 `GoogleCalClient.fetch` 가 책임진다. G2 는 순수하게 "URL 조립 + 페이지 루프 + 응답 병합" 만 수행 — 단일 진입점 `listCalendarEvents(client, { timeMin, timeMax })` 가 전부. 클라이언트를 DI 로 받아서 단위 테스트에서는 `vi.fn` mock 으로, G3 캐시 레이어에서는 `getGoogleCalClientForUser` 결과로 바로 주입할 수 있다.
  - **엔드포인트 고정 (`/calendars/primary/events`)**: 설계 §8-3 에 따라 v1 은 로그인 계정의 primary 캘린더만 읽는다. `/users/me/calendarList` 같은 전체 캘린더 루트는 절대 호출하지 않음 — 권한 스코프(readonly events) 와 정합, API 쿼터 예측 가능. 멀티 캘린더가 필요해지면 `calendarId` 옵션을 추가하는 최소 변경으로 확장 가능.
  - **필수 쿼리 4종 고정**: `timeMin` / `timeMax` (RFC3339, `Date.toISOString()`) + `singleEvents=true` (서버 측 반복 이벤트 전개 — 클라이언트 RRULE 파서 복잡도 회피) + `maxResults=250` (페이지당 상한, Google 기본값과 동일하지만 명시해 회귀 방지). `URLSearchParams` 로 조립해 키 순서/인코딩이 안정적으로 재현되도록 함.
  - **페이지네이션 루프**: 첫 호출은 `pageToken` 없이, 이후 응답의 `nextPageToken` 을 실어 재요청. `items` 는 페이지 순서대로 `collected[]` 에 누적 (스택 오버플로 방지 위해 `push(...items)` 스프레드 대신 `for-of` 로 원소 누적). 종료 조건 두 개: (1) `nextPageToken` 부재 시 정상 종료, (2) 동일 토큰 반복 시 서버 버그로 간주해 즉시 throw — 무한 루프 + API 과금 방지. 추가 안전망으로 loop counter 10000 초과 시 abort.
  - **방어적 입력 가드**: `timeMin` / `timeMax` 가 Date 객체가 아니거나 Invalid Date 이면 네트워크로 나가지 않고 throw. `timeMin >= timeMax` 도 동일 — Google 이 어차피 400 을 돌려주지만 실수 가드를 상위에 두는 편이 호출자 입장에서 더 명확하고, mock 단위 테스트에서도 네트워크 경로 분기를 덜어준다.
  - **에러 경로 설계**: 200 이 아닌 응답은 `status + 본문 앞 200자` 를 담은 generic `Error` 로 throw — G1 이 이미 발생시키는 `GoogleAuthRevokedError` 와 "호출자가 재시도 여부를 결정할 일반 오류(5xx/403/quota)" 를 타입으로 구분하기 위함. `client.fetch` 자체가 throw 하는 `GoogleAuthRevokedError` 는 손대지 않고 그대로 전파 (G4 가 DB 전이로 이어받을 수 있도록).
  - **타입 설계 (`GoogleCalendarEvent`)**: Google API 전체 스키마를 중복 정의하지 않고, v1 에서 소비할 필드(`id`, `summary`, `start/end`, `status`, `location` 등) 만 얇게 타이핑 + `[key: string]: unknown` index signature 로 알려지지 않은 필드는 흘려보낸다. 유지보수 부담 최소화 + 실제로 꺼내 쓰는 필드만 타입 안전. start/end 는 종일 이벤트(`date`) 와 시각 지정 이벤트(`dateTime`) 가 공존해서 union 대신 옵셔널로 표현 — U1 Calendar View 가 둘 다 수용해야 하므로.
  - **테스트 커버리지 (11/11 green)**: (1) primary 엔드포인트 + 4개 필수 쿼리 정확히 전송, (2) GET + body 없음 (G1 에 auth 위임 확인), (3) nextPageToken 없는 단일 페이지는 1회만 호출 + items 그대로 반환, (4) 빈 items 정상 처리, (5) 3페이지 시나리오에서 pageToken 체인이 이어지고 전체 items 가 순서대로 병합, (6) 루프 중에도 timeMin/timeMax/singleEvents/maxResults 유지, (7) 동일 pageToken 반복 시 throw (무한 루프 가드), (8) 500 응답 시 status 포함 throw, (9) 403 응답도 동일 generic Error 로 throw (revoked 와 구분), (10) `client.fetch` 가 `GoogleAuthRevokedError` throw 시 그대로 전파, (11) `timeMin >= timeMax` 면 네트워크 안 나가고 바로 throw.
  - **TDD 준수**: test 먼저 작성 → `Failed to resolve import "@/lib/google-cal/events"` RED 확인 → 구현으로 GREEN 전환 → prettier/eslint 정리. Red-Green-Refactor 사이클 명시적으로 수행.
  - **남은 작업 (G3/G4)**: TTL 5분 LRU 캐시 + 월 네비게이션 300ms debounce 는 G3 가 `src/lib/google-cal/cache.ts` 에서 이 함수를 한 겹 래핑한다 (캐시 키 = `${userId}:${timeMin}:${timeMax}`). G4 는 `client.ts` 의 `onRevoked` 훅을 DB 업데이트(`users.google_auth_status='revoked'`) 로 채우기만 하면 끝 — `listCalendarEvents` 는 G4 가 throw 하는 `GoogleAuthRevokedError` 를 이미 투명하게 전파하도록 설계되어 있어 수정 불필요.
  - 검증: `npm run typecheck` ✅ · `npm run test` 192 green (181 기존 + 11 신규) ✅ · `npx eslint` 0 에러 ✅ · `npx prettier --check` 통과 ✅
- [x] **G3. In-memory LRU 캐시 + debounce**
  - 파일: `src/lib/google-cal/cache.ts` (신규 — `createEventCache` + `createDebouncedFetcher` + `buildEventCacheKey` + 상수 `EVENT_CACHE_TTL_MS` / `EVENT_CACHE_DEFAULT_MAX_ENTRIES` / `EVENT_DEBOUNCE_DEFAULT_MS`), `test/unit/google-cal/cache.test.ts` (신규 — 23 케이스)
  - **G1/G2 와의 관심사 분리**: 인증/토큰 refresh/401 재시도는 G1, URL 조립/페이지네이션은 G2 가 이미 책임지고 있어 G3 는 "네트워크는 끝났다고 가정" 하고 그 앞단에서 (1) 캐시 (2) debounce 만 얹는다. 두 유틸을 분리해 노출하면 호출자가 필요에 따라 조합(UI debounce → 캐시 확인 → fetch → 캐시 저장) 할 수 있다.
  - **캐시 키 직렬화 (`buildEventCacheKey`)**: `${userId}:${timeMin.toISOString()}:${timeMax.toISOString()}` 포맷. `toISOString()` 은 항상 UTC 확장 포맷이라 시계/로케일에 독립적 — 같은 순간을 가리키는 Date 는 언제나 동일 키가 되어 적중률이 안정적이다. userId 를 맨 앞에 두어 디버깅 시 prefix 로 사용자별 엔트리를 골라내기 쉽도록.
  - **LRU + TTL 구현 (`createEventCache`)**: 별도 LRU 라이브러리를 들이지 않고 `Map` 의 insertion-order 불변 사양을 활용 — `get` 적중 시 해당 키를 `delete` → `set` 재삽입해 "가장 최근" 위치로 옮기고, 용량 초과 시 `keys().next().value`(가장 오래된 키) 를 O(1) 로 축출. TTL 은 lazy 만료 — 타이머를 돌리지 않고 `get` 호출 시점에 `now() >= expiresAt` 이면 엔트리를 제거하고 null 반환. 서버리스 환경에서 백그라운드 타이머로 인한 프로세스 고정(pin) 을 피할 수 있다. 기본값: TTL 5분(설계 §8-3), maxEntries 32(1인 월 네비게이션 대표 워크로드 커버). `events` 는 set/get 양쪽에서 spread 로 방어적 복사 — 호출자가 배열을 mutate 해도 캐시가 오염되지 않는다.
  - **Debounce coalescing 의미론 (`createDebouncedFetcher`)**: "전역 debounce" — 한 인스턴스 안에서 `delayMs`(기본 300ms) 이내 연속 호출되면 **오직 마지막 load 만** 실제로 실행되고, 대기 중이던 모든 promise 는 그 최종 결과로 동일하게 resolve/reject. 월 네비게이션 UX 관점에서 정당화 — 사용자가 →→→ 로 빠르게 넘기면 중간 월은 어차피 화면에 안 보이니 fetch 할 필요가 없고, 호출자(useEffect)가 "superseded" 에러를 따로 처리하지 않아도 되도록 마지막 결과로 단일 resolution.
  - **async 오류 경로 방어**: `runLoad()` 가 **동기적으로** throw 하는 경우까지 잡기 위해 try/catch 를 감싼 뒤 promise chain. Promise chain 안에서 reject 된 에러도 동일하게 모든 대기 promise 로 전파. 타이머 fire 시점에 `latestLoad`/`pending` 을 로컬로 스냅샷한 뒤 인스턴스 상태를 초기화해 **다음 호출이 즉시 새 사이클을 시작** 할 수 있도록 — 이전 실행이 여전히 pending 이어도 새 debounce 사이클이 독립적으로 동작한다.
  - **timer DI 설계**: `setTimeoutFn` / `clearTimeoutFn` 을 옵션으로 받아 Vitest 의 글로벌 fake timer 대신 테스트가 직접 제어한 controlled timer 를 주입. 장점 — (1) 다른 테스트와의 글로벌 timer 오염 격리, (2) 정확히 어떤 시점에 `clearTimeoutFn` 이 몇 번 호출되는지 스파이 가능, (3) 테스트 병렬 실행 안전. 프로덕션 경로는 기본값(`setTimeout`/`clearTimeout`) 사용.
  - **테스트 커버리지 (23/23 green)**: (1) `buildEventCacheKey` 안정성 4 케이스 (직렬화 포맷 · 동일 입력 동일 키 · userId 격리 · 범위 차이), (2) 캐시 기본 동작 5 케이스 (미스 → null · round-trip · userId 격리 · upsert · clear/size), (3) TTL 만료 3 케이스 (정확히 경계까지 유효 · 만료 후 null · lazy 제거로 size 감소 · `EVENT_CACHE_TTL_MS === 5분` 상수 락), (4) LRU 축출 3 케이스 (가장 오래된 축출 · `get` 이 recency 갱신 · 동일 키 `set` 이 recency 리셋), (5) debounce 기본 2 케이스 (delayMs 뒤 load 실행 · reject 전파), (6) coalescing 3 케이스 (마지막 load 만 실행 · 모두 동일 reject · 타이머 fire 후 새 사이클 독립), (7) 타이머 위생 1 케이스 (이전 타이머 `clearTimeoutFn` 으로 정리 — 2/3번째 호출에서 정확히 2번 호출), (8) 상수 노출 2 케이스 (`EVENT_DEBOUNCE_DEFAULT_MS === 300` · `EVENT_CACHE_DEFAULT_MAX_ENTRIES` 양의 정수 · 8 이상).
  - **TDD 준수**: test 먼저 작성 → `Failed to resolve import "@/lib/google-cal/cache"` RED 확인 → 구현으로 GREEN 전환 → ESLint 0 에러 · Prettier pass. Red-Green-Refactor 사이클 명시적 수행.
  - **남은 작업 (G4 / U1)**: G4 에서 `revoked` 전이 시 `cache.clear()` 를 호출해 stale 이벤트가 UI 에 남지 않도록 연결. U1 Calendar View 가 이 유틸을 실제로 소비 — 월 변경 → debounced(load) → 캐시 확인 → 미스 시 `listCalendarEvents` → `cache.set` 순서로 조립.
  - 검증: `npm run typecheck` ✅ · `npm run test` 215 green (192 기존 + 23 신규) ✅ · `npx eslint` 0 에러 ✅ · `npx prettier --check` 통과 ✅
- [x] **G4. 401 revoked → user status 전이**
  - 파일: `src/lib/google-cal/client.ts` 의 `getGoogleCalClientForUser.onRevoked` 훅 확장, `test/unit/google-cal/client-user.test.ts` (신규 — 8 케이스)
  - **G1 이 남긴 훅 포인트 채우기**: G1 은 `onRevoked` 콜백 시그니처와 "invalid_grant 경로에서 정확히 한 번 호출 + 훅 자체 throw 는 swallow" 규약까지 제공했고, G4 는 그 훅 본문에 (a) `inMemoryAccessTokenCache.delete(userId)` (b) `db.update(users).set({ googleAuthStatus: 'revoked' }).where(eq(users.id, userId))` 를 붙이는 것으로 끝났다. 이미 합의된 계약을 건드리지 않고 구현체만 추가한 최소 변경.
  - **순서 결정 (캐시 → DB)**: 캐시 `delete` 를 먼저 실행해 같은 프로세스의 후속 요청이 stale access_token 으로 401→refresh 재시도 루프를 도는 것을 즉시 차단. DB 는 그 뒤 — 설령 DB 쓰기가 네트워크 문제로 지연·실패해도, 최소한 메모리 상태는 일관성을 회복해 둔다. `delete` 는 throw 불가능한 O(1) 연산이라 순서 역전으로 인한 리스크 없음.
  - **DB 실패 swallow 경계 재확인**: 원래 G1 의 `performRefresh` 가 `try { await store.onRevoked() } catch {}` 로 훅 예외를 묵음 처리하도록 이미 설계되어 있어, DB 연결이 끊겨 update 가 throw 해도 `GoogleAuthRevokedError` 는 호출자(UI)에 그대로 도달한다. "DB 에러 메시지가 사용자에게 보이면 안 된다 — 재로그인 안내가 먼저" 원칙이 전체 레이어에 걸쳐 성립. 테스트 ④ 가 바로 이 경계를 regression-lock.
  - **G3 event cache clear 는 의도적으로 여기서 하지 않음**: `createEventCache` 는 per-consumer 인스턴스라 이 모듈에서 참조 경로가 없다. 강제로 module-level singleton 으로 묶으면 (1) 멀티유저 격리 깨짐 (2) G3 의 서버리스-친화적 설계 파괴 (3) U1 이 아직 없는 상태에서 "유령 호출처" 생김 — 전부 해롭다. U1 이 `GoogleAuthRevokedError` 를 catch 하는 지점에서 자신의 캐시 인스턴스를 `cache.clear()` 하도록 조립한다. 이 의사결정을 `onRevoked` 본문 주석에 핀 박아 미래의 실수 방지.
  - **테스트 분리 이유 (별도 파일)**: 기존 `client.test.ts` 는 `createGoogleCalClient` (pure factory, DI only) 만 다루고 DB 를 전혀 건드리지 않는다. G4 는 `getGoogleCalClientForUser` (DB-wired) 를 검증해야 해서 `vi.mock('@/db', ...)` + `vi.mock('@/lib/crypto', ...)` 가 필수 — 두 파일에 섞으면 pure factory 테스트까지 stub 모듈 영향권에 끌어들인다. 새 파일 `client-user.test.ts` 로 격리.
  - **가짜 drizzle 체인 설계**: `vi.hoisted` 로 select/update 체인을 thenable-free 단순 객체로 만들어 drizzle 쿼리 빌더를 흉내낸다. `.select().from().where().limit()` 의 terminal(`limit`) 과 `.update().set().where()` 의 terminal(`where`) 만 `async` 로 처리하고 중간 단계는 동기 메서드 — 실제 drizzle 과 정확히 동일한 대기 포인트를 재현해 "await 가 어디서 실제로 일어나는가" 를 흔들지 않는다.
  - **테스트 커버리지 (8/8 green)**: 사전 조건 가드 3 케이스 — (1) userId 존재하지 않으면 "사용자를 찾을 수 없습니다" throw + update 호출 0회, (2) 이미 `googleAuthStatus='revoked'` 면 refresh 시도 없이 즉시 `GoogleAuthRevokedError` + update 호출 0회 (이미 revoked 에게 또 revoked 를 쓰는 불필요 I/O 차단), (3) `googleRefreshToken=null` 이면 `GoogleAuthRevokedError`. G4 전이 5 케이스 — (4) invalid_grant 응답 시 `update().set({ googleAuthStatus:'revoked' }).where(...)` 정확히 1회 호출 + set values 객체 검증, (5) 전이 후에도 호출자에게는 `GoogleAuthRevokedError` 인스턴스가 그대로 rejects, (6) DB update 가 throw 해도 `GoogleAuthRevokedError` 는 전파 (훅 실패 swallow 규약 re-lock), (7) 전이 후 in-memory access token 캐시가 해당 userId 기준으로 비워짐 — 다음 요청이 새 token endpoint 호출을 반드시 트리거해야 함을 행동 기반으로 검증 (내부 Map 직접 access 대신 "probe fetch 에서 token 엔드포인트 호출이 발생했는가" 로 확인), (8) 정상 refresh 성공 경로는 update 호출 0회 (revoked 는 invalid_grant 에서만 일어남을 regression-lock).
  - **TDD 준수**: 테스트 먼저 작성 → `expected 0 to be 1` RED 확인(DB update 호출 0회 = 아직 G4 구현 전) → `onRevoked` 본문에 `db.update(users).set({ googleAuthStatus:'revoked' }).where(eq(users.id,userId))` 추가로 GREEN 전환. Red-Green-Refactor 사이클 명시적으로 수행.
  - **Critical Test Gap #2 해소**: "Google 토큰 revoked 401 → status 전이" 테스트 공백이 이 작업으로 닫혔다(§Critical Test Gaps 표 참조).
  - 검증: `npm run typecheck` ✅ · `npm run test` 223 green (215 기존 + 8 신규) ✅ · `npx eslint src/lib/google-cal/client.ts test/unit/google-cal/client-user.test.ts` 0 에러 ✅ · `npx prettier --check` 통과 ✅

**완료 기준**: 로그인한 사용자의 현재 월 Google Cal 이벤트를 서버에서 가져와서 console.log로 출력 가능. 권한 해제 시뮬레이트 → DB 상태 전이.

---

## 🎨 Phase 4: UI — Views (Day 5~6)

Lane F1 (U1)과 Lane F2 (U2)는 병렬 워크트리 가능.

- [x] **U1. Calendar View (월간, merge 표시 + 3화면 drill-down)** 🚦 와이프 gate UI 🎨 `/design-html` A+B hybrid 승인 (+ C placeholder)
  - ✅ **구현 완료 (Phase 4-U1, 2026-04-19)**: Screen A (CalendarMonthGrid) + Screen B (CalendarDayDetail) 2단 drill-down. Screen C 는 U6 에서 별도 구현 — 현재 `onSelectItem` 은 no-op 로 두어 행 탭이 통과만 되도록 함.
  - **실제 파일 경로**:
    - `src/app/(app)/layout.tsx` — 인증된 라우트 그룹 쉘
    - `src/app/(app)/calendar/page.tsx` — 서버 컴포넌트: `requireUserId` → tasks/labels 조회 → G3 캐시 + G4 graceful fallback → `aggregateMonth` → `CalendarRouteClient` 주입
    - `src/app/(app)/calendar/calendar-route-client.tsx` — 클라이언트 경계: `toggleTaskStatus` 래핑 + 월 네비 헤더 + 재로그인 배너
    - `src/lib/calendar/{types,month,aggregate}.ts` — 도메인 타입 · timezone 기반 월 헬퍼 · tasks+events 병합 aggregator
    - `src/components/calendar/{calendar-viewport,calendar-month-grid,calendar-compact-grid,calendar-day-cell,calendar-day-detail,calendar-day-row,task-status-indicator,status-count-badge}.tsx`
  - **검증**: `npm run typecheck` ✅ / `npm run build` ✅ (/calendar 라우트 8.34 kB)
  - 파일: `src/app/(app)/calendar/page.tsx`, `src/app/(app)/calendar/[date]/page.tsx`, `src/components/calendar/`
  - **참조 프리뷰**: `~/.gstack/projects/SHIN-HANBEEN-Todogram3/designs/calendar-view-20260418/finalized.html` (확정 프로토타입, iterations: 4), `board.html` (A/B/C/D 비교)
  - **approved.json**: `~/.gstack/projects/SHIN-HANBEEN-Todogram3/designs/calendar-view-20260418/approved.json` — A+B hybrid, drill-down 내비게이션, 토큰 매핑
  - **finalized.json**: `~/.gstack/projects/SHIN-HANBEEN-Todogram3/designs/calendar-view-20260418/finalized.json` — refinements 로그(swipe-hint 제거 · Screen C 추가 · indexOf 버그 수정 · 2-state→3-state 전환)
  - **핵심 결정**: 3화면 drill-down. A (월 오버뷰) → 날짜 탭 → B (하루 상세, ribbon+ledger) → 행 탭 → C (아이템 상세 · Phase 4-U6 placeholder). C는 이 Phase 에서는 **뒤로가기 동작 검증용 스텁**이며 정식 구현은 U6.
  - **Screen A — CalendarMonthGrid (Classic Grid)**: 7×5 월 그리드, 셀 ~52×104px, 셀 안에 3px colored left-tick bar + 제목 inline, +N overflow, 오늘(4/18) = sage solid circle, 데스크톱 `.screen.day:hover` 오버레이는 제거됨(파란 틴트 이슈).
  - **Screen B — CalendarDayDetail (Ribbon Month + TodayRow Ledger)**: 상단 45% 압축 월 그리드(오늘/선택일 강조) + Instrument Serif date divider + 하단 55% 시간순 ledger. b-split 헤더에 3-state 미니 스워치 분포 표시 (`■1 ▓1 □2`) — 기존 `0/4` 카운터 대체.
  - **Screen C — 아이템 상세 placeholder (Phase 4-U6 예정)**: 상단 ◀ 뒤로, 대형 JetBrains Mono 시간(28px) + 이탤릭 날짜 + 대형 편집 가능 제목 + 상태 라벨 row + 라벨 칩 + 메모 영역. **이 프로토타입은 drill-down 동작 검증만 담당** — 실제 UI는 U6 에서 재설계.
  - **Task 상태 3-state 인디케이터** (U1 신규 도입, DB enum 매핑):
    - DB enum: `pending` / `in_progress` / `done` (이 문서 L228 필터 정의와 일치)
    - 시각 매핑: `pending` = 20×20 빈 사각 (border-primary 1.5px), `in_progress` = 하단 50% sage 채움 `linear-gradient(to top, var(--brand) 50%, transparent 50%)` + 진한 sage 테두리 2px + 행 배경 `color-mix(in srgb, var(--brand) 5%, transparent)` + 제목 `font-weight: 600`, `done` = 꽉 채움 sage + 흰 체크 + 제목 취소선 + 투명도 0.6.
    - 상호작용: 체크 인디케이터 탭 → `pending → in_progress → done → pending` 순환 (단일 탭, `stopPropagation` 으로 row 클릭과 분리).
    - 참조 메모리: `feedback_quiet_layer_status.md` — Quiet Layer 의 "미묘함"은 장식적 요소에만 적용, **기능적 상태 표현은 명확한 weight 구배 필수**.
  - **Task vs External Event 스펙** (approved.json DESIGN 룰 계승):
    - Todogram task: solid 3px left-tick (라벨 색), 행 클릭 → 상세(U6), 체크 인디케이터 탭 → 상태 전이
    - External Google Cal event: **2px dashed dust-blue border**, opacity 0.85, **click-disabled** (`pointer-events: none` on row, chip 만 읽기). 체크 인디케이터 공간은 `visibility: hidden` 유지.
  - **내비게이션/라우팅**:
    - Phase 4-U1 은 **단일 `/calendar` 라우트 + 내부 슬라이드**로 시작 (프로토타입과 동일: `.viewport` 가 `translateX(0 / -100% / -200%)`로 A/B/C 전환)
    - 추후 공유 URL 요구 생기면 `/calendar/[yyyy-mm]` / `/calendar/[yyyy-mm]/[dd]` 로 쪼개는 마이그레이션 가능 — v1 범위 밖.
    - 뒤로가기: `◀` 버튼 / `ESC` / touch swipe-right → C→B→A 단계적 복귀.
    - 월 네비게이션 `◀ ▶`: 300ms debounce + G3 캐시 히트 시 즉시 스왑, 미스 시 스켈레톤.
  - **컴포넌트 분해**:
    - `CalendarMonthGrid.tsx` — Screen A 월 그리드 (오버뷰·컴팩트 dual-mode, `variant: 'overview' | 'compact'`)
    - `CalendarDayCell.tsx` — 셀 내부 3px left-tick bar + 제목 + +N overflow + 오늘 circle
    - `CalendarDayDetail.tsx` — Screen B ribbon+ledger 컨테이너, `StatusCountBadge` 소비
    - `TaskStatusIndicator.tsx` — 3-state 체크 인디케이터 (U0.7 TodayRow 와 공유 — 기존 이진 체크 대체)
    - `StatusCountBadge.tsx` — `■N ▓N □N` 미니 스워치 (b-split 헤더용, TodayHeader 카운트와 다른 용도)
    - `CalendarViewport.tsx` — A/B/C 슬라이드 컨테이너 (transform 기반, `motion-reduce:transition-none`)
  - **도메인 모델 확장**: `Task.status: 'pending' | 'in_progress' | 'done'` (기존 `done: boolean` → enum 마이그레이션 필요). 프로토타입은 `todo/doing/done` 썼으나 **구현은 DB enum 직접 사용** (매퍼 없음).
  - **G3 캐시 연동**: 월 이동 시 `getMonthCache(yyyy-mm)` 우선 조회, TTL 5min LRU. 프리페치: 현재 월 렌더 완료 후 전후 월 백그라운드 fetch.
  - **G4 권한 해제 대응**: `user.google_status === 'revoked'` 이면 외부 이벤트 행 자리에 "Google 연결 끊김 — 재연결" 배너 렌더 (비침습적, ledger 상단 1회).
  - **접근성**:
    - 셀: `role="gridcell"` + `aria-label="4월 18일 토요일, 할 일 3건 완료 1건"` 형태
    - 행: `role="button"` + `aria-label` 에 상태 포함(`"회의 준비 — 진행 중"`)
    - 상태 체크: `role="button"` + `aria-pressed` + `aria-label="상태 변경: 진행 중 → 완료"`
    - 외부 이벤트: `aria-disabled="true"` + `aria-label="외부 이벤트, 클릭 불가"`
    - 월 네비 버튼: `aria-label="이전 달"` / `"다음 달"`, 키보드 ◀ ▶ 바인딩
    - `prefers-reduced-motion`: viewport 슬라이드 transition → fade 로 폴백
  - **성공 기준**:
    - 월뷰에서 같은 날 task+event 가 시간순 merge 되어 left-tick 색으로 구분됨
    - 날짜 탭 → B 슬라이드, 행 탭 → C 슬라이드, ◀/ESC/swipe-right 모두 단계적 뒤로 동작
    - 체크 인디케이터 탭 → 3-state 순환, 행 클릭과 충돌 없음(stopPropagation 검증)
    - 외부 이벤트 행은 클릭해도 내비게이션 발생 안 함(click-disabled)
    - 월 네비 300ms debounce, G3 캐시 히트 시 스켈레톤 없이 스왑
    - 모바일(≤768px)에서 콘텐츠 영역 ≥ 65% (설계 §12)
  - **Open questions (v1 구현 중 해결)**: (a) Screen B ribbon 의 "월 그리드 45%" 가 태블릿 landscape 에서도 유효한지 → 브레이크포인트 확정, (b) 상태 3-state 순환에서 `done → pending` 시 confirm 다이얼로그 필요성(기본 없음, 재탭 undo 로 충분), (c) C 진입 시 URL 해시 반영 여부(v1.5).
- [x] **U2. List View (Status Sections / Kanban-lite)** 🎨 `/design-shotgun` Variant C 승인 (2026-04-19)
  - 파일: `src/app/(app)/list/page.tsx`, `src/components/task-list/` (`task-list-view.tsx`, `status-section.tsx`, `task-row.tsx`, `search-box.tsx`, `label-filter-rail.tsx`)
  - **참조 프리뷰**: `~/.gstack/projects/SHIN-HANBEEN-Todogram3/designs/list-view-20260419/board.html`
  - **approved.json**: `~/.gstack/projects/SHIN-HANBEEN-Todogram3/designs/list-view-20260419/approved.json`
  - **전략**: 상태 필터를 섹션 구조로 승격. 3개 고정 섹션(대기 · 진행 중 · 완료), 섹션 간 드래그 = 상태 전이. 리스트 아이템은 compact row geometry 고정(섹션이 이미 밀도 구배 제공 — v1 은 단일 밀도만 지원).
  - **섹션 스펙**: 고정 순서 `pending → in_progress → done`. 기본 접힘 상태 `{pending:false, in_progress:false, done:true}`. 섹션 헤더 sticky(top: filter-rail bottom), status-dot + 한글 라벨 + 카운트(JetBrains Mono), caret rotation 180° on collapse.
  - **Row geometry** (compact 고정): `[grip 16 · check 18 · title flex · time · chip-meta]`, min-height 48px, left 3px label tick, 섹션 내부 row gap 2px, 섹션 간 gap 18px.
  - **DnD**: `@dnd-kit/sortable` + `@dnd-kit/core` 멀티 컨테이너. 같은 섹션 내 드래그 = position 재정렬, 섹션 간 드래그 = `updateTaskPosition(id, newPosition, newStatus?)` Server Action 으로 상태 전이 동시 적용. `done` 으로 이동 시 `doneAt = now()` 자동 세팅, `done` 에서 빠져나가면 `doneAt = null`.
  - **필터**: 라벨 multiselect 는 상단 sticky rail(dust-blue 는 캘린더 예약이라 제외 → 5색). 상태 필터는 UI 에서 제거됨(섹션이 대체). 라벨 + 섹션 + 검색 = **AND 합성**.
  - **검색**: title + notes ILIKE, 200ms debounce, 40px input. 검색 결과도 섹션 구조 유지(사용자 명시 요구 — "검색 결과도 대기 / 진행 중 / 완료로 구분").
  - **접근성**: 섹션 헤더 `role=button aria-expanded`, row `role=listitem`, check `role=checkbox aria-checked`, 섹션 간 드래그 `aria-live=polite` 상태 전이 안내.
  - **Open questions (v1 구현 중 해결)**: (a) 섹션 헤더 sticky 가 라벨 rail sticky 와 겹칠 때 z-index / offset, (b) `done` 섹션 접힘 상태 localStorage 영속 여부, (c) 검색 시 done 섹션 자동 펼침 여부, (d) 빈 섹션 표시 방식(숨김 vs "항목 없음"), (e) 섹션 간 드래그 중 다른 섹션이 접혀있을 때 UX.
- [x] **U3. Task 생성/편집 모달** 🎨 `/design-shotgun` Variant A · Quiet Sheet 승인 (2026-04-19)
  - 파일: `src/components/task-form/task-form-sheet.tsx`, `src/components/task-list/task-row.tsx` (onEdit 프로프 추가), `src/components/task-list/task-list-view.tsx` (모달 상태 통합)
  - **참조 프리뷰**: `~/.gstack/projects/SHIN-HANBEEN-Todogram3/designs/task-form-modal-20260419/board.html`, `variant-a-long-content.html`
  - **approved.json**: `~/.gstack/projects/SHIN-HANBEEN-Todogram3/designs/task-form-modal-20260419/approved.json`
  - **형태**: 모바일 = 바텀 시트 (rounded 24px 24px 0 0, `max-sm:items-end` ModalOverlay 기본 동작 활용), 데스크탑 = 중앙 모달 560px · max-height 85vh.
  - **스크롤 정책** (2026-04-19 사용자 리파인먼트 #1): 시트 body 단일 스크롤. title·memo 는 `overflow: hidden` + JS autosize(scrollHeight) 로 내용만큼 커짐 — 각 필드 내부 스크롤 제거. chip-row(라벨) 만 예외적으로 가로 스크롤.
  - **Title sticky 제거** (2026-04-19 사용자 리파인먼트 #2): title-wrap 은 sticky 아님 — 일반 콘텐츠처럼 body 와 함께 스크롤. 헤더(닫기/제목/저장)와 푸터(삭제)만 sticky.
  - **필드**: title (textarea rows=1 autosize, Cmd/Ctrl+Enter 저장, softLimit 120·warn 100), memo (textarea autosize, maxLength 2000·warn 1800), labels (chip-row 토글, 최대 10개), due_at (native `<input type="datetime-local">`, 지우기 버튼), rollover_enabled (토글, 기본 true), location (인라인 텍스트, 선택).
  - **폼 검증**: React Hook Form + Zod (`@hookform/resolvers/zod`). 로컬 폼 스키마 + Server Action 의 `createTaskInputSchema`/`updateTaskInputSchema`/`setTaskLabelsInputSchema` 이중 검증.
  - **Server Actions**: `createTask` / `updateTask` / `deleteTask` + `setTaskLabels` (원자 교체). 저장 시 `revalidatePath` 는 서버에서, 클라이언트는 `onSaved`/`onDeleted` 로 로컬 items 즉시 병합 → 깜빡임 최소화.
  - **키보드**: Esc = 닫기 (React Aria), Cmd/Ctrl+Enter = 저장, Cmd/Ctrl+Del = 삭제 (편집 모드).
  - **UntitledUI Modal** (`ModalOverlay` + `Modal` + `Dialog`) 재사용 — React Aria 기반으로 포커스 트랩·aria-modal·애니메이션 기본 제공.
  - **Row 탭 → 편집**: `TaskRow` 에 `onEdit` prop 추가. grip / checkbox 는 `data-no-edit="true"` 로 편집 오픈에서 제외 (closest 체크).
  - **접근성**: `aria-labelledby` 헤더 제목과 연결, 닫기/저장/삭제 버튼 터치 타겟 48px 확보, 토글 `role=switch aria-checked`, prefers-reduced-motion 준수.
  - **성공 기준**:
    - `/list` FAB → 생성 모달 · row 탭 → 편집 모달 열림
    - 저장·삭제 후 로컬 items 즉시 갱신 + `revalidatePath('/today'|'/list'|'/calendar')` 로 서버 상태 수렴
    - title / memo 에 긴 내용 입력 시 필드 내부 스크롤바 없음, 시트 body 만 한 줄 스크롤
    - title 이 스크롤 대상에 포함되어 body 와 함께 스크롤됨
    - typecheck / build 통과 (build: `/list` 246 kB)
- [x] **U4. Label 관리 화면** 🎨 `/design-shotgun` Variant C (Editor Sheet) 승인 — 2026-04-19
  - 파일: `src/app/(app)/settings/labels/page.tsx`
  - **참조 프리뷰**: `~/.gstack/projects/SHIN-HANBEEN-Todogram3/designs/settings-labels-20260419/board.html` · approved `variant-C.html`
  - **전략**: strip 리스트 + 풀높이 Editor Sheet. 시트 상단 LivePreviewBoard 로 4 variant LabelChip + TaskRow 미리보기 즉시 검증.
  - **리스트**: 52px strip row — `grid-template-columns: 20px 10px 1fr auto auto` (grip / 10px dot / name / count / chevron). 캘린더 reserved sentinel (`dust-blue` / 자물쇠 "외부" 배지) 최상단 고정, 편집 차단. grip 은 v1 에서 시각 힌트만 (DnD 미연결).
  - **에디터 시트**: `src/components/settings/label-editor-sheet.tsx` — RHF + Zod(name) · 색상은 5칸 radio grid (design slug 가 매핑되는 Google colorId 5종: Basil/Sage/Banana/Tomato/Grape). Peacock(#5A7A99)은 캘린더 reserved 와 충돌해 팔레트 제외, 나머지 5종(Lavender/Flamingo/Tangerine/Graphite/Blueberry)은 hexToLabelColor 가 매핑 못해 제외. Cmd/Ctrl+Enter 저장, Esc 닫기, 편집 모드 Sticky footer 의 삭제 버튼.
  - **라이브 프리뷰**: `src/components/settings/live-preview-board.tsx` — dot/pill/outline/pill-dot 4변형 + TaskRow mock(좌측 3px 색 틱 + 체크원 + dot chip). 시트 최상단 배치로 "색 선택 실수" 최소화 (approved.json variant-C 선정 핵심 근거).
  - **서버 조립**: `src/app/(app)/settings/labels/page.tsx` — `requireUserId()` → labels 전량 + task_labels GROUP BY count 집계 → reserved sentinel 삽입 → `LabelsSettingsContainer` 에 전달. Server Action (`createLabel`/`updateLabel`/`deleteLabel`) 이 `revalidatePath('/settings/labels')` 담당하므로 낙관적 업데이트 없이 닫고 수렴.
  - **DESIGN.md Hard Rule 준수**: dust-blue 예약 · 48px 터치 타겟(색 셀 64px) · Pretendard + JetBrains Mono(숫자/헥스) · 시맨틱 토큰 only · 컨페티/사운드 없음.
  - `npm run typecheck` 통과 · `npx eslint src/components/settings src/app/(app)/settings` 0 에러.
- [x] **U5. 모바일 퍼스트 레이아웃 + 네비게이션**
  - 파일: `src/app/(app)/layout.tsx`, `src/components/todogram/sidebar-nav.tsx`, `src/components/todogram/bottom-nav.tsx` (breakpoint/route 수정), `src/components/todogram/fab.tsx` (breakpoint 수정), `src/app/(app)/calendar/calendar-route-client.tsx` (h-dvh 조정).
  - **성공 기준**: 모바일에서 콘텐츠 영역 ≥ 65% (DESIGN.md §12) — (app) 셸이 flex row 지만 SidebarNav 는 `hidden lg:flex` 라 모바일에서는 main 이 100% 차지.
  - **구조**: `<AppShell flex min-h-dvh> [SidebarNav(lg+만)] [main flex-1] [BottomNav(fixed, lg:hidden)] </AppShell>` — 모바일/태블릿은 BottomNav + 100% main, 데스크탑(1024px+) 은 240px Sidebar + 나머지 main.
  - **BottomNav 수정**: (1) `md:hidden` → `lg:hidden` (DESIGN.md §6 태블릿은 단일 컬럼 유지 → BottomNav 공유). (2) Labels 탭 href `/labels` → `/settings/labels` (U4 실제 라우트 반영). (3) 활성 판별을 `matchTab(startsWith)` → `matchBestTab(longest-prefix-wins)` 로 교체 — `/settings/labels` 방문 시 Labels 탭만 활성, Settings 탭은 비활성.
  - **Fab 수정**: `md:hidden` → `lg:hidden` (BottomNav 와 브레이크포인트 동기화).
  - **SidebarNav (신규)**: 240px 고정폭 · `sticky top-0 h-dvh` · 동일한 4탭 · 활성 시 왼쪽 2px sage 바(BottomNav underline 과 시각 대응) + `font-semibold` + sage 텍스트 · Instrument Serif 워드마크 "Todogram" 상단 고정 · 탭 높이 44px (데스크탑 포인터 기준).
  - **캘린더 겹침 해결**: `calendar-route-client.tsx` 루트를 `h-dvh` → `h-[calc(100dvh-72px)] lg:h-dvh` 로 변경 — 모바일/태블릿에서 BottomNav(72px) 위로만 drill-down 영역이 차지하게 제한.
  - `npm run typecheck` · `npm run build` 통과, U5 관련 파일 lint 추가 경고 0.
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
- [x] **U0.7. Today View 스크린 (Unified Ledger Layout)** 🎨 `/design-shotgun` D refined v3 승인
  - 파일: `src/components/todogram/today-view.tsx`, `today-row.tsx`, `filter-rail.tsx`, `rollover-banner.tsx`, `labels.ts`
  - ✅ **구현 완료 (2026-04-19, 커밋 `a7b8fb1`)**: 5개 파일 모두 approved.json spec 대로 구현.
    - `today-view.tsx` — TodayHeader → FilterRail → RolloverBanner? → stream(+Fab) 조합. 내부 `matchesFilter` 로 activeFilter 기반 필터링, `useMemo` 로 `buildTodayStream` 재계산 최소화. `role="tabpanel"` + `aria-labelledby`로 TodayHeader tablist 와 연결.
    - `today-row.tsx` — mine/ext 통합 geometry([time 56 · check 18 · title flex · chip auto], min-h 56px, `border-l-[3px]` + `rounded-r-md`). ext 는 `invisible` 체크박스 + `text-secondary` 제목으로만 구분. `borderLeftColorClass` 로 Tailwind v4 `border-l-label-*` 토큰 매핑. `TodayRowDivider` 는 `flex:0 0 1px` + `min-h-px` + `ml-[3px]` 로 flex-shrink collapse 방지. `buildTodayStream` 헬퍼로 divider-row 번갈음 flatMap 패턴 캡슐화.
    - `filter-rail.tsx` — sticky top-0 z-5 · `overflow-x-auto` + scrollbar 숨김 · `role="tablist"` + 칩별 `role="tab" aria-selected` + `aria-controls=panelId`. `buildDefaultFilterItems` 로 [전체 → 캘린더(reserved dust-blue) → 사용자 라벨] 순 자동 조립. 44px 터치 타겟 + focus-visible 링.
    - `rollover-banner.tsx` — count ≤ 0 시 null 반환. amber tick + `bg-label-amber-bg` · `role="status" aria-live="polite"` · 유지(outline sage) / 보관(ghost) 2 액션 · 선택적 X 닫기. `motion-safe:animate-in fade-in duration-[400ms]` (DESIGN §7).
    - `labels.ts` — `CALENDAR_LABEL_ID='calendar'`, `FILTER_ALL='all'`, `LABEL_COLOR_MAP`(calendar→dust-blue, personal→plum 재배정), `DEFAULT_USER_LABEL_PRESET`(직장 sage · 가정 terracotta · 학습 amber · 개인 plum), `USER_LABEL_PALETTE`(dust-blue 제외 5색), `getLabelColor`/`hexToLabelColor` 헬퍼.
  - **검증**: `npm run typecheck` 통과. todogram/* 파일군 lint 경고 0. 페이지 라우트 연결(`/today`) 은 Phase 4 후속 U1~U3 서버 데이터 연동 시 함께 처리 예정(컴포넌트는 presenter-only).
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
> **U6 (TaskCard 듀얼 뷰) + U7 (뷰 밀도 토글) 삭제 — 2026-04-19**
>
> 사유: U0.7 Today View 는 "통합 row ledger" 로, U2 List View 는 "섹션 구조 + compact row 고정" 으로 확정되어
> v1 에서 `TaskCard` 컴포넌트를 실제로 렌더할 지점이 사라짐. Calendar Screen C 는 별도 "아이템 상세"
> 화면으로 듀얼 뷰 스펙이 아님. 따라서 U6 이 dead 가 되고, U6 의 variant 전환 스위치인 U7 도
> 함께 dead. 관련 DB 컬럼(`users.task_card_style`) 과 ENUM 도 같이 제거함 (Phase 0 F1).
> 밀도 선택지가 필요해지면 v1.5 에서 재도입한다.

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
| 2 | Google 토큰 revoked 401 → status 전이 | G4 | - [x] |
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
