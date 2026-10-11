#!/usr/bin/env node
import process from "node:process";
import { pathToFileURL } from "node:url";
import { parseFlags, readJson } from "./lib/common.mjs";

const FAILED_CONCLUSIONS = new Set(["failure", "cancelled", "timed_out", "action_required", "startup_failure"]);

function normalize(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function classifyFailure(jobs, scope) {
  if (scope?.ok === false) {
    return "scope";
  }

  const failedJobs = Array.isArray(jobs)
    ? jobs.filter((job) => FAILED_CONCLUSIONS.has(normalize(job?.conclusion).replaceAll(" ", "_")))
    : [];
  const labels = failedJobs.flatMap((job) => [
    normalize(job?.name),
    ...(Array.isArray(job?.steps)
      ? job.steps
        .filter((step) => FAILED_CONCLUSIONS.has(normalize(step?.conclusion).replaceAll(" ", "_")))
        .map((step) => normalize(step?.name))
      : [])
  ]).join("\n");

  if (/\b(detection|threat|policy)\b/.test(labels)) {
    return "policy";
  }
  if (/\b(authentication|authorization|membership|permission)\b/.test(labels)) {
    return "auth";
  }
  if (/\b(validate|validation|smoke test|collect sanitized)\b/.test(labels)) {
    return "validation";
  }
  if (/\b(agentic execution|copilot|engine|model)\b/.test(labels)) {
    return "engine";
  }
  if (/\b(setup|checkout|download|bootstrap|container|initialize)\b/.test(labels)) {
    return "infrastructure";
  }
  return "unknown";
}

function main() {
  let flags;
  try {
    flags = parseFlags(process.argv.slice(2), {
      boolean: ["help"],
      value: ["jobs", "scope"]
    });
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
  if (flags.help) {
    console.log("Usage: node .github/scripts/classify-agentic-failure.mjs --jobs PATH [--scope PATH]");
    return;
  }
  if (!flags.jobs) {
    console.error("--jobs PATH is required.");
    process.exit(2);
  }
  const document = readJson(flags.jobs);
  const scope = flags.scope ? readJson(flags.scope) : null;
  console.log(classifyFailure(document.jobs, scope));
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entryUrl) {
  main();
}

export { classifyFailure };
