/*
 * Todogram v1 — Minimal Service Worker
 *
 * 목적:
 *   - PWA "홈 화면에 추가" 설치 가능성(installability) 요건 충족
 *   - 오프라인 편집은 v1 스코프에서 제외 (docs/design/todogram-v2-design.md §13 Q4 → v2+)
 *
 * 동작:
 *   - install: 즉시 skipWaiting (업데이트 즉시 활성화)
 *   - activate: clients.claim (열려 있는 모든 탭을 새 SW 로 인계)
 *   - fetch: 단순 passthrough. 캐시 전략 없음. 네트워크 실패 시 브라우저 기본 오프라인 화면 노출
 *
 * 주의:
 *   - 여기에 cache.addAll / cache.match 를 넣으면 v1 스코프 확장. v1.5 이후에 논의.
 */

// 새 SW 가 기존 SW 를 대기 없이 대체
self.addEventListener('install', () => {
  // waiting 단계를 건너뛰고 바로 activate 단계로 진입
  self.skipWaiting()
})

// activate 된 SW 가 기존 탭들의 제어권까지 즉시 획득
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// 설치 가능성 판정 기준: fetch 리스너 존재 여부 (구형 Chrome 호환)
// 실제로는 네트워크 요청을 그대로 흘려보냄 — 오프라인 정적 응답은 생성하지 않음
self.addEventListener('fetch', () => {
  // 의도적 no-op: 기본 네트워크 요청 흐름을 그대로 둔다.
})
