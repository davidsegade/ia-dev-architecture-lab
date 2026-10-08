export function decision({proposals,failures,state,commentCount}) {
  if(proposals>0)return {skip:true,reason:'Existing proposal'};
  if(state!=='open')return {skip:true,reason:'Issue closed'};
  if(failures>=3 || commentCount>=100)return {skip:true,reason:'Retry or history limit'};
  return {skip:false,reason:null};
}

export function shouldRetry(failures, state, commentCount) {
  return failures<3 && state==='open' && commentCount<100;
}

/**
 * Every execution publishes to a fresh disposable branch. A failed run that managed to
 * push but did not create its PR therefore cannot block a later retry, and no retry ever
 * needs to rewrite an existing proposal branch.
 */
export function proposalBranch(issueNumber, runId, runAttempt = '1') {
  if (!Number.isSafeInteger(Number(issueNumber)) || Number(issueNumber) <= 0) {
    throw new Error('Valid issue number required for proposal branch');
  }
  const safeRun = String(runId || '').replace(/[^A-Za-z0-9._-]/g, '');
  const safeAttempt = String(runAttempt || '').replace(/[^A-Za-z0-9._-]/g, '');
  if (!safeRun || !safeAttempt) throw new Error('Run identity required for proposal branch');
  return `ia-dev/issue-${Number(issueNumber)}-run-${safeRun}-attempt-${safeAttempt}`;
}

/**
 * Idempotency is tied to the logical issue, not to one branch name. This catches a PR
 * created by any previous run/attempt while still allowing orphaned disposable branches
 * from failed attempts to be ignored safely.
 */
export function proposalBelongsToIssue(pullRequest, issueNumber) {
  const marker = `IA DEV execution for issue #${Number(issueNumber)}.`;
  const body = String(pullRequest?.body || '');
  const head = String(pullRequest?.head?.ref || '');
  return body.includes(marker) || head.startsWith(`ia-dev/issue-${Number(issueNumber)}-`);
}
