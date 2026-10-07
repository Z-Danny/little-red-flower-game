import { enabled } from '@/app/game/runtime/engine';
import { relevantZones } from '@/app/game/runtime/drop-zones';
import type { Input, LevelPackage, Run } from '@/app/game/runtime/schema';

type Props = { pack: LevelPackage; run: Run; selected: string | null; disabled: boolean; onInteract: (input: Input) => void };
/** Opt-in data-driven collection controls. Sorting and verification remain engine rules. */
export function CollectionControls({ pack, run, selected, disabled, onInteract }: Props) {
  const action = pack.rules.objects.find(object => object.hudAction);
  if (!action || !['playing', 'settling'].includes(run.phase)) return null;
  const objects = pack.rules.goals.filter(goal => goal.showTarget !== false);
  const stored = objects.filter(goal => run.resolved.includes(goal.id)).length;
  const current = pack.rules.interactions.find(rule => rule.id === run.action?.rule);
  const checks = current ? pack.skin.animations[current.animation].checks : undefined;
  const progress = run.action ? run.action.age / run.action.duration : 0;
  const selectedObject = pack.rules.objects.find(object => object.id === selected);
  return <section className="configured-collection-controls" data-ui-style="painted" aria-label="收纳与通道检查" data-collection-controls>
    <div className="configured-collection-caption"><span>收回自家 · 不占公用空间</span><b data-stored-count>{stored}/{objects.length}</b></div>
    {checks ? <ol className="configured-inspection" aria-label="通道检查进度" data-route-check>
      {checks.map((check, index) => <li key={check.zone} data-checked={progress >= check.at}><span aria-hidden="true">{progress >= check.at ? '✓' : index + 1}</span>{check.label}</li>)}
    </ol> : <>
      <output className="configured-collection-feedback" aria-live="polite">{selectedObject && !run.action ? `把${selectedObject.label}放到哪里？` : run.notice?.text ?? (stored === objects.length ? '物品已收好，再检查一遍通道。' : '先点物品，再选去处；也可以直接拖动。')}</output>
      {selected && !run.action ? <div className="configured-destinations" aria-label="选择物品去处">
        {relevantZones(pack, run, selected).map(id => <button type="button" key={id} data-collection-destination={id} disabled={disabled} onClick={() => {
          // Tap-to-place starts at home; only a physical drag supplies its release point.
          onInteract({ source: selected, mode: 'drop', target: id });
        }}>{pack.skin.zoneLabels?.[id] ?? id}</button>)}
        
      </div> : enabled(action, run) && <button type="button" className="configured-check-button" data-check-route disabled={disabled || !!run.action || run.phase !== 'playing'} onClick={() => onInteract({ source: action.id, mode: 'tap' })}>{action.label}</button>}
    </>}
    <small>日常无火烟时整理 · 有火烟时不为收拾物品耽误避险</small>
  </section>;
}