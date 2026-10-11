## Congratulations!

You completed **Agent Orchestration: Build Your AI Dream Team**. :tada:

You used issue-driven GitHub Agentic Workflows to plan, design, build, validate, and hand off Mona's Project Pulse dashboard.

## What you learned

You learned how to:

- Use an exercise issue and slash commands as an orchestration control plane.
- Follow agentic workflow runs in GitHub Actions.
- Express Orchestrator, Planner, Designer, and Coder as durable workflow roles.
- Preserve ownership boundaries with separate planning, design, implementation, and handoff artifacts.
- Use a merged Designer contract as an auditable input to Coder.
- Review changed-file scope, deterministic checks, run summaries, and evidence artifacts.
- Understand the boundary between a read-only agent job and controlled safe outputs.
- Keep a human approval and merge gate between stages.
- Preview the generated dashboard from its VS Code launch configuration.
- Recognize the one-retry limit and human-escalation path.

## Orchestration pattern you practiced

1. `/pulse-team` documented the role definitions.
1. `/pulse-plan` assigned ownership and dependencies.
1. `/pulse-design` created the visual and accessibility contract.
1. `/pulse-build` implemented and tested that approved contract.
1. `/pulse-handoff` validated the integrated result and recorded the final handoff.

Each stage consumed approved outputs from earlier stages, stayed within an explicit file boundary, proposed changes in a draft pull request, and required human review before its output became input to the next stage.

## What's next?

- Apply the same issue → workflow → evidence → pull request → human approval pattern to a real feature.
- Add specialist workflows only when they have a clear role, file boundary, and handoff artifact.
- Keep acceptance criteria in deterministic validators instead of relying only on model judgment.
- Review editable workflow sources and their compiled lock files together.
- Use `gh aw logs` and `gh aw audit RUN-ID` to investigate runtime history, usage, and cost.
- Add portable repository rules that require human approval, workflow policy checks, and application contract checks.
- Explore the [GitHub Agentic Workflows documentation](https://github.github.com/gh-aw/).
