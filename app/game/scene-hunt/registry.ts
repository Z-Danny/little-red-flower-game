import { generatedHuntPacks } from './generated';
import { checkHunt, type HuntPack } from './schema';
/** All whole-scene recognition packs share one runtime and viewport. */
export const huntPacks = generatedHuntPacks.map((p) =>
  checkHunt(p as unknown as HuntPack),
);
if (new Set(huntPacks.map((p) => p.rules.id)).size !== huntPacks.length)
  throw Error('Duplicate hunt ID');
if (new Set(huntPacks.map((p) => p.rules.order)).size !== huntPacks.length)
  throw Error('Duplicate hunt order');
export const newHazardPacks = huntPacks.filter(
  (p) => p.rules.order >= 14 && p.rules.order <= 20,
);
export const getHunt = (id: string) => huntPacks.find((p) => p.rules.id === id);
