'use client';

import { useRef, useState } from 'react';
import { Check, LoaderCircle, Search } from 'lucide-react';
import { GameIcon } from '@/app/game/icon-map';
import type { DragItem, LevelConfig } from '@/app/game/types';

type SharedProps = {
  level: LevelConfig;
  resolved: Set<string>;
  hintId: string | null;
  processingId?: string | null;
};

export function FindScene({ level, resolved, hintId, processingId, onResolve, onMiss }: SharedProps & { onResolve: (id: string) => void; onMiss: () => void }) {
  const [missPoint, setMissPoint] = useState<{ x: number; y: number; nonce: number } | null>(null);
  return (
    <div className="scene-interaction-layer">
      <button
        className="scene-miss-catcher"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setMissPoint({ x: ((event.clientX - rect.left) / rect.width) * 100, y: ((event.clientY - rect.top) / rect.height) * 100, nonce: Date.now() });
          onMiss();
        }}
        aria-label="检查场景背景"
      />
      {missPoint && <span key={missPoint.nonce} className="miss-ripple" style={{ left: `${missPoint.x}%`, top: `${missPoint.y}%` }}><Search /></span>}
      {level.objectives?.map((objective) => {
        const done = resolved.has(objective.id);
        const isGoal = level.goals.includes(objective.id);
        const requirementsMet = (objective.requires ?? []).every((requirement) => resolved.has(requirement));
        if ((!isGoal && done) || (isGoal && !requirementsMet)) return null;
        const processing = processingId === objective.id;
        return (
          <button
            key={objective.id}
            className={`find-hotspot ${done ? 'resolved' : ''} ${processing ? 'processing' : ''} ${hintId === objective.id ? 'hinted' : ''} ${isGoal ? '' : 'discovery'}`}
            style={{ left: `${objective.position.x}%`, top: `${objective.position.y}%`, width: `${objective.size ?? 13}%`, height: `${objective.size ?? 13}%` }}
            onClick={() => onResolve(objective.id)}
            disabled={done || Boolean(processingId)}
            aria-label={`${done ? '已处理' : '处理'}${objective.label}`}
          >
            <span className="hit-feedback">{processing ? <LoaderCircle /> : done ? <Check /> : <Search />}</span>
            {(done || processing) && <span className="hit-status"><GameIcon name={objective.icon} />{processing ? '处理中…' : '已排除'}</span>}
          </button>
        );
      })}
    </div>
  );
}

type ResponseProps = SharedProps & {
  selectedItem: string | null;
  setSelectedItem: (id: string | null) => void;
  onDrop: (itemId: string, zoneId: string) => void;
};

export function ResponseScene({ level, resolved, hintId, selectedItem, setSelectedItem, onDrop }: ResponseProps) {
  return (
    <>
      <div className="scene-interaction-layer">
        {level.zones?.map((zone) => (
          <button
            key={zone.id}
            data-zone-id={zone.id}
            className={`drop-zone ${selectedItem ? 'ready' : ''}`}
            style={{ left: `${zone.position.x}%`, top: `${zone.position.y}%` }}
            onClick={() => selectedItem && onDrop(selectedItem, zone.id)}
            aria-label={`目标区域：${zone.label}`}
          >
            <GameIcon name={zone.icon} />
            <span>{zone.label}</span>
          </button>
        ))}
      </div>
      <div className="item-tray" aria-label="可拖拽操作物品">
        {level.items?.map((item) => (
          <DraggableItem
            key={item.id}
            item={item}
            selected={selectedItem === item.id}
            hinted={Boolean(hintId && level.actions?.some((action) => action.itemId === item.id && action.goalId === hintId))}
            used={Boolean(level.actions?.some((action) => action.itemId === item.id && action.goalId && resolved.has(action.goalId)))}
            onSelect={() => setSelectedItem(selectedItem === item.id ? null : item.id)}
            onDrop={onDrop}
          />
        ))}
      </div>
    </>
  );
}

function DraggableItem({ item, selected, hinted, used, onSelect, onDrop }: {
  item: DragItem; selected: boolean; hinted: boolean; used: boolean; onSelect: () => void; onDrop: (itemId: string, zoneId: string) => void;
}) {
  const startRef = useRef({ x: 0, y: 0 });
  const [drag, setDrag] = useState<{ x: number; y: number; active: boolean } | null>(null);

  return (
    <>
      <button
        className={`drag-item ${selected ? 'selected' : ''} ${hinted ? 'hinted' : ''} ${used ? 'used' : ''}`}
        data-tone={item.tone}
        disabled={used}
        onPointerDown={(event) => {
          if (used) return;
          startRef.current = { x: event.clientX, y: event.clientY };
          setDrag({ x: event.clientX, y: event.clientY, active: false });
          event.currentTarget.setPointerCapture(event.pointerId);
          onSelect();
        }}
        onPointerMove={(event) => {
          if (!drag) return;
          const active = drag.active || Math.hypot(event.clientX - startRef.current.x, event.clientY - startRef.current.y) > 7;
          setDrag({ x: event.clientX, y: event.clientY, active });
        }}
        onPointerUp={(event) => {
          if (drag?.active) {
            event.currentTarget.releasePointerCapture(event.pointerId);
            const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-zone-id]');
            if (target?.dataset.zoneId) onDrop(item.id, target.dataset.zoneId);
          }
          setDrag(null);
        }}
        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelect(); }}
        aria-pressed={selected}
      >
        <span className="drag-icon">{used ? <Check /> : <GameIcon name={item.icon} />}</span>
        <span>{used ? '已完成' : item.label}</span>
      </button>
      {drag?.active && (
        <div className="drag-ghost" style={{ left: drag.x, top: drag.y }}><GameIcon name={item.icon} /><span>{item.label}</span></div>
      )}
    </>
  );
}
