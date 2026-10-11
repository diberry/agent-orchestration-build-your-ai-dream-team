#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const GH_AW_VERSION = "v0.83.4";
const SETUP_VARIABLE = "AGENTIC_SETUP_COMPLETE";
const RULESET_NAME = "Project Pulse agentic workflow guardrails";
const REQUIRED_SECRETS = [
  {
    name: "COPILOT_GITHUB_TOKEN",
    purpose: "Copilot inference",
    access: "Fine-grained PAT with account permission Copilot Requests: Read"
  },
  {
    name: "GH_AW_CI_TRIGGER_TOKEN",
    purpose: "Trigger normal CI on agent-created pull requests",
    access: "Fine-grained PAT scoped to this repository with Contents: Read and write"
  }
];

function usage() {
  return [
    "Usage:",
    "  node .github/scripts/setup-agentic-workflows.mjs --configure [--repo OWNER/REPO]",
    "  node .github/scripts/setup-agentic-workflows.mjs --check [--repo OWNER/REPO]",
    "",
    "--configure installs the pinned gh-aw extension, prompts only for missing secrets,",
    "and configures the label, Actions permissions, branch ruleset, and setup marker.",
    "--check performs the same preflight without changing repository configuration.",
    "",
    "The authenticated gh user must be a repository administrator."
  ].join("\n");
}

function parseArgs(argv) {
  const result = { mode: "", repo: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--configure" || argument === "--check") {
      if (result.mode) {
        throw new Error("Choose exactly one of --configure or --check.");
      }
      result.mode = argument.slice(2);
    } else if (argument === "--repo") {
      result.repo = argv[index + 1] ?? "";
      index += 1;
      if (!result.repo) {
        throw new Error("--repo requires OWNER/REPO.");
      }
    } else if (argument === "--help" || argument === "-h") {
      result.mode = "help";
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (!result.mode) {
    throw new Error("Choose --configure or --check.");
  }
  return result;
}

function resolveGh() {
  if (process.env.GH_BIN) {
    return process.env.GH_BIN;
  }
  if (process.platform !== "win32") {
    return "gh";
  }
  const programFiles = process.env.ProgramFiles;
  const installed = programFiles ? path.join(programFiles, "GitHub CLI", "gh.exe") : "";
  if (installed && existsSync(installed)) {
    return installed;
  }
  const located = spawnSync("where.exe", ["gh.exe"], {
    encoding: "utf8",
    windowsHide: true
  });
  return located.status === 0 ? located.stdout.split(/\r?\n/).find(Boolean) : "gh.exe";
}

function runGh(args, options = {}) {
  const result = spawnSync(resolveGh(), args, {
    encoding: options.inherit ? undefined : "utf8",
    input: options.input,
    stdio: options.inherit ? "inherit" : ["pipe", "pipe", "pipe"],
    windowsHide: true
  });
  if (result.error) {
    throw new Error(`Unable to run gh: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const detail = options.inherit ? "" : String(result.stderr || result.stdout || "").trim();
    throw new Error(`gh ${args.slice(0, 3).join(" ")} failed${detail ? `: ${detail}` : "."}`);
  }
  return options.inherit ? "" : String(result.stdout).trim();
}

function runGhJson(args, options) {
  const output = runGh(args, options);
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`gh ${args.slice(0, 3).join(" ")} returned invalid JSON.`);
  }
}

function repoArgs(repo) {
  return repo ? ["--repo", repo] : [];
}

function buildRulesetPayload() {
  return {
    name: RULESET_NAME,
    target: "branch",
    enforcement: "active",
    bypass_actors: [],
    conditions: {
      ref_name: {
        exclude: [],
        include: ["~DEFAULT_BRANCH"]
      }
    },
    rules: [
      { type: "deletion" },
      { type: "non_fast_forward" },
      {
        type: "pull_request",
        parameters: {
          allowed_merge_methods: ["merge", "squash", "rebase"],
          dismiss_stale_reviews_on_push: true,
          require_code_owner_review: true,
          require_last_push_approval: true,
          required_approving_review_count: 1,
          required_review_thread_resolution: true
        }
      },
      {
        type: "required_status_checks",
        parameters: {
          do_not_enforce_on_create: true,
          required_status_checks: [
            { context: "Agentic workflow policy" },
            { context: "Project Pulse contract" }
          ],
          strict_required_status_checks_policy: true
        }
      }
    ]
  };
}

function ruleTypes(ruleset) {
  return new Set((ruleset.rules || []).map((rule) => rule.type));
}

function sameStringSet(actual, expected) {
  const actualValues = Array.isArray(actual) ? [...actual].sort() : [];
  const expectedValues = [...expected].sort();
  return JSON.stringify(actualValues) === JSON.stringify(expectedValues);
}

function evaluateSetupState(state, options = {}) {
  const failures = [];
  const secretNames = new Set((state.secrets || []).map((secret) => secret.name));
  for (const secret of REQUIRED_SECRETS) {
    if (!secretNames.has(secret.name)) {
      failures.push(`Missing Actions secret ${secret.name}.`);
    }
  }

  if (!state.label) {
    failures.push("Missing agentic:needs-human label.");
  }
  if (state.actions?.default_workflow_permissions !== "read") {
    failures.push("Actions default workflow permissions must be read.");
  }
  if (state.actions?.can_approve_pull_request_reviews !== true) {
    failures.push("Actions must be allowed to create pull requests.");
  }

  if (!state.ruleset || state.ruleset.enforcement !== "active") {
    failures.push(`Active ruleset "${RULESET_NAME}" is missing.`);
  } else {
    const expected = buildRulesetPayload();
    if ((state.ruleset.bypass_actors || []).length !== 0) {
      failures.push("Ruleset must not define bypass actors.");
    }
    const refCondition = state.ruleset.conditions?.ref_name;
    if (
      !sameStringSet(refCondition?.include, expected.conditions.ref_name.include) ||
      !sameStringSet(refCondition?.exclude, expected.conditions.ref_name.exclude)
    ) {
      failures.push("Ruleset must target only the default branch.");
    }
    const types = ruleTypes(state.ruleset);
    for (const requiredType of ["pull_request", "required_status_checks", "deletion", "non_fast_forward"]) {
      if (!types.has(requiredType)) {
        failures.push(`Ruleset is missing ${requiredType}.`);
      }
    }
    const pullRequestRule = (state.ruleset.rules || []).find((rule) => rule.type === "pull_request");
    const expectedPullRequestRule = expected.rules.find((rule) => rule.type === "pull_request");
    if (pullRequestRule) {
      const actual = pullRequestRule.parameters || {};
      const required = expectedPullRequestRule.parameters;
      if (
        !sameStringSet(actual.allowed_merge_methods, required.allowed_merge_methods) ||
        actual.dismiss_stale_reviews_on_push !== required.dismiss_stale_reviews_on_push ||
        actual.require_code_owner_review !== required.require_code_owner_review ||
        actual.require_last_push_approval !== required.require_last_push_approval ||
        actual.required_approving_review_count !== required.required_approving_review_count ||
        actual.required_review_thread_resolution !== required.required_review_thread_resolution
      ) {
        failures.push("Ruleset pull-request review safeguards do not match the required configuration.");
      }
    }
    const statusRule = (state.ruleset.rules || []).find((rule) => rule.type === "required_status_checks");
    const contexts = new Set(
      (statusRule?.parameters?.required_status_checks || []).map((check) => check.context)
    );
    for (const context of ["Agentic workflow policy", "Project Pulse contract"]) {
      if (!contexts.has(context)) {
        failures.push(`Ruleset does not require ${context}.`);
      }
    }
    if (statusRule && (
      statusRule.parameters?.strict_required_status_checks_policy !== true ||
      statusRule.parameters?.do_not_enforce_on_create !== true
    )) {
      failures.push("Ruleset status checks must be strict and allow initial branch creation.");
    }
  }

  if (options.requireMarker !== false && state.variable?.value !== "true") {
    failures.push(`${SETUP_VARIABLE} must be true.`);
  }
  return failures;
}

function readRepository(repo) {
  return runGhJson(["repo", "view", ...repoArgs(repo), "--json", "nameWithOwner,defaultBranchRef"]);
}

function readRuleset(repo) {
  const rulesets = runGhJson(["api", `repos/${repo}/rulesets`]);
  const summary = rulesets.find((ruleset) => ruleset.name === RULESET_NAME);
  return summary ? runGhJson(["api", `repos/${repo}/rulesets/${summary.id}`]) : null;
}

function readSetupState(repo) {
  const secrets = runGhJson(["secret", "list", "--app", "actions", ...repoArgs(repo), "--json", "name"]);
  const labels = runGhJson(["label", "list", ...repoArgs(repo), "--json", "name", "--limit", "100"]);
  const actions = runGhJson(["api", `repos/${repo}/actions/permissions/workflow`]);
  const variables = runGhJson(["variable", "list", ...repoArgs(repo), "--json", "name,value"]);
  return {
    secrets,
    label: labels.find((label) => label.name === "agentic:needs-human") || null,
    actions,
    ruleset: readRuleset(repo),
    variable: variables.find((variable) => variable.name === SETUP_VARIABLE) || null
  };
}

function configureSecrets(repo) {
  const existing = new Set(
    runGhJson(["secret", "list", "--app", "actions", ...repoArgs(repo), "--json", "name"])
      .map((secret) => secret.name)
  );
  for (const secret of REQUIRED_SECRETS) {
    if (existing.has(secret.name)) {
      console.log(`✓ ${secret.name} already exists.`);
      continue;
    }
    console.log(`\n${secret.name}: ${secret.purpose}`);
    console.log(`Required access: ${secret.access}`);
    console.log("Paste the token at the GitHub CLI prompt. The value is encrypted locally and is not printed.");
    runGh(["secret", "set", secret.name, "--app", "actions", ...repoArgs(repo)], { inherit: true });
  }
}

function configureRuleset(repo) {
  const rulesets = runGhJson(["api", `repos/${repo}/rulesets`]);
  const existing = rulesets.find((ruleset) => ruleset.name === RULESET_NAME);
  const endpoint = existing
    ? `repos/${repo}/rulesets/${existing.id}`
    : `repos/${repo}/rulesets`;
  runGh(
    ["api", "--method", existing ? "PUT" : "POST", endpoint, "--input", "-", "--silent"],
    { input: JSON.stringify(buildRulesetPayload()) }
  );
}

function configure(repo) {
  console.log(`Configuring GitHub Agentic Workflows for ${repo}...\n`);
  runGh(["variable", "set", SETUP_VARIABLE, ...repoArgs(repo), "--body", "false"]);
  runGh(["extension", "install", "github/gh-aw", "--pin", GH_AW_VERSION, "--force"], { inherit: true });
  configureSecrets(repo);
  runGh([
    "label", "create", "agentic:needs-human",
    ...repoArgs(repo),
    "--color", "B60205",
    "--description", "Automatic retry exhausted; maintainer investigation required.",
    "--force"
  ]);
  runGh([
    "api", "--method", "PUT", `repos/${repo}/actions/permissions/workflow`,
    "-f", "default_workflow_permissions=read",
    "-F", "can_approve_pull_request_reviews=true",
    "--silent"
  ]);
  configureRuleset(repo);
}

function printResult(repo, failures) {
  if (failures.length) {
    console.error(`\nAgentic setup is incomplete for ${repo}:`);
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    console.error("\nRun: node .github/scripts/setup-agentic-workflows.mjs --configure");
    return false;
  }
  console.log(`\n✓ Agentic setup is complete for ${repo}.`);
  console.log("The exercise start workflow and slash-command stages are unlocked.");
  return true;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.error(usage());
    process.exit(2);
  }
  if (args.mode === "help") {
    console.log(usage());
    return;
  }

  try {
    runGh(["auth", "status"]);
    const repository = readRepository(args.repo);
    const repo = repository.nameWithOwner;
    if (args.mode === "configure") {
      configure(repo);
      const configurationFailures = evaluateSetupState(readSetupState(repo), { requireMarker: false });
      if (configurationFailures.length) {
        process.exitCode = printResult(repo, configurationFailures) ? 0 : 1;
        return;
      }
      runGh(["aw", "doctor", "--repo", repo], { inherit: true });
      runGh(["variable", "set", SETUP_VARIABLE, ...repoArgs(repo), "--body", "true"]);
    }
    const failures = evaluateSetupState(readSetupState(repo));
    if (!failures.length && args.mode === "check") {
      runGh(["aw", "doctor", "--repo", repo], { inherit: true });
    }
    process.exitCode = printResult(repo, failures) ? 0 : 1;
  } catch (error) {
    console.error(`Setup failed: ${error.message}`);
    process.exitCode = 2;
  }
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entryUrl) {
  main();
}

export {
  GH_AW_VERSION,
  REQUIRED_SECRETS,
  RULESET_NAME,
  SETUP_VARIABLE,
  buildRulesetPayload,
  evaluateSetupState,
  parseArgs
};
