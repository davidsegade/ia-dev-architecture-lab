export function reviewVerdict(raw) {
  const events=raw.split('\n').flatMap(line=>{try{return[JSON.parse(line)];}catch{return[];}});
  const reads=events.filter(event=>event.type==='tool_use' && event.part?.tool==='read' && event.part.state?.status==='completed')
    .map(event=>event.part.state.input?.filePath||'');
  for(const required of ['/src/main.mjs','/tests/main.test.mjs'])if(!reads.some(path=>path.endsWith(required)))throw new Error('Reviewer did not read required files');
  const text=(events.filter(event=>event.type==='text').at(-1)?.part?.text||'').trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');
  const verdict=JSON.parse(text);
  if(typeof verdict.approved!=='boolean' || !Array.isArray(verdict.findings) || verdict.findings.some(x=>typeof x!=='string'))throw new Error('Invalid reviewer verdict');
  if(!verdict.approved || verdict.findings.length)throw new Error('Review rejected: '+verdict.findings.join('; '));
  return verdict;
}
