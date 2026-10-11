---
metadata:
  name: project-pulse-agentic
current_compilation:
  id: fixture-valid
---

# Project Pulse agentic workflow

```yaml
name: Project Pulse agentic workflow
on:
  issue_comment:
    types: [created]

permissions:
  contents: read
  issues: read
  pull-requests: read

jobs:
  project-pulse:
    if: contains(github.event.comment.body, '/project-pulse')
    runs-on: ubuntu-latest
    env:
      CI_TRIGGER_TOKEN: ${{ secrets.CI_TRIGGER_TOKEN }}
      MAX_SAFE_OUTPUT_BYTES: 12000
      MAX_SAFE_OUTPUT_LINES: 300
    steps:
      - name: Request Copilot coding agent
        uses: github/copilot-coding-agent@v1
        with:
          engine: copilot
          draft: true
          allowed-files:
            - app/index.html
            - app/styles.css
            - app/project-data.json
            - .vscode/launch.json
```
