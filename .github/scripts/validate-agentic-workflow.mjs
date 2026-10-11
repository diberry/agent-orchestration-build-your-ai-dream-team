#!/usr/bin/env node
import path from "node:path";
import { createReporter, EXIT, fileExists, findFiles, parseFlags, readText } from "./lib/common.mjs";

const MAX_SAFE_OUTPUT_BYTES = 20000;
const MAX_SAFE_OUTPUT_LINES = 500;

function usage() {
  return [
    "Usage: node .github/scripts/validate-agentic-workflow.mjs [--root PATH] [--json] [workflow.md ...]",
    "",
    "When no workflow paths are supplied, discovers project-pulse-*.md under --root.",
    "Each workflow markdown file must have a paired .lock.yml file with metadata and current compilation indicators.",
    "",
    "Exit codes: 0 passed, 1 validation failed, 2 usage error."
  ].join("\n");
}

function discoverMarkdown(root) {
  return findFiles(root, (filePath) => /^project-pulse-.*\.md$/i.test(path.basename(filePath)));
}

function stripMarkdownFences(text) {
  return text.replace(/```[a-zA-Z0-9_-]*\n([\s\S]*?)```/g, "$1");
}

function frontmatter(text) {
  const match = text.match(/^---\s*\n([\s\S]*?)\n---/);
  return match ? match[1] : "";
}

function lockPathFor(markdownPath) {
  return markdownPath.replace(/\.md$/i, ".lock.yml");
}

function hasReadOnlyPermissions(text) {
  const permissionsMatch = text.match(/permissions\s*:\s*\n((?:[ \t]+[A-Za-z0-9_-]+\s*:\s*[A-Za-z-]+\s*(?:#.*)?\n?)+)/i);
  if (!permissionsMatch) {
    return false;
  }
  const block = permissionsMatch[1];
  const entries = [...block.matchAll(/^\s*([A-Za-z0-9_-]+)\s*:\s*([A-Za-z-]+)/gm)];
  return entries.length > 0 && entries.every((entry) => entry[2].toLowerCase() === "read");
}

function parseNumericSetting(text, names) {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = text.match(new RegExp(`${escaped}\\s*[:=]\\s*["']?(\\d+)`, "i"));
    if (match) {
      return Number(match[1]);
    }
  }
  return undefined;
}

function explicitAllowedFiles(text) {
  const blockMatch = text.match(/allowed-files\s*:\s*\n((?:[ \t]+-[^\n]+\n?)+)/i) ?? text.match(/allowed_files\s*:\s*\n((?:[ \t]+-[^\n]+\n?)+)/i);
  if (blockMatch) {
    return [...blockMatch[1].matchAll(/-\s*["']?([^"'\n#]+)["']?/g)]
      .map((item) => item[1].trim())
      .filter(Boolean);
  }
  const inlineMatch = text.match(/allowed-files\s*:\s*\[([^\]]+)\]/i) ?? text.match(/allowed_files\s*:\s*\[([^\]]+)\]/i);
  if (!inlineMatch) {
    return [];
  }
  return inlineMatch[1]
    .split(",")
    .map((item) => item.replace(/["']/g, "").trim())
    .filter(Boolean);
}

function isBroadAllowedFile(value) {
  const normalized = value.replaceAll("\\", "/").trim();
  return normalized === "." ||
    normalized === "/" ||
    normalized === "./" ||
    normalized === "*" ||
    normalized === "**" ||
    normalized === "**/*" ||
    normalized.endsWith("/**") ||
    normalized.includes("..");
}

function topLevelBlock(text, key) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((line) => new RegExp(`^${key}\\s*:`).test(line));
  if (start === -1) {
    return "";
  }
  const block = [lines[start]];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^[A-Za-z0-9_-]+\s*:/.test(line)) {
      break;
    }
    block.push(line);
  }
  return block.join("\n");
}

function containsIssueOnlySlashTrigger(text) {
  const header = frontmatter(text) || text;
  const onBlock = topLevelBlock(header, "on") || header;
  const hasIssueComment = /\bissue_comment\b/i.test(onBlock) || /\bissue_comment\b/i.test(text) || /\bevents\s*:\s*\[[^\]]*\bissues?\b[^\]]*\]/i.test(onBlock);
  const hasSlashTrigger = text.includes("/project-pulse") ||
    /slash[-_\s]?trigger\s*:\s*["']?\/[A-Za-z0-9_-]+/i.test(text) ||
    /\bslash_command\s*:[\s\S]{0,160}\bname\s*:\s*[A-Za-z0-9_-]+/i.test(header);
  const forbiddenTriggers = /\b(pull_request|pull_request_target|push|workflow_dispatch|schedule)\s*:/i.test(onBlock) ||
    /\bon:\s*\[[^\]]*(pull_request|pull_request_target|push|workflow_dispatch|schedule)/i.test(onBlock) ||
    /\bevents\s*:\s*\[[^\]]*\bpull_request\b/i.test(onBlock);
  return hasIssueComment && hasSlashTrigger && !forbiddenTriggers;
}

function hasCopilotEngine(text) {
  return /\bengine\s*:\s*["']?(?:copilot|github-copilot|copilot-coding-agent)\b/i.test(text) ||
    /\bmodel\s*:\s*["']?(?:copilot|github-copilot|copilot-coding-agent)\b/i.test(text);
}

function hasDraftPr(text) {
  return /\bdraft\s*:\s*true\b/i.test(text) || /\bdraft-pr\s*:\s*true\b/i.test(text) || /\bdraft_pull_request\s*:\s*true\b/i.test(text);
}

function hasCiTriggerSecret(text) {
  return /secrets\.CI_TRIGGER_TOKEN\b/.test(text) || /\bCI_TRIGGER_TOKEN\b/.test(text) || /\bGH_AW_CI_TRIGGER_TOKEN\b/.test(text);
}

function hasBroadBashOrNetwork(text) {
  const patterns = [
    /\bbash\s+-c\b/i,
    /\bshell\s*:\s*bash\b/i,
    /\brun\s*:\s*\|[\s\S]{0,600}\b(curl|wget|Invoke-WebRequest|iwr|Invoke-RestMethod|irm)\b/i,
    /\b(curl|wget)\s+https?:\/\//i,
    /\bgh\s+api\b/i,
    /\bnpm\s+(?:install|add)\b/i,
    /\bpip\s+install\b/i,
    /\b(?:http|https):\/\/(?!localhost\b)/i
  ];
  return patterns.some((pattern) => pattern.test(text));
}

function validateLock(markdownPath, reporter) {
  const lockPath = lockPathFor(markdownPath);
  const relative = path.basename(lockPath);
  if (!fileExists(lockPath)) {
    reporter.fail(`${markdownPath}.lock.exists`, `paired lock file is missing: ${relative}.`);
    return;
  }
  reporter.pass(`${markdownPath}.lock.exists`, `paired lock file exists: ${relative}.`);
  const lockText = readText(lockPath);
  if (/\bmetadata\s*:/i.test(lockText)) {
    reporter.pass(`${markdownPath}.lock.metadata`, "lock file contains metadata.");
  } else {
    reporter.fail(`${markdownPath}.lock.metadata`, "lock file must contain metadata.");
  }
  if (/\b(current_compilation|current-compilation|currentCompilation)\s*:/i.test(lockText) || /\bcompiler_version\b|automatically generated by gh-aw/i.test(lockText)) {
    reporter.pass(`${markdownPath}.lock.current`, "lock file contains a current compilation indicator.");
  } else {
    reporter.fail(`${markdownPath}.lock.current`, "lock file must contain current_compilation metadata.");
  }
  if (/\bsha256\s*:\s*["']?[a-f0-9]{64}\b/i.test(lockText) || /\b(?:frontmatter_hash|body_hash)["']?\s*:\s*["']?[a-f0-9]{64}\b/i.test(lockText)) {
    reporter.pass(`${markdownPath}.lock.sha`, "lock file records a SHA-256 digest.");
  } else {
    reporter.fail(`${markdownPath}.lock.sha`, "lock file must record a SHA-256 digest.");
  }
}

function validateWorkflow(markdownPath, root, reporter) {
  const absolutePath = path.resolve(root, markdownPath);
  const label = path.relative(root, absolutePath).replaceAll("\\", "/") || markdownPath;
  if (!fileExists(absolutePath)) {
    reporter.fail(`${label}.exists`, "workflow markdown file is missing.");
    return;
  }
  reporter.pass(`${label}.exists`, "workflow markdown file exists.");

  const markdown = readText(absolutePath);
  const text = stripMarkdownFences(markdown);

  validateLock(absolutePath, reporter);

  const header = frontmatter(markdown);
  if ((/\bmetadata\s*:/i.test(markdown) || /^---/.test(markdown)) &&
      (/\b(current_compilation|current-compilation|currentCompilation)\s*:/i.test(markdown) || (/\bname\s*:/i.test(header) && /\bengine\s*:/i.test(header)))) {
    reporter.pass(`${label}.metadata-current`, "markdown includes metadata and current compilation indicators.");
  } else {
    reporter.fail(`${label}.metadata-current`, "markdown must include metadata and current_compilation indicators.");
  }

  if (containsIssueOnlySlashTrigger(text)) {
    reporter.pass(`${label}.trigger`, "uses an issue-only slash trigger.");
  } else {
    reporter.fail(`${label}.trigger`, "must use only issue_comment plus a slash trigger and no push/PR/manual/scheduled triggers.");
  }

  if (hasReadOnlyPermissions(text)) {
    reporter.pass(`${label}.permissions`, "uses read-only permissions.");
  } else {
    reporter.fail(`${label}.permissions`, "must declare read-only permissions only.");
  }

  if (/copilot-requests\s*:\s*write/i.test(text)) {
    reporter.fail(`${label}.no-copilot-write`, "must not request copilot-requests: write.");
  } else {
    reporter.pass(`${label}.no-copilot-write`, "does not request copilot-requests: write.");
  }

  if (hasCopilotEngine(text)) {
    reporter.pass(`${label}.engine`, "selects the Copilot engine.");
  } else {
    reporter.fail(`${label}.engine`, "must explicitly select the Copilot engine.");
  }

  const maxBytes = parseNumericSetting(text, ["safe-output-max-bytes", "safe_output_max_bytes", "MAX_SAFE_OUTPUT_BYTES"]);
  const maxLines = parseNumericSetting(text, ["safe-output-max-lines", "safe_output_max_lines", "MAX_SAFE_OUTPUT_LINES"]);
  if (Number.isInteger(maxBytes) && maxBytes > 0 && maxBytes <= MAX_SAFE_OUTPUT_BYTES) {
    reporter.pass(`${label}.safe-output-bytes`, `safe output byte limit is ${maxBytes}.`);
  } else {
    reporter.fail(`${label}.safe-output-bytes`, `must set safe output bytes to 1-${MAX_SAFE_OUTPUT_BYTES}.`);
  }
  if (Number.isInteger(maxLines) && maxLines > 0 && maxLines <= MAX_SAFE_OUTPUT_LINES) {
    reporter.pass(`${label}.safe-output-lines`, `safe output line limit is ${maxLines}.`);
  } else {
    reporter.fail(`${label}.safe-output-lines`, `must set safe output lines to 1-${MAX_SAFE_OUTPUT_LINES}.`);
  }

  if (hasDraftPr(text)) {
    reporter.pass(`${label}.draft-pr`, "creates a draft PR.");
  } else {
    reporter.fail(`${label}.draft-pr`, "must require draft: true for pull requests.");
  }

  const allowedFiles = explicitAllowedFiles(text);
  if (allowedFiles.length > 0 && allowedFiles.every((value) => !isBroadAllowedFile(value))) {
    reporter.pass(`${label}.allowed-files`, "declares explicit allowed files.", allowedFiles);
  } else {
    reporter.fail(`${label}.allowed-files`, "must declare explicit allowed-files entries without broad globs.", allowedFiles);
  }

  if (hasCiTriggerSecret(text)) {
    reporter.pass(`${label}.ci-secret`, "requires the CI trigger secret.");
  } else {
    reporter.fail(`${label}.ci-secret`, "must reference CI_TRIGGER_TOKEN.");
  }

  if (hasBroadBashOrNetwork(text)) {
    reporter.fail(`${label}.no-broad-bash-network`, "must not use broad bash commands or non-local network access.");
  } else {
    reporter.pass(`${label}.no-broad-bash-network`, "does not use broad bash commands or non-local network access.");
  }
}

function main() {
  let flags;
  try {
    flags = parseFlags(process.argv.slice(2), { boolean: ["json", "help"], value: ["root"] });
  } catch (error) {
    console.error(error.message);
    console.error(usage());
    process.exit(EXIT.USAGE);
  }
  if (flags.help) {
    console.log(usage());
    process.exit(EXIT.OK);
  }

  const root = path.resolve(flags.root ?? path.join(process.cwd(), ".github", "workflows"));
  const supplied = flags._.map((item) => path.resolve(root, item));
  const markdownFiles = supplied.length > 0 ? supplied : discoverMarkdown(root);
  const reporter = createReporter({ json: Boolean(flags.json) });

  if (markdownFiles.length === 0) {
    reporter.fail("discover", "no project-pulse-*.md workflow markdown files were found.");
  } else {
    reporter.pass("discover", `found ${markdownFiles.length} workflow markdown file${markdownFiles.length === 1 ? "" : "s"}.`);
  }

  for (const markdownPath of markdownFiles) {
    validateWorkflow(markdownPath, root, reporter);
  }

  const result = reporter.result({ root, files: markdownFiles.map((file) => path.relative(root, file).replaceAll("\\", "/")) });
  reporter.print(result, "Agentic workflow validation");
  process.exit(result.ok ? EXIT.OK : EXIT.VALIDATION_FAILED);
}

main();
