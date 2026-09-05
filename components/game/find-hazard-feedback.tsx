'use client';

import type { CSSProperties } from 'react';
import { Check, Search } from 'lucide-react';
import { GameIcon } from '@/app/game/icon-map';
import type { FindObjective, LevelConfig } from '@/app/game/types';

type ObjectiveStripProps = {
  level: LevelConfig;
  resolved: Set<string>;
  processingId: string | null;
  onHint: (id: string) => void;
};

type TreatmentEffectsProps = {
  level: LevelConfig;
  resolved: Set<string>;
  processingId: string | null;
  risk: number;
};

function silhouetteStyle(objective: FindObjective, image?: string): CSSProperties {
  return {
    backgroundImage: image ? `url(${image})` : undefined,
    backgroundPosition: `${objective.position.x}% ${objective.position.y}%`,
    backgroundSize: `${objective.treatment?.silhouetteZoom ?? 480}%`,
  };
}

function cropStyle(objective: FindObjective, image: string | undefined, position = objective.position): CSSProperties {
  const size = objective.size ?? 15;
  const width = Math.min(size, 100);
  const height = Math.min(size, 100);
  const left = Math.max(0, Math.min(100 - width, position.x - width / 2));
  const top = Math.max(0, Math.min(100 - height, position.y - height / 2));
  const backgroundX = 100 - width > 0 ? (left / (100 - width)) * 100 : 50;
  const backgroundY = 100 - height > 0 ? (top / (100 - height)) * 100 : 50;
  return {
    left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%`,
    backgroundImage: image ? `url(${image})` : undefined,
    backgroundSize: `${10000 / width}% ${10000 / height}%`,
    backgroundPosition: `${backgroundX}% ${backgroundY}%`,
  };
}

function repairStyle(objective: FindObjective, image?: string): CSSProperties {
  const clip = objective.treatment?.repairClip;
  return {
    backgroundImage: image ? `url(${image})` : undefined,
    clipPath: clip ? `inset(${clip.top}% ${clip.right}% ${clip.bottom}% ${clip.left}% round 18px)` : undefined,
  };
}

export function ObjectiveStrip({ level, resolved, processingId, onHint }: ObjectiveStripProps) {
  const targets = level.objectives?.filter((objective) => level.goals.includes(objective.id)) ?? [];
  return (
    <div className="objective-strip hazard-target-strip" aria-label="本关五个物品剪影，点击任一剪影可获得对应提示">
      {targets.map((objective, index) => {
        const done = resolved.has(objective.id);
        const active = processingId === objective.id;
        return (
          <button
            key={objective.id}
            className={`silhouette-target ${done ? 'done' : ''} ${active ? 'active' : ''}`}
            style={{ '--action-duration': `${objective.treatment?.durationMs ?? 900}ms` } as CSSProperties}
            onClick={() => onHint(objective.id)}
            disabled={done || Boolean(processingId)}
            aria-label={`${objective.label}${done ? '，已处理' : '，点击查看提示'}`}
            title={objective.label}
          >
            <span className="silhouette-number">{index + 1}</span>
            <span className="scene-silhouette" style={silhouetteStyle(objective, level.previewImage)} />
            <small>{objective.label.replace('阳台', '').replace('落地', '').replace('未固定', '')}</small>
            {done && <Check className="silhouette-check" />}
          </button>
        );
      })}
    </div>
  );
}

export function TreatmentEffects({ level, resolved, processingId, risk }: TreatmentEffectsProps) {
  const objectives = level.objectives ?? [];
  const active = objectives.find((objective) => objective.id === processingId);
  const plant = objectives.find((objective) => objective.id === 'plant');
  const windowTarget = objectives.find((objective) => objective.id === 'window');
  const cabinet = objectives.find((objective) => objective.id === 'cabinet');
  const plug = objectives.find((objective) => objective.id === 'plug');

  return (
    <div className="treatment-effects" aria-live="polite">
      {objectives.filter((objective) => resolved.has(objective.id) && objective.treatment?.persistRepair !== false).map((objective) => (
        <span
          key={`repair-${objective.id}`}
          className={`resolved-repair repair-${objective.treatment?.kind ?? 'default'}`}
          style={repairStyle(objective, level.safeImage)}
          aria-hidden="true"
        />
      ))}

      {objectives.filter((objective) => resolved.has(objective.id) && objective.treatment?.safePosition).map((objective) => (
        <span
          key={`destination-${objective.id}`}
          className="resolved-destination"
          style={cropStyle(objective, level.safeImage, objective.treatment!.safePosition)}
          aria-hidden="true"
        />
      ))}

      {plant?.riskCue && risk >= plant.riskCue.threshold && !resolved.has(plant.id) && (
        <span className="ambient-object ambient-pot-wobble" style={cropStyle(plant, level.previewImage)} aria-hidden="true" />
      )}
      {windowTarget?.riskCue && risk >= windowTarget.riskCue.threshold && !resolved.has(windowTarget.id) && (
        <span className="ambient-rain-leak" aria-hidden="true"><i /><i /><i /></span>
      )}
      {cabinet?.riskCue && risk >= cabinet.riskCue.threshold && !resolved.has(cabinet.id) && (
        <span className="ambient-object ambient-cabinet-rattle" style={cropStyle(cabinet, level.previewImage)} aria-hidden="true" />
      )}

      {resolved.has('cushion') && plug && !resolved.has('plug') && (
        <span className="discovery-flash" style={{ left: `${plug.position.x}%`, top: `${plug.position.y}%` }}>
          <Search />发现插线板
        </span>
      )}

      {active?.treatment && (
        <div
          key={`action-${active.id}`}
          className={`treatment-action treatment-${active.treatment.kind}`}
          style={{ '--action-duration': `${active.treatment.durationMs}ms` } as CSSProperties}
        >
          {active.treatment.repairClip && active.treatment.persistRepair !== false && (
            <span className="action-repair" style={repairStyle(active, level.safeImage)} aria-hidden="true" />
          )}
          <span className="action-motion" style={cropStyle(active, level.previewImage)} aria-hidden="true" />
          {active.treatment.safePosition && (
            <span className="action-destination" style={cropStyle(active, level.safeImage, active.treatment.safePosition)} aria-hidden="true" />
          )}
          {active.treatment.kind === 'close-window' && <span className="window-lock-flash" aria-hidden="true"><GameIcon name="window" /><i /></span>}
          {active.treatment.kind === 'unplug' && <span className="power-off-flash" aria-hidden="true"><GameIcon name="plug" /><i /></span>}
          <span className="treatment-callout" style={{ left: `${active.position.x}%`, top: `${active.position.y}%` }}>
            <GameIcon name={active.icon} />
            <b>{active.treatment.caption}</b>
            <i><em /></i>
          </span>
        </div>
      )}
    </div>
  );
}
