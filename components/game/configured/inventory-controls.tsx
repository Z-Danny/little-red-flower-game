/* oxlint-disable next/no-img-element -- Original local sprites are embedded in the offline HTML. */
import { useEffect, useId, useRef } from 'react';
import type { Event, LevelPackage, Run } from '@/app/game/runtime/schema';

type Props = { pack: LevelPackage; run: Run; open: boolean; disabled: boolean; onOpen: (value: boolean) => void; onEvent: (event: Event) => void };
/** Shared capacity inventory drawer; the reducer alone decides capacity and departure. */
export function InventoryControls({ pack, run, open, disabled, onOpen, onEvent }: Props) {
  const id = useId(), close = useRef<HTMLButtonElement>(null), toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (open) close.current?.focus({ preventScroll: true }); }, [open]);
  const spec = pack.rules.inventory;
  if (!spec || run.phase !== 'playing') return null;
  const inventory = run.inventory ?? [], busy = disabled || !!run.action;
  const dismiss = () => { onOpen(false); toggle.current?.focus({ preventScroll: true }); };
  return <div className="configured-inventory" data-inventory-controls onKeyDown={event => {
    if (open && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss(); }
  }}>
    {open && <section className="configured-inventory-paper" id={id} aria-label="背包内容" data-inventory-panel>
      <header><h2>我的背包 <span data-inventory-count>{inventory.length}/{spec.capacity}</span></h2><button type="button" ref={close} onClick={dismiss} aria-label="收起背包">收起</button></header>
      <p>点击“取出”可重新选择；装满后确认，再出发。</p>
      <ol className="configured-inventory-slots">
        {Array.from({ length: spec.capacity }, (_, index) => {
          const item = inventory[index], object = pack.rules.objects.find(object => object.id === item);
          return <li key={index} data-inventory-slot={index} data-item={item ?? ''}>
            {object ? <><img src={pack.skin.assets[pack.skin.poses[object.id].asset].src} alt="" draggable={false} /><span>{object.label}</span>
              <button type="button" data-unpack={item} aria-label={`取出${object.label}`} disabled={busy} onClick={() => onEvent({ type: 'unpack', source: item })}>取出</button></>
              : <><span className="configured-inventory-empty" aria-hidden="true">＋</span><span>空位</span></>}
          </li>;
        })}
      </ol>
      <output aria-live="polite">{run.notice?.text ?? '背包检查期间，倒计时继续。'}</output>
      <button type="button" className="configured-inventory-depart" data-inventory-depart disabled={busy || inventory.length !== spec.capacity} onClick={() => onEvent({ type: 'depart' })}>确认出发</button>
      <small>最多 {spec.capacity} 件 · 检查期间倒计时继续</small>
    </section>}
    <button type="button" className="configured-inventory-toggle" data-inventory-toggle ref={toggle} aria-expanded={open} aria-controls={id} disabled={busy} onClick={() => onOpen(!open)}>背包 {inventory.length}/{spec.capacity} · {open ? '收起' : '查看'}</button>
  </div>;
}
