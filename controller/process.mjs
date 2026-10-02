import { spawn } from 'node:child_process';
export async function boundedProcess(binary,args,{cwd,env,timeout}) {
  return await new Promise(resolveResult=>{
    const child=spawn(binary,args,{cwd,env,detached:true,stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='',timedOut=false;
    function stop(){try{process.kill(-child.pid,'SIGKILL');}catch{}}
    const timer=setTimeout(()=>{timedOut=true;stop();},timeout);
    child.stdout.on('data',data=>{stdout+=data;if(stdout.length>2000000)stop();});
    child.stderr.on('data',data=>{stderr+=data;if(stderr.length>100000)stop();});
    child.on('error',error=>{clearTimeout(timer);resolveResult({code:-1,stdout,stderr:error.message,timedOut});});
    child.on('close',code=>{clearTimeout(timer);resolveResult({code,stdout,stderr,timedOut});});
  });
}
export function freeUsage(raw) {
  const events=raw.split('\n').flatMap(line=>{try{return[JSON.parse(line)];}catch{return[];}});
  if(events.some(event=>event.type==='error'))throw new Error('Provider reported an error');
  const finishes=events.filter(event=>event.type==='step_finish');
  if(!finishes.length || finishes.some(event=>event.part?.cost!==0))throw new Error('Free usage not confirmed');
  return {cost:0,steps:finishes.length};
}
