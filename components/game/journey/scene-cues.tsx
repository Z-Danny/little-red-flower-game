import type { SceneCue } from '@/app/game/journey/motion';
import type { CSSProperties } from 'react';

/** Small light/contact cues attach to the painted scene, never to a badge. */
export function SceneCues({ cues }: { cues?: SceneCue[] }) {
  return cues?.map((cue, i) =>
    cue.kind === 'footsteps' ? (
      <g
        key={i}
        data-scene-cue="footsteps"
        fill={cue.color}
        stroke="#f7f8d9"
        strokeWidth="1.2"
      >
        {cue.points.map((point, step) => (
          <g
            key={step}
            transform={`translate(${point.x} ${point.y}) rotate(${point.rotate}) scale(${cue.size / 24})`}
          >
            <g
              className="fx-footstep"
              style={
                {
                  '--step-duration': `${cue.seconds}s`,
                  '--step-delay': `${step * 0.28}s`,
                } as CSSProperties
              }
            >
              <path d="M-5 2C-7-2-7-9-4-12C-1-15 4-13 5-9L6-2C6 1 4 3 1 4L-4 5Z" />
              <path d="M-4 8L3 7L5 13Q1 17-4 14Z" />
            </g>
          </g>
        ))}
      </g>
    ) : cue.kind === 'route' ? (
      <path
        key={i}
        className="fx-route-cue"
        d={cue.path}
        fill="none"
        stroke={cue.color}
        strokeWidth={cue.width ?? 3}
        style={
          cue.dash
            ? ({
                '--route-dash': cue.dash.join(' '),
                '--route-cycle': cue.dash.reduce((a, b) => a + b, 0) * 2,
              } as CSSProperties)
            : undefined
        }
        strokeLinecap="round"
      />
    ) : (
      <g
        key={i}
        transform={`translate(${cue.x} ${cue.y})`}
        data-scene-cue="call"
      >
        <circle className="fx-call-lamp" r="3.2" fill={cue.color} />
        {[0, 1, 2].map((n) => (
          <path
            key={n}
            className="fx-call-wave"
            d={`M${6 + n * 5} ${-5 - n * 4} Q${14 + n * 8} 0 ${6 + n * 5} ${5 + n * 4}`}
            fill="none"
            stroke={cue.color}
            strokeWidth="1.8"
            strokeLinecap="round"
            style={{ animationDelay: `${-n * 0.36}s` }}
          />
        ))}
      </g>
    ),
  );
}
