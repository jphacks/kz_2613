// 画面のアイコン (#515)。フォントの記号・絵文字は端末やフォントで形・太さ・位置がずれ、絵文字として色付きで出ることも
// あるので、SVG で持つ。色は currentColor (文字の色) に合わせ、大きさは 1em (文字の大きさ) に合わせる。
// 読み上げには使わない (aria-hidden)。意味はボタンの aria-label や文字で伝える。外部の CDN・アイコンのフォントは使わない。
// 画面の試験 (TSX を1つずつ変換して読む) からも読めるよう、JSX を使わず createElement で組み立てる。
import { createElement as h, Fragment, type ReactElement } from 'react';

export type IconName =
  | 'arrow-up'
  | 'arrow-down'
  | 'arrow-left'
  | 'arrow-right'
  | 'more'
  | 'undo'
  | 'sparkle'
  | 'warning'
  | 'external';

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
const path = (d: string, extra: object = {}) => h('path', { d, ...extra });
const dot = (cx: number, cy: number, r: number) => h('circle', { cx, cy, r });
const group = (...children: ReactElement[]) => h(Fragment, null, ...children);

const SHAPES: Record<IconName, () => ReactElement> = {
  // スティックの矢印 (▲▼◀▶ の代わり)
  'arrow-up': () => path('M12 4.5 20.5 18.5h-17z'),
  'arrow-down': () => path('M12 19.5 3.5 5.5h17z'),
  'arrow-left': () => path('M4.5 12 18.5 3.5v17z'),
  'arrow-right': () => path('M19.5 12 5.5 20.5v-17z'),
  // そのほかの操作 (⋯)
  more: () => group(dot(5, 12, 2.2), dot(12, 12, 2.2), dot(19, 12, 2.2)),
  // 元に戻す (↶)
  undo: () => group(path('M9 14 4 9l5-5', stroke), path('M4 9h10.5a5.5 5.5 0 0 1 0 11H11', stroke)),
  // 飾りの星 (✦)
  sparkle: () => path('M12 4c.6 5.4 2.6 7.4 8 8-5.4.6-7.4 2.6-8 8-.6-5.4-2.6-7.4-8-8 5.4-.6 7.4-2.6 8-8z'),
  // 注意 (⚠)
  warning: () => group(path('M12 3.5 2.5 20h19z', stroke), path('M12 10v4.5', stroke), dot(12, 17.3, 1.3)),
  // 別のタブで開く (↗)
  external: () => group(path('M7 17 17 7', stroke), path('M9 7h8v8', stroke)),
};

/** アイコン 1 つ。data-icon は試験と見た目の調整に使う */
export function Icon({ name, className }: { name: IconName; className?: string }) {
  return h(
    'svg',
    {
      className: className ? `icon ${className}` : 'icon',
      'data-icon': name,
      viewBox: '0 0 24 24',
      width: '1em',
      height: '1em',
      fill: 'currentColor',
      'aria-hidden': 'true',
      focusable: 'false',
    },
    SHAPES[name](),
  );
}

/** スティックの向き → 矢印のアイコン */
export const arrowIcon = (direction: 'up' | 'down' | 'left' | 'right'): IconName => `arrow-${direction}`;
