import test from 'node:test';
import assert from 'node:assert/strict';
import {boundedProcess,freeUsage} from './process.mjs';
test('provider process failure is visible',async()=>{
  const result=await boundedProcess(process.execPath,['-e','process.exit(42)'],{cwd:process.cwd(),env:{},timeout:1000});
  assert.equal(result.code,42);assert.equal(result.timedOut,false);
});
test('hung agent process is killed within its deadline',async()=>{
  const start=Date.now();
  const result=await boundedProcess(process.execPath,['-e','setInterval(()=>{},1000)'],{cwd:process.cwd(),env:{},timeout:150});
  assert.equal(result.timedOut,true);assert.ok(Date.now()-start<2000);
});
test('only explicit zero cost telemetry is accepted',()=>{
  assert.equal(freeUsage(JSON.stringify({type:'step_finish',part:{cost:0}})).cost,0);
  for(const raw of ['',JSON.stringify({type:'error'}),JSON.stringify({type:'step_finish',part:{cost:0.01}}),JSON.stringify({type:'step_finish',part:{}})])assert.throws(()=>freeUsage(raw));
});
