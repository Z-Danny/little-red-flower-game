import { useId, type CSSProperties } from 'react';
import type { SceneEffectKind } from '@/app/game/journey/signals';
import { motionFor } from '@/app/game/journey/motion';
import { SpriteTracks } from './sprite-tracks';
import { SceneCues } from './scene-cues';
type Props = {
  kind: SceneEffectKind;
  particles: number;
  image?: string;
  motion?: string;
};
type LayerProps = { id: string; particles: number; image?: string };
const style = (i: number) =>
  ({ '--i': i, '--delay': `${-i * 0.37}s` }) as CSSProperties;
function Fire({ id, particles, image }: LayerProps) {
  return (
    <>
      <ellipse
        className="fx-firelight"
        cx="80"
        cy="167"
        rx="69"
        ry="39"
        fill={`url(#${id}-heat)`}
      />
      <g>
        {[0, 1, 2, 3].map((i) => (
          <ellipse
            key={i}
            className="fx-plume"
            cx={62 + i * 12}
            cy="113"
            rx={15 + i * 2}
            ry="22"
            fill={`url(#${id}-smoke)`}
            style={style(i)}
          />
        ))}
      </g>
      {image ? (
        <g>
          <image
            className="fx-fire-sprite"
            href={image}
            x="0"
            y="0"
            width="160"
            height="190"
            preserveAspectRatio="none"
          />
          <image
            className="fx-fire-sprite fx-fire-overlay"
            href={image}
            x="15"
            y="28"
            width="130"
            height="162"
            preserveAspectRatio="none"
          />
        </g>
      ) : (
        <g>
          {[0, 1, 2, 3, 4].map((i) => (
            <g
              key={i}
              transform={`translate(${21 + i * 24} ${i % 2 ? 5 : 0}) scale(${i === 2 ? 1.15 : 0.82} ${i % 2 ? 0.78 : 1})`}
            >
              <path
                className="fx-flame"
                style={style(i)}
                d="M0 172C-17 157-16 140-4 123C1 115 6 111 5 95C20 109 21 122 18 132C28 125 30 113 29 103C48 126 37 141 36 147C51 160 29 181 0 172Z"
                fill={`url(#${id}-flame)`}
              />
              <path
                className="fx-core"
                style={style(i + 2)}
                d="M8 170C-1 154 13 145 13 130C25 143 17 150 26 150C31 159 27 174 8 170Z"
                fill={`url(#${id}-core)`}
              />
            </g>
          ))}
        </g>
      )}
      {Array.from({ length: particles }, (_, i) => (
        <circle
          key={i}
          className="fx-particle"
          cx={35 + ((i * 29) % 92)}
          cy={162 + ((i * 13) % 22)}
          r={i % 3 === 0 ? 2.5 : 1.4}
          fill={i % 2 ? '#fff2ab' : '#ffac48'}
          style={style(i)}
        />
      ))}
    </>
  );
}
export function SceneEffect({ kind, particles, image, motion }: Props) {
  const id = useId().replaceAll(':', '');
  const recipe = motionFor(motion);
  return (
    <svg
      className="scene-effect-art"
      viewBox="0 0 160 200"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${id}-flame`} x1="0" y1="1" x2="0" y2="0">
          <stop stopColor="#f46a25" />
          <stop offset=".45" stopColor="#ffb339" />
          <stop offset="1" stopColor="#ef6d35" stopOpacity=".2" />
        </linearGradient>
        <linearGradient id={`${id}-core`} x1="0" y1="1" x2="0" y2="0">
          <stop stopColor="#fff4b0" />
          <stop offset="1" stopColor="#ffd661" />
        </linearGradient>
        <linearGradient id={`${id}-wind`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#f2faf1" stopOpacity=".65" />
          <stop offset=".5" stopColor="#8dac9c" stopOpacity=".25" />
          <stop offset="1" stopColor="#f2faf1" stopOpacity=".6" />
        </linearGradient>
        <linearGradient id={`${id}-exit`} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#e1f4b7" stopOpacity=".6" />
          <stop offset="1" stopColor="#bce3a8" stopOpacity="0" />
        </linearGradient>
        {Object.entries({
          heat: '#ffad48',
          electric: '#65ccec',
          smoke: '#657165',
          mist: '#dfeddf',
          water: '#61b3c6',
          dust: '#c6ab8b',
          cloud: '#698793',
        }).map(([name, color]) => (
          <radialGradient key={name} id={`${id}-${name}`}>
            <stop
              stopColor={name === 'smoke' ? color : 'var(--fx-color)'}
              stopOpacity={name === 'cloud' ? '.95' : '.65'}
            />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </radialGradient>
        ))}
      </defs>
      <g className="fx-scene">
        {recipe ? (
          <>
            <SpriteTracks recipe={recipe} image={image} />
            <SceneCues cues={recipe.cues} />
          </>
        ) : image && kind !== 'fire' ? (
          <image
            className="fx-custom"
            href={image}
            width="160"
            height="200"
            preserveAspectRatio="none"
          />
        ) : (
          kind === 'fire' && (
            <Fire id={id} particles={particles} image={image} />
          )
        )}
      </g>
      <g className="fx-safety">
        <ellipse
          className="fx-window-light"
          cx="80"
          cy="155"
          rx="65"
          ry="30"
          fill={`url(#${id}-exit)`}
        />
      </g>
    </svg>
  );
}
