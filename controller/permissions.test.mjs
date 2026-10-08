import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bashPermissions, editPermissions, permissionsFor } from './permissions.mjs';

const POLICY = {
  allowedPaths: ['lib/**', 'test/**'],
  acceptanceCommand: 'flutter test',
  buildCommand: 'flutter analyze && flutter test'
};

/** Every value in an OpenCode permission map must be a permission action, not a command. */
function assertOnlyPermissionActions(permissions, where) {
  for (const [key, value] of Object.entries(permissions)) {
    const action = typeof value === 'string' ? value : null;
    assert.ok(
      action === null || ['allow', 'ask', 'deny'].includes(action),
      `${where}["${key}"] is ${JSON.stringify(value)}, which OpenCode rejects as a permission action`
    );
  }
}

test('bash permissions deny everything except the policy commands', () => {
  const permissions = bashPermissions('flutter test', 'flutter analyze && flutter test');
  assert.equal(permissions['*'], 'deny');
  assert.equal(permissions['flutter test'], 'allow');
  assert.equal(permissions['flutter analyze && flutter test'], 'allow');
  assertOnlyPermissionActions(permissions, 'bash');
});

test('bash permissions expand a compound command into its segments', () => {
  const permissions = bashPermissions('npm test', 'npm run build && npm run lint');
  assert.equal(permissions['npm run build'], 'allow');
  assert.equal(permissions['npm run lint'], 'allow');
});

test('bash permissions do not leak the previous repository commands', () => {
  const permissions = bashPermissions('flutter test', 'flutter analyze');
  assert.equal(permissions['npm test'], undefined);
  assert.equal(permissions['npm run build'], undefined);
});

test('bash permissions tolerate a missing command', () => {
  const permissions = bashPermissions(undefined, undefined);
  assert.deepEqual(permissions, { '*': 'deny' });
});

test('bash permissions ignore empty segments of a compound command', () => {
  const permissions = bashPermissions('flutter test', 'flutter analyze && ');
  assert.equal(permissions['flutter analyze'], 'allow');
  assert.equal(permissions[''], undefined);
});

test('edit permissions use the policy glob as written, root relative', () => {
  assert.deepEqual(editPermissions(['lib/**', 'test/**']), {
    '*': 'deny',
    'lib/**': 'allow',
    'test/**': 'allow'
  });
});

test('edit permissions keep a literal file path root relative', () => {
  assert.deepEqual(editPermissions(['src/main.mjs']), {
    '*': 'deny',
    'src/main.mjs': 'allow'
  });
});

test('edit permissions never prefix the policy path with **/', () => {
  // The regression: `**/lib/**` does not match the root relative `lib/x.mjs` OpenCode is
  // about to write, so every allowlisted edit was denied without the run ever failing.
  const permissions = editPermissions(['lib/**', 'src/main.mjs']);
  assert.deepEqual(
    Object.keys(permissions).filter(key => key.includes('**/')),
    []
  );
});

test('edit permissions normalise a redundant prefix and collapse star runs', () => {
  assert.deepEqual(editPermissions(['./lib/**', 'lib/****', '/src/main.mjs']), {
    '*': 'deny',
    'lib/**': 'allow',
    'src/main.mjs': 'allow'
  });
});
test('hidden directory names keep their leading dot',()=>{
  assert.equal(editPermissions(['.config/**'])['.config/**'],'allow');
  assert.equal(editPermissions(['.config/**'])['config/**'],undefined);
});

test('the executor sandbox allows only allowlisted edits and policy commands', () => {
  const permissions = permissionsFor('write', POLICY);
  assert.equal(permissions['*'], 'deny');
  assert.equal(permissions.read, 'allow');
  assert.equal(permissions.external_directory, 'deny');
  assert.deepEqual(permissions.edit, editPermissions(POLICY.allowedPaths));
  assert.deepEqual(permissions.bash, bashPermissions(POLICY.acceptanceCommand, POLICY.buildCommand));
  assertOnlyPermissionActions(permissions, 'permission');
  assertOnlyPermissionActions(permissions.edit, 'permission.edit');
});

test('the reviewer sandbox has no write surface at all', () => {
  const permissions = permissionsFor('review', POLICY);
  assert.equal(permissions.edit, 'deny');
  assert.equal(permissions.bash, 'deny');
  assert.equal(permissions.read, 'allow');
  assert.equal(permissions['*'], 'deny');
});

test('an unknown mode gets no write surface', () => {
  const permissions = permissionsFor('merge', POLICY);
  assert.equal(permissions.edit, 'deny');
  assert.equal(permissions.bash, 'deny');
});
