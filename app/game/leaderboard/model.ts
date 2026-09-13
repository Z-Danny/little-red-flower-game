/** Pure leaderboard rules. No browser, rendering or level-engine dependencies. */
export type ScoreCaps = Readonly<Record<string, number>>;
export type ProfileInput = { name: string; region: string };
export type Player = ProfileInput & { id: string; createdAt: number; completed: Record<string, number> };
export type BoardState = { version: 1; activePlayerId: string; players: Player[] };
export type CompletionReceipt = { levelId:string; playerId:string; reward:number; before:Record<string,number> };
export type RankedPlayer = ProfileInput & { id: string; flowers: number; rank: number | null };
export type BoardSnapshot = {
  scope: 'local' | 'online';
  current: Player;
  entries: RankedPlayer[];
  maxFlowers: number;
  persistence: 'saved' | 'session';
  notice: string;
};

/** Async seam for a future authenticated API. Online results must be verified server-side. */
export interface LeaderboardProvider {
  read(): Promise<BoardSnapshot>;
  createPlayer(profile: ProfileInput): Promise<BoardSnapshot>;
  updateProfile(profile: ProfileInput): Promise<BoardSnapshot>;
  switchPlayer(id: string): Promise<BoardSnapshot>;
  recordResult(levelId: string, flowers: number, playerId: string): Promise<BoardSnapshot>;
  claimCompletion(levelId: string, playerId: string): Promise<{ snapshot:BoardSnapshot; receipt:CompletionReceipt }>;
  resetCurrentProgress(expectedPlayerId?: string): Promise<BoardSnapshot>;
  subscribe?(onChange: () => void): () => void;
}

export const MAX_PLAYERS = 50;
const own = (object: object, key: string) => Object.prototype.hasOwnProperty.call(object, key);
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function cleanText(value: string) {
  return value.normalize('NFC').replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim();
}

export function validateProfile(profile: ProfileInput): ProfileInput {
  if (typeof profile.name !== 'string' || typeof profile.region !== 'string') throw new Error('请输入有效的昵称和地区。');
  const name = cleanText(profile.name);
  const region = cleanText(profile.region);
  if (!name || Array.from(name).length > 12) throw new Error('昵称请填写 1～12 个字。');
  if (Array.from(region).length > 20) throw new Error('地区最多填写 20 个字。');
  return { name, region };
}

export function sanitizeScores(value: unknown, caps: ScoreCaps): Record<string, number> {
  const scores: Record<string, number> = {};
  if (!isRecord(value)) return scores;
  for (const [id, cap] of Object.entries(caps)) {
    const score = own(value, id) ? value[id] : undefined;
    if (typeof score === 'number' && Number.isFinite(score) && score > 0) scores[id] = Math.min(cap, Math.floor(score));
  }
  return scores;
}

export function flowersFor(player: Player, caps: ScoreCaps) {
  return Object.values(sanitizeScores(player.completed, caps)).reduce((total, score) => total + score, 0);
}

/** Competition ranking: 1, 1, 3. Zero-score players are visible but unranked. */
export function rankPlayers(players: readonly Player[], caps: ScoreCaps): RankedPlayer[] {
  const sorted = players.map(player => ({ player, flowers: flowersFor(player, caps) }))
    .sort((a, b) => b.flowers - a.flowers || a.player.createdAt - b.player.createdAt || a.player.id.localeCompare(b.player.id));
  let previous = -1;
  let rank = 0;
  return sorted.map(({ player, flowers }, index) => {
    if (flowers !== previous) rank = index + 1;
    previous = flowers;
    return { id: player.id, name: player.name, region: player.region, flowers, rank: flowers > 0 ? rank : null };
  });
}

export function recordBest(state: BoardState, id: string, flowers: number, caps: ScoreCaps, playerId = state.activePlayerId): BoardState {
  if (!own(caps, id) || !Number.isInteger(flowers) || flowers < 1 || flowers > caps[id]) throw new Error('无效的关卡成绩。');
  if (!state.players.some(player => player.id === playerId)) throw new Error('找不到本次游玩的玩家，成绩未写入。');
  return { ...state, players: state.players.map(player => player.id === playerId
    ? { ...player, completed: { ...player.completed, [id]: Math.max(player.completed[id] ?? 0, flowers) } }
    : player) };
}

/** Completion rewards are collectible once. Legacy best scores remain byte-for-byte values. */
export function claimFirstCompletion(state:BoardState,id:string,playerId:string,caps:ScoreCaps) {
  if (!own(caps,id)) throw new Error('该关卡尚未开放。');
  const player=state.players.find(p=>p.id===playerId);
  if(!player)throw new Error('找不到本次游玩的玩家，成绩未写入。');
  const reward=own(player.completed,id)&&player.completed[id]>0?0:3;
  const receipt:CompletionReceipt={levelId:id,playerId,reward,before:sanitizeScores(player.completed,caps)};
  return {state:reward?recordBest(state,id,3,caps,playerId):state,receipt};
}

/** Do not erase unknown/disabled level records; only active caps contribute to rankings. */
export function parseState(value: unknown): BoardState {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.players) || !value.players.length || value.players.length > MAX_PLAYERS) throw new Error('存档格式无效。');
  const ids = new Set<string>();
  const players: Player[] = value.players.map(item => {
    if (!isRecord(item) || typeof item.id !== 'string' || !item.id || item.id.length > 100 || ids.has(item.id)) throw new Error('玩家记录无效。');
    if (typeof item.createdAt !== 'number' || !Number.isFinite(item.createdAt)) throw new Error('玩家时间无效。');
    ids.add(item.id);
    const profile = validateProfile({ name: item.name as string, region: item.region as string });
    const completed: Record<string, number> = {};
    if (isRecord(item.completed)) for (const [key, score] of Object.entries(item.completed)) {
      if (/^[a-z0-9][a-z0-9_-]{0,99}$/i.test(key) && key !== 'constructor' && key !== 'prototype' && typeof score === 'number' && Number.isInteger(score) && score >= 1 && score <= 3) completed[key] = score;
    }
    return { ...profile, id: item.id, createdAt: item.createdAt, completed };
  });
  return { version: 1, players, activePlayerId: typeof value.activePlayerId === 'string' && ids.has(value.activePlayerId) ? value.activePlayerId : players[0].id };
}
