# GitHub Agentic Workflows migration plan

> [!NOTE]
> Implementation status: the repository implementation uses the recommended defaults in this plan. The one-time, mostly automated operator setup is in `docs/agentic-workflows-operations.md#one-time-setup`. After creating two least-privilege PATs, an administrator runs `node .github/scripts/setup-agentic-workflows.mjs --configure`; Step 0 and every slash command remain locked until the setup check passes.

## Outcome

Convert the exercise from an interactive Copilot CLI experience into a GitHub-native, issue-driven experience powered by **GitHub Agentic Workflows** running in GitHub Actions.

The converted exercise should preserve the same four learning stages:

1. Document the agent team.
2. Plan Project Pulse.
3. Design and build Project Pulse.
4. Validate and hand off Project Pulse.

Instead of copying prompts into Copilot CLI, the learner will invoke a workflow from the exercise issue with a slash command, review the workflow's pull request, and merge it. The existing lesson grader can continue reacting to changes on `main`.

GitHub Agentic Workflows are currently in public preview. Each editable workflow is a Markdown file with YAML frontmatter in `.github/workflows/`. Running `gh aw compile` generates a hardened `.lock.yml` GitHub Actions workflow. Both files must be committed; generated lock files must not be edited manually.

## Personal-account prerequisites

This plan assumes the exercise repository is owned by an individual GitHub account and uses the GitHub Copilot engine.

Three token contexts are used and must remain separate:

1. **Copilot inference authentication:** a fine-grained personal access token stored as `COPILOT_GITHUB_TOKEN`.
2. **GitHub repository operations:** the short-lived per-run `GITHUB_TOKEN`, with different job-level permissions for the read-only agent job and compiler-generated safe-output jobs.
3. **CI activation:** a second fine-grained PAT stored as `GH_AW_CI_TRIGGER_TOKEN`, used only to push an extra empty commit so agent-created pull requests trigger normal `push` and `pull_request` checks.

### Required Copilot PAT

Create a **fine-grained personal access token**, not a classic PAT, OAuth token, or GitHub App token.

Configure it as follows:

- **Resource owner:** the learner's personal GitHub account.
- **Account permission:** **Copilot Requests: Read**.
- **Repository permissions:** do not grant repository write permissions for inference. The token exists only to authenticate Copilot CLI requests.
- **Expiration:** use the shortest practical duration for the exercise and rotate or revoke it when the exercise ends.
- **License:** the PAT owner must have active Copilot inference access.

Store the token as an Actions repository secret named exactly `COPILOT_GITHUB_TOKEN`:

```shell
gh aw secrets set COPILOT_GITHUB_TOKEN --value "<fine-grained-pat>"
```

The token must never be committed, written to an artifact, echoed to a log, placed in workflow Markdown, or exposed to agent shell commands.

### Unsupported inference credentials

- An OAuth user token, including a token with the `gho_` prefix, is intentionally rejected for `COPILOT_GITHUB_TOKEN`.
- A GitHub App installation token cannot be used as `COPILOT_GITHUB_TOKEN`.
- A classic PAT is not the documented authentication path; use a fine-grained PAT with only **Copilot Requests: Read**.

GitHub Apps or a broader GitHub-operations PAT can be introduced later for cross-repository or unsupported operations, but this plan does not require one. The CI-trigger PAT described below is intentionally narrower than a general repository automation token.

### Required CI-trigger PAT

Pull requests created with the built-in Actions `GITHUB_TOKEN` do not trigger additional workflow runs by default. This prevents event cascades, but it would also prevent `project-pulse-contract.yml` and the existing lesson graders from running on an agent-created PR.

Create a second fine-grained PAT with:

- **Resource owner:** the learner's personal GitHub account.
- **Repository access:** only this Project Pulse repository.
- **Repository permission:** **Contents: Read and write**.
- **No additional permissions:** it does not need Issues, Pull requests, Actions, Administration, or Copilot Requests access.
- **Expiration:** the shortest practical duration for the exercise.

Store it as the Actions repository secret `GH_AW_CI_TRIGGER_TOKEN`:

```shell
gh aw secrets set GH_AW_CI_TRIGGER_TOKEN --value "<fine-grained-pat>"
```

GitHub Agentic Workflows recognizes this secret name. After the safe-output job creates the PR branch, it uses this PAT only to push an extra empty commit. That commit runs under the PAT owner's identity and triggers normal CI events.

Do not use the CI-trigger PAT for Copilot inference, issue comments, retry control, observability, or general agent access.

### Workflow frontmatter implication

Do **not** add `copilot-requests: write` to these personal-account workflows. When that permission is present, GitHub Agentic Workflows ignores `COPILOT_GITHUB_TOKEN` for inference and attempts organization-billed authentication instead.

Each stage should instead declare only its required repository read permissions. Safe-output jobs receive the narrowly scoped same-run `GITHUB_TOKEN` permissions needed to create the stage's draft pull request or issue comment.

### How read-only agent permissions become safe writes

The read-only default applies to the **agent job**, not to every generated job in the compiled workflow.

When an editable workflow declares:

```yaml
permissions:
  contents: read
  issues: read
  pull-requests: read

safe-outputs:
  create-pull-request:
    draft: true
    max: 1
  add-comment:
    target: triggering
    max: 1
```

`gh aw compile` creates separate jobs with separate permission boundaries:

1. **Agent job**
   - Receives the declared read permissions.
   - Reads repository and issue context.
   - Edits its isolated checkout.
   - Cannot push a branch, create a PR, or post an issue comment directly.
   - Packages proposed commits as a git bundle and uploads it as an Actions artifact.

2. **Safe-output job**
   - Runs after the agent finishes.
   - Is generated by `gh-aw`, not authored as unrestricted agent code.
   - Receives only the job-level `GITHUB_TOKEN` write scopes required by the declared safe outputs.
   - Downloads and validates the git bundle.
   - Pushes the proposed branch and creates the draft pull request for `create-pull-request`.
   - Posts only the allowed triggering-issue comment for `add-comment`.
   - Applies configured limits such as `max`, `draft`, title prefixes, protected files, and allowed branches.

The model never receives the safe-output job's write-capable token. GitHub creates a separate short-lived `GITHUB_TOKEN` for the job, limited by the compiled job-level `permissions` block and revoked when the job finishes.

The generated `.lock.yml` must be reviewed to confirm:

- The agent job has no repository write scopes.
- Write scopes appear only on the expected safe-output job.
- The safe-output job exposes only declared output handlers.
- No custom step passes the safe-output token back to the agent.

For `create-pull-request`, the built-in `GITHUB_TOKEN` performs the actual branch push and PR creation. `GH_AW_CI_TRIGGER_TOKEN` is then used only for the extra empty commit that triggers CI. To make this explicit instead of relying on the recognized secret name, configure:

```yaml
safe-outputs:
  create-pull-request:
    draft: true
    max: 1
    github-token-for-extra-empty-commit: ${{ secrets.GH_AW_CI_TRIGGER_TOKEN }}
```

The conventional retry controller is different: because it is not an agentic job, its own workflow YAML explicitly grants `actions: write` and `issues: write` to that job's short-lived `GITHUB_TOKEN`. It does not inherit those permissions from the agentic workflows.

### Authentication preflight

Before enabling Stage 1:

1. Confirm the `COPILOT_GITHUB_TOKEN` repository secret exists without printing its value.
2. Confirm the `GH_AW_CI_TRIGGER_TOKEN` repository secret exists without printing its value.
3. Run a minimal `gh aw trial` that performs a read-only Copilot request.
4. Confirm the run does not request `copilot-requests: write`.
5. Inspect the generated `.lock.yml` and confirm the agent job is read-only and write permissions exist only on safe-output jobs.
6. Confirm logs and artifacts redact both secrets and contain no token prefix or authorization header.
7. Confirm safe outputs use `GITHUB_TOKEN`, not `COPILOT_GITHUB_TOKEN`.
8. Create a test draft PR and confirm its extra empty commit is authored by the CI-trigger PAT owner and starts `project-pulse-contract.yml`.
9. Record only each secret name, PAT expiration date, and successful preflight date in operator documentation. Never record token values.

## Recommended architecture

Use the existing exercise issue as the control plane.

- A learner invokes each stage with a slash command such as `/pulse-team`.
- The matching agentic workflow runs in GitHub Actions.
- The agent reads the repository and proposes changes through the `create-pull-request` safe output.
- The workflow posts a status comment on the exercise issue through the `add-comment` safe output.
- The learner reviews and merges the pull request.
- Existing deterministic step workflows check the merged files and post the next lesson.

This keeps a human approval gate between stages and avoids granting an agent unrestricted repository write access.

## Shared GitHub-native files

| File | Purpose | Action |
|---|---|---|
| `.github/copilot-instructions.md` | Repository-wide rules shared by agentic workflows: preserve the four-stage sequence, do not modify grader contracts unless assigned, use exact required names and paths, and produce reviewable pull requests. | Add |
| `.github/instructions/project-pulse.instructions.md` | Path-specific implementation and validation rules for `app/**`, `docs/**`, and `.vscode/launch.json`. Consolidates repeated prompt requirements from the lesson steps. | Add |
| `.github/PULL_REQUEST_TEMPLATE/project-pulse.md` | Standard PR summary with stage, files changed, validation evidence, risks, and learner review checklist. | Add |
| `.github/ISSUE_TEMPLATE/project-pulse-agentic.yml` | Optional issue form for starting a new Project Pulse run outside the Skills exercise bootstrap process. | Optional |
| `.github/scripts/validate-project-pulse.mjs` | Deterministic validator for exact HTML, CSS, JSON, and launch requirements. Keeps acceptance checks outside the model. | Add |
| `.github/scripts/validate-agentic-workflow.mjs` | Repository policy validator for workflow frontmatter, trigger restrictions, permission ceilings, safe-output limits, file-scope declarations, engine configuration, and required human gates. | Add |
| `.github/scripts/collect-agentic-evidence.mjs` | Produces a sanitized machine-readable run manifest containing stage, run ID, source and lock SHAs, trigger, actor, issue or PR, declared permissions, tools, safe outputs, files changed, validation results, timing, and outcome. | Add |
| `.github/scripts/evaluate-agentic-retry.mjs` | Classifies a failed run, checks its full-execution attempt count, authorizes at most one automatic retry, and emits the human-escalation payload after the second failed attempt. | Add |
| `.github/workflows/agentic-workflow-policy.yml` | Conventional GitHub Actions workflow that validates every agentic `.md` source and confirms its generated `.lock.yml` is current. | Add |
| `.github/workflows/agentic-observability.yml` | Conventional `workflow_run` workflow that collects completed agentic-run metadata and logs, publishes an Actions summary, and uploads sanitized evidence artifacts. | Add |
| `.github/workflows/agentic-retry-controller.yml` | Conventional `workflow_run` controller that permits one automatic rerun after the initial failure and escalates the second failure to a human. | Add |
| `.github/workflows/project-pulse-contract.yml` | Conventional non-agentic GitHub Actions workflow that runs the validator on Project Pulse pull requests and pushes to `main`. | Add |
| `.github/CODEOWNERS` | Requires maintainer review for `.github/workflows/*.md`, `.github/workflows/*.lock.yml`, shared instructions, validators, and workflow policy files. | Add or update |
| `.github/agents/*.agent.md` | Existing Orchestrator, Planner, Designer, and Coder role definitions. Agentic workflows do not automatically orchestrate these files, so workflow instructions must explicitly read them or move their durable rules into shared instructions. | Retain during migration |
| `.github/workflows/1-step.yml` through `.github/workflows/4-step.yml` | Existing deterministic lesson grading and progression workflows. | Retain initially; update only where they mention Copilot CLI behavior |

## Agentic workflow governance gate

Every stage must review the agentic workflow itself, not only the artifact it produces. A stage is not ready to merge until its workflow source, compiled lock file, and runtime behavior pass the following checks.

### Boundaries and scope

- The workflow states one durable objective and explicitly lists files it may create or modify.
- The workflow states files and areas it must not modify.
- Stage outputs cannot silently change lesson graders, agent definitions, shared workflow policy, branch protection, secrets, or unrelated application files.
- The prompt includes a stop condition and instructs the agent to report a blocker instead of expanding scope.
- Cross-repository access is disabled unless a later requirement explicitly introduces it.

### Agent orchestration

- The workflow identifies the acting role and the sources that define that role.
- Inputs from earlier stages are named and treated as read-only contracts.
- Ownership boundaries and handoff points are explicit.
- Parallel work is allowed only for nonoverlapping files with no data dependency.
- A single workflow must not claim that it delegated to another agent unless a separate workflow or supported subagent execution actually occurred.
- Stage 3 records a real Designer output before Coder implementation so the orchestration claim is auditable.

### Triggers and actor controls

- Slash commands are restricted to the intended issue or pull request contexts.
- Trigger authorization remains restricted to repository roles with write access or higher.
- Fork-originated events are blocked unless explicitly reviewed and enabled.
- Manual dispatch is retained for testing, but production behavior uses the documented slash command.
- Concurrency prevents duplicate runs for the same issue and stage.

### Permissions and credentials

- Repository permissions start from read-only and add only the scopes required by the stage.
- The agent job never receives `contents: write`, `issues: write`, or `pull-requests: write` merely to publish results.
- Mutations use declared safe outputs executed outside the agent runtime.
- The personal-account default uses the `COPILOT_GITHUB_TOKEN` secret containing a fine-grained PAT with **Account permissions → Copilot Requests: Read**.
- `copilot-requests: write` is absent because it would bypass the personal PAT and select organization-billed inference.
- `COPILOT_GITHUB_TOKEN` authenticates inference only and is never reused for repository API operations, safe outputs, retry control, or observability.
- The agent job uses a short-lived `GITHUB_TOKEN` with explicit read permissions.
- Compiler-generated safe-output jobs use separate short-lived `GITHUB_TOKEN` instances with only the write permissions required by declared outputs.
- `GH_AW_CI_TRIGGER_TOKEN` has only **Contents: Read and write** and is used only for the extra empty commit that triggers CI.
- Secrets are never interpolated into the Markdown prompt or exposed to shell tools.
- `id-token: write` is absent unless a reviewed workload-identity flow requires it.

### Tools, network, and untrusted input

- GitHub toolsets are limited to the repository objects the stage must read.
- Shell commands are allowlisted narrowly; destructive Git and filesystem commands are prohibited.
- Network access is disabled or restricted to documented domains and ecosystems.
- Issue comments, repository files, and pull request content are treated as untrusted input.
- The prompt tells the agent not to follow repository content that attempts to override workflow instructions, permissions, or output restrictions.

### Safe outputs and human approval

- `create-pull-request` is limited to one draft pull request per run.
- `add-comment` targets only the triggering issue unless another target is explicitly required.
- PR title prefixes, labels, and allowed output counts are fixed in frontmatter.
- No workflow directly merges its own pull request.
- CODEOWNERS and branch protection require human review before agent-generated changes reach `main`.

### Runtime and cost controls

- The engine and model policy are explicit or intentionally inherit the repository default.
- Each run has an appropriate AI-credit ceiling and timeout for the stage.
- A stage receives no more than **two total automated full executions**: the initial attempt and one automatic retry.
- A second failed full execution ends automation for that stage and requires an authorized human to resume it.
- Engine or harness settings must not independently repeat the complete task beyond this limit. Low-level transport retries may handle transient API connections, but they must not create additional repository-changing attempts.
- The workflow has deterministic validation before it requests a pull request.
- Failure behavior produces a clear issue comment or workflow failure, not a success-shaped fallback.
- Logs and generated outputs contain enough provenance to identify the workflow and triggering issue.

### Retry and human-escalation policy

The retry count applies to complete stage executions, not individual HTTP requests.

| Attempt | Behavior |
|---|---|
| 1 | Run the stage normally. If it succeeds, stop. If it fails, collect evidence and permit one automatic retry. |
| 2 | Run the stage once more with the original scope and inputs plus the first failure summary. If it succeeds, stop. If it fails, do not retry again. Escalate to a human. |

The implementation should use the GitHub Actions run attempt and a trusted controller, not agent self-reporting, as the source of truth.

`agentic-retry-controller.yml` should:

1. Trigger on completion of only the allowlisted Project Pulse agentic workflows.
2. Ignore successful, cancelled-by-human, skipped, and unrelated workflow runs.
3. On a first failed execution, verify that no safe output partially completed, attach the failure artifact, and rerun the failed workflow once.
4. On a second failed execution:
   - Refuse another automatic rerun.
   - Add an `agentic:needs-human` label to the tracking issue or pull request.
   - Post a human-escalation comment with both run URLs, artifact URLs, failure classification, last successful checkpoint, observed file scope, safe-output state, and recommended next action.
   - Record `escalated_to_human: true` in `run-manifest.json`.
   - Prevent the same stage from automatically activating again while the escalation label remains.
5. Require a repository writer or maintainer to inspect the evidence, correct the workflow or repository state, remove the escalation label, and explicitly invoke the stage command again.

The retry controller needs narrowly scoped `actions: write` permission to rerun an allowlisted workflow and `issues: write` permission to label and comment on the tracking issue. It must not have `contents: write`, `pull-requests: write`, secret access beyond its own needs, or permission to merge changes.

The workflow policy validator should fail a pull request when:

- A stage defines more than one automatic retry.
- Multiple retry mechanisms can stack and exceed two total executions.
- A retry changes the original allowed file scope or broadens permissions.
- A second failure can silently restart through `workflow_run`, schedule, or another command.
- Human escalation lacks evidence links or a blocking label.

### Observability, logs, and artifacts

- Every run has a correlation key containing the tracking issue number, stage ID, GitHub Actions run ID, and generated PR number when one exists.
- The workflow writes a concise `$GITHUB_STEP_SUMMARY` with activation reason, acting role, scope, files considered, files changed, validation outcome, safe outputs requested, and links to the issue and PR.
- Deterministic commands write stdout and stderr to stage-specific log files before those logs are uploaded.
- Each run uploads a sanitized evidence artifact even when the agent fails after activation.
- The artifact contains:
  - `run-manifest.json` with workflow source SHA, lock-file SHA, trigger, actor, engine and model identifiers when available, declared permissions, tools, network policy, safe outputs, start and end time, conclusion, and generated item URLs.
  - `validation.log` with deterministic check output.
  - `changed-files.txt` with the proposed file list.
  - `scope-check.json` showing allowed, denied, and observed paths.
  - `agent-output.md` containing the final user-visible agent result or failure summary.
  - `safe-output-result.json` containing requested and applied safe outputs.
- Build and validation stages also include `http-smoke-test.log`.
- Evidence artifacts use predictable names such as `project-pulse-stage-02-${{ github.run_id }}` and a documented retention period.
- The tracking issue receives a completion or failure comment linking to the Actions run, artifact, and generated PR.
- Operators use `gh aw logs` for workflow history and usage, and `gh aw audit RUN-ID` for per-run duration, token usage, and estimated AI-credit review.
- Observability must not record secrets, credentials, raw authorization headers, hidden chain-of-thought, or unsanitized untrusted content.
- Artifact upload and issue reporting run under `always()` semantics where supported so failures remain diagnosable.
- The observability workflow itself has read-only `actions`, `contents`, and metadata permissions and cannot modify source or merge pull requests.
- Attempt 2 artifacts include a pointer to attempt 1 so a human can compare failures without searching across runs.
- Human escalation must remain visible on the tracking issue until a maintainer resolves it; a later successful manual run may close the escalation with a final evidence link.

### Source and lock-file integrity

- `gh aw compile` succeeds.
- The generated `.lock.yml` matches the committed Markdown source.
- Neither the workflow nor the agent edits `.lock.yml` directly.
- `agentic-workflow-policy.yml` passes before merge.
- A staged or trial run demonstrates that triggers, permissions, tools, and safe outputs match the design.
- The trial run produces the expected Actions summary, logs, evidence artifact, correlation links, and audit record.
- Retry testing demonstrates exactly one automated rerun and confirms that a second failure produces human escalation instead of a third execution.

## Stage 1: Document the agent team

### Objective

Inspect `.github/agents/` and create `docs/agent-team.md` with the Orchestrator, Planner, Designer, and Coder names, model assignments, responsibilities, source files, and Project Pulse collaboration model.

### Learner interaction

Post `/pulse-team` on the exercise issue.

### Agentic workflow files

| File | Purpose |
|---|---|
| `.github/workflows/project-pulse-01-team.md` | Editable agentic workflow triggered by the `/pulse-team` slash command. It reads `.github/agents/*.agent.md`, checks current lesson requirements, and proposes `docs/agent-team.md`. |
| `.github/workflows/project-pulse-01-team.lock.yml` | Generated hardened GitHub Actions workflow produced by `gh aw compile`. |

### Frontmatter capabilities

- Trigger: `slash_command: pulse-team`, restricted to issue contexts and repository writers.
- Permissions: `contents: read` and `issues: read`; Copilot inference uses `COPILOT_GITHUB_TOKEN`.
- GitHub tools: repository contents and issue context, read-only.
- Safe outputs:
  - `create-pull-request` with `max: 1`, a stage-specific title prefix, and a draft PR.
  - `add-comment` targeting the triggering issue.

### Workflow instructions

1. Read all four `.github/agents/*.agent.md` files.
2. Read `.github/steps/1-step.md` and the current grader contract.
3. Create or update only `docs/agent-team.md`.
4. Include exact model names from the agent frontmatter rather than hard-coding model versions in the workflow prompt.
5. Run a deterministic keyword check before requesting the pull request.
6. Open a draft PR titled `Document the Project Pulse agent team`.

### Acceptance gate

Retain `.github/workflows/1-step.yml` as the deterministic post-merge grader. It should continue checking the required file, agent names, model names, `.github/agents/`, and Project Pulse context.

### Stage 1 workflow review

- **Boundary:** only `docs/agent-team.md` may be changed by the generated PR.
- **Scope:** the workflow summarizes existing agent definitions; it does not rewrite `.github/agents/` or update model assignments.
- **Orchestration:** the acting role is Orchestrator, but the workflow must describe the other agents from source files rather than claim that they ran.
- **Permissions:** contents and issue context are read-only; PR creation and issue reporting occur only through safe outputs.
- **Tools:** repository-content and issue-read tools only; no shell or external network access is required.
- **Safe outputs:** one draft PR and one comment on the triggering issue.
- **Validation:** compare all documented names and models directly with frontmatter in the four agent files.
- **Observability:** artifact includes the four agent definition paths read, extracted agent/model table, scope check proving only `docs/agent-team.md` changed, validation output, and resulting PR URL.
- **Retry:** one automatic rerun is allowed only for execution or validation failure; the second failure labels the exercise issue `agentic:needs-human` and stops.
- **Human gate:** a maintainer verifies that the summary accurately represents the agent files before merge.

## Stage 2: Plan Project Pulse

### Objective

Create `docs/project-pulse-plan.md` with the Project Pulse goal, implementation phases, file ownership, Designer and Coder responsibilities, dependencies, parallel work, risks, and validation expectations.

### Learner interaction

After the Stage 1 PR is merged, post `/pulse-plan` on the exercise issue.

### Agentic workflow files

| File | Purpose |
|---|---|
| `.github/workflows/project-pulse-02-plan.md` | Editable Planner workflow triggered by `/pulse-plan`. It researches the repository and proposes the implementation plan. |
| `.github/workflows/project-pulse-02-plan.lock.yml` | Generated hardened GitHub Actions workflow. |

### Frontmatter capabilities

- Trigger: `slash_command: pulse-plan`.
- Permissions: read-only repository and issue access; Copilot inference uses `COPILOT_GITHUB_TOKEN`.
- Safe outputs: one draft pull request and one issue comment.
- Optional engine selection: use the preferred planning engine in this workflow rather than encoding the Planner's model only as prose.

### Workflow instructions

1. Read `docs/agent-team.md`, `.github/project-pulse-brief.md`, `.github/agents/planner.agent.md`, and `.github/steps/2-step.md`.
2. Inspect the repository structure before planning.
3. Assign:
   - `app/index.html` to Coder.
   - `app/styles.css` to Designer.
   - `app/project-data.json` to Coder.
   - `.vscode/launch.json` to Coder.
4. Explain sequential and parallel work and prevent overlapping file ownership.
5. Create or update only `docs/project-pulse-plan.md`.
6. Open a draft PR titled `Plan the Project Pulse dashboard`.

### Acceptance gate

Retain `.github/workflows/2-step.yml` as the post-merge grader. Add a deterministic check for an implementation phases heading if exact wording is required.

### Stage 2 workflow review

- **Boundary:** only `docs/project-pulse-plan.md` may be changed.
- **Scope:** Planner researches and plans but does not create application or launch files.
- **Orchestration:** the plan must assign single-writer ownership to Designer and Coder and identify the Orchestrator's integration role.
- **Dependencies:** earlier-stage `docs/agent-team.md` and the brief are read-only inputs; missing or inconsistent inputs stop the run.
- **Permissions:** contents and issue context remain read-only; safe outputs own all mutations.
- **Tools:** repository search and read tools are permitted; code-editing outside the plan file and unrestricted shell execution are not.
- **Safe outputs:** one draft plan PR and one issue comment.
- **Validation:** deterministic checks confirm all required file paths, roles, dependencies, parallel decisions, and validation expectations.
- **Observability:** artifact includes repository inputs consulted, plan requirement matrix, ownership/dependency checks, scope check proving only `docs/project-pulse-plan.md` changed, validation log, and PR URL.
- **Retry:** attempt 2 must use the same plan-file boundary and cannot respond to failure by implementing application files; a second failure escalates.
- **Human gate:** a maintainer approves file ownership and sequencing before merge.

## Stage 3: Design and build Project Pulse

### Objective

Preserve the Designer/Coder separation while building the complete dashboard and launch configuration.

This stage should use two agentic workflows because one workflow with one agent would weaken the exercise's core orchestration lesson.

### Stage 3A: Designer decision workflow

#### Learner interaction

Post `/pulse-design` after the Stage 2 PR is merged.

#### Files

| File | Purpose |
|---|---|
| `.github/workflows/project-pulse-03-design.md` | Reads the approved plan and produces an explicit visual/accessibility contract. |
| `.github/workflows/project-pulse-03-design.lock.yml` | Generated hardened workflow. |
| `docs/project-pulse-design.md` | Durable Designer output: information hierarchy, class hooks, responsive behavior, status and priority treatments, accessibility requirements, and validation notes. |

#### Safe output

Open one draft PR containing only `docs/project-pulse-design.md`. This creates an auditable contract before implementation and avoids concurrent edits to application files.

### Stage 3B: Coder implementation workflow

#### Learner interaction

After merging the design PR, post `/pulse-build`.

#### Files

| File | Purpose |
|---|---|
| `.github/workflows/project-pulse-03-build.md` | Reads the approved plan and design contract, implements the dashboard, runs deterministic validation, and proposes the app changes. |
| `.github/workflows/project-pulse-03-build.lock.yml` | Generated hardened workflow. |

#### Frontmatter capabilities

- Trigger: `slash_command: pulse-build`.
- Permissions: repository and issue read access; Copilot inference uses `COPILOT_GITHUB_TOKEN`.
- Tools: controlled shell access for JSON parsing and local HTTP smoke tests; no unrestricted GitHub write token in the agent job.
- Safe outputs: one draft pull request and one issue comment.

#### Workflow instructions

1. Read `docs/project-pulse-plan.md`, `docs/project-pulse-design.md`, `.github/agents/coder.agent.md`, and `.github/steps/3-step.md`.
2. Create or update only:
   - `app/index.html`
   - `app/styles.css`
   - `app/project-data.json`
   - `.vscode/launch.json`
3. Treat the approved design document as the Designer-owned contract. The Coder may implement it but must not silently change its decisions.
4. Run `.github/scripts/validate-project-pulse.mjs`.
5. Start `python3 -m http.server 5500`, request `/index.html`, `/styles.css`, and `/project-data.json`, then stop the server.
6. Open a draft PR titled `Build the Project Pulse dashboard` with validation evidence.

### Deterministic CI gate

`project-pulse-contract.yml` should run on the build PR and verify:

- Exact title `Project Pulse`.
- `styles.css` and `project-data.json` references.
- Data-driven `.project-card` rendering.
- Visible `status`, `recentActivity`, and `priority`.
- `.dashboard`, `.project-card`, `border-radius`, and `box-shadow`.
- Strict JSON and required project fields.
- Strict `.vscode/launch.json`.
- Exact launch name, command, working directory, and `index.html` URL.

Retain `.github/workflows/3-step.yml` for lesson progression after the build PR merges.

### Stage 3A Designer workflow review

- **Boundary:** only `docs/project-pulse-design.md` may be changed.
- **Scope:** Designer defines UX, accessibility, responsive behavior, and CSS hooks but does not implement HTML, CSS, data, or launch configuration.
- **Orchestration:** the design document is the explicit handoff contract consumed by Stage 3B.
- **Permissions:** repository contents and issue context are read-only; output is a safe-output draft PR.
- **Tools:** repository reads are sufficient; no shell, browser login, or external network access is required.
- **Safe outputs:** one design-contract PR and one triggering-issue comment.
- **Validation:** require `.dashboard`, `.project-card`, status, priority, loading, empty, error, responsive, reduced-motion, contrast, and focus guidance.
- **Observability:** artifact includes the design requirement matrix, accessibility checklist, proposed class-hook contract, scope check proving only `docs/project-pulse-design.md` changed, and design PR URL.
- **Retry:** attempt 2 may correct the design document only; it cannot proceed to application implementation. A second failure escalates to a human design review.
- **Human gate:** a maintainer approves the design contract before Coder runs.

### Stage 3B Coder workflow review

- **Boundary:** only `app/index.html`, `app/styles.css`, `app/project-data.json`, and `.vscode/launch.json` may be changed.
- **Scope:** Coder implements the approved plan and design contract; it cannot revise `docs/project-pulse-design.md` to match its implementation.
- **Orchestration:** the workflow must cite the approved Designer contract and report any conflict instead of overriding it.
- **Permissions:** contents are read-only to the agent; safe-output PR creation performs the write after validation.
- **Tools:** narrowly allow file editing, Node-based validation, and `python3 -m http.server 5500`; prohibit package installation, arbitrary network access, and destructive commands.
- **Network:** localhost smoke testing is allowed; outbound network access is unnecessary.
- **Safe outputs:** one draft build PR and one issue comment.
- **Validation:** run the contract validator and live HTTP smoke test; attach results to the PR body.
- **Observability:** artifact includes changed-file inventory, JSON validation, selector and launch checks, HTTP smoke-test log, server cleanup result, contract workflow URL, and build PR URL.
- **Retry:** attempt 2 receives the first validation and smoke-test failures but retains the exact four-file boundary and original permissions. A second failure blocks the build stage and escalates with both attempts' logs.
- **Human gate:** require the deterministic `Project Pulse contract` check and CODEOWNER approval before merge.
- **Failure behavior:** if the approved design cannot be implemented within the four-file scope, stop and comment with the blocker rather than editing another file.

## Stage 4: Validate and hand off

### Objective

Review the complete repository state, run deterministic validation, and create `docs/final-handoff.md` with agent contributions, files delivered, validation evidence, launch instructions, risks, and next steps.

### Learner interaction

After the Stage 3 build PR is merged and contract CI passes, post `/pulse-handoff`.

### Agentic workflow files

| File | Purpose |
|---|---|
| `.github/workflows/project-pulse-04-handoff.md` | Read-only review workflow that runs validation and proposes the final handoff document. |
| `.github/workflows/project-pulse-04-handoff.lock.yml` | Generated hardened GitHub Actions workflow. |

### Frontmatter capabilities

- Trigger: `slash_command: pulse-handoff`.
- Optional additional trigger: successful `workflow_run` of `Project Pulse contract`, if automatic Stage 4 creation is preferred.
- Permissions: contents, issues, pull requests, and Actions results read-only; Copilot inference uses `COPILOT_GITHUB_TOKEN`.
- Safe outputs: one draft pull request and one issue comment.

### Workflow instructions

1. Review:
   - `docs/agent-team.md`
   - `docs/project-pulse-plan.md`
   - `docs/project-pulse-design.md`
   - `app/index.html`
   - `app/styles.css`
   - `app/project-data.json`
   - `.vscode/launch.json`
2. Run `.github/scripts/validate-project-pulse.mjs`.
3. Inspect the latest `Project Pulse contract` workflow conclusion.
4. Create or update only `docs/final-handoff.md`.
5. Include exact agent names, app paths, launch name, launch path, lowercase `validation` and `handoff` headings, limitations, and next steps.
6. Open a draft PR titled `Validate and hand off Project Pulse`.

### Acceptance gate

Retain `.github/workflows/4-step.yml` as the final post-merge grader and completion workflow.

### Stage 4 workflow review

- **Boundary:** only `docs/final-handoff.md` may be changed.
- **Scope:** the workflow validates and reports; it does not repair application files or change prior plans.
- **Orchestration:** Orchestrator summarizes actual Planner, Designer, and Coder outputs without claiming unexecuted work.
- **Dependencies:** all prior artifacts and a successful deterministic contract run are required; missing evidence fails the stage.
- **Permissions:** contents, issue context, pull request metadata, and Actions results are read-only; publication uses safe outputs.
- **Tools:** repository reads, Actions-result reads, the validator, and localhost smoke testing only.
- **Safe outputs:** one draft handoff PR and one issue comment.
- **Validation:** the handoff must cite exact files, launch configuration, checks performed, limitations, and next steps.
- **Observability:** artifact includes prior-stage run and PR links, latest contract result, final validation log, handoff requirement matrix, scope check proving only `docs/final-handoff.md` changed, and final PR URL.
- **Retry:** attempt 2 may regenerate only the handoff document after re-running validation. A second failure produces no handoff PR and escalates to a maintainer.
- **Human gate:** a maintainer verifies that validation evidence is current and merges the final PR.
- **Failure behavior:** validation failure produces a blocker comment and no handoff PR.

## Workflow compilation and repository setup

1. Install the extension:

   ```shell
   gh extension install github/gh-aw
   ```

2. Initialize agentic workflow authoring:

   ```shell
   gh aw init
   ```

3. Add the editable `.md` workflows.
4. Compile all workflows:

   ```shell
   gh aw compile
   ```

5. Commit every workflow source file and its generated `.lock.yml`.
6. Run `.github/scripts/validate-agentic-workflow.mjs` against every workflow source and lock pair.
7. Configure `.github/workflows/agentic-observability.yml`, artifact retention, and sanitized run manifests.
8. Configure `.github/workflows/agentic-retry-controller.yml` for two total attempts and human escalation.
9. Create the personal-account inference credential:
   - Create a fine-grained PAT owned by the personal account.
   - Grant only **Account permissions → Copilot Requests: Read**.
   - Store it as the Actions repository secret `COPILOT_GITHUB_TOKEN`.
   - Do not grant `copilot-requests: write` in workflow frontmatter.
10. Create the CI-trigger credential:
   - Create a second fine-grained PAT scoped only to this repository.
   - Grant only **Contents: Read and write**.
   - Store it as the Actions repository secret `GH_AW_CI_TRIGGER_TOKEN`.
   - Use it only as `github-token-for-extra-empty-commit`.
11. Compile the workflows and inspect job-level permissions in every `.lock.yml`.
12. Run each workflow first with `gh aw trial`, then use the real slash command after reviewing its planned permissions, tools, network access, cost ceiling, safe outputs, logs, and artifacts.
13. Confirm an agent-created test PR triggers contract CI through the extra empty commit.
14. Force two controlled failures in a disposable branch to verify one retry, no third execution, and complete human-escalation evidence.
15. Inspect trial evidence with `gh aw logs`, `gh aw audit RUN-ID`, the Actions summary, and the uploaded artifact before enabling the slash command for learners.

## Lesson-content migration

Update the learner-facing files after the workflows are proven:

| Existing file | Change |
|---|---|
| `.github/steps/1-step.md` | Replace Codespaces and Copilot CLI instructions with `/pulse-team`, Actions-run monitoring, PR review, and merge instructions. |
| `.github/steps/2-step.md` | Replace the Planner CLI prompt with `/pulse-plan` and review criteria for the generated plan PR. |
| `.github/steps/3-step.md` | Replace the Orchestrator CLI prompt with `/pulse-design`, merge, `/pulse-build`, contract CI review, and dashboard preview instructions. |
| `.github/steps/4-step.md` | Replace the validation CLI prompt with `/pulse-handoff`, review of validation evidence, and final PR merge. |
| `.github/outline/agent-orchestration-build-your-ai-dream-team-outline.md` | Reframe the exercise as GitHub Agentic Workflows and issue-driven orchestration. |
| `README.md` | Explain that work happens through issue commands, Actions, and pull requests rather than a local CLI session. |
| Codespaces/devcontainer startup files | Remove automatic Copilot CLI startup if it is no longer needed; retain Codespaces only if learners still use it to preview the dashboard. |

## Implementation readiness

This document is sufficient as an architecture and migration plan, but implementation should not begin with all workflows in parallel. The following Phase 0 decisions and specifications must be completed first so implementers do not invent security, retry, observability, or stage-state behavior independently.

### Repository-owner decisions

The repository owner approved the recommended defaults for this implementation. Any later deviation must be recorded in this table and in `docs/agentic-workflows-operations.md`.

| # | Decision | Recommended default | Why it matters | Blocks |
|---|---|---|---|---|
| 1 | Which AI engine strategy should the exercise use? | Use the Copilot engine for every workflow and express Orchestrator, Planner, Designer, and Coder as workflow roles. | Using Claude or Gemini for specific roles requires additional provider keys, billing, network policy, and engine-specific testing. | Exact workflow frontmatter and secrets |
| 2 | Must the new implementation preserve the current per-agent model assignments? | Preserve role names and responsibilities, but do not require the same models unless multi-provider operation is a learning objective. | GitHub Agentic Workflows select an engine per workflow; reproducing every current model assignment increases setup and support burden. | Engine/model configuration |
| 3 | How should learners invoke stages? | Use slash commands on the canonical exercise issue: `/pulse-team`, `/pulse-plan`, `/pulse-design`, `/pulse-build`, and `/pulse-handoff`. | This determines triggers, authorization, stage state, learner instructions, and correlation. | Workflow triggers and lesson prose |
| 4 | Should Stage 3 produce one PR or separate Designer and Coder PRs? | Use a Designer contract PR followed by a Coder implementation PR. | Two PRs provide auditable orchestration and prevent design and implementation ownership from becoming fictional. | Stage 3 workflow structure |
| 5 | Should agent-created PRs trigger CI with a second PAT? | Yes. Use `GH_AW_CI_TRIGGER_TOKEN` only for the extra empty commit. | Without it, PRs created with `GITHUB_TOKEN` do not trigger normal contract checks. | CI and grader integration |
| 6 | What PAT expiration policy should apply? | Use the shortest duration that covers the exercise pilot; revoke both PATs at the end and recreate them for later runs. | This controls credential exposure and learner setup frequency. | Setup documentation and secret rotation |
| 7 | What branch review policy should be required? | Require one human approval, CODEOWNER review for workflow/security files, and all required checks; prohibit workflow self-approval and self-merge. | This defines the human control boundary for agent-generated changes. | Ruleset and CODEOWNERS |
| 8 | Where should human escalation occur? | Add `agentic:needs-human` and a detailed comment to the canonical exercise issue; also comment on an existing stage PR when relevant. | Retry and observability workflows need one authoritative place for blockers and resume actions. | Retry controller and stage-state design |
| 9 | Which failures receive the one automatic retry? | Retry infrastructure, engine, validation, and safe-output failures; do not retry human cancellation, authorization denial, policy violations, or detected scope expansion. | This prevents an automatic retry from bypassing an intentional stop or security control. | Retry classification |
| 10 | How long should evidence artifacts be retained? | Retain pilot artifacts for 30 days, then revisit based on support and audit needs. | Retention affects cost, privacy, incident investigation, and learner support. | Observability configuration |
| 11 | What AI-credit and timeout limits should apply? | Measure Stage 1 trial usage first, then approve explicit per-stage ceilings before enabling learners. Do not inherit the maximum default without review. | This bounds spend and prevents stalled runs. | Runtime policy |
| 12 | What should exist in a fresh learner repository? | Check in deterministic placeholder files instead of relying on `postcreate.sh` to create required targets. | Agentic workflows run in Actions and cannot depend on a learner having opened a Codespace or run a setup script. | Exercise baseline and graders |
| 13 | How long should the Copilot CLI path remain available? | Keep it in a separate fallback branch for one release or pilot cycle, then remove it after the agentic path passes the full test matrix. | This defines rollback and avoids maintaining two learner paths indefinitely. | Cutover plan |
| 14 | Should Stage 4 start automatically after contract CI or require a learner command? | Require `/pulse-handoff` after successful CI. | An explicit final command preserves the learning checkpoint and avoids generating a handoff before the learner reviews the build. | Stage 4 trigger |

Implementation proceeded with the recommended defaults. Any deviation should be reviewed and recorded before the affected workflow is recompiled.

### Phase 0: resolve and document exact configuration

1. **Pin the agentic workflow toolchain**
   - Select and record the supported `gh-aw` version.
   - Define how local and CI compilation install that version.
   - Add a check that fails when lock files were compiled with an unexpected version.
   - Define the update process for preview-breaking changes.

2. **Select the engine and model for every workflow**
   - Decide whether all workflows use Copilot or whether Planner and Designer use different supported engines.
   - Record exact engine and model identifiers accepted by the pinned `gh-aw` version.
   - Set per-stage timeout and AI-credit ceilings rather than leaving them as "appropriate."
   - Define fallback behavior for model unavailability. Fallback must not broaden permissions or exceed the two-attempt policy.

3. **Write the exact frontmatter contract for each workflow**
   - Trigger and authorized actor roles.
   - Concurrency group and cancellation behavior.
   - Read permissions for the agent job.
   - GitHub toolsets.
   - Allowed shell commands.
   - Network policy.
   - Engine configuration and secret references.
   - Safe outputs and their limits.
   - Protected, allowed, and excluded file patterns.
   - Timeout and cost limits.
   - Retry and escalation integration.

4. **Define stage-state storage**
   - Decide how every workflow identifies the canonical exercise issue.
   - Define the stage IDs and allowed transitions.
   - Define how a run discovers the prior stage's merged PR and commit SHA.
   - Define labels such as `agentic:needs-human`, who may remove them, and which workflows must skip while they are present.
   - Define behavior for duplicate slash commands, simultaneous commands, deleted comments, closed issues, and partially merged stages.

5. **Specify the retry controller as a state machine**
   - Define the exact allowlist of workflow names.
   - Define how `github.run_attempt` and prior run IDs are evaluated.
   - Define how the controller locates the tracking issue and first-attempt artifact.
   - Define which conclusions are retryable and which immediately require a human.
   - Define behavior when a safe output partially succeeds, such as a branch existing but PR creation failing.
   - Define how manual reruns interact with the two-total-attempt limit.

6. **Specify observability schemas and retention**
   - Publish JSON schemas for `run-manifest.json`, `scope-check.json`, and `safe-output-result.json`.
   - Choose an artifact retention period.
   - Define maximum log and artifact sizes.
   - Define redaction tests for both PATs and authorization headers.
   - Define stable artifact names and how issue comments link to artifacts.
   - Define the minimum failure evidence required when agent execution ends before normal output generation.

7. **Specify deterministic validators**
   - Define command-line interfaces, exit codes, and JSON output for:
     - `validate-agentic-workflow.mjs`
     - `validate-project-pulse.mjs`
     - `collect-agentic-evidence.mjs`
     - `evaluate-agentic-retry.mjs`
   - Add fixtures for valid and invalid workflows.
   - Ensure validators inspect compiled job permissions, not only Markdown frontmatter.
   - Decide whether validation scripts use only the Node.js standard library or require a pinned dependency manifest.

8. **Configure repository settings**
   - Enable GitHub Actions.
   - Verify repository or account policy permits workflow-requested write scopes.
   - Enable GitHub Actions to create pull requests when using safe outputs with `GITHUB_TOKEN`.
   - Create `COPILOT_GITHUB_TOKEN` and `GH_AW_CI_TRIGGER_TOKEN`.
   - Create the `agentic:needs-human` label.
   - Add CODEOWNERS coverage for workflow sources, lock files, policy scripts, and shared instructions.
   - Add a branch ruleset requiring:
     - Pull requests before merge.
     - CODEOWNER review.
     - `Agentic workflow policy`.
     - `Project Pulse contract` where applicable.
     - Up-to-date branches if required by the exercise.
   - Prevent workflows from approving or merging their own pull requests.

9. **Define CI-trigger behavior**
   - Confirm which workflows run on the safe-output PR's extra empty commit.
   - Prevent the extra commit from creating duplicate agentic runs.
   - Verify the CI-trigger PAT cannot modify protected branches directly.
   - Define behavior when the PAT expires or the extra commit fails.
   - Confirm graders intended only for post-merge `main` pushes do not run prematurely on PR branches.

10. **Define the fresh-exercise baseline**
    - Decide which generated dashboard and documentation files exist in the learner's initial repository.
    - Update `postcreate.sh` or replace it with checked-in placeholders.
    - Ensure agentic workflows behave correctly when files are missing, placeholders exist, or a learner restarts a stage.
    - Separate exercise-author source files from learner-generated deliverables so workflows cannot overwrite grading infrastructure.

11. **Create the end-to-end test matrix**
    - Happy path through all four stages.
    - Missing or expired inference PAT.
    - Missing or expired CI-trigger PAT.
    - Unauthorized slash-command actor.
    - Duplicate or concurrent command.
    - Prompt injection in issue comments and repository files.
    - Out-of-scope file modification.
    - Invalid generated lock file.
    - Validation failure followed by one successful retry.
    - Two failures followed by human escalation and no third run.
    - Partial safe-output failure.
    - Artifact upload failure.
    - Branch protection or CODEOWNER rejection.
    - Human repair and explicit stage resume.

12. **Define cutover and rollback**
    - Run the Copilot CLI and agentic variants in separate test branches or repository copies.
    - Establish success metrics for reliability, duration, cost, and learner completion.
    - Document how to disable slash-command workflows immediately.
    - Preserve a known-good Copilot CLI branch until the agentic implementation passes the complete test matrix.

### Implementation can start when

- Every Phase 0 item has an owner and recorded decision.
- Exact frontmatter examples exist for all agentic workflow sources.
- Repository settings and both PATs pass preflight.
- Policy, retry, observability, and application validators have approved schemas and fixtures.
- A single Stage 1 proof of concept compiles, passes policy, creates a draft PR, triggers CI, uploads evidence, and demonstrates the two-attempt escalation behavior.

After that proof of concept succeeds, Stages 2 through 4 can be implemented from the established templates without redesigning the security and operations model.

## Rollout sequence

1. Add shared instructions, validator, and PR template.
2. Add the agentic workflow policy validator, observability collector, retry evaluator, policy, observability and retry-controller workflows, CODEOWNERS rules, and branch protection before enabling an agentic workflow.
3. Implement and trial Stage 1 in a branch; review its scope, permissions, tools, safe outputs, and lock file.
4. Implement Stage 2 after Stage 1 reliably creates reviewable PRs; repeat the workflow governance review.
5. Implement Stage 3A and 3B, verify that the design contract is consumed by the build workflow, and review both permission boundaries independently.
6. Implement Stage 4, connect it to deterministic validation, and verify that failures cannot publish a success handoff.
7. Update lesson prose only after all workflows and governance checks pass end-to-end in a disposable repository copy.
8. Keep the Copilot CLI instructions for one release behind a feature flag or separate branch, then remove them after the agentic path is stable.

## Definition of done

- Every stage can be invoked from the exercise issue without opening Copilot CLI.
- The personal-account prerequisite uses a fine-grained `COPILOT_GITHUB_TOKEN` with only **Copilot Requests: Read** for inference.
- OAuth tokens, classic PATs, and GitHub App tokens are not used as the Copilot inference credential.
- The Copilot PAT is never reused for GitHub repository writes.
- The read-only agent and write-capable safe-output jobs have separate compiled job-level `GITHUB_TOKEN` permissions.
- A separate `GH_AW_CI_TRIGGER_TOKEN` has only **Contents: Read and write** and is used only to trigger CI with an extra empty commit.
- Every agentic workflow has an editable `.md` source and committed generated `.lock.yml`.
- Every stage includes an explicit review of boundaries, scope, orchestration, triggers, permissions, tools, network access, safe outputs, runtime limits, and human approval.
- Agent jobs are read-only and all repository writes use declared safe outputs.
- `agentic-workflow-policy.yml` validates every workflow source and lock pair.
- Every run emits a sanitized Actions summary, validation logs, structured manifest, changed-file and scope evidence, safe-output results, and a retained artifact linked from the tracking issue.
- Maintainers can inspect workflow history and cost with `gh aw logs` and audit an individual run with `gh aw audit RUN-ID`.
- Failure paths retain enough logs and artifacts to diagnose activation, agent, validation, and safe-output failures without exposing secrets or hidden reasoning.
- Each stage permits exactly two total automated executions: the initial run and one retry.
- A second failure cannot trigger a third automated execution and instead creates a persistent, evidence-linked human escalation.
- Only an authorized human can clear the escalation and explicitly resume the stage.
- CODEOWNERS and branch protection prevent unreviewed workflow or agent-generated changes from reaching `main`.
- Each stage produces a draft pull request for human review.
- Stage 3 preserves separate Designer and Coder outputs.
- Deterministic validation, not model judgment alone, enforces exact exercise requirements.
- Existing lesson graders advance only after the corresponding PR is merged.
- The complete four-stage path succeeds in a clean repository copy.

## References

- [About GitHub Agentic Workflows](https://docs.github.com/en/copilot/concepts/agents/about-github-agentic-workflows)
- [Creating GitHub Agentic Workflows](https://docs.github.com/en/copilot/how-tos/github-agentic-workflows/creating-github-agentic-workflows)
- [GitHub Agentic Workflows documentation](https://github.github.com/gh-aw/)
- [Triggers reference](https://github.github.com/gh-aw/reference/triggers/)
- [Safe outputs reference](https://github.github.com/gh-aw/reference/safe-outputs/)
