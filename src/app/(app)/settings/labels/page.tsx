import { asc, eq, sql } from 'drizzle-orm'

import { db } from '@/db'
import { labels, taskLabels } from '@/db/schema'
import { requireUserId } from '@/lib/session'
import { hexToLabelColor } from '@/components/todogram/labels'
import type { LabelStripItem } from '@/components/settings/labels-list-strip'
import { LabelsSettingsContainer } from '@/components/settings/labels-settings-container'

/* --------------------------------------------------------------------------
 * /settings/labels 서버 페이지 — Phase 4 U4
 *
 * approved.json: designs/settings-labels-20260419/variant-C (Editor Sheet)
 *
 * 역할:
 *   1) 세션 확인 → userId 취득
 *   2) 사용자 라벨 전량 조회 (position ASC, id ASC)
 *   3) task_labels 로 라벨별 태스크 개수 집계 (GROUP BY label_id)
 *   4) hex → slug 매핑 + meta(hex/googleColorId) 유지 → LabelStripItem 배열
 *   5) 캘린더 reserved sentinel 을 리스트 최상단에 삽입 (UI 에서 자물쇠 배지로 차단)
 *   6) 클라이언트 컨테이너(LabelsSettingsContainer) 에 주입
 *
 * 캐시 무효화는 server action(createLabel/updateLabel/deleteLabel) 쪽이
 * revalidatePath('/settings/labels') 를 호출 → 이 페이지가 자연스럽게 재실행.
 * -------------------------------------------------------------------------- */

export const metadata = {
  title: '라벨 관리 · Todogram',
  description: '사용자 라벨과 색상을 관리합니다.',
}

/**
 * 캘린더 reserved sentinel id. 클라이언트는 이 값을 보고 편집을 차단한다.
 * Number(id) 가 NaN 이 되도록 문자열로 둬서 실수로 숫자 id 와 충돌할 일이 없다.
 */
const RESERVED_CALENDAR_SENTINEL_ID = 'reserved:calendar'

export default async function LabelsSettingsPage() {
  const userId = await requireUserId()

  /* --- 1) 라벨 목록 --- */
  const userLabels = await db
    .select()
    .from(labels)
    .where(eq(labels.userId, userId))
    .orderBy(asc(labels.position), asc(labels.id))

  /* --- 2) 라벨별 태스크 개수 집계 (GROUP BY) ---
   * task_labels.label_id = labels.id 로 join → 현재 사용자 라벨만 집계 대상.
   * GROUP BY 한 row 가 안 나온 라벨(=태스크 0개)은 맵 lookup 때 undefined → 0 으로 폴백.
   */
  const countRows =
    userLabels.length === 0
      ? []
      : await db
          .select({
            labelId: taskLabels.labelId,
            count: sql<number>`count(*)::int`,
          })
          .from(taskLabels)
          .innerJoin(labels, eq(taskLabels.labelId, labels.id))
          .where(eq(labels.userId, userId))
          .groupBy(taskLabels.labelId)

  const countByLabelId = new Map<number, number>()
  for (const row of countRows) {
    countByLabelId.set(row.labelId, row.count)
  }

  /* --- 3) LabelStripItem 변환 --- */
  const userItems: LabelStripItem[] = userLabels.map(label => ({
    id: label.id,
    name: label.name,
    slug: hexToLabelColor(label.color),
    taskCount: countByLabelId.get(label.id) ?? 0,
    meta: {
      hex: label.color,
      googleColorId: label.googleColorId,
    },
  }))

  /* --- 4) 캘린더 reserved sentinel 최상단 삽입 ---
   * DESIGN.md §4-3: 외부 캘린더 전용 색(dust-blue) 은 사용자가 임의 편집 불가.
   * 실제 외부 이벤트 색상은 Google Calendar 에서 들어오므로 DB 에는 존재하지 않는
   * 순수 가상 행이다. 클릭하면 reserved 플래그로 차단.
   */
  const reservedItem: LabelStripItem = {
    id: RESERVED_CALENDAR_SENTINEL_ID,
    name: '캘린더 (외부)',
    slug: 'dust-blue',
    taskCount: 0,
    reserved: true,
  }

  const items: LabelStripItem[] = [reservedItem, ...userItems]

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[640px] flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
      <header>
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-text-tertiary">
          설정
        </p>
        <h1 className="mt-1 text-[22px] font-semibold leading-tight text-text-primary">
          라벨 관리
        </h1>
        <p className="mt-1 text-[13px] text-text-tertiary">
          라벨을 만들어 태스크를 분류하고, Google Calendar 색상과 동기화할 수
          있어요.
        </p>
      </header>

      <LabelsSettingsContainer initialItems={items} />
    </main>
  )
}
