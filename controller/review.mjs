/**
 * Independent reviewer verdict.
 *
 * The reviewer has to have opened every file the author changed before its verdict
 * counts. The required files come from the change itself rather than a fixed list, so
 * the check follows whatever repository is under review and cannot be satisfied by
 * reading unrelated files.
 */
export function reviewVerdict(raw, requiredFiles = []) {
  const events = parseEvents(raw);
  const reads = events
    .filter(event => event.type === 'tool_use' && event.part?.tool === 'read' && event.part.state?.status === 'completed')
    .map(event => event.part.state.input?.filePath || '');

  for (const required of requiredFiles) {
    if (!reads.some(path => path.endsWith(required))) {
      throw new Error(`Reviewer did not read ${required}`);
    }
  }

  const text = finalText(events);
  let verdict;
  try {
    verdict = JSON.parse(text);
  } catch {
    // Fail closed: prose instead of a verdict is not an approval.
    throw new Error('Invalid reviewer verdict');
  }
  if (typeof verdict.approved !== 'boolean' || !Array.isArray(verdict.findings) || verdict.findings.some(x => typeof x !== 'string')) {
    throw new Error('Invalid reviewer verdict');
  }
  if (!verdict.approved || verdict.findings.length) {
    throw new Error('Review rejected: ' + verdict.findings.join('; '));
  }
  return verdict;
}

function parseEvents(raw) {
  return String(raw).split('\n').flatMap(line => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
}

/** The last free-text message, stripped of markdown fences and trailing prose. */
function finalText(events) {
  const text = (events.filter(event => event.type === 'text').at(-1)?.part?.text || '').trim();
  // Models often wrap the JSON verdict in ```json fences and then add explanatory text.
  // Extract the first valid JSON object to be robust.
  const fenced = text.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  const firstBrace = fenced.indexOf('{');
  if (firstBrace === -1) return fenced;
  let depth = 0;
  for (let i = firstBrace; i < fenced.length; i++) {
    if (fenced[i] === '{') depth++;
    else if (fenced[i] === '}') {
      if (--depth === 0) return fenced.slice(firstBrace, i + 1);
    }
  }
  return fenced;
}