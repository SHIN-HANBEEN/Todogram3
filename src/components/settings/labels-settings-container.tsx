'use client'

import { useCallback, useState } from 'react'

import { createLabel, deleteLabel, updateLabel } from '@/actions/labels'
import {
  LabelsListStrip,
  type LabelStripItem,
} from '@/components/settings/labels-list-strip'
import {
  LabelEditorSheet,
  type LabelEditorSheetInitialData,
  type LabelFormPayload,
} from '@/components/settings/label-editor-sheet'

/* --------------------------------------------------------------------------
 * LabelsSettingsContainer — U4 라벨 관리 화면의 클라이언트 오케스트레이터
 *
 * 책임:
 *   - 서버에서 받은 initialItems 를 스트립 리스트로 표시
 *   - 편집/생성 시트 open 상태 관리 (한 번에 하나만 노출)
 *   - Server Action (createLabel / updateLabel / deleteLabel) 호출
 *     → 서버 액션이 revalidatePath('/settings/labels') 로 자동 리프레시하므로
 *       낙관적 업데이트 없이 닫고 기다리면 된다 (Quiet Layer: 복잡도 최소).
 *
 * 캘린더 reserved 라벨:
 *   - 서버에서 sentinel item (id='reserved:calendar') 으로 맨 위에 삽입한 상태로 내려옴.
 *   - onSelect 는 reserved 인 경우 호출되지 않도록 LabelStripRow 가 가드.
 * -------------------------------------------------------------------------- */

export interface LabelsSettingsContainerProps {
  initialItems: readonly LabelStripItem[]
}

/* --- sheet 상태 타입 정의 --- */
type SheetState =
  | { open: false }
  | { open: true; mode: 'create' }
  | {
      open: true
      mode: 'edit'
      initial: LabelEditorSheetInitialData
    }

export function LabelsSettingsContainer({
  initialItems,
}: LabelsSettingsContainerProps) {
  const [sheet, setSheet] = useState<SheetState>({ open: false })

  /* --- 리스트 이벤트 핸들러 --- */
  const handleAdd = useCallback(() => {
    setSheet({ open: true, mode: 'create' })
  }, [])

  const handleSelect = useCallback((item: LabelStripItem) => {
    // reserved 는 LabelStripRow 가 이미 차단. 혹시 모를 경우를 위한 이중 가드.
    if (item.reserved) return
    if (typeof item.id !== 'number') return

    setSheet({
      open: true,
      mode: 'edit',
      initial: {
        id: item.id,
        name: item.name,
        // NOTE: LabelStripItem 은 UI 표시용이라 hex/googleColorId 를 들고 있지 않다.
        // 편집 시트 초깃값 매핑은 slug → option 으로 폴백(아래 sheet 내부 처리).
        // 정확한 hex 가 필요하면 initialItems 에 hex/googleColorId 를 포함시켜 전달해야 함 —
        // 실제로 서버 페이지에서 그렇게 전달하고 있다 (아래 rawItems 참고).
        color: item.meta?.hex ?? '#3A6E5B',
        googleColorId: item.meta?.googleColorId ?? null,
      },
    })
  }, [])

  const handleClose = useCallback((open: boolean) => {
    if (!open) setSheet({ open: false })
  }, [])

  /* --- 저장: create / update 분기 --- */
  const handleSubmit = useCallback(
    async (payload: LabelFormPayload) => {
      if (!sheet.open) return

      if (sheet.mode === 'create') {
        await createLabel({
          name: payload.name,
          color: payload.color,
          googleColorId: payload.googleColorId,
        })
      } else {
        await updateLabel(sheet.initial.id, {
          name: payload.name,
          color: payload.color,
          googleColorId: payload.googleColorId,
        })
      }
      // 성공 시 sheet 자체는 LabelEditorSheet 가 onOpenChange(false) 호출 → handleClose 로 닫힘.
    },
    [sheet]
  )

  const handleDelete = useCallback(async () => {
    if (!sheet.open || sheet.mode !== 'edit') return
    await deleteLabel(sheet.initial.id)
  }, [sheet])

  return (
    <>
      <LabelsListStrip
        items={initialItems}
        onSelect={handleSelect}
        onAdd={handleAdd}
      />

      <LabelEditorSheet
        mode={sheet.open ? sheet.mode : 'create'}
        open={sheet.open}
        onOpenChange={handleClose}
        initial={
          sheet.open && sheet.mode === 'edit' ? sheet.initial : null
        }
        onSubmit={handleSubmit}
        onDelete={
          sheet.open && sheet.mode === 'edit' ? handleDelete : undefined
        }
      />
    </>
  )
}
