## Step 2: Plan Project Pulse

Great work meeting the agent team! :sparkles:

Now the Planner will turn Mona's Project Pulse brief into an implementation plan. This stage demonstrates a key orchestration practice: agree on ownership, dependencies, and validation before implementation begins.

### Why use a separate planning workflow?

The Planner researches and plans, but it does not build the application. Its output becomes a read-only contract for the Designer and Coder workflows that follow.

A useful orchestration plan must:

- Give each file a single owner.
- Identify work that can safely run in parallel.
- Keep dependent or overlapping work sequential.
- Define evidence that will prove the result is complete.
- Stop at the planning boundary instead of implementing the solution.

### :keyboard: Activity: Create the implementation plan

1. In a new comment on this exercise issue, enter:

   ```text
   /pulse-plan
   ```

1. Wait for the workflow triggered by `/pulse-plan` to start, then open its Actions run.

1. Review the run summary and evidence. Confirm that:

   - The workflow acted as the Planner.
   - It used `docs/agent-team.md`, `.github/project-pulse-brief.md`, and the Planner definition as inputs.
   - It treated those inputs as read-only.
   - Its proposed file scope contains only `docs/project-pulse-plan.md`.
   - Its requirement and ownership checks passed.

1. Open the draft pull request titled **Plan the Project Pulse dashboard**.

1. Review `docs/project-pulse-plan.md`. Make sure the plan includes:

   - The Project Pulse goal.
   - Ordered implementation phases.
   - Orchestrator, Designer, and Coder responsibilities.
   - File assignments for `app/index.html`, `app/styles.css`, `app/project-data.json`, and `.vscode/launch.json`.
   - Single-writer ownership with no overlapping file assignments.
   - Dependencies between planning, design, implementation, and validation.
   - Decisions about sequential and parallel work.
   - Risks, edge cases, and validation expectations.

1. Check that the plan preserves the role boundaries:

   - Planner creates only the plan.
   - Designer owns visual, interaction, responsive, and accessibility decisions.
   - Coder owns implementation of the approved plan and design contract.
   - Orchestrator coordinates the stage sequence and final handoff.

1. Review the **Files changed** tab and checks:

   - Only `docs/project-pulse-plan.md` should change.
   - No application, launch, agent, workflow, or grader file should change.
   - Confirm all required checks pass.

1. When the plan is correct, mark the pull request ready if needed, complete the required human review, and merge it.

1. Return to this issue. The Step 2 grader will check the merged plan and post the next lesson.

> [!IMPORTANT]
> Do not start design or implementation before this plan is merged. Later workflows use the approved plan on the default branch as their ownership and sequencing contract.

<details>
<summary>Having trouble? 🤷</summary><br/>

- If no run starts, post `/pulse-plan` as a standalone comment after the Step 1 pull request is merged.
- If the plan assigns the same file to multiple roles, request a correction before merging.
- If the workflow creates application files, do not merge the pull request; that exceeds the Planner boundary.
- If two attempts fail, follow the `agentic:needs-human` escalation comment rather than posting the command again.
- If the lesson does not advance, confirm `docs/project-pulse-plan.md` is on the default branch and the Step 2 grader passed.

</details>
