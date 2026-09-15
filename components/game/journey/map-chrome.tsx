/* oxlint-disable next/no-img-element -- Local art is embedded in the standalone offline build. */
import { journeyCategories } from '@/app/game/journey/categories';
import { archipelagoArt } from '@/app/game/journey/archipelago';
import {
  journeyTiming,
  type Region,
  type Planting,
} from '@/app/game/journey/progress';

const homeArt = '/ui/map-corner-garden-v2/home.png';
const flowerArt = '/ui/map-corner-garden-v2/flower-counter.png';
const settingsArt = '/ui/map-corner-garden-v2/settings-blue.png';

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
      <aside
        className="map-corner-tools"
        data-map-corner-tools
        aria-label="地图操作"
      >
        <svg
          className="map-corner-filters"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <filter
              id="map-corner-cream-outline"
              x="-8%"
              y="-8%"
              width="116%"
              height="116%"
              colorInterpolationFilters="sRGB"
            >
              <feMorphology
                in="SourceAlpha"
                operator="dilate"
                radius="0.85"
                result="edge"
              />
              <feFlood floodColor="#f6e7c5" result="cream" />
              <feComposite
                in="cream"
                in2="edge"
                operator="in"
                result="outline"
              />
              <feMerge>
                <feMergeNode in="outline" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
        </svg>
        <button
          type="button"
          className="map-corner-button map-home-button"
          data-map-home
          aria-label="返回游戏首页"
          disabled={!!planting}
          onClick={() => {
            if (planting) return;
            onHome();
          }}
        >
          <img src={homeArt} alt="" draggable={false} />
        </button>
        <button
          type="button"
          className="map-corner-button map-corner-wallet garden-wallet"
          data-journal-open
          data-ui-sound="open"
          disabled={!!planting}
          onClick={() => {
            if (planting) return;
            onArchive();
          }}
          aria-label={`累计${wallet}朵小红花，打开我的进度`}
        >
          <img src={flowerArt} alt="" draggable={false} />
          <strong
            data-wallet
            data-wallet-digits={Math.min(String(wallet).length, 3)}
          >
            {wallet}
          </strong>
        </button>
        <button
          type="button"
          className="map-corner-button"
          data-map-settings
          onClick={() => {
            onSettings();
          }}
          aria-label="打开游戏设置"
        >
          <img src={settingsArt} alt="" draggable={false} />
        </button>
      </aside>
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
