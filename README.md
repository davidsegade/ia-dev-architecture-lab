# IA DEV 2.0 architecture laboratory

This repository is the isolated architecture and safety laboratory for IA DEV 2.0. It contains synthetic functions only. It is not a product repository and must not contain personal data, credentials or code copied from existing projects.

No real project is enabled until the closure criteria below are verified.

## Supported architecture

The supported entrypoint is `.github/workflows/ia-dev-engine.yml`, a reusable `workflow_call` workflow. A target repository uses a minimal caller workflow and references this repository by an exact commit SHA. GitHub's reusable-workflow identity (`job.workflow_repository` and `job.workflow_sha`) is then used inside every job, so the engine executed by a run is the same immutable engine revision selected by the caller.

The target repository's own `GITHUB_TOKEN` remains repository-scoped. No PAT, billing credential, model API key or shared cross-project write token is required. The caller grants the union of permissions needed by the reusable workflow; the called workflow reduces permissions again per job. Author, verifier and reviewer jobs are read-only. Only trusted publication and bounded failure/retry reporting receive write scopes.

An owner-created issue selects a task through a line containing only `task: <registered-task>`. Issue prose is not executable instruction. The engine-owned `config/repositories.yml` decides which repositories, tasks, paths and acceptance/build commands are allowed.

## Execution flow

1. **Prepare** validates the owner-created issue, repository allowlist, registered task, duplicate/retry state and records the base SHA.
2. **Execute** checks out that base and the immutable engine. For Node targets with a committed `package-lock.json`, dependencies are installed with `npm ci`. OpenCode 1.18.35 runs the scoped author with `opencode/mimo-v2.6-flash-free`. The child process receives no GitHub/model credentials and can edit only allowlisted files.
3. **Verify** starts from a clean checkout of the recorded base, reapplies the exported patch and independently runs path protection plus the engine-owned acceptance/build policy. The patch digest is recorded.
4. **Review** starts again from the recorded base, reapplies and re-verifies the patch, then runs a distinct read-only OpenCode reviewer with `opencode/space-bunny-free`. Missing file inspection, malformed verdicts, findings or a negative verdict fail closed.
5. **Publish** rechecks the patch digest and unchanged base, then creates a fresh disposable branch unique to the workflow run/attempt. It uses a normal push only; force-push is forbidden. A draft PR is opened with engine SHA, base SHA, verified/published head SHA, patch digest, author model, reviewer model and Actions evidence. IA DEV never merges or marks its own PR ready.
6. **Recover** records failure evidence and verifier feedback. If the issue is still open and fewer than three failed runs exist, a new clean workflow run is dispatched. Retries never rewrite an existing proposal branch.

## Idempotency and rollback

Idempotency follows the logical issue rather than a deterministic branch name. An existing IA DEV proposal or ready marker prevents a second proposal for the same issue. Failed attempts may leave disposable branches, but those branches are never reused or force-pushed.

Before merge, rollback is simply: close the draft PR and delete its disposable branch. `main` remains unchanged. An owner can also close the source issue or disable the caller workflow to stop further execution.

## Human gate

IA DEV publishes draft PRs and contains no merge or ready-for-review operation. GitHub therefore blocks direct merge of an IA DEV proposal until a separate actor deliberately moves it out of draft. Branch protection/rulesets should additionally require the repository's CI checks; formal review requirements can be added for multi-user repositories.

The laboratory `main` branch is protected and its `test` status is required. Repository-administration details that cannot be read through the connected GitHub integration must not be claimed as verified.

## Cost boundary

The author and reviewer are explicitly pinned to OpenCode free models and there is no paid fallback. If a free provider is unavailable, the run fails closed. GitHub-hosted runner usage and free-model availability remain external service constraints and can change; this system must not be described as permanently zero-cost or zero-maintenance.

OpenCode and action versions are pinned where practical. Model availability, package versions and GitHub runner behavior still require maintenance.

## Closure evidence

Already demonstrated in the laboratory:

- End-to-end issue -> OpenCode author -> independent acceptance -> independent reviewer -> PR using distinct free models (PR #49).
- Rejection of incorrect synthetic implementations by trusted acceptance tests.
- Protected-path, sandbox, permission, reviewer-read, model-separation and exact-artifact tests.
- CI on the architecture test suite.

Still required before IA DEV 2.0 is declared complete and before any real project is enabled:

- Merge the reusable-engine architecture only after human review of its PR.
- Run a fresh synthetic issue through the merged reusable workflow.
- Demonstrate one bounded clean retry through the new reusable workflow and confirm it does not duplicate a proposal.
- Confirm the resulting PR records the exact engine/workflow SHA and disposable branch evidence.

COROS Workout, TURNEO and IA DEV 1.0 remain out of scope until those closure checks pass.

## Official references

- https://opencode.ai/docs/cli/
- https://opencode.ai/docs/github/
- https://opencode.ai/docs/permissions/
- https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows
- https://docs.github.com/en/actions/reference/workflows-and-actions/contexts
- https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency
- https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches
