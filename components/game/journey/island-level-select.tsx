'use client';
/* oxlint-disable next/no-img-element -- Local island paintings are embedded offline. */
import { useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import { archipelagoIslands, archipelagoArt } from '@/app/game/journey/archipelago';
import { islandSceneFor } from '@/app/game/journey/island-scenes';
import type { Progress } from '@/app/game/journey/progress';
import { MapScene } from './map-scene';

type Island = (typeof archipelagoIslands)[number];
type IslandScene = NonNullable<ReturnType<typeof islandSceneFor>>;
function SceneSection({scene,completed,allLevelsUnlocked,viewport,onSelect}:{
  scene:IslandScene;completed:Progress;allLevelsUnlocked:boolean;
  viewport:RefObject<HTMLDivElement|null>;onSelect:(id:string)=>void;
}) {
  const scroller=useRef<HTMLDivElement>(null),world=useRef<HTMLDivElement>(null);
  const done=scene.stops.filter(stop=>!stop.placeholder && completed[stop.id]>0).length;
  return <section className="island-original-section" data-island-authored-scene={scene.region.id} aria-label={scene.region.name}>
    <MapScene region={scene.region} visibleLevelIds={scene.levelIds} progress={completed} authoredMap
      allLevelsUnlocked={allLevelsUnlocked} planting={null} age={0} done={done} ratio={done/scene.levelIds.length}
      scroller={scroller} world={world} scrollViewport={viewport} onInspect={onSelect} />
  </section>;
}
/** One native-proportion authored map per island; original progression remains separate. */
export function IslandLevelSelect({ island, completed, allLevelsUnlocked, onBack, onSelect, tools }: {
  island: Island; completed: Progress; allLevelsUnlocked: boolean;
  onBack: () => void; onSelect: (id: string) => void; tools?:ReactNode;
}) {
  const scene=islandSceneFor(island.id);
  const scroller=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{
    const scroll=scroller.current;
    if(!scroll)return;
    const position=()=>scroll.scrollTo({top:scroll.scrollHeight,behavior:'instant'});
    position();const resize=new ResizeObserver(position);resize.observe(scroll);
    return ()=>resize.disconnect();
  },[island.id]);
  return <section className="island-level-select island-original-select" data-island-levels={island.id}
    data-scene-count={scene ? 1 : 0} aria-labelledby="island-levels-title">
    <h2 id="island-levels-title" className="garden-sr-only">{island.name} · 关卡选择</h2>
    {tools}
    <nav className="map-fan" data-island-map-entrance aria-label="地图切换">
      <button type="button" className="map-fan-toggle" data-levels-close onClick={onBack}
        aria-label={`当前地图：${island.name}，返回群岛选择`}>
        <img className="map-fan-current-art" src={archipelagoArt.entry} alt="" draggable={false} />
        <span className="map-fan-name">{island.name}</span>
      </button>
    </nav>
    {scene ? <div className="island-original-map island-continuous-map" ref={scroller} data-island-level-scroll tabIndex={0} aria-label={`${island.name}场景地图，可上下连续探索`}>
      <SceneSection key={scene.region.id} scene={scene} completed={completed}
        allLevelsUnlocked={allLevelsUnlocked} viewport={scroller} onSelect={onSelect}/>
    </div> : <div className="island-level-empty" data-island-empty>
      <img className="island-empty-sky" src={archipelagoArt.sky} alt="" />
      <img src={island.art} alt="" draggable={false} />
      <div><strong>关卡筹备中</strong><span>该岛暂无已制作关卡，保留原分类与数量</span></div>
    </div>}
  </section>;
}
