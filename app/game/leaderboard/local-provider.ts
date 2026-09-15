import { MAX_PLAYERS, parseState, rankPlayers, recordBest, claimFirstCompletion, sanitizeScores, validateProfile, type BoardSnapshot, type BoardState, type LeaderboardProvider, type ProfileInput, type ScoreCaps } from './model';

export const BOARD_STORAGE_KEY = 'little-red-flower-leaderboard-v1';
export const LEGACY_STORAGE_KEY = 'little-red-flower-emergency-progress-v1';
export type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;
type Options = {
  storage: () => StoragePort;
  caps: ScoreCaps;
  id: () => string;
  now?: () => number;
  listen?: (onChange: () => void) => () => void;
  canEnter?: (levelId:string,completed:Readonly<Record<string,number>>)=>boolean;
};

/** The only module that knows about local persistence. Failed writes stay playable in memory. */
export function createLocalLeaderboard(options: Options): LeaderboardProvider {
  let memory: BoardState | undefined;
  let sessionOnly = false;
  let notice = '';
  const now = options.now ?? Date.now;

  function initial(legacy: unknown = {}): BoardState {
    const id = options.id();
    return { version: 1, activePlayerId: id, players: [{ id, name: '小红花玩家', region: '', createdAt: now(), completed: sanitizeScores(legacy, options.caps) }] };
  }

  function save(state: BoardState) {
    memory = state;
    if (sessionOnly) return;
    try { options.storage().setItem(BOARD_STORAGE_KEY, JSON.stringify(state)); }
    catch {
      sessionOnly = true;
      notice = '浏览器未能保存记录，本次成绩暂存于当前页面。关闭页面后可能丢失。';
    }
  }

  function load(): BoardState {
    if (sessionOnly && memory) return memory;
    try {
      const storage = options.storage();
      const raw = storage.getItem(BOARD_STORAGE_KEY);
      if (raw) {
        try { memory = parseState(JSON.parse(raw)); return memory; }
        catch {
          // Never replace an unreadable/newer-version save with an empty leaderboard.
          sessionOnly = true;
          notice = '玩家存档暂时无法读取，原存档未被覆盖。本次记录暂存于页面，请保留浏览器数据。';
          memory ??= initial();
          return memory;
        }
      }
      let legacy: unknown = {};
      try { legacy = JSON.parse(storage.getItem(LEGACY_STORAGE_KEY) ?? '{}'); } catch { /* Original legacy bytes remain untouched. */ }
      memory ??= initial(legacy);
      save(memory);
      return memory;
    } catch {
      sessionOnly = true;
      notice = '浏览器不允许保存存档，本次记录暂存于页面。关闭页面后可能丢失。';
      memory ??= initial();
      return memory;
    }
  }

  function snapshot(state: BoardState): BoardSnapshot {
    const current = state.players.find(player => player.id === state.activePlayerId)!;
    return {
      scope: 'local', current: { ...current, completed: sanitizeScores(current.completed, options.caps) },
      entries: rankPlayers(state.players, options.caps),
      progressByPlayer: Object.fromEntries(state.players.map(player => [player.id, sanitizeScores(player.completed, options.caps)])),
      maxFlowers: Object.values(options.caps).reduce((sum, cap) => sum + cap, 0),
      persistence: sessionOnly ? 'session' : 'saved', notice,
    };
  }

  function mutate(update: (state: BoardState) => BoardState): BoardSnapshot {
    // Re-read at every mutation so sequential operations in other tabs aren't overwritten.
    const next = update(load());
    save(next);
    return snapshot(next);
  }

  return {
    async read() { return snapshot(load()); },
    async createPlayer(input: ProfileInput) {
      const profile = validateProfile(input);
      return mutate(state => {
        if (state.players.length >= MAX_PLAYERS) throw new Error(`最多保存 ${MAX_PLAYERS} 位玩家。`);
        const id = options.id();
        if (state.players.some(player => player.id === id)) throw new Error('创建失败，请重试。');
        return { ...state, activePlayerId: id, players: [...state.players, { ...profile, id, createdAt: now(), completed: {} }] };
      });
    },
    async updateProfile(input) {
      const profile = validateProfile(input);
      return mutate(state => ({ ...state, players: state.players.map(player => player.id === state.activePlayerId ? { ...player, ...profile } : player) }));
    },
    async switchPlayer(id) {
      return mutate(state => {
        if (!state.players.some(player => player.id === id)) throw new Error('这位玩家已经不存在，请刷新排行榜。');
        return { ...state, activePlayerId: id };
      });
    },
    async recordResult(id, flowers, playerId) { return mutate(state => recordBest(state, id, flowers, options.caps, playerId)); },
    async claimCompletion(id,playerId) {
      const state=load(),player=state.players.find(p=>p.id===playerId);
      if(player&&options.canEnter&&!options.canEnter(id,player.completed))throw new Error('请先完成本区域的上一关。');
      const next=claimFirstCompletion(state,id,playerId,options.caps);
      save(next.state);
      return {snapshot:snapshot(next.state),receipt:next.receipt};
    },
    async resetCurrentProgress(expectedPlayerId) {
      return mutate(state => {
        if (expectedPlayerId && state.activePlayerId !== expectedPlayerId)
          throw new Error('当前玩家已在其他页面切换，请刷新后重新确认。');
        return { ...state, players: state.players.map(player => player.id === state.activePlayerId ? { ...player, completed: {} } : player) };
      });
    },
    subscribe: options.listen,
  };
}
