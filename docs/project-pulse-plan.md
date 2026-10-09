# Project Pulse dashboard - implementation plan

## Summary

Mona's team needs a lightweight, static **Project Pulse** dashboard that lets contributors quickly understand the team's projects at a glance: which projects are active, who owns each, current status, recent activity, and priority or risk, with a short contributor-friendly summary and a polished, card-based visual layout.

This plan turns `.github/project-pulse-brief.md` into an ordered, conflict-free set of tasks that the Orchestrator can delegate to the **Designer** and **Coder** agents. It defines exact file ownership, dependencies, parallel versus sequential work, edge cases, validation expectations, and resolved open questions.

The deliverable is a small static app plus a VS Code launch configuration:

- `app/index.html`
- `app/styles.css`
- `app/project-data.json`
- `.vscode/launch.json`

No build step, framework, or backend is required. Data is loaded client-side from `app/project-data.json` and rendered as project cards.

## Goal and scope

### Goal

Deliver a polished, accessible, static Project Pulse dashboard that renders project cards from local JSON data and runs from the VS Code **Run Project Pulse Dashboard** launch configuration, showing the dashboard UI instead of a server directory listing.

### In scope

- A static frontend with the exact page title **Project Pulse**.
- Visible project cards rendered from a top-level `projects` array in `app/project-data.json`.
- Each card surfaces `name`, `owner`, `status`, `recentActivity`, and `priority`.
- Deterministic CSS hooks: a `.dashboard` selector and a `.project-card` selector, with `border-radius`, `box-shadow`, and a responsive layout.
- Accessible, readable markup with semantic landmarks, heading hierarchy, and status and priority treatments that use sufficient contrast and non-color cues.
- A strict JSON `.vscode/launch.json` with a configuration named **Run Project Pulse Dashboard** that serves from `app/` and opens `index.html`.

### Out of scope

- A backend, database, authentication, or server-side rendering.
- Build tooling, bundlers, frameworks, or npm dependencies.
- Live GitHub data integration; data is static local JSON for this exercise.
- Editing lesson content, agent definitions, `docs/agent-team.md`, or `.vscode/tasks.json`.
- Git operations, which remain learner-controlled.

## Ordered implementation steps

| Step | Task | Owner | Files | Depends on |
|---|---|---|---|---|
| 1 | Define the data contract and seed sample data | Coder | `app/project-data.json` | None |
| 2 | Define the visual design specification and CSS hooks | Designer | Design decisions; no file edits yet | None |
| 3 | Build the HTML structure and client-side rendering logic | Coder | `app/index.html` | Steps 1 and 2 |
| 4 | Implement the stylesheet | Designer | `app/styles.css` | Steps 2 and 3 |
| 5 | Create the VS Code launch configuration | Coder | `.vscode/launch.json` | Step 3 |
| 6 | Perform integrated validation | Orchestrator | All deliverable files, read-only | Steps 3, 4, and 5 |

### Step details

1. **Create `app/project-data.json`.** Add a top-level `projects` array. Each object must include `name`, `owner`, `status`, `recentActivity`, and `priority`. Seed four to six realistic, contributor-friendly sample projects spanning varied statuses and priorities. Keep the file valid strict JSON with no comments or trailing commas.

2. **Define the design specification.** The Designer defines information hierarchy, card anatomy, status badge and priority treatments, spacing, color and contrast, typography, and responsive breakpoints. The Designer and Coder agree on the deterministic class contract before markup is written: `.dashboard`, `.project-card`, and field hooks such as `.project-card__title`, `.status-badge`, and `.priority`.

3. **Create `app/index.html`.** Use the exact document title and visible heading **Project Pulse**. Link `styles.css`, load `project-data.json` through a relative path, and render one visible `.project-card` for each project. Every card shows `name`, `owner`, `status`, `recentActivity`, and `priority`. Use semantic landmarks and a logical heading order. Show a visible, accessible error or empty state instead of a blank page when data cannot be loaded or contains no projects.

4. **Create `app/styles.css`.** Implement the Designer's specification using the agreed hooks. Include `.dashboard` and `.project-card` selectors, with card `border-radius` and `box-shadow`. Add readable spacing, strong visual hierarchy, responsive reflow, and status and priority treatments that do not rely on color alone. The Designer must not modify the HTML or data files during this step.

5. **Create `.vscode/launch.json`.** Use strict JSON without comments. Define a configuration named exactly **Run Project Pulse Dashboard**. Serve from `${workspaceFolder}/app` and open `index.html` so the browser shows the dashboard instead of a directory listing.

6. **Validate the integrated result.** The Orchestrator verifies that all files work together, required selectors, data keys, names, and paths match the contract, and the launch configuration opens the rendered dashboard. Validation is read-only unless a specific defect is delegated back to the file owner.

## File assignments and ownership boundaries

| File | Primary owner | Responsibility |
|---|---|---|
| `app/project-data.json` | **Coder** | Define the data contract and create representative project records. |
| `app/index.html` | **Coder** | Build semantic markup, load the JSON data, render project cards, and handle errors and empty data. |
| `app/styles.css` | **Designer** | Implement the complete visual system, accessibility treatments, and responsive layout. |
| `.vscode/launch.json` | **Coder** | Configure a deterministic runnable preview that serves `app/` and opens `index.html`. |

### Designer responsibilities

- Own the Project Pulse visual and UX direction and the entire `app/styles.css` file.
- Define the CSS class contract that the Coder uses in `app/index.html`.
- Ensure readable typography, logical information hierarchy, sufficient contrast, non-color status cues, and responsive behavior.
- Report design decisions, tradeoffs, and validation recommendations.
- Do not edit `app/index.html`, `app/project-data.json`, or `.vscode/launch.json`.

### Coder responsibilities

- Own `app/project-data.json`, `app/index.html`, and `.vscode/launch.json`.
- Implement semantic markup using the Designer's agreed class hooks.
- Implement deterministic client-side data loading, rendering, error handling, and an empty state.
- Create the strict JSON launch configuration using the required name, working directory, and target page.
- Validate data parsing, rendering, paths, and launch behavior before reporting completion.
- Do not edit `app/styles.css` or `.vscode/tasks.json`.

### Orchestrator and Planner responsibilities

- The **Planner** produces this implementation plan and does not implement the dashboard.
- The **Orchestrator** delegates nonoverlapping file scopes, sequences dependent work, integrates the results, and performs final read-only validation.

## Dependencies

- `app/index.html` depends on the data shape established in `app/project-data.json`.
- `app/index.html` also depends on the Designer's class-hook contract.
- `app/styles.css` depends on the finalized class hooks in `app/index.html`.
- `.vscode/launch.json` depends on `app/index.html` existing at the configured target.
- Integrated validation depends on all four deliverable files being complete.
- The design specification is the shared contract that prevents HTML and CSS drift and must be agreed before implementation begins.

## Parallel and sequential work decisions

### Work that can run in parallel

- The Coder can create `app/project-data.json` while the Designer defines the visual specification because the tasks have no shared file and no data dependency.
- After the CSS class contract is fixed, the Designer can refine styling decisions while the Coder writes `app/index.html`, provided neither agent edits the other's assigned file.
- Once `app/index.html` exists, the Designer can implement `app/styles.css` while the Coder creates `.vscode/launch.json`; these tasks have separate files and no write conflicts.

### Work that must run sequentially

- The Coder must receive the data contract and class-hook contract before finalizing `app/index.html`.
- The Designer must receive finalized markup hooks before completing `app/styles.css`.
- `.vscode/launch.json` should be finalized after `app/index.html` exists so the target page can be verified.
- Integrated validation runs last because it requires all artifacts.

### Conflict prevention

Each deliverable has one writer. The Coder owns the HTML, JSON data, and launch configuration; the Designer owns the stylesheet. The class-hook contract is agreed before concurrent implementation, avoiding overlapping edits and inconsistent assumptions.

## Edge cases and risks

- **Directory listing instead of the dashboard:** Serve from `app/` and explicitly open `index.html`.
- **Data fetch blocked from `file://`:** Run the dashboard through the configured HTTP server rather than opening the file directly.
- **Port already in use:** Stop an existing preview server before relaunching or report the conflict clearly.
- **Local Python unavailable:** The launch command assumes the exercise environment provides Python; report an explicit setup error if it does not.
- **Invalid JSON:** Comments or trailing commas can break parsing. Keep `app/project-data.json` strict and show a visible load error.
- **Missing or empty `projects` array:** Render an accessible empty state.
- **Missing project fields:** Render a safe placeholder instead of throwing or displaying `undefined`.
- **Color-only meaning:** Pair status and priority colors with readable text or other non-color cues.
- **CSS hook drift:** Validate that `.dashboard`, `.project-card`, and agreed field hooks match between HTML and CSS.
- **Responsive overflow:** Verify cards reflow without horizontal scrolling on narrow viewports.

## Validation expectations

### Content and markup

- `app/index.html` contains the exact title and visible heading **Project Pulse**.
- It links `styles.css` and loads `project-data.json` with valid relative paths.
- It uses semantic landmarks and a logical heading hierarchy.
- One visible `.project-card` is rendered per project.
- Every card displays `name`, `owner`, `status`, `recentActivity`, and `priority`.
- Loading errors and empty data produce clear, accessible messages.

### Data

- `app/project-data.json` parses as valid JSON.
- It contains a top-level `projects` array.
- Each project object contains `name`, `owner`, `status`, `recentActivity`, and `priority`.
- The dashboard renders cards from the JSON data rather than duplicating records in HTML.

### Styling, responsiveness, and accessibility

- `app/styles.css` includes `.dashboard` and `.project-card`.
- Project cards include `border-radius` and `box-shadow`.
- The first view clearly looks like a polished dashboard with readable spacing, hierarchy, status badges, and priority treatment.
- Cards reflow at narrow widths without horizontal overflow.
- Status and priority information is understandable without relying on color alone.
- Text contrast, heading structure, and focus visibility meet accessibility expectations.

### VS Code launch configuration

- `.vscode/launch.json` exists and is strict JSON without comments.
- It includes a configuration named exactly **Run Project Pulse Dashboard**.
- Its working directory is `${workspaceFolder}/app`.
- It serves the app over HTTP and opens `index.html`.
- Running it displays the Project Pulse UI rather than a directory listing.
- The preview server can be stopped cleanly after validation.

## Open questions and defaults

- **How many sample projects?** Use four to six records with varied statuses and priorities.
- **Framework or vanilla JavaScript?** Use vanilla HTML, CSS, and JavaScript; no dependency or build system is required.
- **How should the JSON be consumed?** Load `project-data.json` client-side over the configured HTTP preview.
- **How should priority and risk be represented?** Use the required `priority` field as the visible priority or risk signal with a clear text label.
- **Should the browser open automatically?** Yes. The launch configuration should open `index.html` when the preview server is ready.

No blocking questions remain because the project brief, lesson requirements, and custom agent definitions establish the required implementation contract.
