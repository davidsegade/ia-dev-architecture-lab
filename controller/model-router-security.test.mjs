import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const workflow = () => readFileSync(join(root, '.github/workflows/ia-dev-engine.yml'), 'utf8');
const agent = () => readFileSync(join(import.meta.dirname, 'agent.mjs'), 'utf8');
const registry = () => JSON.parse(readFileSync(join(root, 'config/free-models.json'), 'utf8'));

test('production discovers OpenCode models independently for author and reviewer', () => {
  const source = workflow();
  const discovery = source.match(/node "\$IA_DEV_ENGINE\/controller\/discover-models\.mjs"/g) || [];
  assert.equal(discovery.length, 2);
  const inventories = source.match(/AVAILABLE_MODELS_BASE64: \$\{\{ steps\.models\.outputs\.models \}\}/g) || [];
  assert.equal(inventories.length, 2);
  const required = source.match(/RUNTIME_MODEL_DISCOVERY_REQUIRED: 'true'/g) || [];
  assert.equal(required.length, 2);
});

test('runtime discovery refreshes only the opencode provider catalog', () => {
  const source = readFileSync(join(import.meta.dirname, 'discover-models.mjs'), 'utf8');
  assert.match(source, /\['models', 'opencode', '--refresh'\]/);
  assert.match(source, /timeout = 30000/);
  assert.doesNotMatch(source, /Authorization|API_KEY|TOKEN/);
});

test('agent selection is registry plus runtime inventory, never arbitrary prompt data', () => {
  const source = agent();
  assert.match(source, /selectCandidates\(role, runtimeInventory, modelRegistry\)/);
  assert.match(source, /RUNTIME_MODEL_DISCOVERY_REQUIRED/);
  assert.match(source, /freeUsage\(result\.stdout\)/);
  assert.doesNotMatch(source, /process\.env\.(?:MODEL|AUTHOR_MODEL|REVIEWER_MODEL)/);
});

test('checked-in model registry declares zero cost and disjoint author-reviewer pools', () => {
  const data = registry();
  const author = new Set(data.author.map(entry => entry.id));
  for (const entry of [...data.author, ...data.reviewer]) {
    assert.equal(entry.cost, 0);
    assert.match(entry.id, /^opencode\//);
  }
  for (const entry of data.reviewer) assert.equal(author.has(entry.id), false);
});

test('provider rotation is bounded by the approved candidate list', () => {
  const source = agent();
  assert.match(source, /modelIndex < modelCandidates\.length/);
  assert.match(source, /modelIndex\+\+/);
  assert.match(source, /ProviderFailure/);
  assert.match(source, /PolicyFailure/);
});
