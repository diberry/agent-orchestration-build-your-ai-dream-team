import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  buildRulesetPayload,
  evaluateSetupState,
  parseArgs
} from "../setup-agentic-workflows.mjs";
import { detectSafeOutputState } from "../detect-agentic-safe-output-state.mjs";
import { classifyFailure } from "../classify-agentic-failure.mjs";
import { finalizeEvidence } from "../finalize-agentic-evidence.mjs";

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
  assert.equal(pullRequest.parameters.require_code_owner_review, false);
  assert.equal(pullRequest.parameters.require_last_push_approval, false);
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

test("observability finalizer records actual outcome and published pull request", () => {
  const evidenceDir = mkdtempSync(path.join(tmpdir(), "agentic-final-evidence-"));
  const metadataDir = mkdtempSync(path.join(tmpdir(), "agentic-safe-output-"));
  try {
    const stageDir = path.join(evidenceDir, "stage");
    mkdirSync(stageDir, { recursive: true });
    writeFileSync(path.join(stageDir, "run-manifest.json"), JSON.stringify({
      urls: { issue: "https://github.com/owner/repo/issues/7", pullRequest: "" }
    }));
    writeFileSync(path.join(metadataDir, "temporary-id-map.json"), JSON.stringify({
      aw_pr1234: { repo: "owner/repo", number: 8 }
    }));
    const result = finalizeEvidence({
      evidenceDir,
      conclusion: "failure",
      runUrl: "https://github.com/owner/repo/actions/runs/100",
      endTime: "2026-10-11T00:00:00Z",
      safeOutputMetadataDir: metadataDir,
      repository: "owner/repo"
    });
    assert.equal(result.conclusion, "failure");
    assert.equal(result.issueUrl, "https://github.com/owner/repo/issues/7");
    assert.equal(result.pullRequestUrl, "https://github.com/owner/repo/pull/8");
    assert.equal(result.artifactUrl, "https://github.com/owner/repo/actions/runs/100#artifacts");
  } finally {
    rmSync(evidenceDir, { recursive: true, force: true });
    rmSync(metadataDir, { recursive: true, force: true });
  }
});

test("failure classification uses trusted job metadata and refuses unknowns", () => {
  assert.equal(classifyFailure([], null), "unknown");
  assert.equal(classifyFailure([], { ok: false }), "scope");
  assert.equal(classifyFailure([
    { name: "agent", conclusion: "failure", steps: [{ name: "Enforce Project Pulse validation", conclusion: "failure" }] }
  ], null), "validation");
  assert.equal(classifyFailure([
    { name: "detection", conclusion: "failure", steps: [] }
  ], null), "policy");
  assert.equal(classifyFailure([
    { name: "activation", conclusion: "failure", steps: [{ name: "Check team membership", conclusion: "failure" }] }
  ], null), "auth");
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

  const setup = readFileSync(path.join(scriptsDir, "setup-agentic-workflows.mjs"), "utf8");
  assert.match(setup, /workflow", "run", "Step 0"/);
  const contract = readFileSync(path.join(workflowDir, "project-pulse-contract.yml"), "utf8");
  assert.match(contract, /git diff --quiet "origin\/\$BASE_REF\.\.\.HEAD"/);
  assert.match(contract, /\[ "\$app_changed" = "false" \]/);
  assert.equal(existsSync(path.join(repoRoot, ".github", "CODEOWNERS")), false);
  assert.doesNotMatch(readFileSync(path.join(repoRoot, ".gitattributes"), "utf8"), /merge=ours/);
  assert.match(readFileSync(path.join(repoRoot, "README.md"), "utf8"), /\]\(\.\.\/\.\.\/issues\/1\)/);
});

test("publication gates and evidence consumers preserve the sanitized boundary", () => {
  const workflowDir = path.join(repoRoot, ".github", "workflows");
  for (const source of ["project-pulse-03-build.md", "project-pulse-04-handoff.md"]) {
    const content = readFileSync(path.join(workflowDir, source), "utf8");
    assert.match(content, /post-steps:/);
    assert.match(content, /jobs:\s+safe_outputs:\s+pre-steps:/s);
    assert.match(content, /if: needs\.agent\.result != 'success'/);
    assert.match(content, /Enforce Project Pulse validation/);
    assert.match(content, /Enforce Project Pulse smoke test/);

    const compiled = readFileSync(path.join(workflowDir, source.replace(/\.md$/, ".lock.yml")), "utf8");
    const gateIndex = compiled.indexOf("name: Block publication unless deterministic gates pass");
    const processorIndex = compiled.indexOf("name: Process Safe Outputs");
    assert.ok(gateIndex >= 0 && gateIndex < processorIndex, `${source} must gate generated safe-output processing`);
    assert.match(compiled, /if: needs\.agent\.result != 'success'/);
  }

  const handoff = readFileSync(path.join(workflowDir, "project-pulse-04-handoff.md"), "utf8");
  assert.match(handoff, /Require successful Project Pulse contract/);
  assert.match(handoff, /latest\.status !== "completed" \|\| latest\.conclusion !== "success"/);

  for (const workflow of ["agentic-observability.yml", "agentic-retry-controller.yml"]) {
    const content = readFileSync(path.join(workflowDir, workflow), "utf8");
    assert.match(content, /--name "\$artifact_name"/);
    assert.doesNotMatch(content, /gh run download "\$RUN_ID" --dir evidence/);
    assert.doesNotMatch(content, /^\s+evidence\/\s*$/m);
  }

  const observability = readFileSync(path.join(workflowDir, "agentic-observability.yml"), "utf8");
  assert.ok(
    observability.indexOf("Download trusted safe-output metadata")
      < observability.indexOf("Finalize run evidence")
  );
  assert.match(observability, /--name safe-outputs-items/);
  assert.match(observability, /--safe-output-metadata "\$RUNNER_TEMP\/safe-output-metadata"/);

  const retry = readFileSync(path.join(workflowDir, "agentic-retry-controller.yml"), "utf8");
  assert.match(retry, /classify-agentic-failure\.mjs/);
  assert.doesNotMatch(retry, /classification=transient/);
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
      `ok ${secretFixture}\nAuthorization: ******\nCookie: session=abc123\nSet-Cookie: refresh=def456`
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
    assert.match(safeOutput.preview, /Authorization: \[REDACTED\]/);
    assert.match(safeOutput.preview, /Cookie: \[REDACTED\]/);
    assert.match(safeOutput.preview, /Set-Cookie: \[REDACTED\]/);
    assert.doesNotMatch(safeOutput.preview, /session=abc123|refresh=def456/);
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

test("collect-agentic-evidence checks both rename paths and records live issue timing", () => {
  const repository = mkdtempSync(path.join(tmpdir(), "agentic-rename-scope-"));
  const outDir = path.join(repository, ".agentic-evidence");
  const git = process.platform === "win32"
    ? path.join(process.env.ProgramFiles, "Git", "cmd", "git.exe")
    : "git";
  try {
    execFileSync(git, ["init"], { cwd: repository });
    execFileSync(git, ["config", "user.email", "test@example.com"], { cwd: repository });
    execFileSync(git, ["config", "user.name", "Test User"], { cwd: repository });
    writeFileSync(path.join(repository, "outside.md"), "outside\n", "utf8");
    execFileSync(git, ["add", "outside.md"], { cwd: repository });
    execFileSync(git, ["commit", "-m", "baseline"], { cwd: repository });
    execFileSync(git, ["mv", "outside.md", "allowed.md"], { cwd: repository });
    const eventPath = path.join(repository, ".git", "event.json");
    writeFileSync(eventPath, JSON.stringify({
      issue: {
        number: 7,
        html_url: "https://github.com/owner/repo/issues/7"
      }
    }), "utf8");

    const result = runScript("collect-agentic-evidence.mjs", [
      "--out",
      outDir,
      "--git-changed-files",
      "--allowed-files",
      "allowed.md",
      "--stage",
      "test"
    ], {
      cwd: repository,
      env: {
        ...process.env,
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_REPOSITORY: "owner/repo",
        GITHUB_RUN_ID: "100",
        GIT_BIN: git
      }
    });
    assert.equal(result.status, 4, result.stderr || result.stdout);
    const scope = JSON.parse(readFileSync(path.join(outDir, "scope-check.json"), "utf8"));
    assert.deepEqual(scope.changedFiles, ["allowed.md", "outside.md"]);
    assert.deepEqual(scope.outOfScope, ["outside.md"]);
    const manifest = JSON.parse(readFileSync(path.join(outDir, "run-manifest.json"), "utf8"));
    assert.equal(manifest.urls.issue, "https://github.com/owner/repo/issues/7");
    assert.notEqual(manifest.generatedAt, "1970-01-01T00:00:00.000Z");
  } finally {
    rmSync(repository, { recursive: true, force: true });
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

test("evaluate-agentic-retry escalates every second non-successful attempt", () => {
  for (const failureClass of ["auth", "policy", "scope"]) {
    const result = runScript("evaluate-agentic-retry.mjs", [
      "--conclusion",
      "failure",
      "--attempt",
      "2",
      "--failure-class",
      failureClass,
      "--safe-output-state",
      "complete"
    ]);
    assert.equal(result.status, 11, `${failureClass}: ${result.stdout} ${result.stderr}`);
    assert.equal(parseJson(result.stdout).action, "escalate");
  }
});

test("evaluate-agentic-retry gives unsafe, partial, or applied safe-output states precedence", () => {
  for (const safeOutputState of ["unsafe", "partial", "applied"]) {
    for (const failureClass of ["transient", "auth", "policy", "scope"]) {
      const result = runScript("evaluate-agentic-retry.mjs", [
        "--conclusion",
        "failure",
        "--attempt",
        "1",
        "--failure-class",
        failureClass,
        "--safe-output-state",
        safeOutputState
      ]);
      assert.equal(result.status, 11, `${safeOutputState}/${failureClass}: ${result.stdout} ${result.stderr}`);
      const json = parseJson(result.stdout);
      assert.equal(json.authorizeRetry, false);
      assert.equal(json.action, "escalate");
    }
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
