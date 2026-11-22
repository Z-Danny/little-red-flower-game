import { MapCornerTools } from './map-corner-tools';
/* oxlint-disable next/no-img-element -- Local art is embedded in the standalone offline build. */
import { journeyCategories } from '@/app/game/journey/categories';
import { archipelagoArt } from '@/app/game/journey/archipelago';
import {
  journeyTiming,
  type Region,
  type Planting,
} from '@/app/game/journey/progress';

type Props = {
  region: Region;
  done: number;
  wallet: number;
  onArchive: () => void;
  onSettings: () => void;
  onHome: () => void;
  planting: Planting | null;
  age: number;
  onOpenArchipelago: () => void;
};

export function MapChrome({
  region,
  done,
  wallet,
  onArchive,
  onSettings,
  onHome,
  planting,
  age,
  onOpenArchipelago,
}: Props) {
  const active =
    journeyCategories.find((category) =>
      category.regionIds.includes(region.id),
    ) ?? journeyCategories[0];
  return (
    <>
      <MapCornerTools wallet={wallet} onHome={onHome} onArchive={onArchive} onSettings={onSettings} disabled={!!planting} />
      <nav
        className="map-fan"
        data-map-fan
        data-fan-current={active.id}
        data-expanded="false"
        aria-label="地图切换"
      >
        <button
          type="button"
          className="map-fan-toggle"
          data-map-fan-toggle
          aria-haspopup="dialog"
          aria-label={`当前地图：${active.name}，打开群岛选择`}
          disabled={!!planting}
          onClick={onOpenArchipelago}
        >
          <img
            className="map-fan-current-art"
            src={archipelagoArt.entry}
            alt=""
            draggable={false}
          />
          <span className="map-fan-name">{active.name}</span>
        </button>
      </nav>
      {planting && (
        <output className="garden-guide">
          {age < journeyTiming.bloom
            ? '把安心种在这里…'
            : age < journeyTiming.unlock
              ? '小红花开了'
              : done === region.nodes.length
                ? `${region.medal} · 区域已恢复`
                : '沿着花径，向上出发'}
        </output>
      )}
    </>
  );
}
