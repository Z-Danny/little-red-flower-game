import { isRecord, validateProfile, type Player } from './model';
export const BACKUP_MAX_BYTES = 256 * 1024;
export type ProgressBackup = { format: 'little-red-flower-progress'; version: 1; exportedAt: number; player: Pick<Player, 'name' | 'region' | 'completed' | 'allLevelsUnlocked'> };
/** Strict import boundary: reject damaged/newer files rather than silently losing scores. */
export function parseBackup(text: string): ProgressBackup {
  if (new TextEncoder().encode(text).length > BACKUP_MAX_BYTES) throw new Error('存档文件过大，请选择本游戏导出的文件（不超过256KB）。');
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error('无法读取存档，请选择完整的 JSON 存档文件。'); }
  if (!isRecord(data) || data.format !== 'little-red-flower-progress' || data.version !== 1) throw new Error('不是支持的小红花存档，或存档版本过新。');
  if (typeof data.exportedAt !== 'number' || !Number.isFinite(data.exportedAt) || data.exportedAt <= 0 || !isRecord(data.player)) throw new Error('存档信息不完整。');
  const p = data.player;
  if (typeof p.name !== 'string' || typeof p.region !== 'string' || !isRecord(p.completed) || Object.keys(p.completed).length > 500) throw new Error('玩家或关卡记录无效。');
  if (p.allLevelsUnlocked !== undefined && typeof p.allLevelsUnlocked !== 'boolean') throw new Error('解锁记录无效。');
  const completed: Record<string, number> = {};
  for (const [id, score] of Object.entries(p.completed)) {
    if (!/^[a-z0-9][a-z0-9_-]{0,99}$/i.test(id) || ['__proto__','constructor','prototype'].includes(id) || typeof score !== 'number' || !Number.isInteger(score) || score < 1 || score > 3) throw new Error('存档含有无效的关卡成绩，未导入任何内容。');
    completed[id] = score;
  }
  return { format: 'little-red-flower-progress', version: 1, exportedAt: data.exportedAt,
    player: { ...validateProfile({ name:p.name, region:p.region }), completed, ...(p.allLevelsUnlocked === true ? { allLevelsUnlocked:true } : {}) } };
}
export function serializeBackup(player: Player, now = Date.now()): string {
  const text = JSON.stringify({ format:'little-red-flower-progress', version:1, exportedAt:now,
    player:{name:player.name,region:player.region,completed:player.completed,allLevelsUnlocked:player.allLevelsUnlocked === true} }, null, 2);
  parseBackup(text);
  return text;
}
