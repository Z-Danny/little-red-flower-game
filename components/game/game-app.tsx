'use client';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { getLevel, getPackage, levels } from '@/app/game/levels';
import { getHunt } from '@/app/game/scene-hunt/registry';
import { getDisaster } from '@/app/game/disaster/registry';
import {
  canEnter,
  flowerTotal,
  type Planting,
} from '@/app/game/journey/progress';
import type { CompletionReceipt } from '@/app/game/leaderboard/model';
import { LevelHub } from './level-hub';
import type { ArchipelagoSound } from '@/app/game/journey/archipelago';
import { KitchenPlayer } from './kitchen/kitchen-player';
import { ConfiguredPlayer } from './configured/player';
import { SceneHuntPlayer } from './scene-hunt/player';
import { DisasterPlayer } from './disaster/player';
import { useLeaderboard } from './leaderboard/use-leaderboard';
import { PlayerJournal } from './journey/player-journal';
import { journalEntries } from '@/app/game/journey/journal';
import { Settlement } from './journey/settlement';
import type { RewardSound, PlantingSoundStage, InterfaceCue } from './journey/reward-sound';
import { useInterfaceSound } from './use-interface-sound';
import { LevelInterfaceSoundContext, selectInterfaceSoundPolicy, type LevelInterfaceSoundPolicy } from './level-interface-sound-context';
import { useJourneyMusic } from './journey/use-journey-music';
import { PlacementLab } from './placement/placement-lab';
import { COVER_DEPARTURE_MS, TitleScreen } from './journey/title-screen';
import { useJourneyLocation } from './journey/use-journey-location';
import { entryNode, hasJourneyRecord, resumeNode } from '@/app/game/journey/resume';
import home from '@/content/journey-home.json';
import { primeLevelAudioContext, releaseLevelAudioContext } from '@/app/game/level-audio-context';
const EMPTY: Record<string, number> = {};
const UI_MUTE_KEY = 'red-flower:interface-muted';
function readInterfaceMuted() {
  try { return typeof window !== 'undefined' && localStorage.getItem(UI_MUTE_KEY) === 'true'; } catch { return false; }
}
type ModelContext = {
  registerTool: (
    tool: {
      name: string;
      title: string;
      description: string;
      inputSchema: object;
      annotations?: object;
      execute: (input: unknown) => unknown;
    },
    options?: { signal?: AbortSignal },
  ) => void | Promise<void>;
};
export function GameApp() {
  const [lab, setLab] = useState(false);
  useEffect(() => {
    const read = () => setLab(window.location.hash === '#placement-test');
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);
  return lab ? (
    <PlacementLab
      onBack={() => {
        window.location.hash = '';
        setLab(false);
      }}
    />
  ) : (
    <MainGameApp />
  );
}
function MainGameApp() {
  const [showTitle, setShowTitle] = useState(true);
  const [departingTitle, setDepartingTitle] = useState(false);
  const [departureCanContinue, setDepartureCanContinue] = useState(false);
  const departurePending = useRef(false);
  const board = useLeaderboard(),
    [activeId, setActiveId] = useState<string | null>(null),
    [showLeaderboard, setShowLeaderboard] = useState(false);
  const [finished, setFinished] = useState(false),
    [receipt, setReceipt] = useState<CompletionReceipt>(),
    [planting, setPlanting] = useState<Planting | null>(null),
    [focusId, setFocusId] = useState<string | null>(null),
    [muted, setMuted] = useState(readInterfaceMuted);
  const [levelInterfacePolicy, setLevelInterfacePolicy] = useState<LevelInterfaceSoundPolicy>({ muted: false, volume: 1 });
  const reportLevelInterfacePolicy = useCallback((policy: LevelInterfaceSoundPolicy) => {
    setLevelInterfacePolicy(current => current.muted === policy.muted && current.volume === policy.volume ? current : policy);
  }, []);
  const session = useRef({ playerId: '', levelId: '', finished: false }),
    sound = useRef<RewardSound | null>(null);
  const launchingLevel = useRef(false);
  const completed = board.snapshot?.current.completed ?? EMPTY,
    playerId = board.snapshot?.current.id,
    totalFlowers = flowerTotal(completed),
    active = activeId ? getLevel(activeId) : undefined;
  const music = useJourneyMusic(!active);
  const setInterfaceSession = useCallback((session: RewardSound | null) => { sound.current = session; }, []);
  const interfacePolicy = selectInterfaceSoundPolicy(muted, levelInterfacePolicy, !!active && finished);
  const interfaceSound = useInterfaceSound(interfacePolicy.muted, interfacePolicy.volume, setInterfaceSession, !active || finished);
  const onJournalCue = useCallback((kind: InterfaceCue) => {
    if (muted) return;
    sound.current?.unlock();
    sound.current?.ui(kind);
  }, [muted]);
  const bookmark = useJourneyLocation(playerId);
  const startingNewGame = useRef(false);
  const remember = bookmark.remember;
  const continueId = resumeNode(completed, bookmark.location);
  const canContinue = hasJourneyRecord(completed, bookmark.location);
  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    sound.current?.setMuted(next);
    try { localStorage.setItem(UI_MUTE_KEY, String(next)); } catch { /* optional preference */ }
    if (!next) sound.current?.unlock();
  };
  const leaveTitle = () => {
    sound.current?.unlock();
    departurePending.current = true;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShowTitle(false);
      return;
    }
    // Remembering the destination must not swap the menu labels mid-transition.
    setDepartureCanContinue(canContinue);
    setDepartingTitle(true);
  };
  useEffect(() => {
    if (!showTitle) departurePending.current = false;
  }, [showTitle]);
  useEffect(() => {
    if (!departingTitle) return;
    const timer = window.setTimeout(() => {
      setShowTitle(false);
      setDepartingTitle(false);
      departurePending.current = false;
    }, COVER_DEPARTURE_MS);
    return () => window.clearTimeout(timer);
  }, [departingTitle]);
  const enterMap = (resume: boolean) => {
    if (!playerId || board.busy || departurePending.current) return;
    const id = resume ? continueId : entryNode(completed);
    bookmark.remember(id);
    setFocusId(id);
    leaveTitle();
  };
  const startNewGame = async () => {
    if (!playerId || board.busy || startingNewGame.current || departurePending.current) return;
    startingNewGame.current = true;
    try {
      // Without completed levels, starting over only navigates. Never erase
      // a newer result written by another tab while this snapshot was empty.
      if (!Object.values(completed).some((score) => score > 0)) {
        enterMap(false);
        return;
      }
      if (
        !window.confirm(
          home.newGameConfirm
            .replace('{player}', board.snapshot!.current.name)
            .replace('{flowers}', String(totalFlowers)),
        )
      )
        return;
      // Only leave the title after the current player's reset succeeds.
      if (!(await board.resetProgress())) return;
      const id = entryNode(EMPTY);
      session.current = { playerId: '', levelId: '', finished: false };
      setActiveId(null);
      setFinished(false);
      setReceipt(undefined);
      setPlanting(null);
      setShowLeaderboard(false);
      bookmark.remember(id);
      setFocusId(id);
      leaveTitle();
    } finally {
      startingNewGame.current = false;
    }
  };
  useEffect(() => () => releaseLevelAudioContext(), []);
  const startLevel = useCallback(
    (id: string) => {
      if (launchingLevel.current || !playerId || !getLevel(id)?.playable || !canEnter(id, completed))
        return;
      launchingLevel.current = true;
      primeLevelAudioContext();
      session.current = { playerId, levelId: id, finished: false };
      setReceipt(undefined);
      setFinished(false);
      setPlanting(null);
      setActiveId(id);
      setFocusId(id);
      setShowLeaderboard(false);
      setShowTitle(false);
      remember(id);
      sound.current?.unlock();
    },
    [playerId, completed, remember],
  );
  const claim = board.claimCompletion;
  const saveCompletion = useCallback(async () => {
    const { playerId, levelId } = session.current;
    const saved = await claim(levelId, playerId);
    if (
      session.current.playerId === playerId &&
      session.current.levelId === levelId &&
      saved
    ) {
      setReceipt(saved);
      // Flower sounds follow the map animation after returning to the map.
    }
  }, [claim]);
  const finishLevel = useCallback(
    (id: string, stars: number) => {
      // Only a successful engine completion can call this boundary. Failed/partial runs never claim.
      if (
        id !== session.current.levelId ||
        !Number.isInteger(stars) ||
        stars < 1 ||
        stars > 3 ||
        session.current.finished
      )
        return;
      session.current.finished = true;
      setFinished(true);
      void saveCompletion();
    },
    [saveCompletion],
  );
  const returnMap = () => {
    if (finished && !receipt) return;
    launchingLevel.current = false;
    releaseLevelAudioContext();
    if (receipt?.reward && receipt.playerId === playerId)
      setPlanting({
        levelId: receipt.levelId,
        before: receipt.before,
        reward: receipt.reward,
        nonce: Date.now(),
      });
    setFocusId(activeId);
    setActiveId(null);
    setFinished(false);
    setReceipt(undefined);
  };
  const onPlanted = useCallback(() => setPlanting(null), []);
  const onPlantSound = useCallback((stage: PlantingSoundStage) => sound.current?.plant(stage), []);
  const onArchipelagoSound = useCallback((cue: ArchipelagoSound) => {
    sound.current?.unlock();
    sound.current?.ui(cue === 'select' ? 'tap' : 'confirm');
  }, []);
  const resetProgress = () => {
    if (
      window.confirm(
        `要清空「${board.snapshot?.current.name}」的小红花和关卡记录吗？其他玩家不受影响。`,
      )
    ) {
      setPlanting(null);
      setFocusId(null);
      void board.resetProgress();
    }
  };
  useEffect(() => {
    const context = (document as Document & { modelContext?: ModelContext })
      .modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(
      context.registerTool(
        {
          name: 'start_emergency_level',
          title: '开始应急训练关卡',
          description: '打开当前玩家已解锁的关卡。',
          inputSchema: {
            type: 'object',
            properties: {
              levelId: {
                type: 'string',
                enum: levels.filter((l) => l.playable).map((l) => l.id),
              },
            },
            required: ['levelId'],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false },
          execute(input) {
            const candidate = (input as { levelId?: unknown })?.levelId;
            const id = typeof candidate === 'string' ? candidate : '';
            if (!playerId) throw new Error('存档正在载入');
            if (!getLevel(id)?.playable || !canEnter(id, completed))
              throw new Error('该关卡尚未解锁');
            startLevel(id);
            return { status: 'opened', levelId: id };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);
    void Promise.resolve(
      context.registerTool(
        {
          name: 'read_emergency_progress',
          title: '读取应急训练进度',
          description: '读取当前玩家本机记录。',
          inputSchema: { type: 'object', properties: {} },
          annotations: { readOnlyHint: true },
          execute() {
            return {
              completed,
              flowers: totalFlowers,
              totalLevels: levels.filter((l) => l.playable).length,
            };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);
    return () => lifecycle.abort();
  }, [completed, totalFlowers, playerId, startLevel]);
  const shell = (content: ReactNode) => (
    <main
      {...interfaceSound}
      ref={music.containerRef}
      className="game-page"
      data-active-player-id={playerId}
      onPointerDownCapture={() => { if (!active) sound.current?.unlock(); music.unlock(); }}
      onKeyDownCapture={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          if (!active) sound.current?.unlock();
          music.unlock();
        }
      }}
    >
      {content}
      {(board.error || board.snapshot?.notice) && (
        <output className="game-save-notice">
          {board.error || board.snapshot?.notice}
        </output>
      )}
    </main>
  );
  if (!board.snapshot || !bookmark.ready)
    return shell(
      <section className="phone-stage game-loading">
        <output>{board.error || '正在打开你的安全旅程…'}</output>
        {board.error && <button onClick={board.refresh}>重新读取存档</button>}
      </section>,
    );
  if (active) {
    const hunt = getHunt(active.id),
      disaster = getDisaster(active.id),
      pack = getPackage(active.id);
    const player = disaster ? (
      <DisasterPlayer
        key={active.id}
        pack={disaster}
        journey
        autoStart
        onBack={returnMap}
        onFinish={finishLevel}
      />
    ) : hunt ? (
      <SceneHuntPlayer
        key={active.id}
        pack={hunt}
        journey
        autoStart
        onBack={returnMap}
        onFinish={finishLevel}
      />
    ) : pack ? (
      <ConfiguredPlayer
        key={active.id}
        pack={pack}
        journey
        autoStart
        onBack={returnMap}
        onFinish={finishLevel}
      />
    ) : (
      <KitchenPlayer
        key={active.id}
        totalFlowers={totalFlowers}
        journey
        autoStart
        onBack={returnMap}
        onFinish={finishLevel}
      />
    );
    return shell(
      <>
        <LevelInterfaceSoundContext.Provider value={reportLevelInterfacePolicy}>
          {player}
        </LevelInterfaceSoundContext.Provider>
        {finished && (
          <Settlement
            level={active}
            receipt={receipt}
            error={board.error}
            onRetry={() => void saveCompletion()}
            onMap={returnMap}
          />
        )}
      </>,
    );
  }
  if (showTitle)
    return shell(
      <TitleScreen
        canContinue={departingTitle ? departureCanContinue : canContinue}
        onStart={() => void startNewGame()}
        busy={board.busy || departingTitle}
        departing={departingTitle}
        error={board.error}
        onContinue={() => enterMap(true)}
      />,
    );
  return shell(
    <>
    <LevelHub
      key={playerId}
      completed={completed}
      onStart={startLevel}
      onReset={resetProgress}
      onLeaderboard={() => {
        if (planting) return;
        setShowLeaderboard(true);
      }}
      playerName={board.snapshot.current.name}
      planting={planting}
      onPlanted={onPlanted}
      onPlantSound={onPlantSound}
      onArchipelagoSound={onArchipelagoSound}
      onHome={() => setShowTitle(true)}
      onVisit={bookmark.remember}
      focusId={focusId}
      muted={muted}
      onMute={toggleMute}
      musicMuted={music.muted}
      onMusicMute={music.toggle}
    />
    {showLeaderboard && (
      <PlayerJournal
        board={{
          ...board,
          switchPlayer: async (id) => {
            const ok = await board.switchPlayer(id);
            if (ok) setFocusId(null);
            return ok;
          },
          createPlayer: async (profile) => {
            const ok = await board.createPlayer(profile);
            if (ok) setFocusId(null);
            return ok;
          },
        }}
        entries={journalEntries(board.snapshot)}
        onClose={() => setShowLeaderboard(false)}
        onCue={onJournalCue}
      />
    )}
    </>,
  );
}
