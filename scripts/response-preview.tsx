import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { GameApp } from '../components/game/game-app';
import { KitchenPlayer } from '../components/game/kitchen/kitchen-player';
import { ConfiguredPlayer } from '../components/game/configured/player';
import { KitchenCanvas } from '../components/game/kitchen/scene-canvas';
import { createRun } from '../app/game/kitchen/model';
import { validatePackage } from '../app/game/runtime/validate';
import rules from '../content/templates/response/level.json';
import skin from '../content/templates/response/skins/illustrated.json';
import { ResponseAudio, defaultAudioSettings } from '../app/game/response/audio';
function Lab(){
 const [risk,setRisk]=useState(22),[wrong,setWrong]=useState(false),[safe,setSafe]=useState(false);
 const run={...createRun(),phase:'playing' as const,elapsed:5000,risk,boost:wrong?.8:0,reaction:wrong?'panicked' as const:null,covered:safe,gasOff:safe,settlingAge:safe?1700:0};
 const [a]=useState(()=>new ResponseAudio()),[report,setReport]=useState('');
 const testAudio=async()=>{a.update({elapsed:5000,active:true,intensity:risk/100,flame:wrong?2.6:1.3,smoke:.6,resolved:safe,tier:wrong?2:0,milestones:[]});await a.unlock();setReport(JSON.stringify(a.status()));};
 return <div style={{background:'#23342e',color:'#fff',minHeight:'100vh',padding:18}}><h1>声画验收台（合成状态，不是通关证据）</h1><nav>{[22,55,95].map(n=><button key={n} onClick={()=>{setRisk(n);setWrong(false);setSafe(false);}}>压力 {n}</button>)}<button onClick={()=>setWrong(true)}>错误冲击</button><button onClick={()=>setSafe(true)}>已受控</button><button onClick={testAudio}>启动音频测量</button><button onClick={()=>setReport(JSON.stringify(a.status()))}>读取声轨状态</button><button onClick={()=>{a.setSettings({...defaultAudioSettings,muted:true});setReport(JSON.stringify(a.status()));}}>静音测量</button></nav><pre>{report}</pre><div style={{height:780,width:390}}><KitchenCanvas run={run}/></div></div>;
}
const back=()=>{location.href='/';};
const path=location.pathname;
createRoot(document.getElementById('game-root')!).render(path==='/kitchen'?<KitchenPlayer totalFlowers={0} onBack={back} onFinish={()=>{}}/>:path==='/template'?<ConfiguredPlayer pack={validatePackage(rules,skin)} onBack={back} onFinish={()=>{}}/>:path==='/lab'?<Lab/>:<GameApp/>);
