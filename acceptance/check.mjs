import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { realpathSync } from 'node:fs';
const [task, directory] = process.argv.slice(2);
// Assertions stay in this trusted process. Candidate modules cannot monkey-patch them.
const api=Object.fromEntries(['clamp','chunk','sumCents'].map(method=>[method,(...args)=>{
  const driver=realpathSync(resolve(import.meta.dirname,'invoke.mjs'));
  const candidate=realpathSync(directory);
  // The candidate runs in a separate process. Its module-level changes cannot alter
  // this trusted assertion process; the controller has already constrained paths.
  const result=spawnSync(process.execPath,['--permission',`--allow-fs-read=${driver}`,`--allow-fs-read=${candidate}`,driver,candidate,method],{
    env:{PATH:process.env.PATH,LANG:'en_US.UTF-8'},encoding:'utf8',timeout:1000,maxBuffer:100000,
    input:JSON.stringify(args,(_,value)=>typeof value==='number' && !Number.isFinite(value)?{$number:String(value)}:value)
  });
  if(result.status!==0)throw new Error(result.error?.code||result.stderr||'Candidate failed');
  const response=JSON.parse(result.stdout.trim().split('\n').at(-1));
  if(method==='chunk' && response.ok) assert.deepEqual(response.args,args,'Input was mutated');
  if(!response.ok) {
    const Constructor={TypeError,RangeError,Error}[response.error?.name]||Error;
    throw new Constructor(response.error?.message||'Candidate error');
  }
  return response.value;
}]));
let cases = 0;
function check(fn) { fn(); cases++; }
if (task === 'clamp') {
  for (const [v, low, high, expected] of [[-2,0,5,0],[9,0,5,5],[3,0,5,3],[2,2,2,2],[-5,-4,-1,-4],[1.5,0,2,1.5]]) check(() => assert.equal(api.clamp(v,low,high), expected));
  for (const args of [[NaN,0,1],[0,-Infinity,1],[0,0,Infinity],['1',0,2]]) check(() => assert.throws(() => api.clamp(...args), TypeError));
  check(() => assert.throws(() => api.clamp(0,2,1), RangeError));
} else if (task === 'chunk') {
  const input = Object.freeze([1,2,3,4,5]);
  check(() => assert.deepEqual(api.chunk(input,2), [[1,2],[3,4],[5]]));
  check(() => assert.deepEqual(api.chunk([],3), []));
  check(() => assert.deepEqual(api.chunk([1,2],9), [[1,2]]));
  check(() => assert.throws(() => api.chunk('x',1), TypeError));
  for (const size of [0,-1,1.5,NaN,Infinity,'2',Number.MAX_SAFE_INTEGER+1]) check(() => assert.throws(() => api.chunk([],size), RangeError));
} else if (task === 'sumCents') {
  for (const [values, expected] of [[[],0],[[1,2,3],6],[[-2,5],3],[[Number.MAX_SAFE_INTEGER],Number.MAX_SAFE_INTEGER]]) check(() => assert.equal(api.sumCents(values),expected));
  for (const values of ['x',[1.1],['1'],[NaN],[Infinity],[Number.MAX_SAFE_INTEGER+1]]) check(() => assert.throws(() => api.sumCents(values),TypeError));
  check(() => assert.throws(() => api.sumCents([Number.MAX_SAFE_INTEGER,1,-1]),RangeError));
  check(() => assert.throws(() => api.sumCents([-Number.MAX_SAFE_INTEGER,-1]),RangeError));
} else throw new Error('Unknown task');
console.log(JSON.stringify({ task, cases, passed: true }));
