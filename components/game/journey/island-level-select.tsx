'use client';
/* oxlint-disable next/no-img-element -- Original embedded map artwork, not a new composition. */
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { archipelagoIslands, archipelagoArt } from '@/app/game/journey/archipelago';
import { originalScenesForIsland } from '@/app/game/journey/island-scenes';
import { nodeStatus, type Progress } from '@/app/game/journey/progress';
import { getLevel } from '@/app/game/levels';
import { MapScene } from './map-scene';

type Island = (typeof archipelagoIslands)[number];
/** Reuse the original scene renderer. Multiple source paintings stay inside the new island. */
export function IslandLevelSelect({ island, completed, allLevelsUnlocked, onBack, onSelect }: {
  island: Island; completed: Progress; allLevelsUnlocked: boolean;
  onBack: () => void; onSelect: (id: string) => void;
}) {
  const scenes = useMemo(() => originalScenesForIsland(island.id), [island.id]);
  const [sceneId, setSceneId] = useState(() => scenes[0]?.region.id);
  const active = scenes.find(scene => scene.region.id === sceneId) ?? scenes[0];
  const scroller = useRef<HTMLDivElement>(null), world = useRef<HTMLDivElement>(null);
  const target = active?.levelIds.find(id => nodeStatus(id, completed, allLevelsUnlocked) === 'available') ?? active?.levelIds[0];
  useLayoutEffect(() => {
    if (!active || !scroller.current || !world.current) return;
    const scroll = scroller.current, painting = world.current;
    const node = active.region.nodes.find(node => node.id === target)!;
    const position = () => scroll.scrollTo({ top: Math.max(0, node.y / active.region.height * painting.clientHeight - scroll.clientHeight * .62), behavior:'instant' });
    position();
    const resize = new ResizeObserver(position); resize.observe(scroll);
    return () => resize.disconnect();
  }, [active, target]);
  const available = island.levelIds.filter(id => getLevel(id)?.playable).length;
  const done = active?.levelIds.filter(id => completed[id] > 0).length ?? 0;
  return <section className="island-level-select island-original-select" data-island-levels={island.id}
    data-original-scene={active?.region.id ?? ''} data-scene-count={scenes.length} aria-labelledby="island-levels-title">
    <header className="island-level-header">
      <button type="button" className="island-round-button" data-levels-close onClick={onBack} aria-label="返回岛屿选择"><ArrowLeft /></button>
      <div><p>关卡选择</p><h2 id="island-levels-title">{island.name}</h2></div>
      <span>{available}关开放</span>
    </header>
    {scenes.length > 1 && <nav className="island-original-tabs" aria-label="岛内原版场景">
      {scenes.map(scene => <button type="button" key={scene.region.id} data-island-scene-tab={scene.region.id}
        aria-pressed={scene.region.id === active.region.id} onClick={() => setSceneId(scene.region.id)}>
        {scene.region.short}<small>{scene.levelIds.length}关</small>
      </button>)}
    </nav>}
    {active ? <div className="island-original-map">
      <MapScene key={`${island.id}:${active.region.id}`} region={active.region} visibleLevelIds={active.levelIds}
        progress={completed} allLevelsUnlocked={allLevelsUnlocked} planting={null} age={0}
        done={done} ratio={done / active.levelIds.length} scroller={scroller} world={world} onInspect={onSelect} />
    </div> : <div className="island-level-empty" data-island-empty>
      <img className="island-empty-sky" src={archipelagoArt.sky} alt="" />
      <img src={island.art} alt="" draggable={false} />
      <div><strong>关卡筹备中</strong><span>该岛暂无已制作关卡，保留原分类与数量</span></div>
    </div>}
  </section>;
}
