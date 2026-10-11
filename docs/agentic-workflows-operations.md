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

## One-time setup

The setup is intentionally automated. A repository administrator does only two things manually:

1. Create the two fine-grained PATs in the following table.
1. Run one command and paste each token only when GitHub CLI prompts for it.

| Secret | Scope | Purpose |
|---|---|---|
| `COPILOT_GITHUB_TOKEN` | Fine-grained PAT with account permission **Copilot Requests: Read** | Copilot inference only |
| `GH_AW_CI_TRIGGER_TOKEN` | Fine-grained PAT for this repository with **Contents: Read and write** | Extra empty commit that triggers normal PR CI |

Create fine-grained PATs at <https://github.com/settings/personal-access-tokens/new>. Give each token only the access listed above. Do not add `copilot-requests: write`, reuse either token, place token values in command arguments, or save them in this repository.

After this migration is merged, check out the default branch and authenticate GitHub CLI as a repository administrator:

```shell
gh auth login
git switch main
git pull --ff-only
node .github/scripts/setup-agentic-workflows.mjs --configure
```

The script is safe to rerun. It:

- installs or updates `gh-aw` to `v0.83.4`;
- prompts through `gh secret set` only when either required Actions secret is missing;
- creates or updates the `agentic:needs-human` label;
- keeps default Actions permissions read-only and enables GitHub's combined setting that permits Actions to create pull requests;
- creates or updates the active `Project Pulse agentic workflow guardrails` ruleset on the default branch;
- requires a pull request, one human approval, CODEOWNER review, resolution of review threads, and approval from someone other than the last pusher;
- blocks deletion and non-fast-forward updates;
- requires the always-running `Agentic workflow policy` and `Project Pulse contract` checks; and
- runs `gh aw doctor`; and
- sets `AGENTIC_SETUP_COMPLETE=true` only after configuration and doctor checks pass.

GitHub combines “create pull requests” and “approve pull requests” in one repository setting. The setup enables that setting because safe outputs must create draft pull requests. The workflow definitions never request approval or merge operations, and the ruleset requires qualifying human approval.

Confirm the current state without changing anything:

```shell
node .github/scripts/setup-agentic-workflows.mjs --check
```

To target a repository other than the current checkout, add `--repo OWNER/REPOSITORY`.

Record the PAT expiration dates and preflight date in a private operator system, not in this repository.

## Setup gate

Step 0 checks `AGENTIC_SETUP_COMPLETE` and both secret names before it creates the exercise issue or enables Step 1. Every slash-command workflow also requires `AGENTIC_SETUP_COMPLETE == 'true'`. Learners therefore cannot bypass an incomplete setup by creating an issue manually.

Both required checks run on every pull request so the ruleset never waits for a path-filtered workflow that did not start. The Project Pulse contract reports success without app validation while the learner placeholder is checked in.

## Preflight

1. Run `node .github/scripts/setup-agentic-workflows.mjs --check`.
1. Run a read-only Stage 1 trial with an issue trigger context.
1. Confirm the agent job has only read permissions.
1. Confirm write permissions occur only in safe-output jobs.
1. Confirm the draft PR receives an extra empty commit and starts normal CI.
1. Confirm evidence contains no token prefix, authorization header, or unsanitized secret.
For release verification, force two controlled failures in a disposable repository and verify one rerun followed by human escalation. Do not perform this destructive test in the learner repository.

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
