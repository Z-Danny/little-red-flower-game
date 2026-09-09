import rules from '@/content/scenes/typhoon-home/rules.json';
import skin from '@/content/scenes/typhoon-home/skin.json';
import { checkHunt, type HuntPack } from './schema';
const typhoon = checkHunt({ rules, skin } as unknown as HuntPack);
export const huntPacks = [typhoon];
export const getHunt = (id: string) => huntPacks.find((p) => p.rules.id === id);
