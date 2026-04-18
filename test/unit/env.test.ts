import { describe, expect, it } from 'vitest'

import { parseEnv } from '@/env'

// ============================================================================
// env.ts 검증 테스트 (Phase 0 - F4)
// ============================================================================
// - `parseEnv` 를 직접 호출해 Zod 스키마가 의도한 대로 에러/통과를 내는지 본다.
// - 실제 `process.env` 를 건드리지 않기 위해 mock source 객체만 전달한다.
//   (env 모듈은 import 시점에 이미 parse 가 실행되지만, 테스트 환경에서는
//    vitest 설정상 SKIP 경로가 아니어도 모듈 최상위 parse 는 일회성이라 영향 없음.)
// ============================================================================

// AES-256-GCM 용 32바이트 키를 base64 로 인코딩한 값 (모두 0 바이트).
// 실제 값이 아니라 포맷 검증 통과만을 위한 테스트 픽스처.
const VALID_ENCRYPTION_KEY = Buffer.alloc(32, 0).toString('base64')

// 32자 이상이기만 하면 되는 값들 (JWT secret / cron secret).
const VALID_SECRET_32 = 'a'.repeat(32)

// 모든 F4 변수가 정상 채워진 baseline.
const validEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/postgres',
  NEXTAUTH_SECRET: VALID_SECRET_32,
  NEXTAUTH_URL: 'http://localhost:3000',
  GOOGLE_CLIENT_ID: 'test-google-client-id',
  GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
  ENCRYPTION_KEY: VALID_ENCRYPTION_KEY,
  CRON_SECRET: VALID_SECRET_32,
} as unknown as NodeJS.ProcessEnv

describe('parseEnv', () => {
  it('모든 필수 환경변수가 정상이면 parse 에 성공한다', () => {
    const result = parseEnv(validEnv)

    expect(result.DATABASE_URL).toBe(validEnv.DATABASE_URL)
    expect(result.NEXTAUTH_SECRET).toBe(validEnv.NEXTAUTH_SECRET)
    expect(result.ENCRYPTION_KEY).toBe(validEnv.ENCRYPTION_KEY)
    // NODE_ENV 는 enum 파싱 결과도 동일 문자열로 돌아와야 한다.
    expect(result.NODE_ENV).toBe('test')
  })

  it('DATABASE_URL 이 비어 있으면 throw 한다', () => {
    expect(() =>
      parseEnv({ ...validEnv, DATABASE_URL: '' } as NodeJS.ProcessEnv)
    ).toThrow(/DATABASE_URL/)
  })

  it('DATABASE_URL 이 postgres 스킴이 아니면 throw 한다', () => {
    expect(() =>
      parseEnv({
        ...validEnv,
        DATABASE_URL: 'mysql://user:pass@localhost:3306/db',
      } as NodeJS.ProcessEnv)
    ).toThrow(/postgres/)
  })

  it('NEXTAUTH_SECRET 이 32자 미만이면 throw 한다', () => {
    expect(() =>
      parseEnv({
        ...validEnv,
        NEXTAUTH_SECRET: 'too-short',
      } as NodeJS.ProcessEnv)
    ).toThrow(/NEXTAUTH_SECRET/)
  })

  it('NEXTAUTH_URL 이 유효 URL 이 아니면 throw 한다', () => {
    expect(() =>
      parseEnv({
        ...validEnv,
        NEXTAUTH_URL: 'not-a-url',
      } as NodeJS.ProcessEnv)
    ).toThrow(/NEXTAUTH_URL/)
  })

  it('ENCRYPTION_KEY 가 32바이트가 아니면 throw 한다 (짧은 base64)', () => {
    // 16바이트를 base64 로 인코딩 — 디코드 시 32바이트가 아니므로 실패해야 한다.
    const tooShort = Buffer.alloc(16, 0).toString('base64')
    expect(() =>
      parseEnv({
        ...validEnv,
        ENCRYPTION_KEY: tooShort,
      } as NodeJS.ProcessEnv)
    ).toThrow(/ENCRYPTION_KEY/)
  })

  it('CRON_SECRET 이 32자 미만이면 throw 한다', () => {
    expect(() =>
      parseEnv({
        ...validEnv,
        CRON_SECRET: 'short-cron',
      } as NodeJS.ProcessEnv)
    ).toThrow(/CRON_SECRET/)
  })

  it('여러 키가 동시에 비어 있으면 한 번의 throw 에 모두 나열된다', () => {
    const broken = {
      ...validEnv,
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
    } as NodeJS.ProcessEnv

    // 두 키가 모두 에러 메시지 본문에 등장해야 한다.
    expect(() => parseEnv(broken)).toThrow(
      /GOOGLE_CLIENT_ID[\s\S]*GOOGLE_CLIENT_SECRET/
    )
  })
})
