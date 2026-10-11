'use client';
import { useMemo, useState } from 'react';
import { GameApp } from './game-app';
import { ConfiguredPlayer } from './configured/player';
import { Settlement } from './journey/settlement';
import { validatePackage } from '@/app/game/runtime/validate';
/** Same entry/result cards as the map; isolated practice never writes journey rewards. */
export function ResponsePreview({ rules, skin }: { rules: unknown; skin: unknown }) {
  const base = useMemo(() => validatePackage(rules, skin, { embedded: true }), [rules, skin]);
  // Fixed scenarios are a verification-only URL option, not a player's diagnosis choice.
  const [scenario] = useState(() => typeof window === 'undefined' ? null : new URLSearchParams(window.location.hash.slice(1)).get('scenario'));
  const pack = useMemo(() => base.rules.scenarios?.some(s => s.id === scenario)
    ? { ...base, rules: { ...base.rules, scenarios: base.rules.scenarios.filter(s => s.id === scenario) } } : base, [base, scenario]);
  const [finished, setFinished] = useState(false), [replay, setReplay] = useState(0), [map, setMap] = useState(false);
  if (map) return <GameApp />;
  return <div data-response-preview={base.rules.id}>
    <ConfiguredPlayer key={replay} pack={pack} journey onBack={() => setMap(true)} onFinish={() => setFinished(true)} />
    {finished && <Settlement level={base.rules} receipt={undefined} error="" onRetry={() => undefined}
      onMap={() => { setFinished(false); setReplay(n => n + 1); }}
      practice={{ title: '演练完成', summary: base.rules.completion.summary,
        status: base.rules.completion.status, onReplay: () => { setFinished(false); setReplay(n => n + 1); } }} />}
  </div>;
}
