import { redirect } from 'next/navigation'

/*
 * 루트(/) 진입 시 Todogram 로그인 안내 화면으로 보낸다.
 *
 * - Phase 0 F5: 스타터 마케팅 랜딩(Header/Hero/Features/CTA/Footer)을 제거하고
 *   `/login` 의 Quiet Lamp 화면을 v1 의 '로그인 안내' 역할로 통일한다.
 * - 인증 상태 분기(로그인 됨 → `/today`)는 Phase 1 A1(NextAuth v5) 연결 이후
 *   `auth()` 세션 체크를 이 파일에 추가한다. 지금은 미인증만 존재하므로 단순 리다이렉트.
 * - `redirect()` 는 Next.js App Router 에서 RSC 응답으로 307 리다이렉트를 발생시켜
 *   클라이언트 JS 없이 동작한다.
 */
export default function RootPage(): never {
  redirect('/login')
}
