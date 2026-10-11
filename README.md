# Agent Orchestration: Build Your AI Dream Team

<img src="https://octodex.github.com/images/Professortocat_v2.png" align="right" height="200px" alt="Mona the Octocat" />

Build Mona's Project Pulse dashboard by coordinating specialist roles through **GitHub Agentic Workflows**.

## Repository setup

Before learners begin, a repository administrator must complete the one-time setup:

1. Create the two least-privilege fine-grained PATs described in the [operator setup guide](docs/agentic-workflows-operations.md#one-time-setup).
1. From the default branch, run:

   ```shell
   node .github/scripts/setup-agentic-workflows.mjs --configure
   ```

The script prompts only for missing secret values and configures everything else. The exercise start workflow and all five slash commands remain locked until setup passes. Rerun the read-only check at any time with:

```shell
node .github/scripts/setup-agentic-workflows.mjs --check
```

## How the exercise works

The exercise issue is the control plane:

1. Post the slash command from the current lesson.
1. Follow the GitHub Actions run.
1. Review its evidence and draft pull request.
1. Merge approved work to unlock the next lesson.

The sequence is `/pulse-team`, `/pulse-plan`, `/pulse-design`, `/pulse-build`, and `/pulse-handoff`. Planner, Designer, Coder, and Orchestrator produce durable artifacts with explicit ownership boundaries. Agent jobs have read-only repository permissions; compiler-generated safe-output jobs publish draft pull requests, issue comments, and evidence for human review.

Open the exercise issue to begin:

[![Go to Exercise](https://img.shields.io/badge/Go%20to%20Exercise-%E2%86%92-1f883d?style=for-the-badge&logo=github&labelColor=197935)](https://github.com/diberry/agent-orchestration-build-your-ai-dream-team/issues/1)

GitHub Agentic Workflows are in public preview. See [GitHub Agentic Workflows operations](docs/agentic-workflows-operations.md) for token scopes, exactly what the setup script changes, verification, and troubleshooting.
