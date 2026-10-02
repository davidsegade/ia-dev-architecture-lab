import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { command, inspectPatch } from './gate.mjs';
import { taskFromIssue } from './tasks.mjs';
import { decision, shouldRetry } from './lifecycle.mjs';
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
  const {skip,reason}=decision({proposals:proposals.length,failures:failed,state:issue.state,commentCount:comments.length});
  const previous=comments.filter(comment=>comment.user.type==='Bot').map(comment=>/<!-- ia-dev:feedback:([A-Za-z0-9+/=]+) -->/.exec(comment.body)?.[1]).filter(Boolean).at(-1)||'';
  const base=(await api('branches/main')).commit.sha;
  for(const [key,value]of Object.entries({task,issue:issueNumber,base,skip:String(skip),feedback:previous}))appendFileSync(process.env.GITHUB_OUTPUT,`${key}=${value}\n`);
  console.log(JSON.stringify({task,issue:issueNumber,base,skip,failed,reason}));
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
    body:`Synthetic architecture test. Closes #${issueNumber}.\n\nIndependent acceptance and review passed. Author: OpenCode Big Pickle. Reviewer: OpenCode Space Bunny Free.\n\nArtifact SHA-256: \`${digest}\`. Base: \`${current}\`. Checked head: \`${sha}\`.\n\nEvidence: ${runUrl}\n\nHuman approval required. No automatic merge.`});
  await api(`issues/${issueNumber}/comments`,'POST',{body:`<!-- ia-dev:ready -->\nReady for approval: ${pr.html_url}\nEvidence: ${runUrl}`});
  console.log(JSON.stringify({url:pr.html_url,sha,digest}));
  writeFileSync('bundle/publication.json',JSON.stringify({url:pr.html_url,sha,digest},null,2));
} else if(mode==='failure') {
  let feedback='';
  for(const file of ['bundle/review-result.json','bundle/write-result.json']) {
    try {const result=JSON.parse(readFileSync(file,'utf8')); if(!result.success)feedback+=JSON.stringify(result.attempts?.map(attempt=>attempt.error)||[]);}catch{}
  }
  const encoded=Buffer.from(feedback.slice(0,4000)).toString('base64');
  await api(`issues/${issueNumber}/comments`,'POST',{body:`<!-- ia-dev:failed -->\n<!-- ia-dev:feedback:${encoded} -->\nExecution or verification failed. No automatic merge. Evidence: https://github.com/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}\nThe controller allows at most three runs and stops if the issue is closed.`});
  const comments=await api(`issues/${issueNumber}/comments?per_page=100`);
  const failures=comments.filter(comment=>comment.user.type==='Bot' && comment.body.includes('<!-- ia-dev:failed -->')).length;
  if(shouldRetry(failures,issue.state,comments.length)) {
    await api('actions/workflows/laboratory.yml/dispatches','POST',{ref:'main',inputs:{issue:String(issueNumber),automatic:'true'}});
    console.log(JSON.stringify({retry:true,failures}));
  } else console.log(JSON.stringify({retry:false,failures}));
} else throw new Error('Unknown operation');
