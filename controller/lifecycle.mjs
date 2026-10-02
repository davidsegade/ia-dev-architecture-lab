export function decision({proposals,failures,state,commentCount}) {
  if(proposals>0)return {skip:true,reason:'Existing proposal'};
  if(state!=='open')return {skip:true,reason:'Issue closed'};
  if(failures>=3 || commentCount>=100)return {skip:true,reason:'Retry or history limit'};
  return {skip:false,reason:null};
}
export function shouldRetry(failures, state, commentCount) {
  return failures<3 && state==='open' && commentCount<100;
}
