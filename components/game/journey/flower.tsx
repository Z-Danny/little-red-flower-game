/* oxlint-disable next/no-img-element -- The same transparent local sprite is embedded in the offline HTML. */
import type { CSSProperties } from 'react';
import { journeySkin } from '@/app/game/journey/presentation';
export function Flower({
  className = '',
  variant = 'flower',
  style,
}: {
  className?: string;
  variant?: 'flower' | 'restorationFlower';
  style?: CSSProperties;
}) {
  return (
    <img
      className={`garden-flower ${className}`}
      src={journeySkin[variant]}
      style={style}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}
