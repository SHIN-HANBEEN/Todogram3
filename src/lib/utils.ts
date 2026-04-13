import { extendTailwindMerge } from 'tailwind-merge'

// UntitledUI의 커스텀 display-* 텍스트 크기를 tailwind-merge가 인식하도록 확장
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        'display-xs',
        'display-sm',
        'display-md',
        'display-lg',
        'display-xl',
        'display-2xl',
      ],
    },
  },
})

// UntitledUI 스타일: className 병합 함수
export const cx = twMerge

// 기존 코드 호환성을 위해 cn도 동일하게 유지
export const cn = twMerge

// Tailwind IntelliSense가 style 객체 내 클래스를 정렬할 수 있도록 도와주는 헬퍼
export function sortCx<
  T extends Record<
    string,
    | string
    | number
    | Record<string, string | number | Record<string, string | number>>
  >,
>(classes: T): T {
  return classes
}
