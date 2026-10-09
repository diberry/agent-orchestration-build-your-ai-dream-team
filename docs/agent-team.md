# Project Pulse agent team

Mona's Project Pulse dashboard will be built by four custom agents defined in `.github/agents/`.

| Agent | Model | Responsibility | Source |
|---|---|---|---|
| Orchestrator | Claude Opus 4.8 | Coordinates the specialist agents, divides the work into safe phases, assigns nonoverlapping file scopes, verifies the integrated result, and reports the final outcome. | `.github/agents/orchestrator.agent.md` |
| Planner | Claude Opus 4.8 | Researches the repository and relevant documentation, identifies dependencies and edge cases, and produces an ordered implementation and validation plan without writing code. | `.github/agents/planner.agent.md` |
| Designer | Gemini 3.8 Flash | Defines the dashboard's UI and UX, including accessibility, information hierarchy, responsive behavior, project cards, status badges, priorities, spacing, and visual polish. | `.github/agents/designer.agent.md` |
| Coder | GPT-5.5 | Implements the assigned dashboard files with clear, testable code, explicit errors, and repository-consistent patterns; it also validates the result and can configure the runnable preview. | `.github/agents/coder.agent.md` |

## How the team will build Project Pulse

The Orchestrator will first ask the Planner to turn Mona's dashboard brief into an implementation plan with file assignments, dependencies, parallel work, edge cases, and validation expectations. It will then delegate separate, nonoverlapping scopes to the Designer and Coder: the Designer will shape the polished, accessible dashboard experience, while the Coder will implement the static application and its launch support. Work with dependencies or overlapping files will run sequentially. Finally, the Orchestrator will verify that the integrated Project Pulse dashboard is coherent, runnable, and aligned with the plan before reporting the handoff.
