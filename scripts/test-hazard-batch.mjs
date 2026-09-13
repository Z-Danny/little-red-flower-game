/** Batch-only tests; --syntax-only compiles syntax without executing tests or asserting readiness. */
import {createRequire} from 'node:module';
import {existsSync,readdirSync,mkdtempSync,readFileSync,writeFileSync,mkdirSync,unlinkSync,rmdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
const root=resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url);
const esbuildPath=readdirSync(join(root,'node_modules/.pnpm')).filter(n=>n.startsWith('esbuild@')).map(n=>join(root,'node_modules/.pnpm',n,'node_modules/esbuild')).find(p=>existsSync(join(p,'lib/main.js')));
if(!esbuildPath)throw Error('Installed esbuild not found; no dependency installation performed.');
const {build,transform}=require(esbuildPath),output=join(root,'docs/hazard-batch-v2/verification');
mkdirSync(output,{recursive:true});
if(process.argv.includes('--syntax-only')){
  await transform(readFileSync(join(root,'tests/hazard-batch.test.ts'),'utf8'),{loader:'ts',target:'es2022'});
  writeFileSync(join(output,'batch-script-syntax.json'),JSON.stringify({at:new Date().toISOString(),syntax:'passed',unitTests:'not_run',reason:'Syntax-only mode. No assertions, registry readiness, generated assets or browser checks executed.'},null,2));
  console.log('Hazard batch test syntax passed. Unit assertions were NOT run.');
}else{
  const temp=mkdtempSync(join(tmpdir(),'hazard-batch-tests-')),outfile=join(temp,'tests.mjs'),started=Date.now();
  let result;
  try{
    await build({absWorkingDir:root,entryPoints:['tests/hazard-batch.test.ts'],bundle:true,platform:'node',format:'esm',target:'node20',outfile,logLevel:'silent'});
    result=spawnSync(process.execPath,['--test','--test-reporter=tap',outfile],{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024});
    const log=(result.stdout??'')+(result.stderr??'');process.stdout.write(result.stdout??'');process.stderr.write(result.stderr??'');
    writeFileSync(join(output,'batch-unit-tests.tap'),log);
    const number=(key)=>Number(log.match(new RegExp('^# '+key+' (\\d+)','m'))?.[1]??0);
    writeFileSync(join(output,'batch-unit-report.json'),JSON.stringify({at:new Date().toISOString(),durationMs:Date.now()-started,exitCode:result.status,signal:result.signal,tests:number('tests'),pass:number('pass'),fail:number('fail'),status:result.status===0?'passed':'failed'},null,2));
    process.exitCode=result.status??1;
  }catch(error){
    writeFileSync(join(output,'batch-unit-report.json'),JSON.stringify({at:new Date().toISOString(),status:'failed_before_or_during_execution',error:String(error),durationMs:Date.now()-started},null,2));throw error;
  }finally{
    if(existsSync(outfile))unlinkSync(outfile);
    rmdirSync(temp);
  }
}
