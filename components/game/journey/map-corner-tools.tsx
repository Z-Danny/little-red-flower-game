/* oxlint-disable next/no-img-element -- Shared original map controls and artwork. */
import { useId } from 'react';
const homeArt = '/ui/map-corner-garden-v2/home.png';
const flowerArt = '/ui/map-corner-garden-v2/flower-counter.png';
const settingsArt = '/ui/map-corner-garden-v2/settings-blue.png';


export function MapCornerTools({wallet,onArchive,onSettings,onHome,disabled=false}:{wallet:number;onArchive:()=>void;onSettings:()=>void;onHome:()=>void;disabled?:boolean}) {
  const filterId='map-corner-outline-'+useId().replace(/[^a-zA-Z0-9_-]/g,'');
  return (<aside
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
              id={filterId}
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
          disabled={disabled}
          onClick={() => {
            if (disabled) return;
            onHome();
          }}
        >
          <img src={homeArt} alt="" draggable={false} style={{filter:`url(#${filterId})`}} />
        </button>
        <button
          type="button"
          className="map-corner-button map-corner-wallet garden-wallet"
          data-journal-open
          data-ui-sound="open"
          disabled={disabled}
          onClick={() => {
            if (disabled) return;
            onArchive();
          }}
          aria-label={`累计${wallet}朵小红花，打开我的进度`}
        >
          <img src={flowerArt} alt="" draggable={false} style={{filter:`url(#${filterId})`}} />
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
          <img src={settingsArt} alt="" draggable={false} style={{filter:`url(#${filterId})`}} />
        </button>
      </aside>);
}
