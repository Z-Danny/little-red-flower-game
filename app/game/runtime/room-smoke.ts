import type { Box, LevelPackage, Point, Run } from './schema';
export type SmokeStream = { origin:Point; control:Point; end:Point; spread:number; radius:number; lifetimeMs:number };
export type RoomSmokeSpec = { door:SmokeStream; gap:SmokeStream; ceiling:Box; depth:number; closedGoal:string; pluggedGoal:string; reinforcedGoal:string; initialLoad:number; fillMs:number };
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
function at(run:Run,goal:string){return run.resolved.includes(goal)?run.resolvedAt?.[goal]??run.elapsed:Infinity;}
/** Source flow at particle birth, not current flow: emitted smoke never vanishes
 * merely because a mitigation was just completed. All clocks pause with Run. */
export function smokeRates(spec:RoomSmokeSpec,run:Run,time=run.elapsed){
 return {door:time>=at(run,spec.closedGoal)?0:1,gap:time>=at(run,spec.reinforcedGoal)?.015:time>=at(run,spec.pluggedGoal)?.055:.22};
}
export function roomSmokeFrame(pack:LevelPackage,run:Run){
 const spec=pack.skin.presentation?.roomSmoke;if(!spec)return null;
 const times=[0,run.elapsed,...[spec.closedGoal,spec.pluggedGoal,spec.reinforcedGoal].map(g=>at(run,g)).filter(t=>t>0&&t<run.elapsed)].sort((a,b)=>a-b);
 let amount=0;for(let i=1;i<times.length;i++){const rate=smokeRates(spec,run,(times[i]+times[i-1])/2);amount+=(times[i]-times[i-1])*(rate.door+rate.gap);}
 const load=clamp(spec.initialLoad+amount/spec.fillMs),rates=smokeRates(spec,run);
 return{spec,load,...rates,height:spec.ceiling.h*(.4+.6*load)};
}
export function smokePoint(stream:SmokeStream,progress:number):Point{
 const p=clamp(progress),q=1-p;return{x:q*q*stream.origin.x+2*q*p*stream.control.x+p*p*stream.end.x,y:q*q*stream.origin.y+2*q*p*stream.control.y+p*p*stream.end.y};
}
export function trainingRemaining(pack:LevelPackage,run:Run){
 const stopped=run.phase==='settling'||run.phase==='complete';
 const elapsed=stopped?Math.max(0,run.elapsed-run.settleAge):run.elapsed;
 return Math.max(0,Math.ceil(pack.rules.risk.seconds-elapsed/1000));
}
