#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import path from "node:path";
import { createReporter, ensureDir, EXIT, fileExists, parseFlags, readJson, readText } from "./lib/common.mjs";

const REQUIRED_PROJECT_FIELDS = ["name", "owner", "status", "recentActivity", "priority"];

function usage() {
  return [
    "Usage: node .github/scripts/validate-project-pulse.mjs [--root PATH] [--log PATH] [--json]",
    "",
    "Validates the Project Pulse static app contract:",
    "  app/index.html, app/styles.css, app/project-data.json, and .vscode/launch.json.",
    "",
    "Exit codes: 0 passed, 1 validation failed, 2 usage error."
  ].join("\n");
}

function includesRegex(text, regex) {
  return regex.test(text);
}

function validateHtml(root, reporter) {
  const htmlPath = path.join(root, "app", "index.html");
  if (!fileExists(htmlPath)) {
    reporter.fail("html.exists", "app/index.html is missing.");
    return;
  }
  reporter.pass("html.exists", "app/index.html exists.");
  const html = readText(htmlPath);

  const checks = [
    ["html.title", /<title>\s*Project Pulse\s*<\/title>/i, "uses the exact Project Pulse title"],
    ["html.stylesheet", /<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']styles\.css["'][^>]*>/i, "references styles.css"],
    ["html.data-reference", /project-data\.json/i, "references project-data.json"],
    ["html.projects-array", /\bprojects\b/i, "uses the top-level projects data"],
    ["html.data-iteration", /\.(?:forEach|map)\s*\(|for\s*\([^)]*\bprojects\b/i, "iterates over project data"],
    ["html.project-card", /project-card/i, "renders project-card elements from data"],
    ["html.visible-status", /\bstatus\b/i, "renders or labels project status"],
    ["html.visible-recent-activity", /\brecentActivity\b|recent activity/i, "renders or labels recentActivity"],
    ["html.visible-priority", /\bpriority\b/i, "renders or labels project priority"],
    ["html.safe-text", /\.textContent\s*=|createTextNode\s*\(/i, "writes data as visible text"]
  ];

  for (const [id, regex, message] of checks) {
    if (includesRegex(html, regex)) {
      reporter.pass(id, message);
    } else {
      reporter.fail(id, `app/index.html must ${message}.`);
    }
  }

  const externalReferences = html.match(/\b(?:https?:)?\/\//gi) ?? [];
  if (externalReferences.length === 0) {
    reporter.pass("html.no-external", "does not reference external network resources.");
  } else {
    reporter.fail("html.no-external", "must not reference external network resources.", externalReferences);
  }

  if (/\b(?:eval|Function)\s*\(/.test(html)) {
    reporter.fail("html.no-dynamic-eval", "must not use eval or Function constructors.");
  } else {
    reporter.pass("html.no-dynamic-eval", "does not use eval or Function constructors.");
  }
}

function validateCss(root, reporter) {
  const cssPath = path.join(root, "app", "styles.css");
  if (!fileExists(cssPath)) {
    reporter.fail("css.exists", "app/styles.css is missing.");
    return;
  }
  reporter.pass("css.exists", "app/styles.css exists.");
  const css = readText(cssPath);

  const requiredSelectors = [
    ".dashboard",
    ".project-card"
  ];
  for (const selector of requiredSelectors) {
    if (css.includes(selector)) {
      reporter.pass(`css.selector.${selector}`, `defines ${selector}.`);
    } else {
      reporter.fail(`css.selector.${selector}`, `app/styles.css must define ${selector}.`);
    }
  }

  if (/@media\s*\(/i.test(css)) {
    reporter.pass("css.responsive", "includes responsive media queries.");
  } else {
    reporter.fail("css.responsive", "must include responsive media queries.");
  }

  if (/:focus-visible|:focus\b/i.test(css)) {
    reporter.pass("css.focus", "includes keyboard focus styling.");
  } else {
    reporter.fail("css.focus", "must include focus or focus-visible styling.");
  }

  if (/prefers-reduced-motion/i.test(css)) {
    reporter.pass("css.reduced-motion", "includes reduced-motion accessibility handling.");
  } else {
    reporter.fail("css.reduced-motion", "must include prefers-reduced-motion handling.");
  }

  if (/\.project-card[\s\S]{0,800}border-radius\s*:/i.test(css)) {
    reporter.pass("css.project-card.border-radius", "styles project cards with border-radius.");
  } else {
    reporter.fail("css.project-card.border-radius", "must give .project-card a border-radius.");
  }

  if (/\.project-card[\s\S]{0,800}box-shadow\s*:/i.test(css)) {
    reporter.pass("css.project-card.box-shadow", "styles project cards with box-shadow.");
  } else {
    reporter.fail("css.project-card.box-shadow", "must give .project-card a box-shadow.");
  }

  if (/@import\b|url\(\s*["']?(?:https?:)?\/\//i.test(css)) {
    reporter.fail("css.no-external", "must not import external network resources.");
  } else {
    reporter.pass("css.no-external", "does not import external network resources.");
  }
}

function validateData(root, reporter) {
  const dataPath = path.join(root, "app", "project-data.json");
  if (!fileExists(dataPath)) {
    reporter.fail("data.exists", "app/project-data.json is missing.");
    return;
  }
  reporter.pass("data.exists", "app/project-data.json exists.");

  let data;
  try {
    data = readJson(dataPath);
    reporter.pass("data.strict-json", "is strict JSON.");
  } catch (error) {
    reporter.fail("data.strict-json", `must be strict JSON: ${error.message}`);
    return;
  }

  if (!data || typeof data !== "object" || Array.isArray(data) || !Array.isArray(data.projects)) {
    reporter.fail("data.projects", "must contain a top-level projects array.");
    return;
  }
  reporter.pass("data.projects", "contains a top-level projects array.");

  if (data.projects.length > 0) {
    reporter.pass("data.nonempty", "contains at least one project.");
  } else {
    reporter.fail("data.nonempty", "must contain at least one project.");
  }

  data.projects.forEach((project, index) => {
    const prefix = `data.project.${index}`;
    if (!project || typeof project !== "object" || Array.isArray(project)) {
      reporter.fail(`${prefix}.object`, "each project must be an object.");
      return;
    }
    for (const field of REQUIRED_PROJECT_FIELDS) {
      if (typeof project[field] === "string" && project[field].trim()) {
        reporter.pass(`${prefix}.${field}`, `${field} is a non-empty string.`);
      } else {
        reporter.fail(`${prefix}.${field}`, `${field} must be a non-empty string.`);
      }
    }
  });
}

function validateLaunch(root, reporter) {
  const launchPath = path.join(root, ".vscode", "launch.json");
  if (!fileExists(launchPath)) {
    reporter.fail("launch.exists", ".vscode/launch.json is missing.");
    return;
  }
  reporter.pass("launch.exists", ".vscode/launch.json exists.");

  let launch;
  try {
    launch = readJson(launchPath);
    reporter.pass("launch.strict-json", "is strict JSON.");
  } catch (error) {
    reporter.fail("launch.strict-json", `must be strict JSON: ${error.message}`);
    return;
  }

  const config = Array.isArray(launch.configurations)
    ? launch.configurations.find((item) => item?.name === "Run Project Pulse Dashboard")
    : undefined;
  if (!config) {
    reporter.fail("launch.configuration", "must include a Run Project Pulse Dashboard configuration.");
    return;
  }
  reporter.pass("launch.configuration", "includes Run Project Pulse Dashboard.");

  const exactChecks = [
    ["launch.command", config.command, "python3 -m http.server 5500"],
    ["launch.cwd", config.cwd, "${workspaceFolder}/app"],
    ["launch.serverReadyAction.uriFormat", config.serverReadyAction?.uriFormat, "http://localhost:%s/index.html"]
  ];
  for (const [id, actual, expected] of exactChecks) {
    if (actual === expected) {
      reporter.pass(id, `${id} is ${expected}.`);
    } else {
      reporter.fail(id, `expected ${expected}, got ${String(actual)}.`);
    }
  }

  if (typeof config.serverReadyAction?.pattern === "string" && config.serverReadyAction.pattern.includes("port ([0-9]+)")) {
    reporter.pass("launch.serverReadyAction.pattern", "captures the server port.");
  } else {
    reporter.fail("launch.serverReadyAction.pattern", "must capture the server port with ([0-9]+).");
  }
}

function main() {
  let flags;
  try {
    flags = parseFlags(process.argv.slice(2), { boolean: ["json", "help"], value: ["root", "log"] });
  } catch (error) {
    console.error(error.message);
    console.error(usage());
    process.exit(EXIT.USAGE);
  }
  if (flags.help) {
    console.log(usage());
    process.exit(EXIT.OK);
  }

  const root = path.resolve(flags.root ?? process.cwd());
  const reporter = createReporter({ json: Boolean(flags.json) });
  validateHtml(root, reporter);
  validateCss(root, reporter);
  validateData(root, reporter);
  validateLaunch(root, reporter);
  const result = reporter.result({ root });
  const output = flags.json
    ? JSON.stringify(result, null, 2)
    : [
        `Project Pulse validation: ${result.ok ? "passed" : "failed"}`,
        ...result.checks.map((check) => `${check.ok ? "✓" : "✗"} ${check.id}: ${check.message}`),
        ...(result.ok ? [] : [`${result.failures} check${result.failures === 1 ? "" : "s"} failed.`])
      ].join("\n");
  console.log(output);
  if (flags.log) {
    const logPath = path.resolve(flags.log);
    ensureDir(path.dirname(logPath));
    writeFileSync(logPath, `${output}\n`, "utf8");
  }
  process.exit(result.ok ? EXIT.OK : EXIT.VALIDATION_FAILED);
}

main();
