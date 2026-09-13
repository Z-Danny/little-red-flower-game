import streetRules from '@/content/disaster/rain-street-preparation-v1/rules.json';
import streetSkin from '@/content/disaster/rain-street-preparation-v1/skin.json';
import floodRules from '@/content/disaster/flood-house-response-v1/rules.json';
import floodSkin from '@/content/disaster/flood-house-response-v1/skin.json';
import { validateDisaster, type DisasterPack } from './schema';
export const disasterPacks = [
  { rules: streetRules, skin: streetSkin },
  { rules: floodRules, skin: floodSkin },
].map((p) => validateDisaster(p as DisasterPack));
export const getDisaster = (id: string) =>
  disasterPacks.find((p) => p.rules.id === id);
