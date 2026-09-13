/** Canvas labels share the CSS font token used by DOM controls.
 * Resolve once per page, outside repeated style/layout reads during rendering.
 * Changing a font asset or token takes effect on the next page load.
 */
let bodyFamily: string | undefined;
export function canvasLabelFont(size: number, weight = 600): string {
  bodyFamily ??=
    (typeof document !== 'undefined'
      ? getComputedStyle(document.documentElement)
          .getPropertyValue('--font-game-body')
          .trim()
      : '') || 'sans-serif';
  return `${weight} ${size}px ${bodyFamily}`;
}
