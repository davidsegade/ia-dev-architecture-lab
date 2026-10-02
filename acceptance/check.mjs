import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const [task, directory] = process.argv.slice(2);
const api = await import(pathToFileURL(resolve(directory, 'src/main.mjs')));
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
