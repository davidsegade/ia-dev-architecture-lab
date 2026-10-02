import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewVerdict } from './review.mjs';
function events(verdict,reads=true){return [
  ...(reads?['/candidate/src/main.mjs','/candidate/tests/main.test.mjs'].map(filePath=>({type:'tool_use',part:{tool:'read',state:{status:'completed',input:{filePath}}}})):[]),
  {type:'text',part:{text:'I will inspect the files.'}},
  {type:'text',part:{text:JSON.stringify(verdict)}}
].map(event=>JSON.stringify(event)).join('\n');}
test('structured final verdict follows actual file inspection',()=>assert.equal(reviewVerdict(events({approved:true,findings:[]})).approved,true));
test('a confident approval without inspection is rejected',()=>assert.throws(()=>reviewVerdict(events({approved:true,findings:[]},false))));
test('negative, contradictory and invalid verdicts fail closed',()=>{
  for(const verdict of [{approved:false,findings:['bug']},{approved:true,findings:['bug']},{approved:'true',findings:[]}])assert.throws(()=>reviewVerdict(events(verdict)));
});
