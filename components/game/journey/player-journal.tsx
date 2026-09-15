'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { MAX_PLAYERS, validateProfile } from '@/app/game/leaderboard/model';
import {
  categoryProgress,
  journeyCategories,
} from '@/app/game/journey/categories';
import { plantedTotal } from '@/app/game/journey/progress';
import type { JournalPlayer } from '@/app/game/journey/journal';
import type { LeaderboardController } from '../leaderboard/use-leaderboard';
import { GardenDialog } from './dialog';
import { Flower } from './flower';

type JournalCue = 'tap' | 'open' | 'close' | 'confirm';
type JournalProps = {
  board: LeaderboardController;
  entries: JournalPlayer[];
  onClose: () => void;
  onCue: (kind: JournalCue) => void;
};
type JournalView = 'mine' | 'board' | 'player';
type JournalTab = 'board' | 'mine';

const islandArt: Record<string, string> = {
  nature: '/ui/painted-journal-v1/island-nature.webp',
  public: '/ui/painted-journal-v1/island-public.webp',
  home: '/ui/painted-journal-v1/island-home.webp',
};
const categoryNames: Record<string, string> = {
  nature: '自然灾害',
  public: '公共安全',
  home: '居家 · 校园 · 办公',
};
const totalLevels = journeyCategories.reduce(
  (total, category) => total + categoryProgress(category, {}).total,
  0,
);
const reduceMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A single journal: inspecting a player never changes the active save. */
export function PlayerJournal({ board, entries, onClose, onCue }: JournalProps) {
  const [view, setView] = useState<JournalView>('mine');
  const [viewedId, setViewedId] = useState<string | null>(null);
  const [motion, setMotion] = useState<'entering' | 'settled' | 'leaving'>('entering');
  const [editor, setEditor] = useState<'edit' | 'create' | null>(null);
  const [name, setName] = useState('');
  const [validation, setValidation] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [avatarPoke, setAvatarPoke] = useState(0);
  const [islandPoke, setIslandPoke] = useState<string | null>(null);
  const mineTab = useRef<HTMLButtonElement>(null);
  const boardTab = useRef<HTMLButtonElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const closed = useRef(false);
  const alive = useRef(true);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeCallback = useRef(onClose);
  const uid = useId();
  const currentId = board.snapshot?.current.id;
  const mine = entries.find((player) => player.id === currentId);
  const viewed = (view === 'player' ? entries.find((player) => player.id === viewedId) : mine) ?? mine;
  const activeTab: JournalTab = view === 'mine' ? 'mine' : 'board';
  const data = board.snapshot;

  useEffect(() => { closeCallback.current = onClose; }, [onClose]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);
  useEffect(() => {
    setView('mine');
    setViewedId(null);
    setEditor(null);
    setIslandPoke(null);
  }, [currentId]);
  useEffect(() => {
    if (editor) nameInput.current?.focus();
  }, [editor]);
  useEffect(() => {
    if (!avatarPoke) return;
    const timer = setTimeout(() => setAvatarPoke(0), 1700);
    return () => clearTimeout(timer);
  }, [avatarPoke]);

  function finishClose() {
    if (closed.current) return;
    closed.current = true;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeCallback.current();
  }

  function beginClose() {
    if (closing.current || board.busy) return;
    closing.current = true;
    onCue('close');
    if (reduceMotion()) { finishClose(); return; }
    setMotion('leaving');
    closeTimer.current = setTimeout(finishClose, 220);
  }

  function resetPanel() {
    setEditor(null);
    setValidation('');
    setAvatarPoke(0);
    setIslandPoke(null);
    // Keep the title and both tabs within reach after switching a long panel.
    scroller.current?.scrollTo({ top: 0, behavior: 'instant' });
  }

  function selectTab(tab: JournalTab) {
    if (closing.current || board.busy || (view === tab && !editor)) return;
    onCue('tap');
    resetPanel();
    setViewedId(null);
    setView(tab);
  }

  function tabKeys(event: KeyboardEvent<HTMLButtonElement>, tab: JournalTab) {
    if (board.busy || closing.current) return;
    let next: JournalTab | null = null;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') next = tab === 'board' ? 'mine' : 'board';
    if (event.key === 'Home') next = 'board';
    if (event.key === 'End') next = 'mine';
    if (!next) return;
    event.preventDefault();
    selectTab(next);
    (next === 'mine' ? mineTab : boardTab).current?.focus();
  }

  function inspect(player: JournalPlayer) {
    if (closing.current || board.busy) return;
    onCue('open');
    resetPanel();
    setViewedId(player.id);
    setView(player.id === currentId ? 'mine' : 'player');
  }

  function openEditor(mode: 'edit' | 'create') {
    if (closing.current || board.busy) return;
    onCue('tap');
    setName(mode === 'edit' ? data?.current.name ?? '' : '');
    setValidation('');
    setEditor(mode);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (closing.current || board.busy || !editor || !data) return;
    try {
      const profile = validateProfile({ name, region: editor === 'edit' ? data.current.region : '' });
      const wasCreate = editor === 'create';
      onCue('confirm');
      const ok = await (wasCreate ? board.createPlayer(profile) : board.updateProfile(profile));
      if (!alive.current || !ok) return;
      setEditor(null);
      setView('mine');
      setViewedId(null);
      setAnnouncement(wasCreate ? `已使用新玩家 ${profile.name}，从零开始闯关。` : '昵称改好了。');
      mineTab.current?.focus();
    } catch (cause) {
      if (alive.current) setValidation(cause instanceof Error ? cause.message : '昵称没存上，请再试一下。');
    }
  }

  async function usePlayer(player: JournalPlayer) {
    if (closing.current || player.demo || player.id === currentId || board.busy) return;
    onCue('confirm');
    const ok = await board.switchPlayer(player.id);
    if (!alive.current || !ok) return;
    setView('mine');
    setViewedId(null);
    setAnnouncement(`已使用玩家 ${player.name}，接下来的成绩记在这位玩家名下。`);
    mineTab.current?.focus();
  }

  if (!data || !mine || !viewed) return null;
  const completed = plantedTotal(viewed.completed);
  const ownView = viewed.id === currentId;
  const hasDemo = entries.some((player) => player.demo);

  return (
    <GardenDialog
      title={view === 'board' ? '本片儿红人榜' : ownView ? '我的闯关进度' : `${viewed.name}的闯关进度`}
      onClose={beginClose}
      hideClose
      className="painted-journal"
      initialFocus={mineTab}
    >
        <section
          className="journal-card"
          data-testid="journal-card"
          data-ui-sound="off"
          data-view={view}
          data-viewed-player-id={viewed.id}
          data-active-player-id={currentId}
          data-motion={motion}
          aria-busy={board.busy || motion === 'leaving'}
          onKeyDownCapture={(event) => {
            if (closing.current) { event.preventDefault(); event.stopPropagation(); }
          }}
          onAnimationEnd={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.animationName === 'journal-paper-out') finishClose();
            if (event.animationName === 'journal-paper-in') setMotion('settled');
          }}
        >
          <header className="journal-header">
            <img src="/ui/painted-journal-v1/frame-header.webp" alt="" draggable={false} />
            <h2>{view === 'board' ? '本片儿红人榜' : '闯关进度'}</h2>
          </header>
          <div className="journal-body">
            <div className="journal-content">
              <div className="journal-tabs" role="tablist" aria-label="玩家档案">
                {(['board', 'mine'] as const).map((tab) => (
                  <button
                    key={tab}
                    ref={tab === 'mine' ? mineTab : boardTab}
                    id={`${uid}-tab-${tab}`}
                    type="button"
                    role="tab"
                    data-testid={`journal-tab-${tab}`}
                    aria-selected={activeTab === tab}
                    aria-controls={`${uid}-panel-${tab}`}
                    aria-disabled={board.busy}
                    tabIndex={activeTab === tab ? 0 : -1}
                    onClick={() => selectTab(tab)}
                    onKeyDown={(event) => tabKeys(event, tab)}
                  >
                    {tab === 'board' ? '红人榜' : '我的进度'}
                  </button>
                ))}
              </div>

              <div ref={scroller} className="journal-scroll" data-testid="journal-scroll">
              <div
                key={view === 'player' ? viewed.id : view}
                id={`${uid}-panel-${activeTab}`}
                className="journal-panel"
                role="tabpanel"
                aria-labelledby={`${uid}-tab-${activeTab}`}
                data-testid={`journal-panel-${activeTab}`}
                tabIndex={0}
              >
                {view === 'board' ? (
                  <>
                    <div className="journal-board-summary">
                      <span>我的小红花 <b>{mine.flowers}</b> 朵</span>
                      <span>已通关 <b>{plantedTotal(mine.completed)}</b> / {totalLevels}</span>
                    </div>
                    <div className="journal-list-head" aria-hidden="true">
                      <span>名次</span><span>玩家</span><span>小红花</span>
                    </div>
                    <ol className="journal-player-list" aria-label="按小红花数量排名，同分并列">
                      {entries.map((player) => (
                        <li key={player.id}>
                          <button
                            type="button"
                            className={`journal-player-row ${player.id === currentId ? 'is-mine' : ''}`}
                            data-testid={`journal-player-${player.id}`}
                            data-source={player.demo ? 'demo' : 'saved'}
                            data-rank={player.rank ?? 'none'}
                            data-flowers={player.flowers}
                            disabled={board.busy}
                            onClick={() => inspect(player)}
                            aria-label={`查看 ${player.name} 的闯关进度，${player.rank ? `第 ${player.rank} 名，` : '还没上榜，'}${player.flowers} 朵小红花${player.demo ? '，示例玩家' : ''}`}
                          >
                            <span className={`journal-row-rank rank-${player.rank ?? 'none'}`} aria-hidden="true">{player.rank ?? '—'}</span>
                            <span className="journal-row-identity">
                              <strong>{player.name}</strong>
                              <span>已通关 {plantedTotal(player.completed)} / {totalLevels}{player.demo && <i className="journal-demo">示例</i>}</span>
                            </span>
                            <span className="journal-row-score"><Flower /><b>{player.flowers}</b><span className="journal-row-arrow" aria-hidden="true">›</span></span>
                            {player.id === currentId && <span className="journal-you-pin" aria-hidden="true">你在这儿</span>}
                          </button>
                        </li>
                      ))}
                    </ol>
                    <p className="journal-list-tip">点开名字，看看谁闯到哪儿了</p>
                    <div className="journal-board-actions">
                      {data.scope === 'local' && <button
                        type="button"
                        className="journal-small-button"
                        data-testid="journal-create"
                        disabled={board.busy || data.entries.length >= MAX_PLAYERS}
                        onClick={() => openEditor('create')}
                      ><span aria-hidden="true">＋</span> 添加玩家</button>}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="journal-profile">
                      <div className="journal-avatar-wrap">
                        <button
                          type="button"
                          className="journal-avatar"
                          data-testid="journal-avatar"
                          aria-label="戳一下这朵得意的小红花"
                          data-poked={avatarPoke > 0 ? 'true' : 'false'}
                          onClick={() => {
                            onCue('tap');
                            setAvatarPoke((value) => value + 1);
                          }}
                        ><img key={avatarPoke} src="/ui/painted-journal-v1/avatar.webp" alt="" draggable={false} /></button>
                        {avatarPoke > 0 && <span className="journal-avatar-bubble" role="status">我先得意一下。</span>}
                      </div>
                      <div className="journal-identity">
                        <div className="journal-name-line">
                          <h3 data-testid="journal-player-name">{viewed.name}</h3>
                          {viewed.demo && <span className="journal-demo">示例</span>}
                        </div>
                        <span className="journal-rank-leaf" data-testid="journal-rank">
                          {viewed.rank ? <>第 <b>{viewed.rank}</b> 名</> : '还没上榜'}
                        </span>
                        {ownView && <button type="button" className="journal-text-button journal-edit" data-testid="journal-edit" disabled={board.busy} onClick={() => openEditor('edit')}>改个昵称</button>}
                      </div>
                    </div>
                    <p className="journal-profile-line">{completed ? <>这片儿，已经拿下 <b>{completed}</b> 关</> : '这片儿，等你露一手'}</p>
                    <div className="journal-stat-grid">
                      <div className="journal-stat journal-stat-flowers">
                        <Flower />
                        <strong data-testid="journal-flowers" data-value={viewed.flowers}>{viewed.flowers}</strong>
                        <span>小红花</span>
                      </div>
                      <div className="journal-stat journal-stat-completed">
                        <strong data-testid="journal-completed" data-value={completed} data-total={totalLevels}>{completed}<small> / {totalLevels}</small></strong>
                        <span>已通关</span>
                      </div>
                    </div>
                    <h4 className="journal-islands-title"><span>三片地儿，闯到哪儿了</span></h4>
                    <div className="journal-islands">
                      {journeyCategories.map((category) => {
                        const progress = categoryProgress(category, viewed.completed);
                        const fraction = progress.total ? Math.min(1, Math.max(0, progress.completed / progress.total)) : 0;
                        const selected = islandPoke === category.id;
                        return (
                          <button
                            type="button"
                            key={category.id}
                            className={`journal-island journal-island-${category.id}`}
                            data-testid={`journal-island-${category.id}`}
                            data-completed={progress.completed}
                            data-total={progress.total}
                            data-progress={fraction}
                            data-selected={selected}
                            style={{ '--island-progress': `${fraction * 100}%` } as CSSProperties}
                            aria-label={`${category.name}，已完成 ${progress.completed} / ${progress.total} 关，${progress.completed === progress.total ? '全拿下了' : `还差 ${progress.total - progress.completed} 关`}`}
                            aria-pressed={selected}
                            onClick={() => { onCue('tap'); setIslandPoke(selected ? null : category.id); }}
                          >
                            <span className="journal-island-art" aria-hidden="true">
                              <img className="journal-island-fog" src={islandArt[category.id]} alt="" draggable={false} />
                              <img className="journal-island-color" data-testid={`journal-island-color-${category.id}`} src={islandArt[category.id]} alt="" draggable={false} />
                            </span>
                            <span className="journal-island-sign">{categoryNames[category.id] ?? category.name}</span>
                            <span className="journal-island-count">{progress.completed}<span> / </span>{progress.total}</span>
                            {selected && <span className="journal-island-insight" data-testid="journal-island-insight" role="status">{progress.completed === progress.total ? '这片儿全拿下了！' : `还差 ${progress.total - progress.completed} 关`}</span>}
                          </button>
                        );
                      })}
                    </div>
                    {!ownView && !viewed.demo && data.scope === 'local' && <div className="journal-use-player">
                      <button type="button" className="journal-small-button" data-testid="journal-use-player" disabled={board.busy} onClick={() => void usePlayer(viewed)}>使用此玩家</button>
                      <p>切换后，接下来的成绩记在 {viewed.name} 名下。</p>
                    </div>}
                  </>
                )}
              </div>

              {editor && <form className="journal-editor" data-testid="journal-editor" onSubmit={save}>
                <label htmlFor={`${uid}-name`}>{editor === 'create' ? '给新玩家起个名' : '改个响亮的昵称'}<small>1～12 个字</small></label>
                <input ref={nameInput} id={`${uid}-name`} data-testid="journal-name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="off" placeholder="这片儿怎么称呼你？" required maxLength={48} aria-describedby={`${uid}-name-help`} />
                <p id={`${uid}-name-help`}>用昵称就行。</p>
                {validation && <p className="journal-error" role="alert">{validation}</p>}
                <div className="journal-editor-actions">
                  <button type="submit" className="journal-small-button" data-testid="journal-save" disabled={board.busy}>{board.busy ? '正在保存…' : editor === 'create' ? '添加并使用' : '就叫这个'}</button>
                  <button type="button" className="journal-text-button" data-testid="journal-cancel" disabled={board.busy} onClick={() => { onCue('tap'); setEditor(null); (activeTab === 'mine' ? mineTab : boardTab).current?.focus(); }}>取消编辑</button>
                </div>
              </form>}

              <details className="journal-rules" data-testid="journal-rules">
                <summary onClick={() => onCue('tap')}>榜单说明</summary>
                <p>新关首通 +3，重玩不加；同分并列，0 朵暂不上榜。</p>
                {hasDemo && <p>标有“示例”的人物和进度是演示数据，不会写入你的存档。</p>}
                <p>玩家记录保存在当前浏览器；不同设备、浏览器或游戏文件不会自动同步。</p>
              </details>
              {board.error && <p className="journal-error" role="alert">{board.error}</p>}
              {data.notice && <p className="journal-notice" role="status">{data.notice}</p>}
              <span className="garden-sr-only" role="status">{announcement}</span>
              </div>
            </div>
          </div>
          <footer className="journal-footer"><img src="/ui/painted-journal-v1/frame-footer.webp" alt="" draggable={false} /></footer>
        </section>
    </GardenDialog>
  );
}
