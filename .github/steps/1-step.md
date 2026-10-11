## Step 1: Meet the agent team

Welcome to **Agent Orchestration: Build Your AI Dream Team**! :robot:

Mona's team needs a small **Project Pulse** dashboard. You will build it with GitHub Agentic Workflows that run in GitHub Actions.

> [!NOTE]
> A repository administrator must first complete `docs/agentic-workflows-operations.md#one-time-setup`. Step 0 and every slash command are locked until `node .github/scripts/setup-agentic-workflows.mjs --check` passes.

### How will the exercise work?

The exercise issue is your control plane. At each stage, you will:

1. Post a slash command on this issue.
1. Follow the GitHub Actions run.
1. Review the draft pull request and its validation evidence.
1. Approve and merge the work before starting the next stage.

Each workflow acts in a specific role:

- **Orchestrator** coordinates the overall sequence and handoffs.
- **Planner** defines phases, dependencies, and file ownership.
- **Designer** creates an explicit visual and accessibility contract.
- **Coder** implements that approved contract.

The agent job receives read-only repository access. It proposes changes through a controlled safe output, which creates a draft pull request outside the agent runtime. You remain responsible for reviewing and merging every change.

### :keyboard: Activity: Document the agent team

1. In a new comment on this exercise issue, enter:

   ```text
   /pulse-team
   ```

1. Wait for the workflow triggered by `/pulse-team` to start.

1. Open the workflow run from the link posted on this issue, or select the **Actions** tab and open the newest run.

1. Review the run summary. Confirm that:

   - The workflow acted as the Orchestrator.
   - It read the four definitions in `.github/agents/`.
   - Its proposed file scope contains only `docs/agent-team.md`.
   - Validation completed successfully.
   - The run requested one draft pull request and one issue comment through safe outputs.

1. Open the draft pull request titled **Document the Project Pulse agent team**.

1. Review `docs/agent-team.md`. Make sure it:

   - Includes Orchestrator, Planner, Designer, and Coder.
   - Uses the model names found in the current agent frontmatter.
   - Explains each agent's responsibility.
   - References each source file in `.github/agents/`.
   - Explains how the roles work together on Project Pulse.
   - Does not claim that Planner, Designer, or Coder ran during this stage. The Orchestrator inspected their definitions.

1. Review the pull request's **Files changed** tab and checks:

   - Only `docs/agent-team.md` should change.
   - Do not accept changes to agent definitions, workflows, graders, or unrelated files.
   - Confirm all required checks pass.

1. When the pull request is correct, mark it ready for review if needed, complete the required human review, and merge it.

1. Return to this issue. The Step 1 grader will check the merged file and post the next lesson.

> [!IMPORTANT]
> Do not post `/pulse-plan` until the team pull request is merged. Each stage reads the approved output from the previous stage on the default branch.

<details>
<summary>Having trouble? 🤷</summary><br/>

- If no run starts, run `node .github/scripts/setup-agentic-workflows.mjs --check`, then confirm that you posted `/pulse-team` as a standalone issue comment and that you have write access to the repository.
- If the run fails once, the retry controller may rerun it one time.
- If a second attempt fails, look for the `agentic:needs-human` label and the evidence links in the escalation comment. A maintainer must resolve the blocker before the stage is invoked again.
- If the pull request changes more than `docs/agent-team.md`, do not merge it.
- If the lesson does not advance, confirm the pull request was merged into the default branch and the Step 1 grader passed.

</details>
