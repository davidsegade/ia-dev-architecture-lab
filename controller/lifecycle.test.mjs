import test from 'node:test';
import assert from 'node:assert/strict';
import {decision,shouldRetry} from './lifecycle.mjs';
const initial={proposals:0,failures:0,state:'open',commentCount:0};
test('a fresh request is executable',()=>assert.equal(decision(initial).skip,false));
test('duplicate requests cannot create a second proposal',()=>assert.equal(decision({...initial,proposals:1}).skip,true));
test('an interrupted request with no proposal can restart',()=>assert.equal(decision({...initial,failures:1}).skip,false));
test('three failed runs stop further executions',()=>{
  assert.equal(decision({...initial,failures:3}).skip,true);assert.equal(shouldRetry(3,'open',3),false);
});
test('closed issues and excessive history stop safely',()=>{
  assert.equal(decision({...initial,state:'closed'}).skip,true);
  assert.equal(decision({...initial,commentCount:100}).skip,true);
});
test('a transient failure can receive a bounded automatic retry',()=>assert.equal(shouldRetry(1,'open',1),true));
