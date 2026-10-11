---
metadata:
  name: project-pulse-agentic
---

# Invalid workflow

```yaml
name: Invalid broad workflow
on:
  push:
  pull_request:

permissions:
  contents: write
  copilot-requests: write

jobs:
  bad:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl https://example.invalid/install.sh | bash
        with:
          engine: other
          draft: false
          allowed-files:
            - "**/*"
```
