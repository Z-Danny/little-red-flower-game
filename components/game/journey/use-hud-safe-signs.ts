import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

type Rect = Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>;
export type SignLayout = {
  side: 'left' | 'right';
  offsetX: number;
  offsetY: number;
  width: number;
};
const intersects = (a: Rect, b: Rect) =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
const gap = (a: Rect, b: Rect) =>
  Math.hypot(
    Math.max(a.left - b.right, b.left - a.right, 0),
    Math.max(a.top - b.bottom, b.top - a.bottom, 0),
  );
const touchRect = (rect: Rect): Rect => {
  const extension = Math.max(0, (44 - (rect.bottom - rect.top)) / 2);
  return {
    // DOMRect coordinates are prototype getters, so object spread drops them.
    left: rect.left,
    right: rect.right,
    top: rect.top - extension,
    bottom: rect.bottom + extension,
  };
};
const sameLayout = (a: SignLayout | undefined, b: SignLayout) =>
  a?.side === b.side &&
  a.offsetX === b.offsetX &&
  a.offsetY === b.offsetY &&
  a.width === b.width;

/** Remember HUD-avoiding titles, while solving their positions from their flowers. */
export function useHudSafeSigns(
  scroller: RefObject<HTMLDivElement | null>,
  world: RefObject<HTMLDivElement | null>,
  regionId: string,
): ReadonlyMap<string, SignLayout> {
  const [layouts, setLayouts] = useState<ReadonlyMap<string, SignLayout>>(
    () => new Map(),
  );
  const remembered = useRef(layouts);
  const recheck = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    const scroll = scroller.current;
    const painting = world.current;
    const tools = scroll
      ?.closest('.garden-shell')
      ?.querySelector<HTMLElement>('.map-corner-tools');
    if (!scroll || !painting || !tools) return;
    let frame: number | null = null;
    let disposed = false;

    const measure = () => {
      const viewport = scroll.getBoundingClientRect();
      const hud = tools.getBoundingClientRect();
      const bounds = {
        left: Math.max(viewport.left, 0),
        right: Math.min(viewport.right, window.innerWidth),
        top: Math.max(viewport.top, 0),
        bottom: Math.min(viewport.bottom, window.innerHeight),
      };
      const visible = {
        left: Math.max(hud.left, bounds.left),
        right: Math.min(hud.right, bounds.right),
        top: Math.max(hud.top, bounds.top),
        bottom: Math.min(hud.bottom, bounds.bottom),
      };
      if (visible.left >= visible.right || visible.top >= visible.bottom)
        return;

      let next: Map<string, SignLayout> | undefined;
      for (const node of painting.querySelectorAll<HTMLElement>(
        '.garden-node[data-sign-side="right"]',
      )) {
        const id = node.dataset.mapNode;
        if (!id || remembered.current.has(id)) continue;
        const label = node.querySelector<HTMLElement>('.garden-node-label');
        if (
          label &&
          intersects(touchRect(label.getBoundingClientRect()), visible)
        ) {
          const anchor = node.getBoundingClientRect();
          next ??= new Map(remembered.current);
          next.set(id, {
            side: 'left',
            offsetX: 0,
            offsetY: 0,
            width: Math.min(
              152,
              (anchor.left + anchor.right) / 2 - bounds.left - 40,
            ),
          });
        }
      }
      // Apply a newly flipped side before measuring its wrapped title.
      if (next) {
        remembered.current = next;
        setLayouts(next);
        return;
      }

      const signs = Array.from(
        painting.querySelectorAll<HTMLElement>('.garden-node'),
      )
        .map((node) => {
          const label = node.querySelector<HTMLElement>('.garden-node-label');
          const bed = node.querySelector<HTMLElement>('.garden-node-bed');
          const title = label?.querySelector<HTMLElement>('.garden-node-title');
          if (!node.dataset.mapNode || !label || !bed || !title) return null;
          const anchor = node.getBoundingClientRect();
          const centerX = (anchor.left + anchor.right) / 2;
          const centerY = (anchor.top + anchor.bottom) / 2;
          const width = Math.min(152, Math.max(44, centerX - bounds.left - 40));
          const measured = label.getBoundingClientRect();
          const previousLayout = remembered.current.get(node.dataset.mapNode);
          const inView =
            intersects(anchor, bounds) ||
            intersects(touchRect(measured), bounds);
          // Offscreen signs retain their last layout until their flower or sign
          // enters view. Scrolling must not keep changing invisible labels.
          const movable = !!previousLayout && inView;
          const sizes = new Map<number, { width: number; height: number }>([
            [
              measured.width,
              { width: measured.width, height: measured.height },
            ],
          ]);
          // Measure only width-dependent wrapping, then restore the DOM before
          // paint. Cache for this sign/font/frame: extra collision passes must
          // not repeat the same forced layout. Never cache across font/resize.
          const measureWidth = (candidate: number) => {
            const cached = sizes.get(candidate);
            if (cached) return cached;
            const previousWidth = label.style.width;
            try {
              label.style.width = `${candidate}px`;
              const measured = label.getBoundingClientRect();
              const size = { width: measured.width, height: measured.height };
              sizes.set(candidate, size);
              return size;
            } finally {
              label.style.width = previousWidth;
            }
          };
          const size = movable ? measureWidth(width) : measured;
          const original: Rect = movable
            ? {
                left: anchor.left - 2 - size.width,
                right: anchor.left - 2,
                top: centerY - size.height / 2,
                bottom: centerY + size.height / 2,
              }
            : measured;
          const style = movable ? getComputedStyle(title) : null;
          // Keep at least three Chinese glyphs per line when a narrow map needs
          // a compact sign. Font size and artwork stay unchanged.
          const minimumWidth = style
            ? Math.ceil(
                Number.parseFloat(style.fontSize) * 3 +
                  Number.parseFloat(style.paddingLeft) +
                  Number.parseFloat(style.paddingRight),
              )
            : measured.width;
          return {
            id: node.dataset.mapNode,
            anchor,
            centerX,
            centerY,
            movable,
            original,
            rect: original,
            bed: bed.getBoundingClientRect(),
            measureWidth,
            minimumWidth,
            layout:
              (!inView && previousLayout) ||
              ({
                side: 'left',
                offsetX: 0,
                offsetY: 0,
                width: size.width,
              } as SignLayout),
          };
        })
        .filter((sign) => sign !== null);

      // A quarter pixel protects true edge contact from CSS subpixel rounding.
      const clearance = 0.25;
      for (let pass = 0; pass < signs.length; pass++) {
        let moved = false;
        for (const sign of signs) {
          if (!sign.movable) continue;
          const obstacles: Rect[] = [visible];
          for (const other of signs) {
            if (other.id === sign.id) continue;
            const otherTouch = touchRect(other.rect);
            if (intersects(otherTouch, bounds)) obstacles.push(otherTouch);
            if (intersects(other.bed, bounds)) obstacles.push(other.bed);
          }
          const fits = (rect: Rect) => {
            const touch = touchRect(rect);
            const ownGap = gap(rect, sign.bed);
            return (
              touch.left >= bounds.left + 10 &&
              touch.right <= bounds.right - 10 &&
              touch.top >= bounds.top &&
              touch.bottom <= bounds.bottom &&
              !intersects(rect, sign.bed) &&
              ownGap <= 36 &&
              obstacles.every((obstacle) => !intersects(touch, obstacle)) &&
              signs.every(
                (other) =>
                  other.id === sign.id || gap(rect, other.bed) + 2 >= ownGap,
              )
            );
          };
          const verticalCandidates = (
            left: number,
            width: number,
            height: number,
          ) => {
            const extension = Math.max(0, (44 - height) / 2);
            const across = obstacles.filter(
              (r) => left < r.right && left + width > r.left,
            );
            return [
              sign.centerY - height / 2,
              bounds.top + extension,
              bounds.bottom - height - extension,
              sign.bed.bottom + clearance,
              sign.bed.top - height - clearance,
              ...across.flatMap((r) => [
                r.bottom + extension + clearance,
                r.top - height - extension - clearance,
              ]),
            ].map(
              (top): Rect => ({
                left,
                right: left + width,
                top,
                bottom: top + height,
              }),
            );
          };
          const score = (a: Rect, b: Rect) =>
            gap(a, sign.bed) - gap(b, sign.bed) ||
            Math.abs((a.top + a.bottom) / 2 - sign.centerY) -
              Math.abs((b.top + b.bottom) / 2 - sign.centerY) ||
            b.right - b.left - (a.right - a.left) ||
            Math.abs((a.left + a.right) / 2 - sign.centerX) -
              Math.abs((b.left + b.right) / 2 - sign.centerX) ||
            b.top - a.top;
          const originalWidth = sign.original.right - sign.original.left;
          const originalHeight = sign.original.bottom - sign.original.top;
          // Preserve the established left-side layout whenever a vertical gap
          // exists. Only a genuinely crowded gap invokes the shared 2D solver.
          let chosen = verticalCandidates(
            sign.original.left,
            originalWidth,
            originalHeight,
          )
            .filter(fits)
            .sort(score)[0];
          if (!chosen) {
            const widths = [originalWidth, sign.minimumWidth];
            for (let width = 152; width >= sign.minimumWidth; width -= 16)
              widths.push(width);
            const alternatives: Rect[] = [];
            for (const width of new Set(widths)) {
              if (
                width < sign.minimumWidth ||
                width > bounds.right - bounds.left - 20
              )
                continue;
              const size = sign.measureWidth(width);
              const xs = [
                sign.anchor.left - 2 - size.width,
                sign.anchor.right + 2,
                bounds.left + 10,
                bounds.right - 10 - size.width,
                ...[sign.bed, ...obstacles].flatMap((r) => [
                  r.right + clearance,
                  r.left - size.width - clearance,
                ]),
              ];
              for (const left of new Set(xs)) {
                if (
                  left < bounds.left + 10 ||
                  left + size.width > bounds.right - 10
                )
                  continue;
                alternatives.push(
                  ...verticalCandidates(left, size.width, size.height).filter(
                    fits,
                  ),
                );
              }
            }
            chosen = alternatives.sort(score)[0];
          }
          // If geometry is impossible, retain the flower anchor for QA rather
          // than silently attaching this sign to a different flower.
          const rect = chosen ?? sign.original;
          const width = rect.right - rect.left;
          const side =
            (rect.left + rect.right) / 2 < sign.centerX ? 'left' : 'right';
          const baseLeft =
            side === 'left'
              ? sign.anchor.left - 2 - width
              : sign.anchor.right + 2;
          const layout: SignLayout = {
            side,
            width,
            offsetX: rect.left - baseLeft,
            offsetY: (rect.top + rect.bottom) / 2 - sign.centerY,
          };
          if (!sameLayout(sign.layout, layout)) moved = true;
          sign.rect = rect;
          sign.layout = layout;
        }
        if (!moved) break;
      }
      for (const sign of signs) {
        if (
          !sign.movable ||
          sameLayout(remembered.current.get(sign.id), sign.layout)
        )
          continue;
        next ??= new Map(remembered.current);
        next.set(sign.id, sign.layout);
      }
      if (next) {
        remembered.current = next;
        setLayouts(next);
      }
    };

    const schedule = () => {
      if (disposed || frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        measure();
      });
    };
    const resize = new ResizeObserver(schedule);
    resize.observe(scroll);
    resize.observe(painting);
    resize.observe(tools);
    for (const label of painting.querySelectorAll('.garden-node-label'))
      resize.observe(label);
    scroll.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    recheck.current = schedule;
    schedule();

    return () => {
      disposed = true;
      recheck.current = null;
      if (frame !== null) cancelAnimationFrame(frame);
      resize.disconnect();
      scroll.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [scroller, world, regionId]);

  useLayoutEffect(() => {
    recheck.current?.();
  }, [layouts]);
  return layouts;
}
