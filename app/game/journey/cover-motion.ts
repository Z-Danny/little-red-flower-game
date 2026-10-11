/** Decorative only: stable seeds keep SSR and client leaf geometry identical. */
export const COVER_DEPARTURE_MS = 1800;
export const COVER_IDLE_LEAF_COUNT = 4;
export const COVER_GUST_LEAF_COUNT = 48;

export function coverGustLeaves() {
  let seed = 27092026;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  return Array.from({ length: COVER_GUST_LEAF_COUNT }, (_, id) => {
    const near = id % 4 === 0;
    const leftBranch = id % 3 === 0;
    return {
      id,
      near,
      x: leftBranch ? 2 + random() * 20 : 5 + random() * 90,
      y: leftBranch ? 5 + random() * 23 : -8 + random() * 15,
      size: near ? 27 + random() * 13 : 11 + random() * 13,
      delay: random() * 380,
      duration: near ? 1700 + random() * 500 : 2250 + random() * 850,
      drift: 22 + random() * 90,
      sway: 9 + random() * 24,
      angle: -80 + random() * 150,
      turn: 75 + random() * 120,
      opacity: near ? 0.94 : 0.54 + random() * 0.28,
    };
  });
}
