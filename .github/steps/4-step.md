## Step 4: Validate and hand off the dashboard

You built Project Pulse. Now complete the orchestration loop. :rocket:

The Orchestrator will review the approved outputs from Planner, Designer, and Coder, rerun deterministic validation, and propose a final handoff. It reports what actually happened; it must not claim work that has no merged artifact or passing evidence.

### :keyboard: Activity: Validate and create the handoff

1. Confirm that the build pull request is merged and the **Project Pulse contract** check passed.

1. In a new comment on this exercise issue, enter:

   ```text
   /pulse-handoff
   ```

1. Wait for the workflow triggered by `/pulse-handoff` to start, then open its Actions run.

1. Review the run summary and evidence. Confirm that:

   - The workflow acted as Orchestrator.
   - It read `docs/agent-team.md`, `docs/project-pulse-plan.md`, `docs/project-pulse-design.md`, the app files, and `.vscode/launch.json`.
   - It found a successful **Project Pulse contract** result.
   - It reran deterministic validation instead of relying only on earlier claims.
   - Its proposed file scope contains only `docs/final-handoff.md`.
   - Validation and safe-output reporting completed successfully.

1. Open the draft pull request titled **Validate and hand off Project Pulse**.

1. Review `docs/final-handoff.md`. Make sure it includes:

   - The exact agent names Orchestrator, Planner, Designer, and Coder.
   - The contribution made by each role.
   - The approved plan and Designer contract used by Coder.
   - The exact paths `app/index.html`, `app/styles.css`, and `app/project-data.json`.
   - The exact launch path `.vscode/launch.json`.
   - The exact launch name **Run Project Pulse Dashboard**.
   - A heading containing the lowercase word `validation`.
   - A heading containing the lowercase word `handoff`.
   - The checks that ran and their actual outcomes.
   - Current limitations, risks, and next steps.

1. Compare the handoff claims with the merged files and run evidence. Do not accept claims about agents, validation, or features that are not supported by those sources.

1. Review the **Files changed** tab and checks:

   - Only `docs/final-handoff.md` should change.
   - The workflow must not repair app files, revise the plan or design, or modify workflow infrastructure during this stage.
   - Confirm all required checks pass.

1. When the handoff is accurate, mark the pull request ready if needed, complete the required human review, and merge it.

1. Return to this issue. The Step 4 grader will validate the merged handoff and complete the exercise.

<details>
<summary>Having trouble? 🤷</summary><br/>

- Post `/pulse-handoff` only after the build PR is merged and contract CI passes.
- If validation fails, the workflow should post a blocker and must not publish a success-shaped handoff.
- If the handoff PR changes anything except `docs/final-handoff.md`, do not merge it.
- If a second attempt fails, follow the `agentic:needs-human` escalation comment and evidence links.
- If the exercise does not complete, confirm the handoff PR was merged into the default branch and the Step 4 grader passed.

</details>
