#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  ensureDir,
  EXIT,
  isSensitiveKey,
  normalizeRepoPath,
  parseFlags,
  redactValue,
  sha256,
  uniqueSorted,
  writeJson
} from "./lib/common.mjs";

const DEFAULT_MAX_SAFE_OUTPUT_BYTES = 12000;
const DEFAULT_MAX_SAFE_OUTPUT_LINES = 300;

function usage() {
  return [
    "Usage: node .github/scripts/collect-agentic-evidence.mjs --out DIR [options]",
    "",
    "Options:",
    "  --changed-files LIST        Comma/newline separated changed files.",
    "  --changed-files-file PATH   File containing changed files, one per line.",
    "  --git-changed-files         Read tracked and untracked paths from git status.",
    "  --allowed-files LIST        Comma/newline separated allowed file paths or directory prefixes ending in '/'.",
    "  --allowed-files-file PATH   File containing allowed files, one per line.",
    "  --safe-output TEXT          Command output to sanitize and summarize.",
    "  --safe-output-file PATH     File containing command output to sanitize and summarize.",
    "  --max-bytes NUMBER          Safe output byte limit; default 12000.",
    "  --max-lines NUMBER          Safe output line limit; default 300.",
    "  --attempt NUMBER            Attempt number for the manifest.",
    "  --run-id VALUE              Run id for the manifest.",
    "  --stage VALUE               Agentic workflow stage.",
    "  --source-sha VALUE          Source markdown SHA.",
    "  --lock-sha VALUE            Lock/compiled workflow SHA.",
    "  --trigger VALUE             Trigger name or slash command.",
    "  --actor VALUE               Actor that initiated the run.",
    "  --engine VALUE              Agentic engine id.",
    "  --model VALUE               Agentic model id.",
    "  --permissions VALUE         Declared permissions as JSON or comma list.",
    "  --tools VALUE               Declared tools as JSON or comma list.",
    "  --network VALUE             Declared network policy as JSON or text.",
    "  --safe-outputs VALUE        Declared safe outputs as JSON or comma list.",
    "  --start-time VALUE          Run start timestamp.",
    "  --end-time VALUE            Run end timestamp.",
    "  --conclusion VALUE          Run conclusion.",
    "  --issue-url VALUE           Triggering issue URL.",
    "  --pr-url VALUE              Draft PR URL.",
    "  --run-url VALUE             GitHub Actions run URL.",
    "  --artifact-url VALUE        Evidence artifact URL.",
    "  --escalated-to-human VALUE  true or false.",
    "  --json                      Print a JSON summary.",
    "",
    "Writes run-manifest.json, scope-check.json, safe-output-result.json, and changed-files.txt.",
    "Exit codes: 0 in scope, 4 scope violation, 2 usage error."
  ].join("\n");
}

function splitList(value) {
  return String(value ?? "")
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function readList(flags, inlineName, fileName) {
  const values = [];
  if (flags[inlineName]) {
    values.push(...splitList(flags[inlineName]));
  }
  if (flags[fileName]) {
    values.push(...splitList(readFileSync(flags[fileName], "utf8")));
  }
  return uniqueSorted(values);
}

function readGitChangedFiles() {
  const configuredGit = process.env.GIT_BIN;
  const windowsGit = process.env.ProgramFiles
    ? path.join(process.env.ProgramFiles, "Git", "cmd", "git.exe")
    : "";
  const git = configuredGit || (process.platform === "win32" && existsSync(windowsGit) ? windowsGit : "git");
  const output = execFileSync(git, ["status", "--porcelain=v1", "-z", "--untracked-files=all"], {
    encoding: "utf8"
  });
  const entries = output.split("\0").filter(Boolean);
  const files = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const status = entry.slice(0, 2);
    const file = normalizeRepoPath(entry.slice(3));
    if (file && !file.startsWith(".agentic-evidence/")) {
      files.push(file);
    }
    if (/[RC]/.test(status)) {
      const sourceFile = normalizeRepoPath(entries[index + 1] ?? "");
      if (sourceFile && !sourceFile.startsWith(".agentic-evidence/")) {
        files.push(sourceFile);
      }
      index += 1;
    }
  }
  return files;
}

function readSafeOutput(flags) {
  if (flags["safe-output-file"]) {
    return readFileSync(flags["safe-output-file"], "utf8");
  }
  if (flags["safe-output"] !== undefined) {
    return String(flags["safe-output"]);
  }
  return "";
}

function valueFrom(flags, name, envName, fallback = "") {
  return flags[name] ?? process.env[envName] ?? fallback;
}

function booleanFrom(flags, name, envName) {
  const value = valueFrom(flags, name, envName, "false");
  return /^(1|true|yes)$/i.test(String(value));
}

function parseDeclaredValue(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    const list = splitList(text);
    return list.length > 1 ? list : text;
  }
}

function sanitizeForManifest(value) {
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForManifest(item));
  }
  if (value && typeof value === "object") {
    const result = {};
    for (const [key, child] of Object.entries(value)) {
      result[key] = isSensitiveKey(key) ? "[REDACTED]" : sanitizeForManifest(child);
    }
    return result;
  }
  return redactValue(value);
}

function sanitizeUrl(value) {
  return String(value ?? "")
    .replace(/gh[pousr]_[A-Za-z0-9_]{20,}/g, "[REDACTED]")
    .replace(/github_pat_[A-Za-z0-9_]{20,}/g, "[REDACTED]")
    .replace(/([?&](?:token|secret|password|auth|api[_-]?key)=)[^&#]+/gi, "$1[REDACTED]");
}

function deriveIssueUrl(flags) {
  const explicit = valueFrom(flags, "issue-url", "GITHUB_ISSUE_URL");
  if (explicit) {
    return explicit;
  }
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    return "";
  }
  const event = JSON.parse(readFileSync(eventPath, "utf8"));
  const issueUrl = event.issue?.html_url;
  if (issueUrl) {
    return issueUrl;
  }
  const issueNumber = event.issue?.number;
  const repository = process.env.GITHUB_REPOSITORY;
  const serverUrl = process.env.GITHUB_SERVER_URL ?? "https://github.com";
  return issueNumber && repository ? `${serverUrl}/${repository}/issues/${issueNumber}` : "";
}

function sanitizeEnvironment(env) {
  const allowList = [
    "GITHUB_ACTION",
    "GITHUB_ACTIONS",
    "GITHUB_ACTOR",
    "GITHUB_EVENT_NAME",
    "GITHUB_JOB",
    "GITHUB_SERVER_URL",
    "GITHUB_REF",
    "GITHUB_REF_NAME",
    "GITHUB_REPOSITORY",
    "GITHUB_RUN_ATTEMPT",
    "GITHUB_RUN_ID",
    "GITHUB_RUN_NUMBER",
    "GITHUB_SHA",
    "GITHUB_WORKFLOW",
    "GH_AW_ENGINE",
    "GH_AW_MODEL",
    "GH_AW_STAGE",
    "RUNNER_ARCH",
    "RUNNER_NAME",
    "RUNNER_OS"
  ];
  const sanitized = {};
  for (const key of allowList) {
    if (env[key] !== undefined && !isSensitiveKey(key)) {
      sanitized[key] = redactValue(env[key]);
    }
  }
  return sanitized;
}

function isPathAllowed(changedFile, allowedFiles) {
  const changed = normalizeRepoPath(changedFile);
  return allowedFiles.some((allowedValue) => {
    const allowed = normalizeRepoPath(allowedValue);
    if (!allowed || allowed.includes("..") || allowed === "." || allowed === "/" || allowed === "*" || allowed === "**") {
      return false;
    }
    if (allowed.endsWith("/")) {
      return changed.startsWith(allowed);
    }
    return changed === allowed;
  });
}

function buildScopeCheck(changedFiles, allowedFiles) {
  const outOfScope = changedFiles.filter((file) => !isPathAllowed(file, allowedFiles));
  return {
    ok: outOfScope.length === 0,
    changedFiles,
    allowedFiles,
    outOfScope
  };
}

function buildSafeOutputResult(rawOutput, maxBytes, maxLines) {
  const sanitized = redactValue(rawOutput).replace(/\r\n/g, "\n");
  const lines = sanitized.split("\n");
  const lineLimited = lines.slice(0, maxLines).join("\n");
  const bytes = Buffer.byteLength(lineLimited, "utf8");
  let preview = lineLimited;
  let byteLimited = false;
  if (bytes > maxBytes) {
    preview = "";
    let previewBytes = 0;
    for (const character of lineLimited) {
      const characterBytes = Buffer.byteLength(character, "utf8");
      if (previewBytes + characterBytes > maxBytes) {
        break;
      }
      preview += character;
      previewBytes += characterBytes;
    }
    byteLimited = true;
  }

  const lineLimitedFlag = lines.length > maxLines;
  return {
    ok: !byteLimited && !lineLimitedFlag,
    state: byteLimited || lineLimitedFlag ? "truncated" : "complete",
    maxBytes,
    maxLines,
    originalBytes: Buffer.byteLength(rawOutput, "utf8"),
    sanitizedBytes: Buffer.byteLength(sanitized, "utf8"),
    previewBytes: Buffer.byteLength(preview, "utf8"),
    originalSha256: sha256(rawOutput),
    sanitizedSha256: sha256(sanitized),
    truncated: byteLimited || lineLimitedFlag,
    secretPatternsRedacted: sanitized !== rawOutput,
    preview
  };
}

function deterministicTimestamp(env) {
  if (env.AGENTIC_EVIDENCE_TIMESTAMP) {
    return String(env.AGENTIC_EVIDENCE_TIMESTAMP);
  }
  if (env.SOURCE_DATE_EPOCH && /^\d+$/.test(env.SOURCE_DATE_EPOCH)) {
    return new Date(Number(env.SOURCE_DATE_EPOCH) * 1000).toISOString();
  }
  return new Date().toISOString();
}

function main() {
  let flags;
  try {
    flags = parseFlags(process.argv.slice(2), {
      boolean: ["git-changed-files", "json", "help"],
      value: [
        "out",
        "changed-files",
        "changed-files-file",
        "allowed-files",
        "allowed-files-file",
        "safe-output",
        "safe-output-file",
        "max-bytes",
        "max-lines",
        "attempt",
        "run-id",
        "stage",
        "source-sha",
        "lock-sha",
        "trigger",
        "actor",
        "engine",
        "model",
        "permissions",
        "tools",
        "network",
        "safe-outputs",
        "start-time",
        "end-time",
        "conclusion",
        "issue-url",
        "pr-url",
        "run-url",
        "artifact-url",
        "escalated-to-human"
      ]
    });
  } catch (error) {
    console.error(error.message);
    console.error(usage());
    process.exit(EXIT.USAGE);
  }
  if (flags.help) {
    console.log(usage());
    process.exit(EXIT.OK);
  }
  if (!flags.out) {
    console.error("Missing required --out DIR.");
    console.error(usage());
    process.exit(EXIT.USAGE);
  }

  const outDir = path.resolve(flags.out);
  const changedFiles = readList(flags, "changed-files", "changed-files-file");
  if (flags["git-changed-files"]) {
    changedFiles.push(...readGitChangedFiles());
  }
  const normalizedChangedFiles = uniqueSorted(changedFiles);
  const allowedFiles = readList(flags, "allowed-files", "allowed-files-file");
  const maxBytes = Number(flags["max-bytes"] ?? DEFAULT_MAX_SAFE_OUTPUT_BYTES);
  const maxLines = Number(flags["max-lines"] ?? DEFAULT_MAX_SAFE_OUTPUT_LINES);
  if (!Number.isInteger(maxBytes) || maxBytes <= 0 || !Number.isInteger(maxLines) || maxLines <= 0) {
    console.error("--max-bytes and --max-lines must be positive integers.");
    process.exit(EXIT.USAGE);
  }

  const safeOutput = buildSafeOutputResult(readSafeOutput(flags), maxBytes, maxLines);
  const scopeCheck = buildScopeCheck(normalizedChangedFiles, allowedFiles);
  const runId = String(valueFrom(flags, "run-id", "GITHUB_RUN_ID"));
  const repository = String(process.env.GITHUB_REPOSITORY ?? "");
  const serverUrl = String(process.env.GITHUB_SERVER_URL ?? "https://github.com");
  const defaultRunUrl = repository && runId ? `${serverUrl}/${repository}/actions/runs/${runId}` : "";
  const startTime = String(valueFrom(flags, "start-time", "AGENTIC_RUN_START", deterministicTimestamp(process.env)));
  const endTime = String(valueFrom(flags, "end-time", "AGENTIC_RUN_END", deterministicTimestamp(process.env)));
  const runManifest = {
    schemaVersion: 1,
    generatedAt: deterministicTimestamp(process.env),
    stage: sanitizeForManifest(valueFrom(flags, "stage", "GH_AW_STAGE")),
    sourceSha: sanitizeForManifest(valueFrom(flags, "source-sha", "GH_AW_SOURCE_SHA")),
    lockSha: sanitizeForManifest(valueFrom(flags, "lock-sha", "GH_AW_LOCK_SHA")),
    trigger: sanitizeForManifest(valueFrom(flags, "trigger", "GITHUB_EVENT_NAME")),
    actor: sanitizeForManifest(valueFrom(flags, "actor", "GITHUB_ACTOR")),
    engine: sanitizeForManifest(valueFrom(flags, "engine", "GH_AW_ENGINE")),
    model: sanitizeForManifest(valueFrom(flags, "model", "GH_AW_MODEL")),
    declared: {
      permissions: sanitizeForManifest(parseDeclaredValue(valueFrom(flags, "permissions", "GH_AW_DECLARED_PERMISSIONS"))),
      tools: sanitizeForManifest(parseDeclaredValue(valueFrom(flags, "tools", "GH_AW_DECLARED_TOOLS"))),
      network: sanitizeForManifest(parseDeclaredValue(valueFrom(flags, "network", "GH_AW_DECLARED_NETWORK"))),
      safeOutputs: sanitizeForManifest(parseDeclaredValue(valueFrom(flags, "safe-outputs", "GH_AW_DECLARED_SAFE_OUTPUTS")))
    },
    timing: {
      start: sanitizeForManifest(startTime),
      end: sanitizeForManifest(endTime)
    },
    conclusion: sanitizeForManifest(valueFrom(flags, "conclusion", "AGENTIC_CONCLUSION")),
    urls: {
      issue: sanitizeUrl(deriveIssueUrl(flags)),
      pullRequest: sanitizeUrl(valueFrom(flags, "pr-url", "GITHUB_PR_URL")),
      run: sanitizeUrl(valueFrom(flags, "run-url", "GITHUB_RUN_URL", defaultRunUrl)),
      artifact: sanitizeUrl(valueFrom(flags, "artifact-url", "GITHUB_ARTIFACT_URL"))
    },
    escalatedToHuman: booleanFrom(flags, "escalated-to-human", "AGENTIC_ESCALATED_TO_HUMAN"),
    runId,
    attempt: Number(flags.attempt ?? process.env.GITHUB_RUN_ATTEMPT ?? 1),
    eventName: process.env.GITHUB_EVENT_NAME ?? "",
    repository,
    ref: process.env.GITHUB_REF ?? "",
    sha: process.env.GITHUB_SHA ?? "",
    environment: sanitizeEnvironment(process.env),
    evidenceFiles: [
      "run-manifest.json",
      "scope-check.json",
      "safe-output-result.json",
      "changed-files.txt"
    ]
  };

  ensureDir(outDir);
  writeJson(path.join(outDir, "run-manifest.json"), runManifest);
  writeJson(path.join(outDir, "scope-check.json"), scopeCheck);
  writeJson(path.join(outDir, "safe-output-result.json"), safeOutput);
  writeFileSync(
    path.join(outDir, "changed-files.txt"),
    `${normalizedChangedFiles.join("\n")}${normalizedChangedFiles.length ? "\n" : ""}`,
    "utf8"
  );

  const summary = {
    ok: scopeCheck.ok,
    outDir,
    filesWritten: runManifest.evidenceFiles,
    scopeOk: scopeCheck.ok,
    safeOutputState: safeOutput.state
  };
  if (flags.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`Evidence collection: ${summary.ok ? "passed" : "scope violation"}`);
    console.log(`Wrote ${summary.filesWritten.join(", ")} to ${outDir}`);
    if (!scopeCheck.ok) {
      console.error(`Out-of-scope files: ${scopeCheck.outOfScope.join(", ")}`);
    }
  }
  process.exit(scopeCheck.ok ? EXIT.OK : EXIT.SCOPE_FAILED);
}

main();
