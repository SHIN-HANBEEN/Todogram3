import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

import { env } from '@/env'

// ============================================================================
// AES-256-GCM 암호화 헬퍼 (Phase 1 - A2)
// ============================================================================
// - Google OAuth 의 refresh_token 을 DB (`users.google_refresh_token`) 에 저장할 때
//   "보일 더 레이크 원칙 (defense in depth)" 에 따라 암호화하여 보관한다.
//   DB 가 누출되더라도 ENCRYPTION_KEY 없이는 토큰을 재사용할 수 없다.
// - 선택: AES-256-GCM.
//     * 대칭키라서 단일 서버 프로세스가 encrypt/decrypt 모두 수행 가능.
//     * GCM 모드는 암호화와 동시에 auth tag 를 생성하므로 ciphertext 조작을 복호화 단계에서 감지.
//     * 256비트 키 → `ENCRYPTION_KEY` 가 정확히 32바이트여야 함 (env.ts 에서 이미 강제).
//     * 96비트(12바이트) IV 는 GCM 표준 권장 값. 매 호출마다 randomBytes 로 새로 생성.
// - 저장 포맷: `base64( IV(12B) || AUTH_TAG(16B) || CIPHERTEXT(NB) )`
//     * 단일 base64 문자열 → Postgres text 컬럼 하나로 충분.
//     * 앞쪽 고정 28바이트만 읽으면 IV 와 auth tag 를 빠르게 추출 가능.
// - 키는 모듈 로드 시점이 아니라 **호출 시점 (lazy)** 에 읽는다.
//   테스트가 beforeAll 로 process.env 를 채운 뒤 import 해도 동작하도록 하기 위함.
// ============================================================================

const ALGORITHM = 'aes-256-gcm'
// AES-256 키 길이 (바이트). openssl rand -base64 32 결과와 일치해야 한다.
const KEY_LENGTH = 32
// GCM 권장 IV 길이. 96비트 = 12바이트.
const IV_LENGTH = 12
// AES-GCM auth tag 표준 길이 (128비트 = 16바이트).
const AUTH_TAG_LENGTH = 16

/**
 * env.ENCRYPTION_KEY 를 base64 디코드해 32바이트 Buffer 로 반환한다.
 * env 모듈이 이미 같은 검증을 수행하지만, SKIP_ENV_VALIDATION=1 경로(테스트/빌드)에서는
 * 검증이 우회되므로 여기서도 방어적으로 한 번 더 확인한다.
 */
function getEncryptionKey(): Buffer {
  const keyBase64 = env.ENCRYPTION_KEY
  if (!keyBase64) {
    throw new Error(
      'ENCRYPTION_KEY 가 설정되지 않았습니다. `openssl rand -base64 32` 로 생성 후 .env.local 에 등록하세요.'
    )
  }
  const key = Buffer.from(keyBase64, 'base64')
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `ENCRYPTION_KEY 는 base64 디코드 시 정확히 ${KEY_LENGTH}바이트여야 합니다 (현재 ${key.length}바이트).`
    )
  }
  return key
}

/**
 * 평문을 AES-256-GCM 으로 암호화해 base64 문자열로 반환한다.
 *
 * 반환 포맷: base64(IV || AUTH_TAG || CIPHERTEXT)
 *   - 같은 평문이라도 매번 다른 IV 가 생성되므로 결과 문자열은 매 호출마다 달라진다.
 *   - 길이는 평문보다 (IV 12 + authTag 16 + base64 오버헤드) 만큼 크다.
 *
 * @param plaintext UTF-8 문자열. 빈 문자열도 허용.
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  // update() 와 final() 결과를 합쳐야 완전한 ciphertext 가 된다.
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  // GCM auth tag 는 final() 이후에만 확정되므로 반드시 concat 뒤에 읽는다.
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64')
}

/**
 * encrypt() 가 만든 base64 문자열을 복호화해 원문(UTF-8)을 반환한다.
 * - IV/auth tag/ciphertext 를 고정 오프셋으로 분리한 뒤 decipher.
 * - auth tag 검증 실패(ciphertext 나 tag 가 조작된 경우)는 `decipher.final()` 에서 throw.
 * - 길이가 IV + tag 최소치 미만이거나 base64 가 깨져 있으면 별도 Error.
 *
 * @param ciphertext encrypt() 반환값과 동일한 포맷의 base64 문자열.
 */
export function decrypt(ciphertext: string): string {
  const key = getEncryptionKey()
  const buf = Buffer.from(ciphertext, 'base64')
  if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error(
      '복호화 대상 데이터가 너무 짧습니다. (IV + auth tag 최소 길이 미달)'
    )
  }
  const iv = buf.subarray(0, IV_LENGTH)
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const encrypted = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH)
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  // update + final 합산. auth tag 가 맞지 않으면 final() 에서 즉시 throw.
  const plaintext = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ])
  return plaintext.toString('utf8')
}
