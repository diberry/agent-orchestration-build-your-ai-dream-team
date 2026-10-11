#!/usr/bin/env bash
set -euo pipefail

echo "Setting up Agent Orchestration: Build Your AI Dream Team..."

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI was not found. The dev container image should include gh."
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 is required to preview Project Pulse."
  exit 1
fi

echo ""
echo "Setup complete."
echo "Repository owners: follow docs/agentic-workflows-operations.md#one-time-setup."
echo "Then run: node .github/scripts/setup-agentic-workflows.mjs --check"
echo "Use the exercise issue for slash commands and workflow status."
echo "Use this Codespace only when a lesson asks you to preview the dashboard."
