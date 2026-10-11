import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  buildRulesetPayload,
  evaluateSetupState,
  parseArgs
} from "../setup-agentic-workflows.mjs";
import { detectSafeOutputState } from "../detect-agentic-safe-output-state.mjs";

const scriptsDir = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(scriptsDir, "..", "..");
const secretFixture = ["ghp", "abcdefghijklmnopqrstuvwxyz"].join("_");

function runScript(scriptName, args = [], options = {}) {
  return spawnSync(process.execPath, [path.join(scriptsDir, scriptName), ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_TOKEN: secretFixture,
      GITHUB_RUN_ID: "100",
      GITHUB_RUN_ATTEMPT: "1",
      GITHUB_EVENT_NAME: "issue_comment",
      GITHUB_REPOSITORY: "owner/repo",
      GITHUB_SHA: "abc123",
      SOURCE_DATE_EPOCH: "0"
    },
    ...options
  });
}

function parseJson(stdout) {
  return JSON.parse(stdout);
}

test("validate-project-pulse accepts the valid fixture", () => {
  const fixture = path.join(scriptsDir, "fixtures", "project-pulse-valid");
  const result = runScript("validate-project-pulse.mjs", ["--root", fixture, "--json"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const json = parseJson(result.stdout);
  assert.equal(json.ok, true);
});

test("validation and smoke helpers create nested evidence logs", () => {
  const outDir = mkdtempSync(path.join(tmpdir(), "agentic-helper-logs-"));
  const fixture = path.join(scriptsDir, "fixtures", "project-pulse-valid");
  try {
    const validationLog = path.join(outDir, "validation", "validation.log");
    const validation = runScript("validate-project-pulse.mjs", [
      "--root",
      fixture,
      "--log",
      validationLog
    ]);
    assert.equal(validation.status, 0, validation.stderr || validation.stdout);
    assert.match(readFileSync(validationLog, "utf8"), /Project Pulse validation: passed/);

    const smokeLog = path.join(outDir, "smoke", "http-smoke-test.log");
    const smoke = runScript("smoke-test-project-pulse.mjs", [
      "--root",
      fixture,
      "--port",
      "5512",
      "--log",
      smokeLog
    ]);
    assert.equal(smoke.status, 0, smoke.stderr || smoke.stdout);
    assert.equal(existsSync(smokeLog), true);
    assert.match(readFileSync(smokeLog, "utf8"), /project-data\.json: HTTP 200/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("setup script builds the required default-branch ruleset", () => {
  const payload = buildRulesetPayload();
  assert.equal(payload.enforcement, "active");
  assert.deepEqual(payload.conditions.ref_name.include, ["~DEFAULT_BRANCH"]);
  const pullRequest = payload.rules.find((rule) => rule.type === "pull_request");
  assert.deepEqual(pullRequest.parameters.allowed_merge_methods, ["merge", "squash", "rebase"]);
  assert.equal(pullRequest.parameters.required_approving_review_count, 1);
  assert.equal(pullRequest.parameters.require_code_owner_review, true);
  const requiredChecks = payload.rules.find((rule) => rule.type === "required_status_checks");
  assert.deepEqual(
    requiredChecks.parameters.required_status_checks.map((check) => check.context),
    ["Agentic workflow policy", "Project Pulse contract"]
  );
});

test("setup check reports missing configuration and accepts complete state", () => {
  assert.throws(() => parseArgs([]), /Choose --configure or --check/);
  assert.deepEqual(parseArgs(["--check", "--repo", "owner/repo"]), {
    mode: "check",
    repo: "owner/repo"
  });

  const incomplete = evaluateSetupState({
    secrets: [],
    label: null,
    actions: {},
    ruleset: null,
    variable: null
  });
  assert.ok(incomplete.length >= 6);

  const complete = evaluateSetupState({
    secrets: [
      { name: "COPILOT_GITHUB_TOKEN" },
      { name: "GH_AW_CI_TRIGGER_TOKEN" }
    ],
    label: { name: "agentic:needs-human" },
    actions: {
      default_workflow_permissions: "read",
      can_approve_pull_request_reviews: true
    },
    ruleset: buildRulesetPayload(),
    variable: { name: "AGENTIC_SETUP_COMPLETE", value: "true" }
  });
  assert.deepEqual(complete, []);

  const weakened = buildRulesetPayload();
  weakened.conditions.ref_name.include = ["refs/heads/not-main"];
  weakened.rules.find((rule) => rule.type === "pull_request").parameters.required_approving_review_count = 0;
  assert.ok(evaluateSetupState({
    secrets: [
      { name: "COPILOT_GITHUB_TOKEN" },
      { name: "GH_AW_CI_TRIGGER_TOKEN" }
    ],
    label: { name: "agentic:needs-human" },
    actions: {
      default_workflow_permissions: "read",
      can_approve_pull_request_reviews: true
    },
    ruleset: weakened,
    variable: { name: "AGENTIC_SETUP_COMPLETE", value: "true" }
  }).length >= 2);
});

test("safe-output retry detection is conservative after any write-capable job starts", () => {
  assert.equal(detectSafeOutputState([{ name: "safe_outputs", conclusion: "skipped" }]), "none");
  assert.equal(detectSafeOutputState([{ name: "Process Safe Outputs", conclusion: "failure" }]), "unsafe");
  assert.equal(detectSafeOutputState([{ name: "safe_outputs", conclusion: "success" }]), "unsafe");
  assert.equal(detectSafeOutputState([]), "unsafe");
});

test("exercise start and every agentic stage require completed setup", () => {
  const start = readFileSync(path.join(repoRoot, ".github", "workflows", "0-start-exercise.yml"), "utf8");
  assert.match(start, /name: Agentic setup gate/);
  assert.match(start, /SETUP_COMPLETE: \$\{\{ vars\.AGENTIC_SETUP_COMPLETE \}\}/);
  assert.match(start, /needs: \[setup_gate\]/);

  const workflowDir = path.join(repoRoot, ".github", "workflows");
  for (const source of [
    "project-pulse-01-team.md",
    "project-pulse-02-plan.md",
    "project-pulse-03-design.md",
    "project-pulse-03-build.md",
    "project-pulse-04-handoff.md"
  ]) {
    const content = readFileSync(path.join(workflowDir, source), "utf8");
    assert.match(
      content,
      /vars\.AGENTIC_SETUP_COMPLETE == 'true'/,
      `${source} must require completed setup`
    );
  }
});

test("validate-project-pulse rejects the invalid fixture", () => {
  const fixture = path.join(scriptsDir, "fixtures", "project-pulse-invalid");
  const result = runScript("validate-project-pulse.mjs", ["--root", fixture, "--json"]);
  assert.equal(result.status, 1);
  const json = parseJson(result.stdout);
  assert.equal(json.ok, false);
  assert.ok(json.failures > 0);
});

test("validate-agentic-workflow accepts valid discovered project-pulse markdown", () => {
  const fixture = path.join(scriptsDir, "fixtures", "workflows-valid");
  const result = runScript("validate-agentic-workflow.mjs", ["--root", fixture, "--json"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const json = parseJson(result.stdout);
  assert.equal(json.ok, true);
  assert.deepEqual(json.files, ["project-pulse-agentic.md"]);
});

test("validate-agentic-workflow rejects unsafe workflow markdown", () => {
  const fixture = path.join(scriptsDir, "fixtures", "workflows-invalid");
  const result = runScript("validate-agentic-workflow.mjs", ["--root", fixture, "--json"]);
  assert.equal(result.status, 1);
  const json = parseJson(result.stdout);
  assert.equal(json.ok, false);
  assert.ok(json.checks.some((check) => !check.ok && check.id.endsWith(".no-copilot-write")));
  assert.ok(json.checks.some((check) => !check.ok && check.id.endsWith(".no-broad-bash-network")));
});

test("collect-agentic-evidence writes sanitized deterministic evidence files", () => {
  const outDir = mkdtempSync(path.join(tmpdir(), "agentic-evidence-"));
  try {
    const result = runScript("collect-agentic-evidence.mjs", [
      "--out",
      outDir,
      "--changed-files",
      "app/index.html,app/styles.css",
      "--allowed-files",
      "app/",
      "--stage",
      "03-build",
      "--source-sha",
      "source123",
      "--lock-sha",
      "lock456",
      "--trigger",
      "/project-pulse",
      "--actor",
      "mona",
      "--engine",
      "copilot",
      "--model",
      "gpt-test",
      "--permissions",
      "{\"contents\":\"read\"}",
      "--tools",
      "edit,github",
      "--network",
      "{}",
      "--safe-outputs",
      "{\"create-pull-request\":{\"draft\":true}}",
      "--start-time",
      "2026-01-01T00:00:00.000Z",
      "--end-time",
      "2026-01-01T00:01:00.000Z",
      "--conclusion",
      "success",
      "--issue-url",
      "https://github.com/owner/repo/issues/1",
      "--pr-url",
      "https://github.com/owner/repo/pull/2",
      "--artifact-url",
      "https://github.com/owner/repo/actions/runs/100/artifacts/3",
      "--escalated-to-human",
      "false",
      "--safe-output",
      `ok ${secretFixture}`
    ]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const manifest = JSON.parse(readFileSync(path.join(outDir, "run-manifest.json"), "utf8"));
    const scope = JSON.parse(readFileSync(path.join(outDir, "scope-check.json"), "utf8"));
    const safeOutput = JSON.parse(readFileSync(path.join(outDir, "safe-output-result.json"), "utf8"));
    const changed = readFileSync(path.join(outDir, "changed-files.txt"), "utf8");

    assert.equal(manifest.generatedAt, "1970-01-01T00:00:00.000Z");
    assert.equal(manifest.stage, "03-build");
    assert.equal(manifest.sourceSha, "source123");
    assert.equal(manifest.lockSha, "lock456");
    assert.equal(manifest.trigger, "/project-pulse");
    assert.equal(manifest.actor, "mona");
    assert.equal(manifest.engine, "copilot");
    assert.equal(manifest.model, "gpt-test");
    assert.deepEqual(manifest.declared.permissions, { contents: "read" });
    assert.deepEqual(manifest.declared.tools, ["edit", "github"]);
    assert.deepEqual(manifest.declared.network, {});
    assert.deepEqual(manifest.declared.safeOutputs, { "create-pull-request": { draft: true } });
    assert.deepEqual(manifest.timing, { start: "2026-01-01T00:00:00.000Z", end: "2026-01-01T00:01:00.000Z" });
    assert.equal(manifest.conclusion, "success");
    assert.equal(manifest.urls.issue, "https://github.com/owner/repo/issues/1");
    assert.equal(manifest.urls.pullRequest, "https://github.com/owner/repo/pull/2");
    assert.equal(manifest.urls.run, "https://github.com/owner/repo/actions/runs/100");
    assert.equal(manifest.urls.artifact, "https://github.com/owner/repo/actions/runs/100/artifacts/3");
    assert.equal(manifest.escalatedToHuman, false);
    assert.equal(manifest.environment.GITHUB_RUN_ID, "100");
    assert.equal(scope.ok, true);
    assert.equal(safeOutput.secretPatternsRedacted, true);
    assert.doesNotMatch(JSON.stringify({ manifest, safeOutput, changed }), new RegExp(secretFixture));
    assert.equal(changed, "app/index.html\napp/styles.css\n");
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("collect-agentic-evidence returns scope failure for out-of-scope files", () => {
  const outDir = mkdtempSync(path.join(tmpdir(), "agentic-evidence-"));
  try {
    const result = runScript("collect-agentic-evidence.mjs", [
      "--out",
      outDir,
      "--changed-files",
      "README.md",
      "--allowed-files",
      "app/"
    ]);
    assert.equal(result.status, 4);
    const scope = JSON.parse(readFileSync(path.join(outDir, "scope-check.json"), "utf8"));
    assert.deepEqual(scope.outOfScope, ["README.md"]);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("collect-agentic-evidence keeps UTF-8 previews within the byte limit", () => {
  const outDir = mkdtempSync(path.join(tmpdir(), "agentic-evidence-"));
  try {
    const result = runScript("collect-agentic-evidence.mjs", [
      "--out",
      outDir,
      "--safe-output",
      "😀",
      "--max-bytes",
      "1"
    ]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const safeOutput = JSON.parse(readFileSync(path.join(outDir, "safe-output-result.json"), "utf8"));
    assert.equal(safeOutput.previewBytes, 0);
    assert.equal(safeOutput.preview, "");
    assert.equal(safeOutput.truncated, true);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("evaluate-agentic-retry authorizes only attempt 1 retryable failures", () => {
  const result = runScript("evaluate-agentic-retry.mjs", [
    "--conclusion",
    "failure",
    "--attempt",
    "1",
    "--failure-class",
    "transient",
    "--safe-output-state",
    "complete"
  ]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const json = parseJson(result.stdout);
  assert.equal(json.authorizeRetry, true);
  assert.equal(json.nextAttempt, 2);
  assert.equal(json.action, "retry");
});

test("evaluate-agentic-retry escalates retryable attempt 2", () => {
  const result = runScript("evaluate-agentic-retry.mjs", [
    "--conclusion",
    "failure",
    "--attempt",
    "2",
    "--failure-class",
    "transient",
    "--safe-output-state",
    "complete"
  ]);
  assert.equal(result.status, 11);
  const json = parseJson(result.stdout);
  assert.equal(json.authorizeRetry, false);
  assert.equal(json.action, "escalate");
});

test("evaluate-agentic-retry refuses cancellation, auth, policy, and scope classes", () => {
  for (const [conclusion, failureClass] of [
    ["cancelled", ""],
    ["failure", "auth"],
    ["failure", "policy"],
    ["failure", "scope"]
  ]) {
    const result = runScript("evaluate-agentic-retry.mjs", [
      "--conclusion",
      conclusion,
      "--attempt",
      "1",
      "--failure-class",
      failureClass,
      "--safe-output-state",
      "complete"
    ]);
    assert.equal(result.status, 10, `${conclusion}/${failureClass}: ${result.stdout} ${result.stderr}`);
    const json = parseJson(result.stdout);
    assert.equal(json.authorizeRetry, false);
    assert.equal(json.action, "refuse");
  }
});

test("evaluate-agentic-retry escalates unsafe, partial, or applied safe-output states", () => {
  for (const safeOutputState of ["unsafe", "partial", "applied"]) {
    const result = runScript("evaluate-agentic-retry.mjs", [
      "--conclusion",
      "failure",
      "--attempt",
      "1",
      "--failure-class",
      "transient",
      "--safe-output-state",
      safeOutputState
    ]);
    assert.equal(result.status, 11, `${safeOutputState}: ${result.stdout} ${result.stderr}`);
    const json = parseJson(result.stdout);
    assert.equal(json.authorizeRetry, false);
    assert.equal(json.action, "escalate");
  }
});

test("evaluate-agentic-retry treats infrastructure, engine, validation, and safe_output as retryable", () => {
  for (const failureClass of ["infrastructure", "engine", "validation", "safe_output"]) {
    const result = runScript("evaluate-agentic-retry.mjs", [
      "--conclusion",
      "failure",
      "--attempt",
      "1",
      "--failure-class",
      failureClass,
      "--safe-output-state",
      "complete"
    ]);
    assert.equal(result.status, 0, `${failureClass}: ${result.stdout} ${result.stderr}`);
    const json = parseJson(result.stdout);
    assert.equal(json.authorizeRetry, true);
    assert.equal(json.action, "retry");
  }
});
