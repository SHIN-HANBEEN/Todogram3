import { beforeAll, describe, expect, it } from 'vitest'

// ============================================================================
// crypto.ts 테스트 (Phase 1 - A2)
// ============================================================================
// - AES-256-GCM 암호화/복호화 헬퍼의 round-trip 보장과 무결성 검증을 확인한다.
// - 핵심 관심사:
//     1) round-trip: encrypt → decrypt 결과가 원문과 완전히 일치.
//     2) 무결성: ciphertext 가 조작되면 decrypt 가 반드시 throw (GCM auth tag).
//     3) IV 유일성: 같은 평문이라도 매번 다른 ciphertext (랜덤 IV).
//     4) 잘못된 입력(비정상 base64, 너무 짧은 버퍼 등) 방어.
//     5) Unicode/빈 문자열 호환.
// - NextAuth JWT 콜백이 Google refresh_token 을 DB 에 암호화 저장하기 전 이 헬퍼를 호출하므로,
//   위 모든 조건이 빠짐없이 만족되어야 "v1 보일 더 레이크 원칙"이 성립한다.
// ============================================================================

// 테스트용 32바이트 키. `env.ENCRYPTION_KEY` 가 base64 로 저장되어 있다고 가정하므로
// 동일 포맷을 따른다. `SKIP_ENV_VALIDATION` 덕분에 process.env 를 직접 주입해도 `@/env`
// 의 env 프록시가 그 값을 그대로 노출한다(vitest.config 의 env 설정 참고).
const VALID_KEY_BASE64 = Buffer.alloc(32, 7).toString('base64')

beforeAll(() => {
  // crypto.ts 가 env.ENCRYPTION_KEY 를 call-time 에 읽도록 설계되어 있으므로
  // import 이후 세팅해도 문제가 없다 (lazy read).
  process.env.ENCRYPTION_KEY = VALID_KEY_BASE64
})

// 지연 import — process.env 를 먼저 채운 뒤 모듈을 평가할 수 있도록.
// (vitest 는 top-level import 를 호이스팅하지만, crypto.ts 는 env 를 call-time 에 읽어서
//  이 순서가 사실 무관하다. 그럼에도 명시적으로 함수 안에서 import 하여 규칙을 자명하게 드러낸다.)
async function loadCrypto() {
  return await import('@/lib/crypto')
}

describe('encrypt / decrypt', () => {
  it('round-trip: 암호화 후 복호화하면 원문과 일치한다', async () => {
    const { encrypt, decrypt } = await loadCrypto()
    const plaintext = 'ya29.a0AfH6SMBx_example_google_refresh_token_abcdefghij'

    const ciphertext = encrypt(plaintext)

    expect(decrypt(ciphertext)).toBe(plaintext)
  })

  it('ciphertext 는 평문과 다르며 평문 문자열을 포함하지 않는다', async () => {
    const { encrypt } = await loadCrypto()
    const plaintext = 'super-secret-refresh-token'

    const ciphertext = encrypt(plaintext)

    expect(ciphertext).not.toBe(plaintext)
    expect(ciphertext).not.toContain(plaintext)
  })

  it('같은 평문이라도 매번 다른 ciphertext 를 반환한다 (랜덤 IV)', async () => {
    const { encrypt } = await loadCrypto()
    const plaintext = 'same-input'

    const a = encrypt(plaintext)
    const b = encrypt(plaintext)

    expect(a).not.toBe(b)
  })

  it('빈 문자열도 round-trip 이 가능하다', async () => {
    const { encrypt, decrypt } = await loadCrypto()

    const ciphertext = encrypt('')

    expect(decrypt(ciphertext)).toBe('')
  })

  it('한글/이모지 Unicode 를 손실 없이 round-trip 한다', async () => {
    const { encrypt, decrypt } = await loadCrypto()
    const plaintext = '한국어 리프레시 토큰 🔐 テスト'

    expect(decrypt(encrypt(plaintext))).toBe(plaintext)
  })

  it('ciphertext 의 일부가 조작되면 복호화가 실패한다 (GCM 무결성)', async () => {
    const { encrypt, decrypt } = await loadCrypto()
    const ciphertext = encrypt('tamper-target')

    // base64 문자열의 가운데 1바이트를 뒤집어 auth tag 또는 ciphertext 본문을 훼손.
    const buf = Buffer.from(ciphertext, 'base64')
    buf[Math.floor(buf.length / 2)] = buf[Math.floor(buf.length / 2)] ^ 0xff
    const tampered = buf.toString('base64')

    expect(() => decrypt(tampered)).toThrow()
  })

  it('ciphertext 가 너무 짧으면 복호화가 실패한다 (IV + tag 크기 미만)', async () => {
    const { decrypt } = await loadCrypto()
    // 1바이트짜리 base64 — IV(12) + tag(16) = 28 바이트 최소 요구 미달.
    const tooShort = Buffer.alloc(1, 0).toString('base64')

    expect(() => decrypt(tooShort)).toThrow()
  })

  it('ENCRYPTION_KEY 가 32바이트가 아니면 encrypt 가 실패한다', async () => {
    const { encrypt } = await loadCrypto()
    const original = process.env.ENCRYPTION_KEY
    try {
      // 16바이트 키를 base64 로 주입 — AES-256 요구치 미달.
      process.env.ENCRYPTION_KEY = Buffer.alloc(16, 0).toString('base64')
      expect(() => encrypt('x')).toThrow(/ENCRYPTION_KEY/)
    } finally {
      process.env.ENCRYPTION_KEY = original
    }
  })

  it('ENCRYPTION_KEY 가 비어 있으면 encrypt 가 실패한다', async () => {
    const { encrypt } = await loadCrypto()
    const original = process.env.ENCRYPTION_KEY
    try {
      delete process.env.ENCRYPTION_KEY
      expect(() => encrypt('x')).toThrow(/ENCRYPTION_KEY/)
    } finally {
      process.env.ENCRYPTION_KEY = original
    }
  })
})
