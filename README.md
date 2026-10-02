# IA DEV architecture laboratory

This repository contains synthetic functions only. It is not a product repository and contains no personal data, credentials or code from existing projects.

## Flow

An owner-created issue carrying the `ia-dev` label and `task: clamp`, `task: chunk`, or `task: sumCents` starts one queued workflow. The controller uses a registered task specification, not executable instructions supplied in issue text.

OpenCode 1.18.34 runs through its official non-interactive CLI on an ephemeral Ubuntu runner. Big Pickle writes code in a separate working directory, with no GitHub or model credentials in its child environment. At most two attempts are allowed per workflow, each limited to three minutes. Protected paths and independent acceptance are checked locally before exporting a patch.

A fresh runner reapplies the patch to the recorded base and verifies protected-file scope, author tests, syntax and independent acceptance. A separate runner reviews with Space Bunny Free, with editing and shell access denied. Missing, invalid or negative review verdicts block publication. No paid-model fallback is configured.

Only a final trusted publishing job receives write permission. It checks the artifact digest and unchanged base, applies the verified patch without executing candidate code, creates a deterministic branch and opens a PR. Acceptance and review statuses refer to that exact commit. GitHub branch protection must require these statuses and human approval. No workflow merges a PR.

## Recovery and limits

The issue and workflow run persist independently of the Mac. An execution that fails publishes a failure notice and keeps its evidence for seven days. Failed runs receive bounded automatic retries with verifier feedback. An explicit cancellation remains stopped; a workflow-dispatch retry accepts an existing issue number. The same issue never generates a second proposal when a PR already exists; after three failed runs it stops. Recovery restarts from the recorded task; it does not promise to restore a live agent process.

Workflows are serialized; the queue holds at most GitHub's supported queue capacity. A canceled run may require a deliberate retry. No scheduled polling or permanent server is installed. An owner can disable the workflow to stop new work; deletion of this laboratory removes its execution setup.

## Cost boundary

Use standard hosted Ubuntu runners in a public repository containing only synthetic data. Big Pickle and Space Bunny Free are currently documented as free; this is temporary availability, not a permanent entitlement. No billing account, API key, paid provider, credit purchase or automatic recharge is configured. If anonymous free access fails, the task fails. Big Pickle's free-period data may be used to improve its model, which is another reason to keep this laboratory synthetic.

The model catalog, package versions and runtime still need maintenance. These workflow scripts are integration glue, not a permanent homemade orchestration server. They must not be represented as zero maintenance.

## Acceptance status

Local controller checks and cloud execution are separate evidence. Architecture completion requires end-to-end cloud success, rejected incorrect results, recovery, duplication prevention, exact-commit validation and enforced human approval. Passing a function test alone does not satisfy this condition.

## Official references

- https://opencode.ai/docs/cli/
- https://opencode.ai/docs/github/
- https://opencode.ai/docs/permissions/
- https://opencode.ai/docs/zen/
- https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency
- https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches
