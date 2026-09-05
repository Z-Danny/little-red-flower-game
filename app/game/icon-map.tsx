import type { LucideIcon } from 'lucide-react';
import {
  Bandage, Blinds, CircleGauge, CircleUserRound, CupSoda, DoorOpen, Factory,
  FireExtinguisher, Flame, Flashlight, Flower2, Hand, Heater, Package, PanelsTopLeft,
  Phone, Plug, Radio, Shirt, ShowerHead, Sparkles, SprayCan, Square, Waves, Zap,
} from 'lucide-react';
import type { IconKey } from './types';

const icons: Record<IconKey, LucideIcon> = {
  plant: Flower2,
  window: PanelsTopLeft,
  shirt: Shirt,
  plug: Plug,
  cabinet: Square,
  heater: Heater,
  flame: Flame,
  curtain: Blinds,
  flashlight: Flashlight,
  sandbag: Package,
  radio: Radio,
  lid: CircleGauge,
  gas: Factory,
  person: CircleUserRound,
  water: CupSoda,
  cloth: Waves,
  extinguisher: FireExtinguisher,
  spark: Zap,
  phone: Phone,
  hand: Hand,
  ring: Sparkles,
  gauze: Bandage,
  toothpaste: SprayCan,
  exit: DoorOpen,
  sink: ShowerHead,
};

export function GameIcon({ name, className }: { name: IconKey; className?: string }) {
  const Icon = icons[name];
  return <Icon aria-hidden="true" className={className} />;
}
