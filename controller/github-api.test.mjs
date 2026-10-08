import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGitHubApi } from './github-api.mjs';

function response(status, data) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async json() { return data; }
  };
}

function client(fetchImpl, options = {}) {
  return createGitHubApi({
    targetRepo: 'acme/repo',
    token: 'super-secret-token',
    fetchImpl,
    sleep: async () => {},
    timeoutMs: 20,
    ...options
  });
}

test('pagination collects more than 100 records and preserves query parameters', async () => {
  const urls = [];
  const api = client(async url => {
    urls.push(url);
    const page = Number(new URL(url).searchParams.get('page'));
    return response(200, page === 1 ? Array.from({ length: 100 }, (_, i) => i) : [100, 101]);
  });
  const result = await api.all('pulls?state=all');
  assert.equal(result.length, 102);
  assert.match(urls[0], /state=all&per_page=100&page=1/);
  assert.match(urls[1], /state=all&per_page=100&page=2/);
});

test('pagination stops on the first short page', async () => {
  let calls = 0;
  const api = client(async () => {
    calls++;
    return response(200, [1, 2]);
  });
  assert.deepEqual(await api.all('issues/1/comments'), [1, 2]);
  assert.equal(calls, 1);
});

test('pagination fails closed when its page cap is exhausted', async () => {
  const api = client(async () => response(200, [1]), { maxPages: 2 });
  await assert.rejects(() => api.all('issues/1/comments', { perPage: 1 }), /exceeded 2 pages/);
});

test('GET retries transient failures within its bounded budget', async () => {
  let calls = 0;
  const api = client(async () => {
    calls++;
    return calls < 3 ? response(503, {}) : response(200, { ok: true });
  });
  assert.deepEqual(await api.request('branches/main'), { ok: true });
  assert.equal(calls, 3);
});

test('non-transient GET failures are not retried', async () => {
  let calls = 0;
  const api = client(async () => { calls++; return response(404, {}); });
  await assert.rejects(() => api.request('missing'), /404/);
  assert.equal(calls, 1);
});

test('POST requests are never automatically retried', async () => {
  let calls = 0;
  const api = client(async () => { calls++; return response(503, {}); });
  await assert.rejects(() => api.request('pulls', 'POST', { title: 'x' }), /503/);
  assert.equal(calls, 1);
});

test('a hanging GET is aborted and eventually reports a bounded timeout', async () => {
  let calls = 0;
  const api = client((url, options) => new Promise((resolve, reject) => {
    calls++;
    options.signal.addEventListener('abort', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    });
  }), { getRetries: 1, timeoutMs: 5 });
  await assert.rejects(() => api.request('branches/main'), /timed out/);
  assert.equal(calls, 2);
});

test('errors never expose the bearer token', async () => {
  const api = client(async () => response(500, {}), { getRetries: 0 });
  await assert.rejects(async () => {
    try { await api.request('branches/main'); }
    catch (error) {
      assert.doesNotMatch(error.message, /super-secret-token/);
      throw error;
    }
  }, /GitHub GET branches\/main: 500/);
});
