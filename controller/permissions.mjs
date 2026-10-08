/**
 * Agent sandbox permissions.
 *
 * Everything is denied by default. The agent is granted only what the engine-owned
 * policy declared for the target repository: the allowlisted edit paths, and the
 * acceptance and build commands used as the independent acceptance gate.
 *
 * These values are never derived from the issue body. An issue contributes at most a
 * registered task name, so untrusted input cannot widen the sandbox.
 */

/** Edit permissions for the allowlisted paths, everything else denied. */
export function editPermissions(allowedPaths) {
  const permissions = { '*': 'deny' };
  for (const path of allowedPaths) {
    permissions[normalizePattern(path)] = 'allow';
  }
  return permissions;
}

/**
 * A policy path as OpenCode matches it: relative to the workspace root.
 *
 * OpenCode compares an edit permission against the path it is about to write, which is
 * root relative in the sandbox. Prefixing the policy path with a recursive directory glob
 * in the tree therefore stopped `lib/**` from matching the root relative `lib/x.mjs` the
 * agent was instructed to write: the allowlisted edits were denied while the run still
 * looked healthy, because a denied edit is not a failure the run can report.
 *
 * Runs of three or more stars still collapse: `lib/**` describes one recursive wildcard,
 * and rewriting every star separately would yield `lib/****`.
 */
function normalizePattern(pattern) {
  return String(pattern).replace(/^\.\//, '').replace(/^\/+/, '').replace(/\*{3,}/g, '**');
}

/**
 * Bash permissions for the acceptance and build commands, everything else denied.
 *
 * A compound command such as `flutter analyze && flutter test` is also expanded into
 * its segments so the agent can run one step on its own. The commands come from the
 * engine-owned policy file rather than from an issue, so widening to the segments of
 * an engine-declared command stays inside that trust boundary.
 */
export function bashPermissions(acceptanceCommand, buildCommand) {
  const permissions = { '*': 'deny' };
  for (const command of [acceptanceCommand, buildCommand].filter(Boolean)) {
    permissions[command] = 'allow';
    for (const segment of command.split('&&').map(part => part.trim()).filter(Boolean)) {
      permissions[segment] = 'allow';
    }
  }
  return permissions;
}

/**
 * Full permission block for an agent run.
 * The reviewer gets no write surface at all: no edits, no bash.
 */
export function permissionsFor(mode, { allowedPaths = [], acceptanceCommand, buildCommand } = {}) {
  if (mode !== 'write') {
    return {
      '*': 'deny',
      read: 'allow',
      glob: 'allow',
      grep: 'allow',
      external_directory: 'deny',
      edit: 'deny',
      bash: 'deny'
    };
  }
  return {
    '*': 'deny',
    read: 'allow',
    glob: 'allow',
    grep: 'allow',
    external_directory: 'deny',
    edit: editPermissions(allowedPaths),
    bash: bashPermissions(acceptanceCommand, buildCommand)
  };
}
