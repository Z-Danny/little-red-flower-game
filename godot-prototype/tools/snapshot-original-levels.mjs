/** Snapshot original release routes into the Godot navigation catalog. No source content is enabled or rewritten. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { dependency, root } from '../../scripts/lib/dependencies.mjs';

const build=await dependency('esbuild').build({bundle:true, write:false, platform:'node', format:'esm', absWorkingDir:root, stdin:{resolveDir:root, contents:`
import {getLevel, getPackage, levels} from './app/game/levels';
import {getDisaster} from './app/game/disaster/registry';
import {getHunt} from './app/game/scene-hunt/registry';
import {rewardReferenceSeconds} from './app/game/journey/level-reward';
import {journeyMap} from './app/game/journey/progress';
import islandData from './content/island-level-maps.json';

export const levelsDeclaredPlayable=levels.filter(l=>l.playable).map(l=>l.id);
export const sourceOnlyDefinitions=levels.filter(l=>!l.playable).map(l=>({id:l.id,title:l.title}));
const nodes=new Map(journeyMap.regions.flatMap(r=>r.nodes).map(node=>[node.id,node]));
export const maps=islandData.maps.map(map=>({
  id:map.id, name:map.name, source_image:map.image, source_sha256:map.sha256,
  image:'res://assets/island_maps/'+map.id+'.webp', width:map.width, height:map.height,
  stops:map.stops.map((stop,index)=>{
    const id=stop.id, level=getLevel(id), playable=Boolean(level?.playable);
    const engine=!playable?null:level.engine==='first-aid-cpr'?'first-aid-cpr':getDisaster(id)?'disaster-v1':getHunt(id)?'scene-hunt':getPackage(id)?'configured-v1':level.engine;
    const intro=level?.briefing || stop.preview;
    return {id, title:stop.title, number:index+1, x:stop.x, y:stop.y, was_playable:playable,
      status:playable?'playable':stop.placeholder?'placeholder':'preview', engine,
      unlock_after:nodes.get(id)?.unlockAfter??null, description:id==='oil-fire'?'厨房的油锅起火了。控制火源、盖住油锅，再把人物拖到门外安全区。':intro,
      knowledge:playable?level.knowledge:'', reference_seconds:playable&&engine!=='first-aid-cpr'?rewardReferenceSeconds(id):null,
      fixed_reward:engine==='first-aid-cpr'?3:null};
  }),
}));
`}});
const {maps,levelsDeclaredPlayable,sourceOnlyDefinitions}=await import('data:text/javascript;base64,'+Buffer.from(build.outputFiles[0].text).toString('base64'));
const stops=maps.flatMap(m=>m.stops);
assert.equal(maps.length,9);
assert.equal(new Set(stops.map(s=>s.id)).size,stops.length,'no duplicate map IDs');
assert.deepEqual(stops.filter(s=>s.was_playable).map(s=>s.id).sort(),levelsDeclaredPlayable.sort(),'every shipped level must appear exactly once');
assert(stops.every(s=>!s.was_playable||s.engine));
assert(stops.every(s=>s.status==='placeholder'||s.status==='preview'||s.fixed_reward||s.reference_seconds>0));
const ids=new Set(stops.map(s=>s.id));
const revisions={web_main:'aeded70', before_map_art:'510d159', old_four_regions:'ce17904', landscape:'b96cdf7', early_24_levels:'edaa408'};
const baselines=Object.fromEntries(Object.entries(revisions).map(([label,ref])=>{
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
  const old=JSON.parse(git('show',`${ref}:content/journey-map.json`));
  const nodeIds=old.regions.flatMap(region=>region.nodes.map(n=>n.id));
  return [label,{commit:git('rev-parse',ref),nodes:nodeIds.length,absent_from_nine_islands:nodeIds.filter(id=>!ids.has(id))}];
}));
const totals=Object.fromEntries(['playable','preview','placeholder'].map(kind=>[kind,stops.filter(s=>s.status===kind).length]));
const target=path.join(root,'godot-prototype/data/original_levels.json');
fs.mkdirSync(path.dirname(target),{recursive:true});
fs.writeFileSync(target,JSON.stringify({schema_version:1,totals,baselines,source_only_definitions:sourceOnlyDefinitions,maps},null,2)+'\n');
console.log(JSON.stringify({target,baselines,totals},null,2));
