# Todogram v2 Design Doc

> **생성일**: 2026-04-13
> **세션**: `/office-hours` (Startup mode)
> **상태**: `APPROVED`
> **브랜치**: `main`
> **프로젝트**: TodoGram3 (`C:\C-Projects\TodoGram3`)
> **이전 문서**: `docs/TODO_APP_FUNCTIONAL_SPEC.md` (v1 기능 명세, 2026-03-04)

---

## 1. 제품 정의 (Problem Statement)

**Todogram v2**는 "또 하나의 Todo 앱"이 아니다.
**사용자가 이미 사용 중인 캘린더(Google Calendar) 위에 얹는 얇은 레이어**로, 다음 세 가지 문제를 해결한다.

1. **완료하지 못한 할 일이 매일 손실되는 문제** — 기존 캘린더는 "이벤트"만 알고 "할 일의 미완료 상태"를 모른다.
2. **다중 역할(직장/가정)의 컨텍스트가 뒤섞이는 문제** — 같은 캘린더 안에 모든 역할이 평면적으로 나열된다.
3. **기존 캘린더 앱의 모바일 UX가 할 일 관리에는 부적합한 문제** — 캘린더는 "보는" 도구이지 "처리하는" 도구가 아니다.

v2의 본질: **"이사시키지 않고, 기존 도구를 덜 멍청하게 만든다."**

---

## 2. 수요 증거 (Demand Evidence)

### 2-1. Primary (강한 신호)
- **본인**: v1 Todogram 개발자이자 유일한 데일리 유저. "라벨로 역할 전환" 기능을 직접 설계하고 사용 중이며 가장 유용하다고 명시.
- **와이프 (가장 중요한 실사용자 피드백)**:
  - v1 한 번 시도 후 **이사 부담**을 이유로 사용 포기 ("선뜻 완전히 넘어오는게 부담스러워 보이더라고").
  - 명시적으로 원했던 기능: **"일정을 못 지키면 자동으로 다음 날로 미뤄지는 기능"** (= auto-rollover).
  - 핵심 발견: **v1은 이 기능을 이미 구현했지만 와이프의 캘린더(Apple Cal) 위에서 작동하지 않아 가치 전달에 실패했다.**

### 2-2. Eureka
> **"당신의 제품 직관은 정확했다. 실행이 잘못된 레이어에서 일어났다."**
>
> v1은 올바른 문제를 풀었지만 사용자가 떠날 수 없는 "그들의 캘린더"에서 작동하지 않았다. v2는 같은 기능을 **올바른 레이어**로 이식하는 것이다. 이것은 피벗이 아니라 레이어 이동이다.

### 2-3. 시장 신호 (참조)
- **Sunsama** (~$20/월): Google Cal 위에 "일일 계획" 레이어 — 수백만 ARR
- **Motion** (~$19/월): Google Cal 위에 AI 자동 스케줄링 레이어
- **Reclaim.ai** (~$8/월): Google Cal 위에 "smart time block" 레이어

세 제품 모두 "캘린더를 대체하지 않고 위에 얹는다"는 전략으로 수익화에 성공. 시장은 존재.

---

## 3. 현재 상태 (Status Quo)

### 3-1. 타겟 사용자의 현재 워크플로우
- **본인**: 삼성 폰 → 삼성 캘린더 앱 (내부적으로 Google Calendar 데이터).
- **와이프**: iPhone → Apple 캘린더 (iCloud 데이터).
- 둘 다 기존 캘린더에 수개월~수년치 일정이 누적되어 있어 이사 불가능.

### 3-2. 현재 워크플로우의 고통
- 미완료 할 일이 어제 날짜에 방치됨 → 며칠 뒤 스크롤하다 발견 → 수동으로 오늘로 복사/이동
- 직장/가정 할 일이 한 화면에 섞여 있어 "지금 이 순간 어떤 역할 모드인가"를 유저 머리로 관리해야 함
- Google Cal/Apple Cal 모두 모바일에서 "할 일 체크리스트" 느낌이 나쁨 — 체크박스, 라벨, 드래그 정렬 등 할 일 전용 UX 부재

### 3-3. 진짜 경쟁자
**다른 Todo 앱이 아니라 "이미 쌓인 데이터"이다.** 새 앱의 기능 우수성은 데이터 중력(data gravity) 앞에서 의미가 없다.

---

## 4. 타겟 사용자 & 가장 좁은 웨지 (Narrowest Wedge)

### 4-1. v1 (narrowest wedge)
- **유일한 검증 사용자**: 본인 (Android/Samsung + Google Calendar).
- **성공 기준**: 한 달 동안 매일 Todogram을 Samsung 캘린더 기본 앱보다 먼저 연다.
- **검증 목표**: "auto-rollover + 라벨 + 모바일 UX가 기존 캘린더 경험을 유의미하게 개선한다"는 thesis의 실존 증명.

### 4-2. v2 (두 번째 사용자)
- **목표 사용자**: 와이프 (iOS + Apple Calendar).
- **기술 확장**: iCloud CalDAV 지원 추가.
- **성공 기준**: 와이프가 자발적으로 매일 사용. 요청받지 않아도 연다.

### 4-3. v3+ (시장 확장)
- **세그먼트**: "크로스 에코시스템 가정" — 안드로이드 남편 + iOS 아내 (또는 반대). 공유 가족 캘린더 기능 추가.
- **수익화**: Sunsama 스타일 월 구독 (예: 개인 $5/월, 가족 $9/월).
- **차별화 메시지**: *"부부가 서로 다른 폰을 써도 같이 쓸 수 있는 유일한 캘린더 레이어."*

---

## 5. 제약 조건 (Constraints)

- **스택**: 이미 셋업된 Next.js 15.5.3 + React 19 + UntitledUI 유지 (재작성 없음)
- **개발 리소스**: 1인 개발 (본인), CC+gstack 활용
- **예산**: Google Calendar API 무료 티어 내, 호스팅 최소 비용
- **시간**: v1 출시 목표 4~5주 (human 기준) / 7~10일 (CC+gstack 집중 기준)
- **개인정보**: 사용자 캘린더 데이터 서버 저장 최소화 (Google event_id + 최소 metadata만)

---

## 6. 전제 (Premises) — 사용자 확정됨

| # | 전제 | 상태 |
|---|---|---|
| P1 | Todogram v2는 독립 Todo 앱이 아니라 기존 캘린더 위에 얹는 레이어다. 사용자는 이사하지 않는다. | ✅ 확정 |
| P2 | v1의 유일한 검증 사용자는 본인. 와이프 확보는 v2 목표. | ✅ 확정 |
| P3 | v1 기술 스택은 Next.js 15 Web PWA + Google Calendar API. Native 개발 없음. | ✅ 확정 |
| P4 | 킬러 기능은 Auto-rollover + 라벨. 그 외(대시보드, 공유 등)는 v1 제외. | ✅ 확정 |
| P5 | "성공"은 본인이 한 달 동안 매일 Todogram을 Google Cal 기본 앱보다 먼저 여는 것. | ✅ 확정 |
| P6 | Todogram은 기존 캘린더 이벤트를 **read-only로 표시**한다. Todogram task는 별도 엔티티로 그 위에 얹힌다. | ✅ 확정 (2026-04-14 인터뷰) |
| P7 | v1 범위는 layer + task + 라벨 + auto-rollover. archive/대시보드는 v1.5, AI 기능은 v2로 편입한다. | ✅ 확정 (2026-04-14 인터뷰) |

---

## 7. 검토한 접근 방식 (Approaches Considered)

### Approach A: 독립 앱으로 재건 (REJECTED)
- Google Cal 통합 없이 v1 Todogram을 모바일 UX만 고쳐서 재건
- **완성도**: 6/10
- **Rejected reason**: P1을 위반. 데이터 중력 문제를 하나도 해결하지 못함.

### Approach B': Read-first 캘린더 레이어 + Todogram task ✅ CHOSEN (2026-04-14 수정)
- 자체 DB가 source of truth (Todogram task에 한해), **기존 캘린더 이벤트는 read-only로 fetch하여 표시**
- Google Cal 쓰기는 **옵션 (기본 OFF)**. 사용자가 토글해야 `calendar.events` scope 재요청
- **완성도**: 9/10
- **변경 이유**: 2026-04-14 와이프 인터뷰에서 "기존 일정이 Todogram에서 안 보이면 안 쓴다"가 명확한 gate로 확인됨. 기존 B안(write-only, read 없음)은 이 gate를 통과하지 못함. §13.5 참조.
- **상세**: 아래 §8 참조

### Approach B: 단방향 write-to-Calendar 하이브리드 (DEPRECATED 2026-04-14)
- 자체 DB가 source of truth, Google Cal에는 write-only, 기존 이벤트 read 없음
- **Deprecated reason**: 와이프의 gate 조건(기존 이벤트 가시성)을 충족 못함. 상세는 §13.5.

### Approach C: 완전 bidirectional Calendar 레이어 (DEFERRED TO v3)
- Google Cal이 canonical, 양방향 sync
- **완성도**: 10/10
- **Deferred reason**: v1에는 과도. Bidirectional sync는 분산 시스템 난제. 3개월+ 소요로 조기 사망 위험.

---

## 8. 추천 접근 (Recommended Approach): Approach B' 상세

### 8-1. 핵심 원칙
1. **Todogram 자체 DB가 source of truth (Todogram task에 한해서)**. 모든 Todogram task의 진짜 상태는 여기에 있다.
2. **기존 캘린더 이벤트는 read-only로 fetch + 표시**. Google Cal에서 `events.list`로 불러와 Todogram UI에서 함께 보여준다. **절대 수정/삭제하지 않는다.**
3. **Todogram task는 별도 엔티티**. 기존 캘린더 이벤트와 독립적으로 생성/관리되며, 시각적으로 구분된다 (색상/아이콘/border 스타일).
4. **Google Cal 쓰기는 옵션 (기본 OFF)**. 사용자가 토글하면 Todogram task 생성 시 **전용 "Todogram" 서브캘린더**에만 events.insert. 사용자의 primary 캘린더는 절대 건드리지 않는다.
5. **Sync 충돌 회피**. Todogram이 건드리는 건 자신이 만든 이벤트뿐. 사용자 기존 이벤트는 읽기만 한다.
6. **Auto-rollover는 Todogram task에만 적용**. 기존 캘린더 이벤트는 이월 대상이 아니다.

### 8-2. 데이터 모델 (초안)

```sql
-- 사용자 (기존 v1 auth 재활용)
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  username      TEXT NOT NULL,
  google_refresh_token TEXT,  -- OAuth 토큰 (암호화 저장)
  google_calendar_id   TEXT,  -- 'primary' 또는 전용 캘린더 ID
  default_rollover     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 라벨 (기존 v1 스키마 재활용)
CREATE TABLE labels (
  id            SERIAL PRIMARY KEY,
  user_id       INT REFERENCES users(id),
  name          TEXT NOT NULL,          -- 예: '직장', '가정'
  color         TEXT NOT NULL,          -- '#RRGGBB' (UI 표시용)
  google_color_id TEXT,                 -- '1'~'11' (Google Cal colorId 매핑)
  position      INT NOT NULL,
  UNIQUE(user_id, name)
);

-- 할 일 (task)
CREATE TABLE tasks (
  id              SERIAL PRIMARY KEY,
  user_id         INT REFERENCES users(id),
  title           TEXT NOT NULL,
  notes           TEXT,
  location        TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | in_progress | done
  due_at          TIMESTAMPTZ,
  rollover_enabled BOOLEAN DEFAULT true,
  position        INT NOT NULL,              -- 리스트 정렬용
  google_event_id TEXT,                      -- Google Cal 이벤트 ID (nullable)
  google_synced_at TIMESTAMPTZ,              -- 마지막 sync 시각
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  done_at         TIMESTAMPTZ
);

CREATE INDEX idx_tasks_user_due ON tasks(user_id, due_at);
CREATE INDEX idx_tasks_rollover ON tasks(user_id, status, rollover_enabled, due_at)
  WHERE status != 'done' AND rollover_enabled = true;

-- 할 일 ↔ 라벨 (다대다)
CREATE TABLE task_labels (
  task_id  INT REFERENCES tasks(id) ON DELETE CASCADE,
  label_id INT REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, label_id)
);

-- 자동 이월 로그 (중복 실행 방지)
CREATE TABLE rollover_logs (
  task_id    INT REFERENCES tasks(id) ON DELETE CASCADE,
  rolled_at  DATE NOT NULL,
  PRIMARY KEY (task_id, rolled_at)
);
```

### 8-3. 동기화 규칙 (Sync Rules)

#### Read (v1 필수 — 와이프 gate 조건)

사용자의 기존 Google Cal 이벤트를 불러와 Todogram UI에서 표시한다. **읽기만 한다. 건드리지 않는다.**

| Todogram 동작 | Google Cal 액션 |
|---|---|
| 사용자가 Calendar View 진입 | `events.list` — 현재 뷰 범위(월/주)의 모든 이벤트 fetch |
| 포커스된 날짜/뷰 범위 변경 | `events.list` — 새 범위 fetch (in-memory 캐시 우선) |
| 백그라운드 refresh (옵션) | 5분마다 현재 뷰 범위 재fetch |

- Fetched 이벤트는 Todogram UI에서 **"외부 캘린더 이벤트"** 로 구분 표시 (border 스타일, 아이콘, 투명도 등으로 Todogram task와 시각적 차별화)
- 캐싱: v1은 세션 내 in-memory 캐시로 단순하게 시작. DB 캐시는 v1.5 이후 성능 문제 발생 시 검토
- 범위 제한: `events.list` 호출 시 `timeMin`/`timeMax`로 현재 뷰 범위만 요청 (전체 캘린더 fetch 금지)
- 반복 이벤트: Google Cal의 recurrence rule 그대로 존중. Todogram은 expand만 하고 저장하지 않는다.

#### Write (v1 옵션, 기본 OFF)

사용자가 설정에서 "Google Cal에도 쓰기" 토글을 켠 경우에만 적용. 토글 ON 시 추가 OAuth scope(`calendar.events`) 재요청 필요.

**쓰기 대상은 전용 "Todogram" 서브캘린더 뿐.** 사용자의 primary 캘린더나 기존 이벤트에는 절대 쓰지 않는다. 토글 최초 ON 시 `calendars.insert`로 Todogram 서브캘린더 자동 생성.

| Todogram 이벤트 | Google Cal 액션 |
|---|---|
| Task 생성 | `events.insert` (전용 서브캘린더) — 제목 = task.title, 시작/종료 = due_at, 색상 = label.google_color_id |
| Task 제목/시간/장소 수정 | `events.patch` — 해당 필드만 |
| Task 상태 → done | `events.patch` — 제목 앞에 `✓ ` 접두사 + 회색(colorId='8') |
| Task 상태 → pending/in_progress (done 취소) | `events.patch` — `✓ ` 제거 + 원래 색상 복원 |
| Task 삭제 | `events.delete` |
| Auto-rollover 실행 | `events.patch` — start/end를 다음 날로 이동 |

#### 공통 주의사항

- Google API 호출은 **비동기 백그라운드 queue**로 처리. UI 블로킹 금지.
- API 실패 시 자체 DB는 성공 상태 유지. `google_synced_at`이 stale하면 재시도 cron.
- Rate limit: Google Calendar API는 사용자당 분당 600 queries. Read는 캐싱으로, Write는 배치로 처리.
- **원칙**: Todogram은 자기가 만든 이벤트만 관리한다. 사용자 기존 이벤트는 건드리지 않는다.

### 8-4. Auto-rollover Cron 로직

```
매일 00:05 (사용자 timezone 기준) 실행:
1. user_id별로 돌며
2. SELECT tasks WHERE status != 'done' AND rollover_enabled = true AND due_at < today_start
3. 각 task에 대해:
   a. 오늘로 due_at 업데이트 (시간은 유지)
   b. rollover_logs에 (task_id, today) 삽입 — 중복 방지
   c. Google Cal events.patch 호출
   d. 실패 시 google_synced_at = NULL로 표시하고 다음 싸이클에 재시도
```

### 8-5. 라벨 ↔ Google Cal 색상 매핑

Google Cal 이벤트 색상은 **11개 고정**(colorId 1~11). 라벨이 11개 초과 시:
- 처음 11개는 직접 매핑
- 12번째부터는 라벨 이름을 이벤트 제목 앞에 `[라벨명] ` 형태로 prefix

v1은 라벨 5~6개 내외일 것으로 예상되어 색상 매핑만으로 충분.

### 8-6. 버전별 기능 범위

#### ✅ v1 (core — 4~6주)

와이프의 gate 조건(Q1/Q2)을 충족하는 최소 세트. 본인 dogfooding 1개월 목표.

- [ ] Google OAuth 로그인 (`calendar.events.readonly` scope)
- [ ] **기존 Google Cal 이벤트 read-only 표시** (Calendar View에서 merge) ← 와이프 Q1 gate
- [ ] Todogram task 생성/수정/삭제 (모바일 퍼스트 재설계)
- [ ] 라벨 생성/수정/할당 ← 와이프 Q2 gate
- [ ] Auto-rollover (본인 timezone 기준 자정 cron, Todogram task만)
- [ ] List View (드래그 정렬 + 검색 + 상태/라벨 필터)
- [ ] Calendar View (월간, 기존 이벤트 + Todogram task 시각적 구분)
- [ ] Google Cal 쓰기 토글 (기본 OFF. 켜면 `calendar.events` scope 재요청 + 전용 서브캘린더 자동 생성)
- [ ] Dark mode + 한국어
- [ ] PWA 설치 가능

#### ✅ v1.5 (archive — +1~2주)

v1 dogfooding으로 task 데이터가 쌓인 뒤 archive 가치를 확인하는 단계. 와이프 Q3의 "대시보드" 요구를 해소.

- [ ] 완료 task 아카이브 뷰 (라벨별, 시간별 필터)
- [ ] 오늘/이번 주 대시보드 (완료율, 라벨별 분포, 진행 중 항목)
- [ ] 라벨별 누적 통계

#### ✅ v2 (AI + 와이프 onboarding — +4~5주)

Archive에 최소 1~2개월치 데이터가 쌓인 뒤 진입. 와이프 Q3의 AI 요구들을 해소. 와이프 onboarding gate.

- [ ] AI 주간/월간 요약 (Anthropic Claude API, Todogram task 기록 대상)
- [ ] 자연어 검색 ("그 업무 언제였지?") — Todogram task + notes 대상
- [ ] 이직서 draft 생성 (Todogram task history → Claude 요약 → resume bullet 초안)
- [ ] **iCloud CalDAV read 지원** — 와이프 Apple 캘린더 이벤트 표시 (와이프 onboarding 필수)
- [ ] Google OAuth app verification 제출

#### ❌ 전 버전 공통 제외 (YAGNI)

- 댓글 기능 (혼자/부부만 쓰는 앱)
- 공유/협업
- 푸시 알림 (Google Cal 자체 알림 활용)
- 개선요청 피드백 시스템
- 다국어 (한국어만)
- **Bidirectional sync (사용자 기존 이벤트에 쓰기) — 영구 제외.** 충돌 해결 지옥 회피 원칙.

---

## 9. 기술 아키텍처

```
┌─────────────────────────┐
│   Next.js 15 (App Router)│
│   React 19 + UntitledUI  │
│   TailwindCSS v4         │
└────────┬─────────────────┘
         │ Server Actions
         ↓
┌─────────────────────────┐      ┌──────────────────┐
│   API Routes             │─────→│  Google Cal API  │
│   /api/auth  (NextAuth)  │      │  (write-only)    │
│   /api/tasks             │      └──────────────────┘
│   /api/labels            │
│   /api/rollover-cron     │
└────────┬─────────────────┘
         │
         ↓
┌─────────────────────────┐
│   PostgreSQL (Supabase   │
│   또는 Neon 무료 티어)    │
└─────────────────────────┘
         ↑
         │
┌─────────────────────────┐
│   Cron (Vercel Cron      │
│   또는 GitHub Actions)   │
│   매일 00:05 rollover    │
└─────────────────────────┘
```

**권장 기술 선택**
- **Auth**: NextAuth.js (Google Provider) — OAuth refresh token 처리가 내장
- **DB**: Supabase (무료 티어로 v1 충분, Postgres 호환)
- **ORM**: Drizzle ORM (TypeScript-first, Next.js 친화적)
- **Cron**: Vercel Cron Jobs (무료 플랜 1개 cron 가능) 또는 GitHub Actions schedule
- **Forms**: 기존 스타터 포함된 React Hook Form + Zod
- **Background jobs**: 초기엔 단순 DB 큐, 규모 커지면 BullMQ 또는 Trigger.dev

---

## 10. 배포 계획 (Distribution Plan)

- **배포 플랫폼**: Vercel (무료 티어 v1 충분)
- **도메인**: 초기 `todogram.vercel.app` → v2에서 커스텀 도메인 검토
- **환경변수**: Google OAuth Client ID/Secret, NextAuth Secret, DB URL, Cron Secret
- **CI/CD**: GitHub → Vercel 자동 배포 (main 브랜치 push 시)
- **Google OAuth 앱 상태**: v1은 **unverified** (100 user 한도 내 본인만 사용). v2 시작 시 verification 제출.

---

## 11. 종속성 & 선행 과제 (Dependencies)

### 선행 필수
1. **Google Cloud Console 프로젝트 생성**
   - OAuth consent screen 설정 (내부용으로 일단 구성)
   - `calendar.events.readonly` scope 추가 (v1 core — 읽기 전용)
   - (옵션) `calendar.events` scope 추가 예약 — 사용자가 "Google Cal에도 쓰기" 토글 ON 시 incremental auth로 재요청
   - OAuth Client ID 발급 (Web application type)
2. **DB 환경 구성**
   - Supabase 프로젝트 생성 + 스키마 마이그레이션 (Drizzle)
3. **NextAuth.js 설정**
   - Google Provider 연결 + refresh token persistence

### v2 진입 시 추가 필요
1. **Google OAuth App Verification 제출** (2~6주 소요)
   - 개인정보 처리방침 URL 필요
   - 데모 영상 녹화
   - 보안 검토 응답
2. **iCloud CalDAV 연동 조사** (Approach C 이전 단계)

---

## 12. 성공 지표 (Success Criteria)

### v1 (MVP, ~5주)
- ✅ **정량**: 본인이 30일 연속 매일 앱 오픈 (앱 분석 이벤트)
- ✅ **정성**: "Samsung 캘린더 앱을 여는 빈도가 절반 이하로 줄었다"고 본인이 진술 가능
- ✅ **Sync 품질**: Auto-rollover 실행된 task 중 Google Cal 반영 실패율 < 1%
- ✅ **UX**: 모바일 화면에서 캘린더 뷰의 컨텐츠 영역이 화면의 65% 이상 차지 (v1 실패 반복 방지)

### v2 (와이프 확보, ~5주 추가)
- ✅ **정량**: 와이프가 30일 중 20일 이상 앱 오픈
- ✅ **정성**: 와이프가 "Apple 캘린더 대신 이걸 먼저 연다"고 진술
- ⚠️ 와이프가 안 쓰면 v2 thesis 재검토 (자존심 버리고 인터뷰 진행)

### v3 (시장 진입)
- 외부 사용자 10명 유료 전환 시 → 진짜 제품-시장 적합성 탐색 시작

---

## 13. 열린 질문 (Open Questions)

1. **Google OAuth scope**: `calendar.events` (이벤트 단위) vs `calendar` (전체 캘린더). 보수적으로 `events`만 요청.
2. ~~**전용 캘린더 vs primary 캘린더**~~ → **✅ 확정 (2026-04-14)**: Google Cal 쓰기 토글이 ON일 때 Todogram은 **전용 "Todogram" 서브캘린더**에만 쓴다. 이유: (1) Todogram이 만든 이벤트와 사용자 기존 이벤트를 완전 분리, (2) 사용자가 Samsung/Apple 캘린더 앱에서 on/off 토글 가능, (3) read 시에도 Todogram 서브캘린더 = "내부 소스"로 구분 가능, (4) 사용자의 primary 캘린더를 절대 건드리지 않는다는 원칙 준수.
3. **Timezone 처리**: 사용자 timezone을 어떻게 수집하고 저장할지. NextAuth 로그인 시 브라우저 timezone 수집해 DB에 저장하는 게 합리적.
4. **Offline PWA**: v1에서 오프라인 편집 지원할지? → **v1 제외.** 단순 온라인 전제로 시작.
5. **로그아웃 시 Google Cal 이벤트 처리**: 삭제할지, 유지할지? → **유지 권장.** 사용자 데이터는 건드리지 않는다는 원칙.

---

## 13.5. 와이프 인터뷰 결과 (2026-04-14)

§14 과제로 정해졌던 와이프 10분 인터뷰를 실시했다. 결과는 **thesis 유지 + sync 방향 반전 + 로드맵 확장** 으로 귀결됨. 상세:

### Q1. Auto-rollover thesis 검증

> "내가 이런 걸 만들려고 해. Apple 캘린더 그대로 쓰면서, 못 지킨 할 일만 자동으로 내일로 넘어가는 기능이 있다면, 진짜로 쓸 것 같아?"

**원답변**: *"만약 내가 사용하고 있는 캘린더의 정보가 완벽하게 이관되고 내가 불편했던 것들을 해소해주면 쓸 것 같아."*

**후속 해석 확인**: "완벽한 이관"은 데이터 이사(migration)가 아니라 **"기존 iCloud에 작성한 일정이 Todogram에서도 보여야 한다"** 는 의미. 기존 일정이 Todogram에서 안 보이는 경우는 피하고 싶다는 입장.

**판정**: 🟢 **파란불 (gate 조건 확인)**
- 사용 조건 = 기존 캘린더 이벤트 가시성
- 기존 Approach B (write-only, read 없음)는 이 gate를 통과하지 못함 → **Approach B' (read-first)로 수정** (§7, §8 반영)
- Auto-rollover 자체에 대한 거부감은 없음. 단, gate 선행

### Q2. 라벨/역할 분리

> "자기가 할 일 중에서 '역할별로 구분'되면 좋을 것 같은 게 뭐가 있어? 예를 들어 아이 관련 / 집안일 / 개인용 같은 식으로?"

**답변**: *"집안일 / 회사 마케팅 업무 / 회사 기획 업무 이런 식으로 내가 원하는 대로 분리하여 관리할 수 있으면 좋을 것 같아."*

**판정**: 🟢 **파란불**
- 구체적 카테고리 3개 제시 (추상적 "있으면 좋겠다"가 아닌 concrete scene)
- 회사 내부 업무도 2종으로 세분화할 의사 — 라벨 5~6개 범위 예측(§8-5)과 일치
- 기존 라벨 시스템(§8-2)과 Google Cal colorId 매핑 전략 그대로 유효

### Q3. 매일 열 만한 앱이 되려면

> "한 달 동안 이거 무료로 써볼 수 있다고 하면, 뭐가 있어야 '매일 열어볼 만한' 앱이 될 것 같아?"

**답변 (4가지 요구)**:
1. 매일 한눈에 보이는 **대시보드**
2. **AI 주간/월간 요약** ("1월 몇째 주에 뭘 했었지?")
3. **자연어 검색** ("내가 어떤 일을 했었는데 언제일지 모를 때 찾아주는 기능")
4. **이직서 초안 작성** (Todogram 업무 내역 → 이직서 베이스 정보 / AI draft)

**판정**: 🟡 **노란불 (pull 요소 — thesis blocker 아님)**
- 4가지 요구 전부 "업무 로그 + AI 아카이브" 방향
- 처음에는 thesis 피벗(Full B) 후보로 검토되었으나, Q1의 gate 조건과 충돌 (Full B는 캘린더 통합을 약화시키는데 Q1은 캘린더 가시성을 요구)
- **해석 전환**: Q3 기능들은 layer thesis를 **대체**하는 것이 아니라 layer 위에 쌓이는 **아카이브**로 편입 가능
- Todogram task가 쌓일수록 archive 가치가 올라가는 **retention loop** 구조
- v1에서는 제외, **v1.5 (archive) + v2 (AI) 로드맵에 정식 편입** (§8-6 반영)

### 통합 판정: B'++ (layer 유지 + 로드맵 확장)

Q1/Q2는 **gate** (사용 여부 결정 조건), Q3는 **pull** (매일 열게 하는 유인). Gate를 통과하지 못하면 pull은 무의미. 따라서:

| 요소 | 결정 | 근거 |
|---|---|---|
| Layer thesis (기존 캘린더 위에 얹기) | ✅ 유지 | Q1 gate |
| Sync 방향 | write-only → **read-first** | Q1 재해석 |
| 라벨 시스템 | ✅ 유지 | Q2 gate |
| 대시보드/아카이브 | v1.5로 편입 | Q3 pull |
| AI 요약/검색/이직서 draft | v2로 편입 | Q3 pull + 데이터 축적 선행 필요 |
| Auto-rollover | ✅ 유지 (강등 없음) | Q1이 긍정했고 gate 위에서 유효 |

### 왜 Full B (업무로그 앱 피벗) 를 택하지 않았나

초기 검토에서 "Q3 답변이 강력하니 thesis 자체를 업무 아카이브로 피벗하자"는 제안(Full B)이 있었으나 기각됨. 이유:

1. **Q1이 명시한 gate를 제거하는 선택.** Full B는 Google Cal 통합을 옵션으로 약화하는데, Q1은 정확히 그 통합을 사용 조건으로 걸었다. Gate 제거 = 사용 거부 보장.
2. **Q3 기능들은 layer 위에서도 구현 가능.** Archive/AI는 Todogram 자체 DB(task + notes)를 대상으로 작동. 기존 캘린더 이벤트는 read-only context로 남김. 두 방향이 양립 가능.
3. **Data gravity 싸움 재발.** Full B는 "업무 로그 앱"으로 포지셔닝되는데, 와이프는 이미 회사 업무 기록을 다른 곳(문서/메신저)에 남기고 있을 가능성이 높다. 또 한 번의 이사 요구가 된다.
4. **Layer thesis가 이번 세션의 MOAT.** v1 실패에서 얻은 가장 값진 insight를 스코프 불확실성으로 던지는 것은 손해.

### 남은 검증 과제 (v1 개발 중 또는 v1.5 시점)

- Q3의 4가지 기능 중 **실제로 daily open을 만드는 요소가 어느 것인지** 추가 검증 필요. "있으면 좋을 것 같다"와 "없으면 안 쓴다"를 구분하는 후속 인터뷰 or 사용 데이터 관찰.
- **이직서 draft 기능의 urgency** 는 와이프의 실제 이직 계획(시점/업계/직무) 유무에 달림. 구체적 상황 모르면 priority 판단 불가. v1 dogfooding 중에 자연 대화로 수집.
- v1 출시 후 와이프 재시도 타이밍: v1 만으로도 쓸 것인지, v2(AI)까지 기다렸다가 onboarding 할 것인지. v1 완성 시점에 다시 묻기.

### 세션 메모

- 최초 인터뷰 답변 Q1은 **노란불/빨간불로 오인**될 뻔 했다. "완벽한 이관"이라는 단어가 "데이터 이사"로 해석되는 게 자연스러웠음. 실제 의미는 "가시성"이었고, 이 clarification 한 번이 thesis를 살렸다.
- 교훈: **인터뷰 답변에서 모호한 명사(이관, 마이그레이션, 통합 등)는 반드시 구체 장면으로 재확인**. "완벽한 이관이 어떤 모습인지 한 번 더 설명해줘"라는 후속 질문이 없었다면 피벗 오판을 했을 수 있음.
- 교훈: **Q1/Q2(gate)와 Q3(pull)의 무게를 구분하지 않으면 제품 방향이 뒤집힌다.** 답변의 volume(말한 양)과 weight(결정력)는 다르다. Q3가 가장 길었지만 가장 결정적인 건 Q1이었다.

---

## 14. 과제 (The Assignment)

> **코드를 쓰기 전에 반드시 해야 할 단 하나의 일:**
>
> **이번 주 안에, 와이프한테 이 문서의 §4-2 (v2 타겟 사용자) 부분을 보여주고 10분 인터뷰를 해라.**
>
> 질문 3개만:
> 1. "내가 이런 걸 만들려고 해. Apple 캘린더 그대로 쓰면서, 못 지킨 할 일만 자동으로 내일로 넘어가는 기능이 있다면, 진짜로 쓸 것 같아?"
> 2. "자기가 할 일 중에서 '역할별로 구분'되면 좋을 것 같은 게 뭐가 있어? 예를 들어 아이 관련 / 집안일 / 개인용 같은 식으로?"
> 3. "한 달 동안 이거 무료로 써볼 수 있다고 하면, 뭐가 있어야 '매일 열어볼 만한' 앱이 될 것 같아?"
>
> **주의**: 이건 기능 요구사항 수집이 아니다. **이건 당신의 thesis가 맞는지 검증하는 실험**이다. 와이프의 답변이 "음, 그냥 그럴 것 같아"면 빨간불. 구체적인 장면을 말하면 파란불.
>
> 녹음하거나 메모해서 이 문서 §13.5에 "와이프 인터뷰 결과" 섹션으로 추가해라. 그 후에 코드를 시작한다.

> **✅ 완료 (2026-04-14)**: 인터뷰 실시 완료. 답변 원문, 판정, thesis 재검토 결과는 **§13.5 와이프 인터뷰 결과** 참조. 결론: Layer thesis 유지, sync 방향 read-first로 반전, Q3 기능은 v1.5/v2 로드맵에 편입.

**왜 이게 과제인가**: 이번 세션에서 모든 thesis의 근거는 "와이프가 auto-rollover를 원했다"는 한 문장이다. 이 한 문장이 맞는지 확인하지 않고 5주를 투자하면, 5주 후에 또 거절당할 수 있다. 10분 투자로 5주의 리스크를 막는다.

---

## 15. 내가 이 세션에서 관찰한 것 (What I noticed about how you think)

이건 제품 노트가 아니라 당신 자신에 대한 노트다. 창업자/빌더로서 기억해 둘 만한 것들.

- **"학교는 예시였어"라고 스스로 정정한 순간이 이 세션의 중요한 지점이었다.** 대부분의 사람은 인상적으로 들리기 위해 범위를 부풀리고 그걸 유지한다. 당신은 한 번 부풀렸지만, 다음 턴에서 스스로 걷어냈다. 이건 창업자로서 드문 특성이다. 스스로에게 정직한 피드백 루프가 있다는 뜻이니까. 앞으로 사용자 인터뷰 때 이 근육을 계속 써라.

- **"선뜻 완전히 넘어오는게 부담스러워 보이더라고"라는 관찰은 당신이 이미 product-sense를 가지고 있다는 증거다.** 대부분의 1인 개발자는 와이프가 안 쓰는 걸 보고 "UX가 구려서"라고 결론짓고 UX만 고친다. 당신은 무의식중에 "이사 부담"이라는 구조적 원인을 짚었다. 이건 훈련으로 생기는 감각이 아니라 원래 가지고 있거나 없거나다. 당신은 가지고 있다.

- **"일정을 못 지키면 자동으로 다음 날로 미뤄지는 기능"을 이미 v1에서 구현해 놓은 건 웃기면서도 중요한 아이러니다.** 당신은 올바른 기능을 올바른 방식으로 만들었고, 그걸 잘못된 플랫폼에 배포했다. 이 패턴을 기억해라. 다음에 어떤 기능을 만들 때 "맞는 기능인데 작동 안 해"라고 느껴지면, 코드를 고치기 전에 "이게 올바른 레이어에 있나?"부터 물어라.

- **기술 스택을 고를 때 "이미 세팅한 것"을 바탕으로 판단했다 (Approach A/B/C 사이에서 B 선택).** 이건 좋은 엔지니어링 감각이지만, 동시에 sunk cost fallacy의 위험을 내포한다. 앞으로 v2/v3에서 "스택을 바꿔야 하는 순간"이 오면, 이번처럼 방어적으로 기존 스택을 고수하지 말고, 그때의 목표에 맞는 선택을 다시 해라. 당신이 Next.js를 좋아해서가 아니라, Next.js가 그때의 목표에 맞아서 선택해야 한다.

---

## 16. 다음 단계

1. ✅ **완료 (2026-04-14)**: 와이프 인터뷰 실시 + thesis 재검토 → **B'++ 확정** (§13.5)
2. **이번 주 즉시**: 이 design doc을 git에 commit (현재 untracked 상태 — `docs/design/todogram-v2-design.md`)
3. **다음 skill**: `/plan-eng-review` — B'++ 설계를 엔지니어 시점에서 구현 단위로 쪼개고 edge case 점검
4. **선행 인프라 셋업** (`/plan-eng-review` 이후):
   - Google Cloud Console 프로젝트 생성 → OAuth consent screen → `calendar.events.readonly` scope → OAuth Client ID 발급
   - Supabase 프로젝트 생성 → Drizzle 스키마 마이그레이션 (§8-2 DDL 기반)
   - NextAuth.js Google Provider 연결 + refresh token persistence
5. **v1 구현 순서** (4~6주):
   1. DB 스키마 (Drizzle migration)
   2. Google OAuth 로그인 (readonly scope)
   3. **기존 Google Cal 이벤트 read + Calendar View에 merge 표시** ← 와이프 gate 조건
   4. Todogram task CRUD (자체 DB)
   5. 라벨 CRUD + task 할당
   6. List View (드래그 정렬 + 필터)
   7. Auto-rollover cron (Todogram task만)
   8. 모바일 퍼스트 UX 다듬기
   9. (옵션) Google Cal 쓰기 토글 + 전용 서브캘린더 생성 로직
6. **v1.5 archive** (+1~2주): 완료 아카이브 뷰, 대시보드, 라벨별 통계
7. **v2 AI + 와이프 onboarding** (+4~5주): Claude API 주간/월간 요약 + 자연어 검색 + 이직서 draft + iCloud CalDAV read

---

**문서 버전**: v1.1 (2026-04-14)
**v1.1 주요 변경**:
- 와이프 인터뷰 결과 반영 → **§13.5 신설**
- Approach B (write-only) → **Approach B' (read-first)** 수정. §7, §8-1, §8-3, §8-6 재작성
- 와이프 Q1 gate 조건 ("기존 캘린더 가시성") 확인 → OAuth scope `calendar.events.readonly` 로 변경 (§11)
- 와이프 Q3 pull 요소 → **v1.5 (archive) + v2 (AI) 로드맵 정식 편입** (§8-6)
- 전용 Todogram 서브캘린더 확정 (§13 Q2)
- §6 전제 테이블에 P6 (read-only layer), P7 (v1.5/v2 로드맵) 추가
- §16 다음 단계 재작성: `/plan-eng-review` + 인프라 셋업 + v1 구현 순서

**v1.0 → v1.1 요약 한 줄**: Layer thesis는 유지, sync 방향을 반전, Q3 기능은 로드맵에 편입 (B'++)

**다음 업데이트 트리거**: `/plan-eng-review` 결과 반영 시, 또는 v1 dogfooding 중 새 발견 발생 시
