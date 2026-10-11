# Exercise outline: Agent Orchestration — Build Your AI Dream Team

## Exercise overview

- **Audience:** Developers familiar with GitHub, pull requests, and GitHub Actions.
- **Experience level:** Intermediate.
- **Estimated duration:** Less than one hour after repository preflight.
- **Primary interface:** The canonical exercise issue.
- **Execution platform:** GitHub Agentic Workflows running in GitHub Actions.
- **Review model:** Agentic run → evidence → draft pull request → human approval → merge.

## Learning objectives

Learners will:

1. Use slash commands to invoke role-specific workflows from an issue.
1. Explain the Orchestrator, Planner, Designer, and Coder responsibilities.
1. Preserve ownership boundaries with durable handoff artifacts.
1. Review Actions summaries, evidence artifacts, file scope, and deterministic checks.
1. Distinguish a read-only agent job from compiler-generated safe-output jobs.
1. Apply a human approval gate between agentic stages.
1. Recognize the one-retry limit and human-escalation path.

## Runtime roles

| Role | Declared model metadata | Workflow responsibility |
|---|---|---|
| Orchestrator | Claude Opus 4.8 | Documents the team and validates the final integrated handoff |
| Planner | Claude Opus 4.8 | Creates ownership, dependency, sequencing, risk, and validation plans |
| Designer | Gemini 3.8 Flash | Creates the durable UX and accessibility contract |
| Coder | GPT-5.5 | Implements and validates the approved plan and design contract |

Every workflow uses the Copilot engine. Model names above are instructional metadata read from `.github/agents/`; the exercise does not require a multi-provider runtime.

## Learner sequence

### Step 1: Document the team

- Command: `/pulse-team`
- Acting role: Orchestrator
- Output: `docs/agent-team.md`
- Scope: one documentation file
- Gate: Step 1 grader after human merge

### Step 2: Plan Project Pulse

- Command: `/pulse-plan`
- Acting role: Planner
- Inputs: merged team document and Project Pulse brief
- Output: `docs/project-pulse-plan.md`
- Gate: Step 2 grader after human merge

### Step 3A: Define the design contract

- Command: `/pulse-design`
- Acting role: Designer
- Input: merged plan
- Output: `docs/project-pulse-design.md`
- Gate: human review and merge before implementation

### Step 3B: Build Project Pulse

- Command: `/pulse-build`
- Acting role: Coder
- Inputs: merged plan and design contract
- Outputs: `app/index.html`, `app/styles.css`, `app/project-data.json`, and `.vscode/launch.json`
- Gates: Project Pulse contract CI, preview, human review, and Step 3 grader after merge

### Step 4: Validate and hand off

- Command: `/pulse-handoff`
- Acting role: Orchestrator
- Inputs: all merged artifacts and contract CI
- Output: `docs/final-handoff.md`
- Gate: Step 4 grader after human merge

## Governance

- Agent jobs receive read-only repository permissions.
- Safe outputs create at most one draft pull request, one triggering-issue comment, and one sanitized evidence artifact per stage.
- File allowlists enforce stage boundaries.
- `COPILOT_GITHUB_TOKEN` authenticates inference only.
- `GH_AW_CI_TRIGGER_TOKEN` pushes only the extra empty commit needed to trigger normal CI.
- No workflow approves or merges its own output.
- A failed stage receives at most one automatic rerun. A second failure adds `agentic:needs-human`.
- Editable workflow Markdown and generated lock files are reviewed together.

## Deterministic checks

- Existing `1-step.yml` through `4-step.yml` retain post-merge lesson progression.
- `project-pulse-contract.yml` validates dashboard and launch requirements on the build pull request.
- `agentic-workflow-policy.yml` validates source policy, script tests, compilation, and lock freshness.
- Evidence is retained for 30 days and summarized by `agentic-observability.yml`.

## Completion

The learner finishes with an approved plan, an auditable Designer-to-Coder handoff, a validated static dashboard, and a final Orchestrator handoff. The final review emphasizes orchestration contracts and human control rather than a single undifferentiated prompt.
