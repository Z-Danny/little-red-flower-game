import { useId, type CSSProperties } from 'react';
import {
  motionConfig,
  sampleMotion,
  type MotionRecipe,
  type SpriteTrack,
} from '@/app/game/journey/motion';

function trackStyle(track: SpriteTrack, copy: number): CSSProperties {
  const opacity = track.opacity ?? [0, 0.8, 0];
  const vars: Record<string, string | number> = {
    '--track-seconds': `${track.seconds}s`,
    '--track-delay': `${-(track.phase ?? 0.3) - (copy * track.seconds) / (track.copies ?? 1)}s`,
    '--track-in': opacity[0],
    '--track-peak': opacity[1],
    '--track-out': opacity[2],
  };
  // CSS animates only transforms/opacity; no per-frame JS or SMIL timer.
  for (let i = 0; i <= 8; i++) {
    const p = sampleMotion(track, i / 8);
    vars[`--track-p${i}`] =
      `translate(${p.x.toFixed(2)}px,${p.y.toFixed(2)}px) rotate(${p.rotate.toFixed(2)}deg) scale(${p.scale.toFixed(3)})`;
  }
  return vars as CSSProperties;
}
/** Art, paths and phase offsets come from data. Shared by every map theme. */
export function SpriteTracks({
  recipe,
  image,
}: {
  recipe: MotionRecipe;
  image?: string;
}) {
  const filterId = `paint-${useId().replaceAll(':', '')}`;
  const tone = recipe.appearance;
  const slope = tone ? tone.brightness * tone.contrast : 1;
  const intercept = tone ? tone.brightness * (0.5 - tone.contrast * 0.5) : 0;
  return (
    <g className="fx-painted-tracks">
      {tone && (
        <defs>
          <filter
            id={filterId}
            x="-15%"
            y="-15%"
            width="130%"
            height="130%"
            colorInterpolationFilters="sRGB"
          >
            <feColorMatrix type="saturate" values={String(tone.saturation)} />
            <feComponentTransfer>
              <feFuncR type="linear" slope={slope} intercept={intercept} />
              <feFuncG type="linear" slope={slope} intercept={intercept} />
              <feFuncB type="linear" slope={slope} intercept={intercept} />
              <feFuncA type="linear" slope={tone.alpha} />
            </feComponentTransfer>
            <feDropShadow
              dx="0"
              dy="0.35"
              stdDeviation="0.65"
              floodColor={tone.edge}
              floodOpacity="0.32"
            />
          </filter>
        </defs>
      )}
      {recipe.tracks.flatMap((track, i) =>
        Array.from({ length: track.copies ?? 1 }, (_, copy) => (
          <g
            key={`${i}-${copy}`}
            className="fx-track"
            data-track={`${i}-${copy}`}
            data-envelope={track.envelope}
            style={trackStyle(track, copy)}
          >
            <image
              className="fx-paint"
              filter={tone ? `url(#${filterId})` : undefined}
              href={
                image && track.asset === recipe.tracks[0]?.asset
                  ? image
                  : motionConfig.assets[track.asset]
              }
              x={-track.size[0] * (track.pivot?.[0] ?? 0.5)}
              y={-track.size[1] * (track.pivot?.[1] ?? 0.5)}
              width={track.size[0]}
              height={track.size[1]}
              preserveAspectRatio="xMidYMid meet"
            />
          </g>
        )),
      )}
    </g>
  );
}
