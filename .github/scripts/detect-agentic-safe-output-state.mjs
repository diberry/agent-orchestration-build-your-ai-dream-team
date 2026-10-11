#!/usr/bin/env node
import process from "node:process";
import { pathToFileURL } from "node:url";
import { parseFlags, readJson } from "./lib/common.mjs";

function isSafeOutputJob(job) {
  return String(job?.name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "") === "safeoutputs";
}

function detectSafeOutputState(jobs) {
  const matching = Array.isArray(jobs) ? jobs.filter(isSafeOutputJob) : [];
  if (matching.length !== 1) {
    return "unsafe";
  }
  return matching[0].conclusion === "skipped" ? "none" : "unsafe";
}

function main() {
  let flags;
  try {
    flags = parseFlags(process.argv.slice(2), {
      boolean: ["help"],
      value: ["jobs"]
    });
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
  if (flags.help) {
    console.log("Usage: node .github/scripts/detect-agentic-safe-output-state.mjs --jobs PATH");
    return;
  }
  if (!flags.jobs) {
    console.error("--jobs PATH is required.");
    process.exit(2);
  }
  const document = readJson(flags.jobs);
  console.log(detectSafeOutputState(document.jobs));
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entryUrl) {
  main();
}

export { detectSafeOutputState };
