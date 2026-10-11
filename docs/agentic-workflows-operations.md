# GitHub Agentic Workflows operations

## Approved defaults

This implementation records the repository owner's request to implement the migration plan using its recommended defaults:

- GitHub Copilot is the inference engine for every stage.
- Existing agent names, responsibilities, and declared model names remain instructional metadata; workflows do not reproduce a multi-provider runtime.
- Learners invoke `/pulse-team`, `/pulse-plan`, `/pulse-design`, `/pulse-build`, and `/pulse-handoff` on the canonical exercise issue.
- Designer and Coder use separate Stage 3 pull requests.
- Agent jobs use read-only repository permissions. Draft pull requests, comments, and evidence artifacts use compiler-generated safe-output jobs.
- Every stage allows at most two complete executions: one initial attempt and one controller-authorized rerun.
- A second failure adds `agentic:needs-human` and blocks automatic continuation.
- Evidence artifacts are retained for 30 days.
- Human review and required checks are mandatory; workflows cannot approve or merge their own pull requests.
- Stage 4 requires `/pulse-handoff`; it does not start automatically.
- The former Copilot CLI learner path is removed from this branch.

## Toolchain

- Required `gh-aw` version: `v0.83.4`.
- Editable workflows are `.github/workflows/project-pulse-*.md`.
- Generated `.lock.yml` files are committed and must never be edited manually.
- Compile with `gh aw compile`.
- Validate policy with `node .github/scripts/validate-agentic-workflow.mjs`.

## Required repository secrets

Configure values through repository settings or `gh aw secrets set`. Never record token values.

| Secret | Scope | Purpose |
|---|---|---|
| `COPILOT_GITHUB_TOKEN` | Fine-grained PAT with account permission **Copilot Requests: Read** | Copilot inference only |
| `GH_AW_CI_TRIGGER_TOKEN` | Fine-grained PAT for this repository with **Contents: Read and write** | Extra empty commit that triggers normal PR CI |

Do not add `copilot-requests: write` to stage workflows. Do not reuse either token for a different purpose.

Record the PAT expiration dates and preflight date in a private operator system, not in this repository.

## Repository settings

1. Enable GitHub Actions and allow Actions to create pull requests.
1. Create the `agentic:needs-human` label.
1. Apply a branch ruleset requiring pull requests, one human approval, CODEOWNER review for governed paths, `Agentic workflow policy`, and `Project Pulse contract` where applicable.
1. Prevent workflows from approving or merging their own pull requests.
1. Configure both required secrets.

## Preflight

1. Confirm both secret names exist without printing their values.
1. Run `gh aw doctor --repo OWNER/REPOSITORY`.
1. Run a read-only Stage 1 trial with an issue trigger context.
1. Confirm the agent job has only read permissions.
1. Confirm write permissions occur only in safe-output jobs.
1. Confirm the draft PR receives an extra empty commit and starts normal CI.
1. Confirm evidence contains no token prefix, authorization header, or unsanitized secret.
1. Force two controlled failures in a disposable repository and verify one rerun followed by human escalation.

## Stage state

The exercise issue is the authoritative control plane. A stage is ready only when the prior stage's pull request is merged into the default branch:

1. `team` produces `docs/agent-team.md`.
1. `plan` requires the team document and produces `docs/project-pulse-plan.md`.
1. `design` requires the plan and produces `docs/project-pulse-design.md`.
1. `build` requires the plan and design contract and produces the app and launch files.
1. `handoff` requires a successful Project Pulse contract run and produces `docs/final-handoff.md`.

Duplicate or concurrent commands for the same issue and stage are serialized by compiler-generated concurrency. While `agentic:needs-human` is present, a maintainer must resolve the evidence, remove the label, and explicitly invoke the command again.

## Retry policy

Retry infrastructure, engine, validation, and safe-output failures once. Do not retry human cancellation, authorization denial, policy violation, detected scope expansion, or a run that already applied a partial safe output. The controller uses `github.run_attempt`, not model self-reporting.

## Evidence

Each stage requests one artifact named `project-pulse-stage-<stage>-<run-id>` containing:

- `run-manifest.json`
- `validation.log`
- `changed-files.txt`
- `scope-check.json`
- `agent-output.md`
- `safe-output-result.json`
- `http-smoke-test.log` for build and handoff

Use `gh aw logs --run-id RUN_ID` and `gh aw audit RUN_ID` for investigation. Evidence must not contain secrets, raw authorization headers, hidden reasoning, or unsanitized issue content.
