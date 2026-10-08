const TRANSIENT_GET_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function joinPage(path, page, perPage) {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}per_page=${perPage}&page=${page}`;
}

export function createGitHubApi({
  targetRepo,
  token,
  fetchImpl = globalThis.fetch,
  timeoutMs = 10000,
  getRetries = 2,
  sleep = delay,
  maxPages = 100
}) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(targetRepo || '')) throw new Error('Valid target repository required');
  if (!token) throw new Error('GitHub token required');
  if (typeof fetchImpl !== 'function') throw new Error('fetch implementation required');

  async function request(path, method = 'GET', body) {
    const upperMethod = String(method).toUpperCase();
    const retries = upperMethod === 'GET' ? getRetries : 0;

    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response;
      try {
        response = await fetchImpl(`https://api.github.com/repos/${targetRepo}/${path}`, {
          method: upperMethod,
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json',
            'X-GitHub-Api-Version': '2022-11-28'
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) })
        });
      } catch (error) {
        clearTimeout(timer);
        const timedOut = controller.signal.aborted || error?.name === 'AbortError';
        if (upperMethod === 'GET' && attempt < retries) {
          await sleep(100 * (attempt + 1));
          continue;
        }
        throw new Error(
          timedOut
            ? `GitHub ${upperMethod} ${path} timed out`
            : `GitHub ${upperMethod} ${path} transport failure`
        );
      }
      clearTimeout(timer);

      if (response.ok) {
        return response.status === 204 ? null : await response.json();
      }

      if (upperMethod === 'GET' && TRANSIENT_GET_STATUSES.has(response.status) && attempt < retries) {
        await sleep(100 * (attempt + 1));
        continue;
      }
      throw new Error(`GitHub ${upperMethod} ${path}: ${response.status}`);
    }
    throw new Error(`GitHub ${upperMethod} ${path}: retry budget exhausted`);
  }

  async function all(path, { perPage = 100 } = {}) {
    if (!Number.isSafeInteger(perPage) || perPage < 1 || perPage > 100) throw new Error('Invalid GitHub page size');
    const items = [];
    for (let page = 1; page <= maxPages; page++) {
      const result = await request(joinPage(path, page, perPage));
      if (!Array.isArray(result)) throw new Error(`GitHub pagination expected an array: ${path}`);
      items.push(...result);
      if (result.length < perPage) return items;
    }
    throw new Error(`GitHub pagination exceeded ${maxPages} pages: ${path}`);
  }

  return { request, all };
}
