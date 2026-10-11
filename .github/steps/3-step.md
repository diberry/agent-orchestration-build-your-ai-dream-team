## Step 3: Design and build the Project Pulse dashboard

Nice! You have an approved plan. :tada:

This stage uses two workflows and two human-reviewed pull requests:

1. Designer produces a durable design contract.
1. Coder implements that contract.

This separation makes the handoff auditable. The Coder cannot silently invent or replace Designer decisions, and the exercise can verify that real orchestration occurred.

### Activity 1: Create the Designer contract

1. In a new comment on this exercise issue, enter:

   ```text
   /pulse-design
   ```

1. Wait for the workflow triggered by `/pulse-design` to start, then open its Actions run.

1. Review the run summary and evidence. Confirm that:

   - The workflow acted as Designer.
   - It read the approved plan as a read-only input.
   - Its proposed file scope contains only `docs/project-pulse-design.md`.
   - It did not implement HTML, CSS, JSON, or launch configuration.

1. Open the draft pull request for the Project Pulse design contract.

1. Review `docs/project-pulse-design.md`. Make sure it defines:

   - Information hierarchy and project-card content.
   - `.dashboard` and `.project-card` class hooks.
   - Status and priority treatments.
   - Responsive behavior.
   - Keyboard focus and readable contrast expectations.
   - Reduced-motion guidance.
   - Loading, empty, and error states.
   - Accessibility and design validation notes.

1. Review the **Files changed** tab and checks:

   - Only `docs/project-pulse-design.md` should change.
   - No app or launch files should be present.
   - Confirm all required checks pass.

1. When the contract is correct, mark the pull request ready if needed, complete the required human review, and merge it.

> [!IMPORTANT]
> Merge the Designer contract before posting `/pulse-build`. The build workflow reads the merged contract from the default branch and must report a blocker instead of overriding it.

### Activity 2: Implement the approved design

1. After the design pull request is merged, return to this issue and enter:

   ```text
   /pulse-build
   ```

1. Wait for the workflow triggered by `/pulse-build` to start, then open its Actions run.

1. Review the run summary, validation log, and HTTP smoke-test evidence. Confirm that:

   - The workflow acted as Coder.
   - It read both `docs/project-pulse-plan.md` and `docs/project-pulse-design.md`.
   - It changed only `app/index.html`, `app/styles.css`, `app/project-data.json`, and `.vscode/launch.json`.
   - The Project Pulse validator passed.
   - Requests for `/index.html`, `/styles.css`, and `/project-data.json` succeeded.
   - The preview server was stopped after validation.

1. Open the draft pull request titled **Build the Project Pulse dashboard**.

1. Review the implementation. Make sure:

   - `app/index.html` uses the exact title `Project Pulse`.
   - `app/index.html` references `styles.css` and `project-data.json`.
   - Project data renders as visible cards with the `project-card` class.
   - Each card shows `status`, `recentActivity`, and `priority`.
   - `app/styles.css` includes `.dashboard`, `.project-card`, `border-radius`, `box-shadow`, and responsive behavior.
   - `app/project-data.json` has a top-level `projects` array.
   - Every project has `name`, `owner`, `status`, `recentActivity`, and `priority`.
   - `.vscode/launch.json` is strict JSON.
   - The launch configuration is named **Run Project Pulse Dashboard**.
   - It runs `python3 -m http.server 5500` from the `app` directory.
   - It opens `http://localhost:%s/index.html`, not a directory listing.
   - The implementation follows the approved Designer contract.

1. Open the pull request's **Checks** tab and confirm the **Project Pulse contract** check passes.

1. Review the **Files changed** tab. Do not merge if the Coder changed the plan, design contract, workflows, graders, agent definitions, or other out-of-scope files.

### Activity 3: Preview the dashboard

1. Create or open a Codespace on the build pull request branch. If you reuse a Codespace, use the branch selector to check out the pull request branch before continuing.

1. In VS Code, open **Run and Debug**.

1. Select **Run Project Pulse Dashboard**, then select the green play button.

1. Confirm the browser opens `index.html` and displays the Project Pulse cards, statuses, recent activity, and priorities.

1. Check the layout at a narrow viewport and verify that keyboard focus remains visible.

1. Stop the preview server.

1. Return to the pull request. When the implementation, evidence, preview, and required checks are correct, mark it ready if needed, complete the required human review, and merge it.

1. Return to this issue. The Step 3 grader will check the merged application and post the next lesson.

<details>
<summary>Having trouble? 🤷</summary><br/>

- Do not post `/pulse-build` until `docs/project-pulse-design.md` is merged.
- If the design PR changes app files, or the build PR changes the design contract, do not merge it.
- If **Project Pulse contract** fails, use its log and the workflow evidence to review the failure. Do not bypass the check.
- If an agentic workflow fails twice, follow the `agentic:needs-human` escalation comment. There should not be a third automatic attempt.
- If the preview opens a directory listing, verify that the launch URL ends in `/index.html` and the working directory is `app`.
- If the lesson does not advance, confirm the build PR was merged and the Step 3 grader passed.

</details>
