'use client'

import { useState, type ComponentType, type SVGProps } from 'react'
import Link from 'next/link'
import { ChevronDown } from '@untitledui/icons'
import { Lightbulb03 } from '@untitledui/icons'
import { EyeIcon, EyeOffIcon } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { cx, sortCx } from '@/utils/cx'

/* --------------------------------------------------------------------------
 * LoginForm — Todogram v3 (Quiet Layer) 로그인 화면
 *
 * DESIGN.md §1 (Quiet Layer) + §3 (타이포) + §4 (컬러) + §5 (터치) + §9 (Hard Rules) 근거.
 * approved.json: login-variants-20260418 — Variant A "Quiet Lamp"
 *   - 카드 chrome 제거, 중앙 정렬 max-w-[360px]
 *   - 상단: sage 램프 아이콘 44×44 → Instrument Serif 44px 'Todogram' 워드마크
 *           → Instrument Serif italic 18px 인사말
 *   - OAuth 우선: Google brand-solid (sage) + Apple black-solid, 각 52px
 *   - 이메일은 disclosure 'ㆍ이메일로 계속 ▾' ghost 버튼으로 접힘 — OAuth 흐름 강화
 *   - 펼침 시: email / password (eye toggle) / remember / 로그인 / 비밀번호 찾기
 *   - 하단: '계정이 없으신가요? 회원가입' sage link
 *   - 모든 색은 시맨틱 토큰, 다크모드 자동 대응. 그라디언트/카드/컨페티 없음.
 *
 * 접근성:
 *   - OAuth 버튼 52px + 이메일 input 48px → DESIGN §5 (터치 타겟 48px+)
 *   - aria-expanded (disclosure), aria-pressed (eye toggle), aria-invalid (error)
 *   - Tab 순서: Google → Apple → 이메일 disclosure → [펼치면] email → password
 *     → eye → remember → 로그인 → 비번찾기 → 회원가입
 *   - prefers-reduced-motion 대응: transition-[] duration 1ms로 축약
 * -------------------------------------------------------------------------- */

export interface LoginFormProps {
  /** 이메일/비밀번호 제출 시 호출. OAuth 흐름은 별도 handler. */
  onSubmit?: (values: {
    email: string
    password: string
    rememberMe: boolean
  }) => Promise<void> | void
  /** 로그인 성공 시 리다이렉트 경로 (NextAuth signIn 옵션으로 전달 예정) */
  redirectTo?: string
}

/* 시간대 기반 인사말 선택. 4-11시 '좋은 아침', 12-17시 '다시 만나서 반가워요',
   18-3시 '오늘도 가볍게'. approved.json greeting_variants 3종 순환. */
function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour >= 4 && hour < 12) return '좋은 아침이에요.'
  if (hour >= 12 && hour < 18) return '다시 만나서 반가워요.'
  return '오늘도 가볍게.'
}

/* --------------------------------------------------------------------------
 * 스타일 — sortCx 로 영역별(wordmark / oauth / email / footer) 그룹핑.
 * 색상은 전부 시맨틱 토큰(bg-brand-600, text-text-primary …). raw 색 금지.
 * -------------------------------------------------------------------------- */
const styles = sortCx({
  /* 최외곽 컨테이너. 카드 없음, 중앙 정렬, 상/하 safe-area. */
  container: {
    base:
      'mx-auto flex min-h-screen w-full max-w-[360px] flex-col items-stretch' +
      ' bg-bg-primary px-6 pt-14 pb-7',
  },
  /* 상단 워드마크 블록: 램프 아이콘 → 워드마크 → 인사말. */
  wordmark: {
    block: 'flex flex-col items-center',
    /* 44×44 원형 + brand-subtle 배경. 내부 22×22 브랜드 색 아이콘. */
    lampWrap:
      'mb-5 flex size-11 items-center justify-center rounded-full bg-brand-100' +
      ' dark:bg-brand-900',
    lamp: 'size-[22px] text-brand-600 dark:text-brand-400',
    /* Instrument Serif 44px · line-height 1 · tracking tight. */
    title:
      'font-display text-[44px] font-normal leading-none tracking-[-0.9px]' +
      ' text-text-primary',
    /* Instrument Serif italic 18px · 아래 여백 48px 로 OAuth 와 간격. */
    greeting:
      'mt-3 mb-12 font-display text-[18px] italic leading-[1.3] text-text-tertiary',
  },
  /* OAuth 버튼 영역. gap 12px. */
  oauth: {
    list: 'flex flex-col gap-3',
    /* 공통: 52px · radius 10 · Pretendard 15/500 · gap 10px (아이콘-라벨). */
    button:
      'inline-flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-[10px]' +
      ' px-4 text-[15px] font-medium tracking-[-0.1px]' +
      ' transition-[background-color,color,box-shadow,transform] duration-150 ease-linear' +
      ' focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-100' +
      ' active:scale-[0.985] active:transition-transform active:duration-100' +
      ' motion-reduce:transition-none motion-reduce:active:scale-100' +
      ' disabled:cursor-not-allowed disabled:opacity-50',
    /* Google: brand solid. 라이트=sage bg + 흰 텍스트, 다크=sage bg + 검정 텍스트. */
    google:
      'bg-brand-600 text-white hover:bg-brand-700' +
      ' dark:bg-brand-400 dark:text-[#0E0F0C] dark:hover:bg-brand-300',
    /* Apple HIG: 검정 bg + 흰 텍스트. 다크 모드에서는 offwhite 반전. */
    apple:
      'bg-[#0a0a0a] text-white hover:bg-[#1a1a1a]' +
      ' dark:bg-[#F0EEE7] dark:text-[#0E0F0C] dark:hover:bg-white',
    icon: 'size-5 shrink-0',
  },
  /* 이메일 disclosure + 확장 폼. */
  email: {
    /* 그룹 래퍼: OAuth 블록 아래 24px 여백 (OAuth 우선 흐름을 시각적으로 강조). */
    group: 'mt-6',
    /* 트리거 ghost 버튼: 14/500, text-secondary, brand-subtle hover. */
    trigger:
      'group/trigger flex w-full items-center justify-center gap-1.5 rounded-lg' +
      ' px-4 py-3.5 text-[14px] font-medium text-text-secondary' +
      ' transition-colors duration-150 ease-linear hover:bg-brand-100' +
      ' focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300' +
      ' dark:hover:bg-brand-900 motion-reduce:transition-none',
    /* ▾ 아이콘: expanded 시 180° 회전. */
    triggerIcon:
      'size-3.5 shrink-0 transition-transform duration-200 ease-out' +
      ' group-aria-expanded/trigger:rotate-180 motion-reduce:transition-none',
    /* 확장 패널: height auto + opacity fade. 간단히 mt-3 으로 간격. */
    panel:
      'mt-3 flex flex-col gap-3 overflow-hidden transition-[max-height,opacity]' +
      ' duration-[220ms] ease-out motion-reduce:transition-none',
    panelOpen: 'max-h-[560px] opacity-100',
    panelClosed: 'pointer-events-none max-h-0 opacity-0',
    field: 'flex flex-col gap-1.5',
    label: 'text-[13px] font-medium text-text-secondary',
    /* 이메일/비밀번호 인풋: 48px 터치 타겟, rounded-[10px] 로 OAuth 와 조화. */
    input:
      'h-12 rounded-[10px] border-border-primary bg-bg-primary px-3.5 text-[15px]' +
      ' text-text-primary placeholder:text-text-placeholder' +
      ' focus-visible:border-brand-600 focus-visible:ring-brand-100 dark:focus-visible:border-brand-400',
    inputError: 'border-border-error focus-visible:border-border-error focus-visible:ring-red-100',
    /* 비밀번호 input 우측 eye toggle. */
    eyeWrap: 'relative',
    eye:
      'absolute inset-y-0 right-0 flex size-12 items-center justify-center' +
      ' text-text-tertiary transition-colors hover:text-text-secondary' +
      ' focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 rounded-r-[10px]',
    error: 'text-[13px] text-text-error-primary',
    /* remember + forgot 한 줄 배치. */
    meta: 'flex items-center justify-between pt-1',
    remember: 'flex items-center gap-2 text-[13px] text-text-secondary',
    forgot:
      'text-[13px] font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300',
    /* 로그인 submit: OAuth 와 동일 geometry (52px brand solid). */
    submit:
      'mt-1 inline-flex min-h-[52px] w-full items-center justify-center rounded-[10px]' +
      ' bg-brand-600 text-[15px] font-medium tracking-[-0.1px] text-white' +
      ' transition-[background-color,transform] duration-150 ease-linear' +
      ' hover:bg-brand-700 active:scale-[0.985] focus-visible:outline-none' +
      ' focus-visible:ring-[3px] focus-visible:ring-brand-100' +
      ' dark:bg-brand-400 dark:text-[#0E0F0C] dark:hover:bg-brand-300' +
      ' motion-reduce:transition-none motion-reduce:active:scale-100' +
      ' disabled:cursor-not-allowed disabled:opacity-50',
  },
  /* 하단 회원가입 링크 — margin-top auto 로 뷰포트 하단에 고정. */
  footer: {
    wrap: 'mt-auto pt-6 text-center',
    text: 'text-[13px] text-text-tertiary',
    link:
      'font-medium text-brand-600 underline-offset-4 hover:underline' +
      ' dark:text-brand-400',
  },
})

/* --------------------------------------------------------------------------
 * Google · Apple 브랜드 아이콘 (단색 SVG · currentColor 상속)
 *   - Google G: sage 배경 위 '흰 실루엣' 버전. 흰 플레이트 컬러 G 는 쓰지 않음
 *     (brand-solid 와 대비 충돌). approved.json oauth.google.icon 결정 근거.
 *   - Apple logo: 단색 fill-currentColor — 검정/흰 반전 자동 대응.
 * -------------------------------------------------------------------------- */
const GoogleIcon: ComponentType<SVGProps<SVGSVGElement>> = props => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    {...props}
  >
    <path d="M21.35 11.1H12v3.2h5.35c-.23 1.45-1.74 4.25-5.35 4.25-3.22 0-5.85-2.67-5.85-5.95S8.78 6.65 12 6.65c1.83 0 3.06.78 3.76 1.45l2.57-2.48C16.75 4.11 14.6 3.2 12 3.2 7.02 3.2 3 7.2 3 12.2s4.02 9 9 9c5.19 0 8.64-3.65 8.64-8.78 0-.59-.06-1.04-.14-1.52Z" />
  </svg>
)

const AppleIcon: ComponentType<SVGProps<SVGSVGElement>> = props => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    {...props}
  >
    <path d="M16.365 1.43c0 1.14-.417 2.23-1.1 3.05-.73.87-1.92 1.55-3.09 1.46-.13-1.13.42-2.3 1.1-3.04.76-.83 2.05-1.46 3.09-1.47Zm4.54 17.43c-.56 1.24-.84 1.8-1.57 2.9-1.02 1.54-2.46 3.46-4.24 3.48-1.59.02-2-.9-4.16-.88-2.17.01-2.6.9-4.19.88-1.79-.02-3.15-1.75-4.17-3.29C-.36 17.08-.73 12.04 1 9.25c1.19-1.95 3.08-3.09 4.86-3.09 1.82 0 2.96.93 4.46.93 1.46 0 2.35-.93 4.45-.93 1.6 0 3.28.83 4.48 2.27-3.94 2.01-3.29 7.46.66 9.43Z" />
  </svg>
)

export function LoginForm({ onSubmit, redirectTo = '/today' }: LoginFormProps) {
  /* disclosure expand 여부. 접힘 기본 — OAuth 우선 흐름 강화. */
  const [showEmailForm, setShowEmailForm] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [oauthLoading, setOauthLoading] = useState<'google' | 'apple' | null>(
    null
  )
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    rememberMe: false,
  })
  const [errors, setErrors] = useState({ email: '', password: '' })

  /* 기존 validate 로직 유지 — approved.json api_sketch.state.formData+errors 준수. */
  const validateForm = () => {
    const newErrors = { email: '', password: '' }
    if (!formData.email) {
      newErrors.email = '이메일을 입력해 주세요.'
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = '올바른 이메일 주소를 입력해 주세요.'
    }
    if (!formData.password) {
      newErrors.password = '비밀번호를 입력해 주세요.'
    } else if (formData.password.length < 8) {
      newErrors.password = '비밀번호는 최소 8자 이상이어야 합니다.'
    }
    setErrors(newErrors)
    return !newErrors.email && !newErrors.password
  }

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (field === 'email' || field === 'password') {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return
    try {
      setIsSubmitting(true)
      /* 이메일/비밀번호 실제 처리는 Phase 1 A1 (NextAuth v5 credentials) 태스크에서 연결.
         현재는 onSubmit prop 에 위임하거나 콘솔 출력. */
      if (onSubmit) {
        await onSubmit(formData)
      } else {
        console.log('[login] email submit (auth 미연결):', formData)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  /* OAuth 클릭 — Phase 1 A1 NextAuth v5 연결 전 임시 placeholder.
     연결 후: `signIn('google', { callbackUrl: redirectTo })` 로 교체. */
  const handleOAuth = async (provider: 'google' | 'apple') => {
    try {
      setOauthLoading(provider)
      console.log('[login] oauth start:', provider, '→', redirectTo)
      /* TODO(A1): await signIn(provider, { callbackUrl: redirectTo }) */
    } finally {
      setOauthLoading(null)
    }
  }

  const greeting = getGreeting()

  return (
    <main data-slot="login-form" className={styles.container.base}>
      {/* 워드마크 블록 — 램프 아이콘 + Todogram + 인사말 */}
      <section className={styles.wordmark.block}>
        <div className={styles.wordmark.lampWrap} aria-hidden="true">
          <Lightbulb03 className={styles.wordmark.lamp} strokeWidth={1.8} />
        </div>
        <h1 className={styles.wordmark.title}>Todogram</h1>
        {/* greeting 은 시간대에 따라 동적. 스크린리더는 h1 이후 자연 흐름 읽음. */}
        <p className={styles.wordmark.greeting}>{greeting}</p>
      </section>

      {/* OAuth 버튼 묶음 — Google(brand) → Apple(black) */}
      <section className={styles.oauth.list} aria-label="소셜 계정으로 로그인">
        <button
          type="button"
          onClick={() => handleOAuth('google')}
          disabled={oauthLoading !== null || isSubmitting}
          aria-busy={oauthLoading === 'google'}
          className={cx(styles.oauth.button, styles.oauth.google)}
        >
          <GoogleIcon className={styles.oauth.icon} />
          <span>
            {oauthLoading === 'google' ? '연결 중...' : 'Continue with Google'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleOAuth('apple')}
          disabled={oauthLoading !== null || isSubmitting}
          aria-busy={oauthLoading === 'apple'}
          className={cx(styles.oauth.button, styles.oauth.apple)}
        >
          <AppleIcon className={styles.oauth.icon} />
          <span>
            {oauthLoading === 'apple' ? '연결 중...' : 'Continue with Apple'}
          </span>
        </button>
      </section>

      {/* 이메일 disclosure — 접힘 기본, 클릭 시 폼 expand */}
      <section className={styles.email.group}>
        <button
          type="button"
          onClick={() => setShowEmailForm(v => !v)}
          aria-expanded={showEmailForm}
          aria-controls="login-email-panel"
          className={styles.email.trigger}
        >
          <span aria-hidden="true">ㆍ</span>
          <span>이메일로 계속</span>
          <ChevronDown className={styles.email.triggerIcon} />
        </button>

        {/* 확장 패널 — max-height + opacity 트랜지션. 접힘 상태에서도 DOM 유지 (focus 유지용) */}
        <div
          id="login-email-panel"
          className={cx(
            styles.email.panel,
            showEmailForm ? styles.email.panelOpen : styles.email.panelClosed
          )}
          aria-hidden={!showEmailForm}
        >
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            {/* 이메일 */}
            <div className={styles.email.field}>
              <Label htmlFor="login-email" className={styles.email.label}>
                ㆍ이메일
              </Label>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={formData.email}
                onChange={e => handleInputChange('email', e.target.value)}
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? 'login-email-error' : undefined}
                tabIndex={showEmailForm ? 0 : -1}
                className={cx(
                  styles.email.input,
                  errors.email && styles.email.inputError
                )}
              />
              {errors.email && (
                <p id="login-email-error" className={styles.email.error}>
                  {errors.email}
                </p>
              )}
            </div>

            {/* 비밀번호 + eye toggle */}
            <div className={styles.email.field}>
              <Label htmlFor="login-password" className={styles.email.label}>
                ㆍ비밀번호
              </Label>
              <div className={styles.email.eyeWrap}>
                <Input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="8자 이상"
                  value={formData.password}
                  onChange={e => handleInputChange('password', e.target.value)}
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={
                    errors.password ? 'login-password-error' : undefined
                  }
                  tabIndex={showEmailForm ? 0 : -1}
                  className={cx(
                    styles.email.input,
                    'pr-12',
                    errors.password && styles.email.inputError
                  )}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  aria-pressed={showPassword}
                  aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                  tabIndex={showEmailForm ? 0 : -1}
                  className={styles.email.eye}
                >
                  {showPassword ? (
                    <EyeOffIcon className="size-4" />
                  ) : (
                    <EyeIcon className="size-4" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p id="login-password-error" className={styles.email.error}>
                  {errors.password}
                </p>
              )}
            </div>

            {/* remember + forgot 한 줄 */}
            <div className={styles.email.meta}>
              <label className={styles.email.remember}>
                <Checkbox
                  checked={formData.rememberMe}
                  onCheckedChange={checked =>
                    handleInputChange('rememberMe', checked === true)
                  }
                  tabIndex={showEmailForm ? 0 : -1}
                />
                <span>로그인 상태 유지</span>
              </label>
              <Link
                href="/forgot-password"
                tabIndex={showEmailForm ? 0 : -1}
                className={styles.email.forgot}
              >
                비밀번호를 잊으셨나요?
              </Link>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || oauthLoading !== null}
              aria-busy={isSubmitting}
              tabIndex={showEmailForm ? 0 : -1}
              className={styles.email.submit}
            >
              {isSubmitting ? '로그인 중...' : '로그인'}
            </button>
          </form>
        </div>
      </section>

      {/* 하단 회원가입 링크 */}
      <footer className={styles.footer.wrap}>
        <p className={styles.footer.text}>
          계정이 없으신가요?{' '}
          <Link href="/signup" className={styles.footer.link}>
            회원가입
          </Link>
        </p>
      </footer>
    </main>
  )
}
