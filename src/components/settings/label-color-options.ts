/* --------------------------------------------------------------------------
 * label-color-options.ts — U4 라벨 관리 화면에서 쓰이는 색상 팔레트 상수
 *
 * 설계 근거:
 *   - DESIGN.md §4-3 Hard Rule: 라벨은 6색 팔레트(sage/terracotta/dust-blue/
 *     amber/plum/moss)로 제한. dust-blue 는 캘린더 전용 reserved.
 *   - docs/tasks/todogram-v1-implementation.md U4 스펙: "색상 피커
 *     (Google colorId 11개 고정 선택)". 11개 중 디자인 시스템이 수용하는 5색만
 *     노출하고 나머지는 팔레트 밖으로 뺀다 (Lavender/Flamingo/Tangerine/Graphite/
 *     Blueberry 는 라벨 slug 매핑이 없어 런타임에 'moss' 로 폴백됨 →
 *     hexToLabelColor 와 어긋나면 list/today 에서 색이 안 보이는 현상 발생).
 *   - src/components/todogram/labels.ts USER_LABEL_PALETTE 와 1:1 동기화:
 *     sage, terracotta, amber, plum, moss 5종.
 *
 * Google Calendar API 의 event colorId 매핑:
 *   - '2' Sage      → design slug 'moss'      (#7A8B4A)
 *   - '3' Grape     → design slug 'plum'      (#8C5A6E)
 *   - '5' Banana    → design slug 'amber'     (#C08A3E)
 *   - '10' Basil    → design slug 'sage'      (#3A6E5B)  ← Todogram 브랜드색
 *   - '11' Tomato   → design slug 'terracotta'(#B3573A)
 *   - '7' Peacock  = 캘린더 reserved (#5A7A99, dust-blue) → 사용자 선택 불가
 *   - 나머지 6개 (1/4/6/8/9) = 디자인 팔레트 외 → 사용자 선택 불가
 *
 * 팔레트 변경이 필요하면 이 파일과 src/app/theme.css `--color-label-*` 값을
 * 함께 갱신. 두 소스가 어긋나면 라이브 프리뷰가 '가짜' 색으로 찍힘.
 * -------------------------------------------------------------------------- */

import type { LabelChipColor } from '@/components/todogram/label-chip'
import type { GoogleCalendarColorId } from '@/lib/validators/labels'

export interface LabelColorOption {
  /** Google Calendar event colorId ('1'~'11'). DB google_color_id 컬럼에 그대로 저장. */
  googleColorId: GoogleCalendarColorId
  /** Google UI 에 표기되는 색 이름. 시트 내 미리보기 라벨로 사용. */
  googleName: string
  /** 한국어 표시명. 접근성/이해도 보조. */
  localizedName: string
  /** UI 에 표시되는 실제 hex (#RRGGBB, 라이트 모드 기준). DB color 컬럼에 저장. */
  hex: string
  /** LabelChip/TaskRow 가 사용하는 design slug. hexToLabelColor 의 출력과 일치해야 함. */
  slug: LabelChipColor
}

/**
 * 사용자 선택 가능 팔레트 (5색).
 * 순서는 hue wheel 기준: sage(녹색) → moss(올리브) → amber(황색) → terracotta(주황) → plum(자주).
 * 6열 그리드에 한 줄로 표시되도록 5개로 고정.
 */
export const USER_LABEL_COLOR_OPTIONS: readonly LabelColorOption[] = [
  {
    googleColorId: '10',
    googleName: 'Basil',
    localizedName: '바질',
    hex: '#3A6E5B',
    slug: 'sage',
  },
  {
    googleColorId: '2',
    googleName: 'Sage',
    localizedName: '세이지',
    hex: '#7A8B4A',
    slug: 'moss',
  },
  {
    googleColorId: '5',
    googleName: 'Banana',
    localizedName: '바나나',
    hex: '#C08A3E',
    slug: 'amber',
  },
  {
    googleColorId: '11',
    googleName: 'Tomato',
    localizedName: '토마토',
    hex: '#B3573A',
    slug: 'terracotta',
  },
  {
    googleColorId: '3',
    googleName: 'Grape',
    localizedName: '그레이프',
    hex: '#8C5A6E',
    slug: 'plum',
  },
] as const

/**
 * 기본 선택 색상 — 신규 라벨 생성 시 초기값. sage(브랜드색)로 시작해
 * 사용자가 별도 선택 없이 저장해도 브랜드 톤이 유지되도록 한다.
 */
export const DEFAULT_LABEL_COLOR_OPTION: LabelColorOption =
  USER_LABEL_COLOR_OPTIONS[0]

/**
 * hex 문자열로 USER_LABEL_COLOR_OPTIONS 중 하나를 찾는다. 대소문자 구분 없음.
 * 기존 라벨을 편집 모드로 열 때 "어떤 칩이 선택되어야 하는가" 를 결정.
 * 매치 실패 시 undefined — 상위 컴포넌트가 '색상 변경 필요' 힌트 등으로 처리.
 */
export function findColorOptionByHex(
  hex: string
): LabelColorOption | undefined {
  const normalized = hex.trim().toLowerCase()
  return USER_LABEL_COLOR_OPTIONS.find(
    option => option.hex.toLowerCase() === normalized
  )
}

/**
 * googleColorId 문자열로 옵션 찾기. 마이그레이션 시 color 가 비어 있고
 * googleColorId 만 살아 있는 케이스를 커버.
 */
export function findColorOptionByGoogleId(
  googleColorId: string | null | undefined
): LabelColorOption | undefined {
  if (!googleColorId) return undefined
  return USER_LABEL_COLOR_OPTIONS.find(
    option => option.googleColorId === googleColorId
  )
}
