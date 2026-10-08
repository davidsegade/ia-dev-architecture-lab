import test from 'node:test';
import assert from 'node:assert/strict';
import {decision,shouldRetry,proposalBranch,proposalBelongsToIssue} from './lifecycle.mjs';

const initial={proposals:0,failures:0,state:'open',commentCount:0};

test('a fresh request is executable',()=>assert.equal(decision(initial).skip,false));
test('duplicate requests cannot create a second proposal',()=>assert.equal(decision({...initial,proposals:1}).skip,true));
test('an interrupted request with no proposal can restart',()=>assert.equal(decision({...initial,failures:1}).skip,false));
test('three failed runs stop further executions',()=>{
  assert.equal(decision({...initial,failures:3}).skip,true);
  assert.equal(shouldRetry(3,'open',3),false);
});
test('closed issues and excessive history stop safely',()=>{
  assert.equal(decision({...initial,state:'closed'}).skip,true);
  assert.equal(decision({...initial,commentCount:100}).skip,true);
});
test('a transient failure can receive a bounded automatic retry',()=>assert.equal(shouldRetry(1,'open',1),true));

test('proposal branches are unique per run attempt and never require rewriting',()=>{
  assert.equal(proposalBranch(48,'37765181190','1'),'ia-dev/issue-48-run-37765181190-attempt-1');
  assert.equal(proposalBranch(48,'37765181190','2'),'ia-dev/issue-48-run-37765181190-attempt-2');
  assert.notEqual(proposalBranch(48,'37765181190','1'),proposalBranch(48,'37765181190','2'));
});

test('proposal branch rejects missing run identity',()=>{
  assert.throws(()=>proposalBranch(48,'','1'),/Run identity required/);
  assert.throws(()=>proposalBranch(0,'1','1'),/Valid issue number/);
});

test('proposal idempotency follows the logical issue across disposable branches',()=>{
  assert.equal(proposalBelongsToIssue({body:'IA DEV execution for issue #48.\nEvidence: run'},48),true);
  assert.equal(proposalBelongsToIssue({head:{ref:'ia-dev/issue-48-run-99-attempt-1'}},48),true);
  assert.equal(proposalBelongsToIssue({body:'IA DEV execution for issue #49.',head:{ref:'other'}},48),false);
});
