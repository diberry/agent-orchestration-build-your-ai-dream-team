---
description: "Project Pulse artifact, validation, and handoff requirements."
applyTo: "app/**,docs/**,.vscode/launch.json"
---

# Project Pulse requirements

## Documentation

- `docs/agent-team.md` identifies Orchestrator, Planner, Designer, and Coder from their current agent frontmatter.
- `docs/project-pulse-plan.md` defines phases, single-writer ownership, dependencies, parallel work, risks, and validation.
- `docs/project-pulse-design.md` is the Designer-owned contract for hierarchy, class hooks, responsive behavior, accessibility, and UI states.
- `docs/final-handoff.md` reports actual merged work and current validation evidence without repairing earlier artifacts.

## Dashboard

- `app/index.html` has the exact title `Project Pulse`, references `styles.css` and `project-data.json`, and renders data-driven `.project-card` elements.
- Each project card visibly presents `status`, `recentActivity`, and `priority`.
- `app/styles.css` defines `.dashboard` and `.project-card`, uses `border-radius` and `box-shadow`, and provides responsive, focus-visible, contrast, and reduced-motion behavior.
- `app/project-data.json` is strict JSON with a top-level `projects` array. Every project contains `name`, `owner`, `status`, `recentActivity`, and `priority`.
- `.vscode/launch.json` is strict JSON. The launch configuration is named `Run Project Pulse Dashboard`, runs `python3 -m http.server 5500` from `${workspaceFolder}/app`, and opens `http://localhost:%s/index.html`.

## Validation

- Run `node .github/scripts/validate-project-pulse.mjs`.
- For build and handoff stages, serve `app/` on port 5500 and request `/index.html`, `/styles.css`, and `/project-data.json`.
- Stop the server after smoke testing.
- A validation failure is a blocker, not permission to change an out-of-scope file.
