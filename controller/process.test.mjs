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
test('usage records uncached tokens and cache reads separately',()=>{
  const raw=[{input:12,output:3,reasoning:2,cache:{read:100,write:0}},{input:4,output:2,reasoning:1,cache:{read:150,write:5}}].map(tokens=>JSON.stringify({type:'step_finish',part:{cost:0,tokens}})).join('\n');
  assert.deepEqual(freeUsage(raw),{cost:0,steps:2,tokens:{input:16,output:5,reasoning:3,cachedRead:250,cachedWrite:5}});
});
