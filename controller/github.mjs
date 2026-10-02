import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { command, inspectPatch } from './gate.mjs';
import { taskFromIssue } from './tasks.mjs';
const repository=process.env.GITHUB_REPOSITORY;
const token=process.env.GH_TOKEN;
if(!/^[\w.-]+\/[\w.-]+$/.test(repository||'') || !token)throw new Error('GitHub context required');
async function api(path,method='GET',body) {
  const response=await fetch(`https://api.github.com/repos/${repository}/${path}`,{
    method,headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},
    ...(body?{body:JSON.stringify(body)}:{})
  });
  if(!response.ok)throw new Error(`GitHub ${method} ${path}: ${response.status}`);
  return response.status===204?null:await response.json();
}
const event=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
const issueNumber=event.issue?.number||Number(event.inputs?.issue);
if(!Number.isSafeInteger(issueNumber)||issueNumber<=0)throw new Error('Issue number required');
const issue=await api(`issues/${issueNumber}`);
if(issue.user.login!==repository.split('/')[0] || issue.pull_request)throw new Error('Only owner-created issues accepted');
const branch=`ia-dev/issue-${issueNumber}`;
const [mode]=process.argv.slice(2);
if(mode==='prepare') {
  const task=taskFromIssue(issue.body||'');
  const proposals=await api(`pulls?head=${encodeURIComponent(repository.split('/')[0]+':'+branch)}&state=all`);
  const comments=await api(`issues/${issueNumber}/comments?per_page=100`);
  const failed=comments.filter(comment=>comment.user.type==='Bot' && comment.body.includes('<!-- ia-dev:failed -->')).length;
  const skip=proposals.length>0 || failed>=3 || issue.state!=='open';
  const base=(await api('branches/main')).commit.sha;
  for(const [key,value]of Object.entries({task,issue:issueNumber,base,skip:String(skip)}))appendFileSync(process.env.GITHUB_OUTPUT,`${key}=${value}\n`);
  console.log(JSON.stringify({task,issue:issueNumber,base,skip,failed,reason:proposals.length?'Existing proposal':failed>=3?'Retry limit':null}));
} else if(mode==='publish') {
  const patch=readFileSync('bundle/change.patch','utf8');
  const digest=inspectPatch(patch);
  if(digest!==process.env.EXPECTED_DIGEST)throw new Error('Artifact changed after independent verification');
  const review=JSON.parse(readFileSync('bundle/review-result.json','utf8'));
  if(!review.success || review.task!==taskFromIssue(issue.body||''))throw new Error('Independent review missing');
  const current=(await api('branches/main')).commit.sha;
  if(current!==process.env.BASE_SHA)throw new Error('Base changed; new verification required');
  command('git',['apply','--check','bundle/change.patch'],process.cwd());
  command('git',['apply','bundle/change.patch'],process.cwd());
  command('git',['config','user.name','IA DEV laboratory'],process.cwd());
  command('git',['config','user.email','41898282+github-actions[bot]@users.noreply.github.com'],process.cwd());
  command('git',['switch','-c',branch],process.cwd());
  command('git',['add','--','src/main.mjs','tests/main.test.mjs'],process.cwd());
  command('git',['commit','-m',`Synthetic task for issue #${issueNumber}`],process.cwd());
  command('git',['push','origin',`HEAD:refs/heads/${branch}`],process.cwd(),30000);
  const sha=command('git',['rev-parse','HEAD'],process.cwd()).trim();
  const runUrl=`https://github.com/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`;
  for(const context of ['IA DEV / acceptance','IA DEV / review'])await api(`statuses/${sha}`,'POST',{state:'success',context,target_url:runUrl,description:`Verified artifact ${digest.slice(0,12)}`});
  const pr=await api('pulls','POST',{title:`[Laboratory] ${issue.title}`,head:branch,base:'main',draft:false,
    body:`Synthetic architecture test. Closes #${issueNumber}.\n\nIndependent acceptance and review passed. Author: OpenCode Big Pickle. Reviewer: OpenCode LongCat 2.5 Preview Free.\n\nArtifact SHA-256: \`${digest}\`. Base: \`${current}\`. Checked head: \`${sha}\`.\n\nEvidence: ${runUrl}\n\nHuman approval required. No automatic merge.`});
  await api(`issues/${issueNumber}/comments`,'POST',{body:`<!-- ia-dev:ready -->\nReady for approval: ${pr.html_url}\nEvidence: ${runUrl}`});
  console.log(JSON.stringify({url:pr.html_url,sha,digest}));
  writeFileSync('bundle/publication.json',JSON.stringify({url:pr.html_url,sha,digest},null,2));
} else if(mode==='failure') {
  await api(`issues/${issueNumber}/comments`,'POST',{body:`<!-- ia-dev:failed -->\nExecution or verification failed. No automatic merge. Evidence: https://github.com/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}\nThe owner can request a fresh attempt; after three failed runs the laboratory refuses more attempts.`});
} else throw new Error('Unknown operation');
