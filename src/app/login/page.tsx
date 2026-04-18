import { Metadata } from 'next'

import { LoginForm } from '@/components/login-form'

export const metadata: Metadata = {
  title: '로그인 · Todogram',
  description: '계정에 로그인하여 조용한 할 일 레이어를 시작하세요',
}

/* Quiet Lamp 레이아웃: LoginForm 이 자체적으로 min-h-screen · max-w-[360px]
   · 중앙 정렬 · 상하 safe-area 를 책임진다. 페이지 래퍼는 단순 pass-through. */
export default function LoginPage() {
  return <LoginForm />
}
