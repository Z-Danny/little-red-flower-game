'use client';
import { useRef, useState } from 'react';
import { GardenDialog } from './dialog';
import type { LeaderboardController } from '../leaderboard/use-leaderboard';
import { BACKUP_MAX_BYTES, parseBackup, type ProgressBackup } from '@/app/game/leaderboard/backup';
import { flowerTotal, plantedTotal } from '@/app/game/journey/progress';

export function SaveManager({board,onClose,onImported}:{board:LeaderboardController;onClose:()=>void;onImported:()=>void}) {
  const [pending,setPending]=useState<{text:string;data:ProgressBackup;playerId:string}|null>(null);
  const [error,setError]=useState(''),[message,setMessage]=useState(''),[working,setWorking]=useState(false);
  const file=useRef<HTMLInputElement>(null), selection=useRef(0);
  const current=board.snapshot!.current, blocked=working||board.busy;
  const saved=board.snapshot!.persistence==='saved';
  async function download() {
    setError('');setMessage('');setWorking(true);
    try {
      const text=await board.exportBackup(current.id);
      const url=URL.createObjectURL(new Blob([text],{type:'application/json;charset=utf-8'}));
      const anchor=document.createElement('a');anchor.href=url;
      anchor.download='小红花存档-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
      document.body.appendChild(anchor);
      try { anchor.click(); } finally { anchor.remove(); window.setTimeout(()=>URL.revokeObjectURL(url),1000); }
      setMessage('已发起存档下载，请确认文件已保存到下载目录或你选择的位置。');
    } catch(cause) {setError(cause instanceof Error?cause.message:'导出失败，请重试。');}
    finally {setWorking(false);}
  }
  return <GardenDialog title="存档管理" onClose={()=>{if(!blocked)onClose();}} className="save-manager">
    <h2>存档管理</h2>
    <p className="save-persistence" data-persistence={saved?'saved':'session'} role="status">{saved?'进度已保存到本机':'尚未保存到本机 · 关闭页面可能丢失'}</p>
    <p>当前玩家：<strong>{current.name}</strong><br/>已完成 {plantedTotal(current.completed)} 关 · {flowerTotal(current.completed)} 朵小红花</p>
    <p>通关后自动保存，下次选择“继续游戏”。备份包含当前玩家资料、关卡成绩和解锁状态，不包含关卡中途操作、地图停留位置或声音设置。其他玩家需切换后分别导出。</p>
    {!saved&&<p role="alert">浏览器存储不可用，请在退出前导出存档备份。</p>}
    <div className="save-actions">
      <button type="button" onClick={()=>void download()} disabled={blocked} data-save-export>导出当前玩家存档</button>
      <button type="button" onClick={()=>file.current?.click()} disabled={blocked} data-save-import>选择存档文件</button>
    </div>
    <input ref={file} type="file" accept=".json,application/json" aria-label="选择小红花存档文件" className="garden-sr-only" disabled={blocked} onChange={async event=>{
      const chosen=event.target.files?.[0];event.target.value='';if(!chosen)return;
      const seq=++selection.current;setPending(null);setError('');setMessage('');setWorking(true);
      const playerId=current.id;
      try {
        if(chosen.size>BACKUP_MAX_BYTES)throw new Error('存档文件过大（最多256KB）。');
        const text=await chosen.text(),data=parseBackup(text);
        if(seq===selection.current)setPending({text,data,playerId});
      }catch(cause){if(seq===selection.current)setError(cause instanceof Error?cause.message:'读取文件失败。');}
      finally{if(seq===selection.current)setWorking(false);}
    }}/>
    {pending&&<section className="save-preview" data-save-preview>
      <h3>确认导入</h3>
      <p>玩家：{pending.data.player.name}<br/>已完成 {plantedTotal(pending.data.player.completed)} 关 · {flowerTotal(pending.data.player.completed)} 朵小红花{pending.data.player.allLevelsUnlocked?' · 全部关卡已解锁':''}</p>
      <p>将作为<strong>新的本机玩家</strong>导入并切换过去，原玩家及其最新进度不会被覆盖。即使昵称相同，也是独立存档。</p>
      <div className="save-actions"><button type="button" data-save-confirm disabled={blocked} onClick={async()=>{
        setWorking(true);setError('');setMessage('');
        try {if(await board.importBackup(pending.text,pending.playerId)){setPending(null);setMessage('已导入为新的本机玩家。请以上方保存状态为准；原玩家记录保留。');onImported();}}
        finally{setWorking(false);}
      }}>确认导入为新玩家</button><button type="button" disabled={blocked} onClick={()=>setPending(null)}>取消导入</button></div>
    </section>}
    {(error||board.error)&&<p role="alert">{error||board.error}</p>}
    {message&&<p role="status" data-save-message>{message}</p>}
    <p>这是本地备份，不是云同步。请保管好下载文件；清理浏览器数据前先备份。</p>
  </GardenDialog>;
}

