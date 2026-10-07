import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBackup, serializeBackup, BACKUP_MAX_BYTES } from '../app/game/leaderboard/backup';
import { createLocalLeaderboard, BOARD_STORAGE_KEY } from '../app/game/leaderboard/local-provider';
import { MAX_PLAYERS, type Player } from '../app/game/leaderboard/model';
const player:Player={id:'original',createdAt:1,name:'小花',region:'青岛',completed:{'typhoon-home':1,'flood-kit':3,'future-level':2},allLevelsUnlocked:true};
const file=serializeBackup(player,123);
function setup() {
 const bytes=new Map<string,string>();let seq=0,blocked=false;
 const make=()=>createLocalLeaderboard({storage:()=>({getItem:k=>bytes.get(k)??null,setItem:(k,v)=>{if(blocked)throw Error('quota');bytes.set(k,v);}}),id:()=>String(++seq),caps:{'typhoon-home':3,'flood-kit':3},now:()=>100});
 return {bytes,make,block:()=>{blocked=true;}};
}
test('backup round trip preserves names, scores, unknown IDs and unlock flag without copying identity',()=>{
 const decoded=parseBackup(file);assert.equal(decoded.player.name,player.name);assert.deepEqual(decoded.player.completed,player.completed);assert.equal(decoded.player.allLevelsUnlocked,true);assert(!('id' in decoded.player));
});
test('damaged/foreign/newer/oversized backups reject instead of silently dropping scores',()=>{
 for(const text of ['', '{', '{}', '[]', 'null', ' '.repeat(BACKUP_MAX_BYTES+1)]) assert.throws(()=>parseBackup(text));
 const base=JSON.parse(file);
 for(const patch of [{format:'other'},{version:2},{exportedAt:0},{exportedAt:null},{player:{...base.player,name:''}},{player:{...base.player,allLevelsUnlocked:'true'}},{player:{...base.player,completed:{a:4}}},{player:{...base.player,completed:{a:0}}},{player:{...base.player,completed:{a:1.1}}},{player:{...base.player,completed:{a:'3'}}},{player:{...base.player,completed:JSON.parse('{"__proto__":3}')}}]) assert.throws(()=>parseBackup(JSON.stringify({...base,...patch})));
});
test('import creates a new selected player; existing and newer local scores survive reload',async()=>{
 const s=setup(),p=s.make(),original=await p.read();await p.claimCompletion('typhoon-home',original.current.id,3);
 const before=JSON.parse(s.bytes.get(BOARD_STORAGE_KEY)!).players;
 const imported=await p.importBackup(file,original.current.id);assert.notEqual(imported.current.id,original.current.id);assert.deepEqual(imported.current.completed,{'typhoon-home':1,'flood-kit':3});
 const state=JSON.parse(s.bytes.get(BOARD_STORAGE_KEY)!);assert.deepEqual(state.players.slice(0,-1),before);assert.equal(state.players.at(-1).completed['future-level'],2);
 const reload=await s.make().read();assert.deepEqual(reload.current,imported.current);
 const exported=parseBackup(await p.exportBackup(imported.current.id));assert.deepEqual(exported.player.completed,player.completed);
 await p.switchPlayer(original.current.id);assert.equal((await p.read()).current.completed['typhoon-home'],3);
});
test('bad file, changed player, export after player switch and full player list never mutate storage',async()=>{
 const s=setup(),p=s.make(),a=await p.read();const b=await p.createPlayer({name:'另一个',region:''});let before=s.bytes.get(BOARD_STORAGE_KEY);
 await assert.rejects(()=>p.importBackup(file,a.current.id));await assert.rejects(()=>p.exportBackup(a.current.id));await assert.rejects(()=>p.importBackup('{}',b.current.id));assert.equal(s.bytes.get(BOARD_STORAGE_KEY),before);
 for(let i=2;i<MAX_PLAYERS;i++)await p.createPlayer({name:'玩家'+i,region:''});const full=await p.read();before=s.bytes.get(BOARD_STORAGE_KEY);await assert.rejects(()=>p.importBackup(file,full.current.id));assert.equal(s.bytes.get(BOARD_STORAGE_KEY),before);
});
test('quota failure is session-only and backup rescues unsaved imported progress',async()=>{
 const s=setup(),p=s.make(),a=await p.read(),before=s.bytes.get(BOARD_STORAGE_KEY);s.block();
 const imported=await p.importBackup(file,a.current.id);assert.equal(imported.persistence,'session');assert.equal(s.bytes.get(BOARD_STORAGE_KEY),before);
 assert.deepEqual(parseBackup(await p.exportBackup(imported.current.id)).player.completed,player.completed);
});
