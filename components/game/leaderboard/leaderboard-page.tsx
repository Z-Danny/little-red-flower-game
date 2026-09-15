'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ChevronRight, MapPin, Pencil, Plus, Trophy, X } from 'lucide-react';
import {Flower} from '../journey/flower';
import {journeyCopy} from '@/app/game/journey/presentation';
import { MAX_PLAYERS, validateProfile } from '@/app/game/leaderboard/model';
import type { LeaderboardController } from './use-leaderboard';

type Props = { board: LeaderboardController; onBack: () => void };

export function LeaderboardPage({ board, onBack }: Props) {
  const [editor, setEditor] = useState<'edit' | 'create' | null>(null);
  const [name, setName] = useState('');
  const [region, setRegion] = useState('');
  const [validation, setValidation] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const nameInput = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => { if (editor) nameInput.current?.focus(); }, [editor]);
  const data = board.snapshot;
  if (!data) return null;
  const mine = data.entries.find(player => player.id === data.current.id)!;
  const rankedCount = data.entries.filter(player => player.rank !== null).length;
  const leading = data.entries.find(player => player.rank === 1);
  const local = data.scope === 'local';

  function openEditor(mode: 'edit' | 'create') {
    returnFocus.current = document.activeElement as HTMLElement;
    setName(mode === 'edit' ? data!.current.name : '');
    setRegion(mode === 'edit' ? data!.current.region : '');
    setValidation('');
    setEditor(mode);
  }
  function closeEditor() {
    setEditor(null);
    returnFocus.current?.focus();
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    try {
      const profile = validateProfile({ name, region });
      const ok = await (editor === 'create' ? board.createPlayer(profile) : board.updateProfile(profile));
      if (ok) { closeEditor(); setAnnouncement(editor === 'create' ? `已切换为 ${profile.name}，新玩家从零开始。` : '玩家资料已保存。'); }
    } catch (cause) { setValidation((cause as Error).message); }
  }

  return <section className="phone-stage lb-page">
    <header className="lb-header">
      <button className="lb-icon" onClick={onBack} aria-label="返回关卡首页"><ArrowLeft /></button>
      <span>{journeyCopy.brand}</span>
      <span className="lb-local-badge">红人榜</span>
    </header>

    <div className="lb-hero">
      <div className="lb-hero-flower" aria-hidden="true"><Flower /></div>
      <span className="lb-eyebrow">每一处守护，都留下花开的痕迹</span>
      <h1 ref={heading} tabIndex={-1}>小红花排行榜</h1>
      <p>把安全记在心里，让小红花慢慢盛开。</p>
      <div className="lb-hero-meta"><span><Trophy />{rankedCount} 人上榜</span><i /><span>当前最多 {data.maxFlowers} 朵</span></div>
    </div>

    <section className="lb-mine" aria-label="当前玩家">
      <div className="lb-mine-top"><span>我的小红花</span><button disabled={board.busy} onClick={() => openEditor('edit')}><Pencil />编辑资料</button></div>
      <div className="lb-mine-body">
        <span className="lb-avatar" aria-hidden="true">{Array.from(mine.name)[0]}</span>
        <div className="lb-mine-identity"><strong>{mine.name}</strong><span><MapPin />{mine.region || '地区未设置'}</span></div>
        <div className="lb-mine-score"><strong><Flower />{mine.flowers}</strong><span>{mine.rank ? `第 ${mine.rank} 名` : '未上榜'}</span></div>
      </div>
      <p>{mine.rank ? (mine.rank === 1 ? '你正在榜首，继续守护每一份安全。' : `距离榜首还差 ${(leading?.flowers ?? mine.flowers) - mine.flowers} 朵，继续练习吧。`) : '完成任意关卡，收获第一朵小红花。'}</p>
    </section>

    <section className="lb-list-section" aria-label="玩家排行榜">
      <div className="lb-list-title"><h2>{local ? '本机玩家' : '玩家排名'} <small>{data.entries.length}</small></h2>{local && <button disabled={board.busy || data.entries.length >= MAX_PLAYERS} onClick={() => openEditor('create')}><Plus />添加玩家</button>}</div>
      <div className="lb-table-wrap"><table className="lb-table">
        <caption className="lb-sr-only">按小红花数从高到低排列；同分并列，零朵未上榜</caption>
        <thead><tr><th scope="col">排名</th><th scope="col">昵称 / 地区</th><th scope="col">小红花</th><th scope="col"><span className="lb-sr-only">切换玩家</span></th></tr></thead>
        <tbody>{data.entries.map(player => <tr key={player.id} className={player.id === mine.id ? 'lb-current-row' : ''} aria-current={player.id === mine.id ? 'true' : undefined}>
          <td><span className={`lb-rank lb-rank-${player.rank ?? 'none'}`} aria-label={player.rank ? `第 ${player.rank} 名` : '未上榜'}>{player.rank === 1 && <Trophy aria-hidden="true" />}{player.rank ?? '—'}</span></td>
          <td><div className="lb-row-name">{player.name}{player.id === mine.id && <small>我</small>}</div><div className="lb-row-region">{player.region || '地区未设置'}</div></td>
          <td><span className="lb-row-flowers"><Flower />{player.flowers}</span></td>
          <td>{player.id !== mine.id && local ? <button className="lb-switch" disabled={board.busy} aria-label={`切换为 ${player.name}`} onClick={async () => { if (await board.switchPlayer(player.id)) setAnnouncement(`已切换为 ${player.name}，接下来的成绩将记在这位玩家名下。`); }}><ChevronRight /></button> : <span className="lb-current-dot" aria-hidden="true" />}</td>
        </tr>)}</tbody>
      </table></div>
      {data.entries.length === 1 && <p className="lb-invite">让家人也来试试？添加玩家，各自收集小红花。</p>}
    </section>

    {editor && <section className="lb-editor" aria-label={editor === 'edit' ? '编辑玩家资料' : '添加本机玩家'} onKeyDown={event => { if (event.key === 'Escape' && !board.busy) closeEditor(); }}>
      <div className="lb-editor-title"><h2>{editor === 'edit' ? '编辑玩家资料' : '添加本机玩家'}</h2><button className="lb-icon" disabled={board.busy} onClick={closeEditor} aria-label="取消编辑"><X /></button></div>
      <form onSubmit={save}>
        <label htmlFor="lb-name">昵称 <small>必填 · 最多 12 个字</small></label>
        <input ref={nameInput} id="lb-name" value={name} onChange={event => setName(event.target.value)} placeholder="起个喜欢的昵称" autoComplete="off" required maxLength={48} aria-describedby="lb-form-help" />
        <label htmlFor="lb-region">地区 <small>选填 · 最多 20 个字</small></label>
        <input id="lb-region" value={region} onChange={event => setRegion(event.target.value)} placeholder="例如：山东 · 青岛" autoComplete="off" maxLength={80} aria-describedby="lb-form-help" />
        <p id="lb-form-help">使用昵称即可，请勿填写真实姓名、住址或电话。不读取定位。</p>
        {validation && <p className="lb-error" role="alert">{validation}</p>}
        <button className="lb-primary" type="submit" disabled={board.busy}>{board.busy ? '正在保存…' : editor === 'create' ? '添加并切换玩家' : '保存资料'}</button>
      </form>
    </section>}

    {board.error && <p className="lb-error" role="alert">{board.error}</p>}
    {data.notice && <p className="lb-warning" role="status">{data.notice}</p>}
    <p className="lb-announcement" role="status">{announcement}</p>
    <footer className="lb-rules">
      <h2>小红花怎样计算？</h2>
      <p>每关首次完成获得 3 朵小红花，重复游玩不重复领奖。旧版花数保留。同分并列排名，0 朵暂不上榜。</p>
      <p>{local ? '仅展示此浏览器、此游戏地址保存的玩家，不是全网排名。清理浏览器数据会丢失本机记录；不同设备、浏览器或离线文件不会自动同步。' : '联网榜由服务端更新。'}</p>
    </footer>
    <button className="lb-play" onClick={onBack}>返回地图 <ChevronRight /></button>
  </section>;
}
