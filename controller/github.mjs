import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { command, inspectPatch, getAllowedPaths } from './gate.mjs';
import { requestFromIssue, specificationDigest } from './tasks.mjs';
import { loadConfig, tasksForPolicy } from './config.mjs';
import { decision, shouldRetry, proposalBranch, proposalBelongsToIssue } from './lifecycle.mjs';

const targetRepo = process.env.TARGET_REPO || process.env.GITHUB_REPOSITORY;
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const runUrl = `https://github.com/${targetRepo}/actions/runs/${process.env.GITHUB_RUN_ID}`;

if (!/^[\w.-]+\/[\w.-]+$/.test(targetRepo || '') || !token) {
  throw new Error('Target repo and token required');
}

async function api(path, method = 'GET', body) {
  const response = await fetch(`https://api.github.com/repos/${targetRepo}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  if (!response.ok) throw new Error(`GitHub ${method} ${path}: ${response.status}`);
  return response.status === 204 ? null : await response.json();
}

const config = loadConfig();
const repoConfig = config[targetRepo];

if (!repoConfig) {
  throw new Error(`Repository ${targetRepo} not in allowlist`);
}

const baseBranch = repoConfig.base_branch || 'main';
const allowedTaskCatalog = tasksForPolicy(repoConfig);
const allowedProfiles = repoConfig.profiles || ['legacy-synthetic'];

function parseRequest() {
  return requestFromIssue(issue.body || '', {
    taskCatalog: allowedTaskCatalog,
    allowedProfiles
  });
}

function publish(output) {
  for (const [key, value] of Object.entries(output)) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
  }
  return output;
}

let issueNumber;
const explicitIssue = process.env.IA_DEV_ISSUE_NUMBER || process.env.ISSUE_NUMBER;
if (explicitIssue) {
  issueNumber = Number(explicitIssue);
} else {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  if (event.event === 'workflow_dispatch') {
    issueNumber = Number(event.inputs?.issue);
  } else if (event.event === 'issues') {
    issueNumber = event.issue?.number;
  } else {
    issueNumber = event.issue?.number || Number(event.inputs?.issue);
  }
}

if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0) {
  throw new Error('Issue number required');
}

const issue = await api(`issues/${issueNumber}`);
if (issue.user.login !== targetRepo.split('/')[0] || issue.pull_request) {
  throw new Error('Only owner-created issues accepted');
}

const [mode] = process.argv.slice(2);

if (mode === 'prepare') {
  const request = parseRequest();

  const pulls = await api('pulls?state=all&per_page=100');
  const comments = await api(`issues/${issueNumber}/comments?per_page=100`);
  const proposals = pulls.filter(pr => proposalBelongsToIssue(pr, issueNumber));
  const readyMarkers = comments.filter(comment => comment.user.type === 'Bot' && comment.body.includes('<!-- ia-dev:ready -->'));
  const failed = comments.filter(comment => comment.user.type === 'Bot' && comment.body.includes('<!-- ia-dev:failed -->')).length;
  const { skip, reason } = decision({
    proposals: Math.max(proposals.length, readyMarkers.length),
    failures: failed,
    state: issue.state,
    commentCount: comments.length
  });

  const previous = comments
    .filter(comment => comment.user.type === 'Bot')
    .map(comment => /<!-- ia-dev:feedback:([A-Za-z0-9+/=]+) -->/.exec(comment.body)?.[1])
    .filter(Boolean)
    .at(-1) || '';

  const base = (await api(`branches/${encodeURIComponent(baseBranch)}`)).commit.sha;
  const writePaths = repoConfig.write_paths || repoConfig.allowed_paths || [];
  const contextPaths = repoConfig.context_paths || writePaths;
  const sensitivePaths = repoConfig.sensitive_paths || [];

  const output = {
    task: request.task,
    profile: request.profile,
    specification: Buffer.from(request.specification, 'utf8').toString('base64'),
    issue: issueNumber,
    base,
    skip: String(skip),
    feedback: previous,
    'target-config': JSON.stringify({
      allowed_paths: writePaths,
      write_paths: writePaths,
      context_paths: contextPaths,
      protected_paths: repoConfig.protected_paths || [],
      sensitive_paths: sensitivePaths,
      acceptance_command: repoConfig.acceptance_command || 'npm test',
      build_command: repoConfig.build_command || 'npm run build',
      workspace_root: repoConfig.workspace_root || '.',
      base_branch: baseBranch
    })
  };

  publish(output);
  console.log(JSON.stringify({ ...output, specification: '[base64]', failed, reason }));

} else if (mode === 'publish') {
  const patch = readFileSync('bundle/change.patch', 'utf8');
  const digest = inspectPatch(patch);

  if (digest !== process.env.EXPECTED_DIGEST) {
    throw new Error('Artifact changed after independent verification');
  }

  const review = JSON.parse(readFileSync('bundle/review-result.json', 'utf8'));
  const author = JSON.parse(readFileSync('bundle/write-result.json', 'utf8'));
  const reviewed = parseRequest();
  const requestDigest = specificationDigest(reviewed.specification);
  if (
    !author.success || author.task !== reviewed.task || author.profile !== reviewed.profile || author.specificationDigest !== requestDigest ||
    !review.success || review.task !== reviewed.task || review.profile !== reviewed.profile || review.specificationDigest !== requestDigest ||
    review.approved !== true || review.findings?.length !== 0 || author.model === review.model
  ) {
    throw new Error('Independent review missing or request changed');
  }

  const current = (await api(`branches/${encodeURIComponent(baseBranch)}`)).commit.sha;
  if (current !== process.env.BASE_SHA) {
    throw new Error('Base changed; new verification required');
  }

  command('git', ['apply', '--check', 'bundle/change.patch'], process.cwd());
  command('git', ['apply', 'bundle/change.patch'], process.cwd());
  command('git', ['config', 'user.name', 'IA DEV'], process.cwd());
  command('git', ['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'], process.cwd());

  const branch = proposalBranch(issueNumber, process.env.GITHUB_RUN_ID, process.env.GITHUB_RUN_ATTEMPT || '1');
  command('git', ['switch', '-c', branch], process.cwd());

  const allowedPaths = getAllowedPaths();
  command('git', ['add', '--', ...allowedPaths], process.cwd());
  command('git', ['commit', '-m', `IA DEV: ${reviewed.task} for issue #${issueNumber}`], process.cwd());
  command('git', ['push', 'origin', `HEAD:refs/heads/${branch}`], process.cwd(), 30000);

  const sha = command('git', ['rev-parse', 'HEAD'], process.cwd()).trim();

  for (const context of ['IA DEV / acceptance', 'IA DEV / review']) {
    await api(`statuses/${sha}`, 'POST', { state: 'success', context, target_url: runUrl, description: `Verified artifact ${digest.slice(0, 12)}` });
  }

  const pr = await api('pulls', 'POST', {
    title: `[IA DEV] ${issue.title}`,
    head: branch,
    base: baseBranch,
    draft: true,
    body: `IA DEV execution for issue #${issueNumber}.\n\nProfile: ${reviewed.profile}. Independent acceptance and review passed. Author: ${author.model}. Reviewer: ${review.model}.\n\nEngine/workflow SHA: \`${process.env.IA_DEV_ENGINE_SHA || 'not recorded'}\`. Base: \`${current}\`. Verified/published head: \`${sha}\`. Artifact SHA-256: \`${digest}\`. Specification SHA-256: \`${requestDigest}\`.\n\nEvidence: ${runUrl}\n\nHuman approval required. No automatic merge. This proposal branch is disposable and is never force-pushed.`
  });

  await api(`issues/${issueNumber}/comments`, 'POST', {
    body: `<!-- ia-dev:ready -->\nReady for approval: ${pr.html_url}\nEvidence: ${runUrl}`
  });

  const publication = publish({ 'pr-url': pr.html_url, 'pr-sha': sha });
  console.log(JSON.stringify(publication));
  writeFileSync('bundle/publication.json', JSON.stringify({ url: pr.html_url, sha, digest, requestDigest, profile: reviewed.profile, branch, base: current }, null, 2));

} else if (mode === 'failure') {
  let feedback = '';
  for (const file of ['bundle/review-result.json', 'bundle/write-result.json']) {
    try {
      const result = JSON.parse(readFileSync(file, 'utf8'));
      if (!result.success) feedback += JSON.stringify(result.attempts?.map(attempt => attempt.error) || []);
    } catch {}
  }
  const encoded = Buffer.from(feedback.slice(0, 4000)).toString('base64');
  await api(`issues/${issueNumber}/comments`, 'POST', {
    body: `<!-- ia-dev:failed -->\n<!-- ia-dev:feedback:${encoded} -->\nExecution or verification failed. No automatic merge. Evidence: ${runUrl}\nThe controller allows at most three runs and stops if the issue is closed.`
  });
  const comments = await api(`issues/${issueNumber}/comments?per_page=100`);
  const failures = comments.filter(comment => comment.user.type === 'Bot' && comment.body.includes('<!-- ia-dev:failed -->')).length;

  const outcome = shouldRetry(failures, issue.state, comments.length);
  console.log(JSON.stringify(publish({ retry: String(outcome), failures: String(failures) })));

} else if (mode === 'retry') {
  if (process.env.RETRY !== 'true') {
    console.log(JSON.stringify(publish({ dispatched: 'false' })));
  } else {
    const workflow = String(process.env.CALLER_WORKFLOW || '');
    if (!/^[A-Za-z0-9._-]+\.ya?ml$/.test(workflow)) {
      throw new Error('Safe caller workflow filename required');
    }
    await api(`actions/workflows/${encodeURIComponent(workflow)}/dispatches`, 'POST', {
      ref: baseBranch,
      inputs: { issue: String(issueNumber), automatic: 'true' }
    });
    console.log(JSON.stringify(publish({ dispatched: 'true' })));
  }
} else {
  throw new Error('Unknown operation');
}
