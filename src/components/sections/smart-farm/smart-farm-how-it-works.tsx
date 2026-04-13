// 시작 3단계 프로세스 데이터
const steps = [
  {
    step: '01',
    title: 'IoT 센서 설치',
    description:
      '농장 곳곳에 AgriSense 스마트 센서를 설치하고 앱으로 연결하세요. 평균 설치 시간은 4시간이며, 전문 엔지니어가 직접 방문해 설치를 도와드립니다.',
    note: '설치 지원 포함 / 평균 4시간 완료',
  },
  {
    step: '02',
    title: 'AI 실시간 분석',
    description:
      '수집된 센서 데이터를 AI가 실시간으로 분석하여 작물 상태와 최적의 재배 환경을 파악합니다. 앱과 대시보드에서 인사이트를 즉시 확인하세요.',
    note: '24시간 실시간 / 14일 예측 제공',
  },
  {
    step: '03',
    title: '자동 최적화 실행',
    description:
      'AI 추천에 따라 관개, 조명, 환기 시스템이 자동으로 조정됩니다. 직접 개입 없이 최적의 재배 환경이 유지되며, 언제든 수동 제어도 가능합니다.',
    note: '자동 제어 / 원격 수동 오버라이드',
  },
]

export const SmartFarmHowItWorks = () => {
  return (
    <section className="bg-bg-secondary py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        {/* 섹션 헤더 */}
        <div className="mb-16 text-center">
          <p className="text-text-brand-tertiary mb-3 text-sm font-semibold uppercase tracking-widest">
            시작 가이드
          </p>
          <h2 className="text-text-primary mb-4 text-display-sm font-bold md:text-display-md">
            세 단계로 시작하는 스마트 농업
          </h2>
          <p className="text-text-tertiary mx-auto max-w-xl text-lg">
            복잡한 설정 없이 빠르게 시작하세요. 전문팀이 전 과정을 지원합니다.
          </p>
        </div>

        {/* 단계별 카드 — 데스크탑에서 가로 연결선 표시 */}
        <div className="relative grid gap-8 md:grid-cols-3">
          {/* 연결선 — 데스크탑 전용 */}
          <div
            aria-hidden="true"
            className="border-border-secondary absolute top-8 right-[calc(33.33%+1rem)] left-[calc(33.33%+1rem)] hidden border-t-2 border-dashed md:block"
          />
          <div
            aria-hidden="true"
            className="border-border-secondary absolute top-8 right-[calc(33.33%-1rem+2px)] left-[calc(66.66%+1rem)] hidden border-t-2 border-dashed md:block"
          />

          {steps.map((step, index) => (
            <div key={step.step} className="relative flex flex-col gap-4">
              {/* 단계 번호 뱃지 */}
              <div className="flex items-center gap-4 md:flex-col md:items-start">
                <div className="bg-bg-brand-solid text-text-white flex size-16 shrink-0 items-center justify-center rounded-2xl text-display-xs font-bold shadow-md">
                  {step.step}
                </div>
                {/* 모바일 전용 연결선 */}
                {index < steps.length - 1 && (
                  <div
                    aria-hidden="true"
                    className="border-border-secondary flex-1 border-t-2 border-dashed md:hidden"
                  />
                )}
              </div>

              {/* 단계 내용 */}
              <div>
                <h3 className="text-text-primary mb-2 text-xl font-bold">
                  {step.title}
                </h3>
                <p className="text-text-tertiary mb-4 leading-relaxed">
                  {step.description}
                </p>
                {/* 단계별 부가 정보 */}
                <div className="border-border-secondary bg-bg-primary inline-flex rounded-full border px-3 py-1">
                  <span className="text-text-secondary text-xs font-semibold">
                    {step.note}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
