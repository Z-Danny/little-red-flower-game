export type ViewportMetrics = { width: number; height: number; offsetLeft: number; offsetTop: number };
export type SurfaceFrame = { x: number; y: number; width: number; height: number; mobile: boolean };
/** Portrait phones fill available content. Only desktop/wide surfaces get a portrait window. */
export function fitSurface(viewport: ViewportMetrics, design: { width: number; height: number }): SurfaceFrame {
  const w = Math.max(1, viewport.width), h = Math.max(1, viewport.height);
  const mobile = w <= 600 && h >= w;
  const aspect = design.width / design.height;
  const width = mobile ? w : Math.min(520, w, h * aspect);
  const height = mobile ? h : Math.min(h, width / aspect);
  return { x: viewport.offsetLeft + (w - width) / 2, y: viewport.offsetTop, width, height, mobile };
}
export function readViewport(): ViewportMetrics {
  if (typeof window === 'undefined') return { width: 390, height: 844, offsetLeft: 0, offsetTop: 0 };
  const vv = window.visualViewport;
  return { width: vv?.width || window.innerWidth, height: vv?.height || window.innerHeight, offsetLeft: vv?.offsetLeft || 0, offsetTop: vv?.offsetTop || 0 };
}
