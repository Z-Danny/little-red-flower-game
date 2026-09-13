import { camera, type HuntSkin } from './schema';
import policy from '@/content/hunt-viewport.json';
export const huntViewportPolicy = policy;
export type SafeInsets = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

/** One transform for the painting, effects, rings and inverse hit coordinates. */
export function sceneCamera(s: HuntSkin, w: number, h: number, cover = true) {
  if (cover) {
    const scale = Math.max(w / s.width, h / s.height);
    return {
      x: (w - s.width * scale) / 2,
      y: (h - s.height * scale) / 2,
      scaleX: scale,
      scaleY: scale,
    };
  }
  const c = camera(s, w, h);
  return { x: c.x, y: c.y, scaleX: c.scale, scaleY: c.scale };
}

/** Fit a normal portrait game, not a stretched desktop-sized painting. */
export function phoneFrame(
  s: Pick<HuntSkin, 'width' | 'height'>,
  w: number,
  h: number,
  safe: SafeInsets = { left: 0, right: 0, top: 0, bottom: 0 },
) {
  const mobile = w <= policy.mobileMaxWidth && h >= w;
  const width = mobile
    ? w
    : Math.min(policy.desktopMaxWidth, w, (h * s.width) / s.height);
  const height = mobile ? h : (width * s.height) / s.width;
  return {
    x: (w - width) / 2,
    y: 0,
    width,
    height,
  };
}

/** Reference layout: a centered horizontal clue row below the floating HUD. */
export function clueLayout(
  s: HuntSkin,
  w: number,
  h: number,
  headerBottom = policy.headerHeight,
  safe: SafeInsets = { left: 0, right: 0, top: 0, bottom: 0 },
) {
  const count = Object.keys(s.targets).length;
  const available = Math.max(
    1,
    w - safe.left - safe.right - policy.edgePadding * 2,
  );
  const gap = available >= 243 ? policy.clueGap : 5;
  const tileW = Math.min(
    policy.clueWidth,
    Math.max(1, Math.floor((available - (count - 1) * gap) / count)),
  );
  const tileH = Math.min(policy.clueHeight, tileW + 4);
  const width = count * tileW + (count - 1) * gap;
  return {
    left: safe.left + policy.edgePadding + (available - width) / 2,
    top: Math.min(
      headerBottom + policy.clueTopGap,
      h - safe.bottom - tileH - policy.edgePadding,
    ),
    column: false,
    tileW,
    tileH,
    gap,
  };
}

/** Canvas, rings and pointer masks share this inverse. CSS pixels, never device pixels. */
export function pointerToScene(
  s: HuntSkin,
  rect: { left: number; top: number; width: number; height: number },
  clientX: number,
  clientY: number,
) {
  const c = sceneCamera(s, rect.width, rect.height);
  return {
    x: (clientX - rect.left - c.x) / c.scaleX,
    y: (clientY - rect.top - c.y) / c.scaleY,
  };
}

/** Release gate for new art. Existing packs are audited, not silently moved or stretched. */
export function auditHuntViewport(s: HuntSkin) {
  return policy.acceptanceViewports.flatMap(([w, h]) => {
    const frame = phoneFrame(s, w, h),
      c = sceneCamera(s, frame.width, frame.height);
    const checks = Object.entries(s.targets).map(([id, t]) => ({
      id,
      box: t.bounds,
    }));
    for (const [i, box] of (s.criticalRegions ?? []).entries())
      checks.push({ id: `critical-${i}`, box });
    return checks.flatMap(({ id, box: b }) => {
      const x = c.x + b.x * c.scaleX,
        y = c.y + b.y * c.scaleY,
        right = x + b.w * c.scaleX,
        bottom = y + b.h * c.scaleY;
      if (
        x < -0.1 ||
        y < -0.1 ||
        right > frame.width + 0.1 ||
        bottom > frame.height + 0.1
      )
        return [
          {
            id,
            viewport: [w, h],
            reason: 'critical-content-cropped',
            bounds: { x, y, right, bottom },
          },
        ];
      const row = clueLayout(s, frame.width, frame.height);
      return y < row.top + row.tileH + 8
        ? [
            {
              id,
              viewport: [w, h],
              reason: 'critical-content-in-hud-band',
              bounds: { x, y, right, bottom },
            },
          ]
        : [];
    });
  });
}
