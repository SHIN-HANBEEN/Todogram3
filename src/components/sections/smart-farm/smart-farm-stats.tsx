// AgriSense AI 핵심 성과 지표 섹션
const stats = [
  {
    value: '500+',
    label: '파트너 농장',
    description: '전국 규모로 운영 중',
  },
  {
    value: '32%',
    label: '수확량 증가',
    description: '평균 첫 시즌 기준',
  },
  {
    value: '45%',
    label: '비용 절감',
    description: '운영 및 인건비 포함',
  },
  {
    value: '99.9%',
    label: '시스템 가동률',
    description: '연간 SLA 기준',
  },
]

export const SmartFarmStats = () => {
  return (
    <section className="bg-bg-brand-section py-16 md:py-20">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        {/* 섹션 헤더 */}
        <div className="mb-12 text-center">
          <p className="text-text-secondary_on-brand mb-2 text-sm font-semibold uppercase tracking-widest">
            검증된 성과
          </p>
          <h2 className="text-text-primary_on-brand text-display-sm font-bold md:text-display-md">
            전국 스마트팜이 AgriSense를 선택한 이유
          </h2>
        </div>

        {/* 통계 그리드 */}
        <dl className="grid grid-cols-2 gap-8 lg:grid-cols-4">
          {stats.map(stat => (
            <div
              key={stat.label}
              className="border-border-brand/30 flex flex-col items-center gap-1 border-b pb-8 text-center last:border-b-0 lg:border-b-0 lg:border-r lg:pb-0 lg:last:border-r-0"
            >
              {/* 수치 */}
              <dt className="text-text-primary_on-brand text-display-md font-bold md:text-display-lg">
                {stat.value}
              </dt>
              {/* 라벨 */}
              <dd className="text-text-primary_on-brand text-lg font-semibold">
                {stat.label}
              </dd>
              {/* 설명 */}
              <p className="text-text-secondary_on-brand text-sm">
                {stat.description}
              </p>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
