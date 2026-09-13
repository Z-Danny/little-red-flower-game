'use client';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  journeyMap,
  nodeStatus,
  regionProgress,
  journeyTiming,
  type Progress,
  type Planting,
} from '@/app/game/journey/progress';
import {
  regionFor,
  nodeFor,
  nextNode,
  flowerTotal,
} from '@/app/game/journey/progress';
export function useMapJourney({
  completed,
  planting,
  onPlanted,
  focusId,
  onVisit,
}: {
  completed: Progress;
  planting: Planting | null;
  onPlanted: () => void;
  focusId: string | null;
  onVisit?: (id: string) => void;
}) {
  const initialRegion = regionFor(focusId ?? '') ?? journeyMap.regions[0];
  const initialId =
    focusId ??
    initialRegion.nodes.find((n) => nodeStatus(n.id, completed) === 'available')
      ?.id ??
    initialRegion.nodes[0].id;
  const [regionId, setRegionId] = useState(
    regionFor(focusId ?? '')?.id ?? 'nature',
  );
  const [age, setAge] = useState(0);
  const [focusRequest, setFocusRequest] = useState<{
    id: string;
    smooth: boolean;
    align: number;
  } | null>({ id: initialId, smooth: false, align: planting ? 0.5 : 0.78 });
  const scroller = useRef<HTMLDivElement>(null),
    world = useRef<HTMLDivElement>(null);
  const [animatedWallet, setWallet] = useState(
    planting ? flowerTotal(planting.before) : flowerTotal(completed),
  );
  const progress =
    planting && age < journeyTiming.unlock ? planting.before : completed;
  const region = journeyMap.regions.find((r) => r.id === regionId)!;
  const current = region.nodes.find(
    (n) => nodeStatus(n.id, progress) === 'available',
  );
  const done = regionProgress(region, progress),
    ratio = done / region.nodes.length;
  const focus = useCallback(
    (id: string, smooth = true, align = 0.55) => {
      onVisit?.(id);
      setRegionId(regionFor(id)!.id);
      setFocusRequest({ id, smooth, align });
    },
    [onVisit],
  );
  useLayoutEffect(() => {
    if (!focusRequest || !scroller.current || !world.current) return;
    const node = nodeFor(focusRequest.id);
    if (!node) return;
    const scroll = scroller.current,
      painting = world.current;
    const position = () =>
      scroll.scrollTo({
        top: Math.max(
          0,
          (node.y / region.height) * painting.clientHeight -
            Math.min(
              scroll.clientHeight * focusRequest.align,
              scroll.clientHeight - 145,
            ),
        ),
        behavior:
          focusRequest.smooth &&
          !matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'smooth'
            : 'instant',
      });
    position();
    const resize = new ResizeObserver(position);
    resize.observe(scroll);
    return () => resize.disconnect();
  }, [focusRequest, regionId, region.height]);
  useEffect(() => {
    if (!planting) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0,
      last = performance.now(),
      elapsed = 0,
      guided = false;
    const loop = (now: number) => {
      const dt = Math.min(now - last, 60);
      last = now;
      if (!document.hidden) elapsed += dt;
      const t = reduced ? Math.min(journeyTiming.end, elapsed * 2) : elapsed;
      setAge(t);
      if (t >= journeyTiming.count)
        setWallet(
          Math.min(
            flowerTotal(completed),
            flowerTotal(planting.before) +
              1 +
              Math.floor((t - journeyTiming.count) / 110),
          ),
        );
      if (t >= journeyTiming.guide && !guided) {
        guided = true;
        const next = nextNode(planting.levelId, completed);
        if (next && regionFor(next.id)?.id === regionFor(planting.levelId)?.id)
          focus(next.id);
      }
      if (t >= journeyTiming.end) {
        onPlanted();
        return;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [planting, completed, onPlanted, focus]);
  return {
    region,
    progress,
    current,
    done,
    ratio,
    age,
    wallet: planting ? animatedWallet : flowerTotal(completed),
    scroller,
    world,
    focus,
  };
}
