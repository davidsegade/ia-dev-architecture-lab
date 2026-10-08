const TOKEN_KEYS = ['input', 'output', 'reasoning', 'cachedRead', 'cachedWrite'];

function emptyTokens() {
  return Object.fromEntries(TOKEN_KEYS.map(key => [key, 0]));
}

export function summarizeAgentResult(result) {
  const tokens = emptyTokens();
  let cost = 0;
  const attempts = Array.isArray(result?.attempts) ? result.attempts : [];
  for (const attempt of attempts) {
    const usage = attempt?.usage;
    if (!usage) continue;
    if (typeof usage.cost === 'number') cost += usage.cost;
    for (const key of TOKEN_KEYS) tokens[key] += Number(usage.tokens?.[key] || 0);
  }
  return {
    model: result?.model || 'unknown',
    candidates: Array.isArray(result?.modelCandidates) ? result.modelCandidates.length : 0,
    runs: attempts.length,
    contextFiles: Number(result?.sandbox || attempts[0]?.contextFiles || 0),
    cost,
    tokens,
    registryVerifiedAt: result?.modelRegistryVerifiedAt || null
  };
}

export function formatRunMetrics(authorResult, reviewResult) {
  const author = summarizeAgentResult(authorResult);
  const reviewer = summarizeAgentResult(reviewResult);
  const row = (name, value) => `- ${name}: model \`${value.model}\`; runs ${value.runs}; context files ${value.contextFiles}; tokens input ${value.tokens.input}, output ${value.tokens.output}, reasoning ${value.tokens.reasoning}, cache-read ${value.tokens.cachedRead}, cache-write ${value.tokens.cachedWrite}; observed cost ${value.cost}`;
  const registry = [author.registryVerifiedAt, reviewer.registryVerifiedAt].filter(Boolean).sort().at(-1) || 'not recorded';
  return `### IA DEV run metrics\n${row('Author', author)}\n${row('Reviewer', reviewer)}\n- Free-model registry verified: ${registry}`;
}
