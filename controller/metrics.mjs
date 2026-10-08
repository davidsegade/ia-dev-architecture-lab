const TOKEN_KEYS = ['input', 'output', 'reasoning', 'cachedRead', 'cachedWrite'];

function emptyTokens() {
  return Object.fromEntries(TOKEN_KEYS.map(key => [key, 0]));
}

export function summarizeAgentResult(result) {
  const tokens = emptyTokens();
  let cost = 0;
  let preparationMs = 0;
  const attempts = Array.isArray(result?.attempts) ? result.attempts : [];
  for (const attempt of attempts) {
    const usage = attempt?.usage;
    if (usage) {
      if (typeof usage.cost === 'number') cost += usage.cost;
      for (const key of TOKEN_KEYS) tokens[key] += Number(usage.tokens?.[key] || 0);
    }
    preparationMs += Number(attempt?.context?.preparationMs || 0);
  }
  const latestContext = [...attempts].reverse().find(attempt => attempt?.context)?.context || {};
  return {
    model: result?.model || 'unknown',
    candidates: Array.isArray(result?.modelCandidates) ? result.modelCandidates.length : 0,
    runs: attempts.length,
    contextMode: result?.contextMode || latestContext.mode || 'legacy',
    contextFiles: Number(result?.sandbox || attempts[0]?.contextFiles || 0),
    selectedFiles: Number(latestContext.selectedFileCount ?? result?.sandbox ?? 0),
    selectedSymbols: Number(latestContext.selectedSymbols || 0),
    contextChars: Number(latestContext.chars || 0),
    contextPreparationMs: preparationMs,
    graphNodes: Number(latestContext.graphNodes || 0),
    graphEdges: Number(latestContext.graphEdges || 0),
    graphifyVersion: latestContext.graphifyVersion || null,
    cost,
    tokens,
    registryVerifiedAt: result?.modelRegistryVerifiedAt || null
  };
}

export function formatRunMetrics(authorResult, reviewResult) {
  const author = summarizeAgentResult(authorResult);
  const reviewer = summarizeAgentResult(reviewResult);
  const row = (name, value) => `- ${name}: model \`${value.model}\`; runs ${value.runs}; context ${value.contextMode}; sandbox files ${value.contextFiles}; selected files ${value.selectedFiles}; selected symbols ${value.selectedSymbols}; context chars ${value.contextChars}; context prep ${value.contextPreparationMs} ms; tokens input ${value.tokens.input}, output ${value.tokens.output}, reasoning ${value.tokens.reasoning}, cache-read ${value.tokens.cachedRead}, cache-write ${value.tokens.cachedWrite}; observed cost ${value.cost}`;
  const registry = [author.registryVerifiedAt, reviewer.registryVerifiedAt].filter(Boolean).sort().at(-1) || 'not recorded';
  const graphify = [author.graphifyVersion, reviewer.graphifyVersion].filter(Boolean).sort().at(-1) || 'not used';
  return `### IA DEV run metrics\n${row('Author', author)}\n${row('Reviewer', reviewer)}\n- Free-model registry verified: ${registry}; Graphify: ${graphify}`;
}
