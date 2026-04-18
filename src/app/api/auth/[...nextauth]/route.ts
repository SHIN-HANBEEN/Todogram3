// Auth.js v5 App Router 라우트 핸들러.
// - `src/lib/auth.ts` 의 NextAuth() 구성이 만들어 준 `handlers` 객체를 GET/POST 로
//   분해해 그대로 노출한다. OAuth 콜백(GET) + 자격 증명 교환(POST) 두 메서드가 모두 필요하다.
// - 실제 비즈니스 로직은 전부 `@/lib/auth` 에 모여 있어, 이 파일은 "공개 URL 에
//   Auth.js 를 노출하는 얇은 어댑터" 역할만 한다. 이렇게 분리해두면 Server Component /
//   Server Action / middleware 는 `auth()` 를 직접 import 해서 쓰고, 외부(브라우저/Google)
//   요청은 이 라우트로만 들어오게 된다.

import { handlers } from '@/lib/auth'

export const { GET, POST } = handlers
