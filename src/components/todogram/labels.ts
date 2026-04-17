/* --------------------------------------------------------------------------
 * labels.ts — Todogram v3 (Quiet Layer) 라벨 상수 / 매핑
 *
 * DESIGN.md §4-3 (라벨 팔레트 6색) + 2026-04-17 Today View 승인사항 근거.
 *   - `calendar` 는 reserved 라벨 (dust-blue). 외부 Google Cal 이벤트 전용.
 *     사용자가 임의로 할당/편집 불가.
 *   - 기본 사용자 라벨 4종 프리셋: 직장(sage) · 가정(terracotta) · 학습(amber) · 개인(plum)
 *   - `dust-blue` 는 사용자 라벨 팔레트에서 제외 (캘린더 reserved 와 충돌 방지)
 *
 * 이 파일은 Today View ledger 에서 좌측 3px 색 틱 + LabelChip 색상 결정에 쓰임.
 * -------------------------------------------------------------------------- */

import type { LabelChipColor } from './label-chip'

/* --------------------------------------------------------------------------
 * LabelId — 라벨의 식별자. 'calendar' 는 reserved, 그 외는 사용자 정의.
 *
 * 런타임 DB 에서는 사용자 라벨의 id 가 UUID/int 가 될 수 있지만, 컴포넌트
 * 레이어에서는 문자열 slug 로 일관 취급해도 충분 (TodayRow 의 label prop 은
 * 화면 렌더만 담당하고, 서버 액션에서는 실제 label id 를 주고받음).
 * -------------------------------------------------------------------------- */
export type LabelId = string

/** 외부 Google Calendar 이벤트 전용 reserved 라벨 id. */
export const CALENDAR_LABEL_ID = 'calendar' as const

/** FilterRail 의 특수값 — 모든 항목 표시. */
export const FILTER_ALL = 'all' as const

/** FilterRail 활성값의 유니온. 사용자 LabelId 또는 'all'. */
export type FilterValue = LabelId | typeof FILTER_ALL

/* --------------------------------------------------------------------------
 * LABEL_COLOR_MAP — LabelId → LabelChipColor 매핑.
 *
 * `calendar` → 'dust-blue' 고정 (reserved 규칙).
 * 그 외 라벨은 사용자가 만들 때 색을 선택 → 런타임에 이 맵이 동적으로 채워짐.
 * 컴포넌트 레이어에서는 ledger 렌더 시점에 이 맵을 참조해서 색을 판단.
 *
 * 기본 사용자 라벨 프리셋(아래 DEFAULT_USER_LABEL_PRESET 참조) 의 색 매핑도
 * 여기에 포함시켜서 신규 사용자가 온보딩 직후에도 색이 제대로 표시되도록 함.
 * -------------------------------------------------------------------------- */
export const LABEL_COLOR_MAP: Record<LabelId, LabelChipColor> = {
  [CALENDAR_LABEL_ID]: 'dust-blue',
  work: 'sage',
  home: 'terracotta',
  study: 'amber',
  personal: 'plum',
}

/* --------------------------------------------------------------------------
 * USER_LABEL_PALETTE — 사용자가 새 라벨을 만들 때 선택 가능한 색상 목록.
 * dust-blue 는 calendar reserved 와 충돌하므로 제외 (DESIGN.md §4-3 규칙).
 * -------------------------------------------------------------------------- */
export const USER_LABEL_PALETTE: readonly LabelChipColor[] = [
  'sage',
  'terracotta',
  'amber',
  'plum',
  'moss',
] as const

/* --------------------------------------------------------------------------
 * DEFAULT_USER_LABEL_PRESET — v1 신규 사용자 온보딩 시 자동 생성되는 라벨 4종.
 *
 * 각 entry:
 *   - id: 라벨 슬러그 (LabelId, 런타임에서 실제 DB id 로 치환될 수 있음)
 *   - color: LABEL_COLOR_MAP 과 동기화
 *   - labels: 로케일별 표시 문구 (ko/en)
 *
 * 2026-04-17 변경: 이전엔 '개인' 이 dust-blue 였으나 calendar reserved 와
 * 충돌하여 plum 으로 재배정. DESIGN.md §4-3 "Reserved 라벨 규칙" 참조.
 * -------------------------------------------------------------------------- */
export interface DefaultLabelPreset {
  id: LabelId
  color: LabelChipColor
  labels: { ko: string; en: string }
}

export const DEFAULT_USER_LABEL_PRESET: readonly DefaultLabelPreset[] = [
  { id: 'work', color: 'sage', labels: { ko: '직장', en: 'Work' } },
  { id: 'home', color: 'terracotta', labels: { ko: '가정', en: 'Home' } },
  { id: 'study', color: 'amber', labels: { ko: '학습', en: 'Study' } },
  { id: 'personal', color: 'plum', labels: { ko: '개인', en: 'Personal' } },
] as const

/* --------------------------------------------------------------------------
 * getLabelColor — LabelId 를 LabelChipColor 로 해석.
 * 매핑이 없는 id(사용자가 DB 에서 만든 새 라벨) 는 fallback 'moss' 로 안전 처리.
 * (실제 앱에서는 Label 레코드에 color 가 이미 있으므로 이 함수는 최후 fallback)
 * -------------------------------------------------------------------------- */
export function getLabelColor(id: LabelId): LabelChipColor {
  return LABEL_COLOR_MAP[id] ?? 'moss'
}

/** calendar reserved 라벨 여부. */
export function isCalendarLabel(id: LabelId): boolean {
  return id === CALENDAR_LABEL_ID
}
