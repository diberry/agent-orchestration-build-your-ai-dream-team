#!/usr/bin/env node
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { findFiles, parseFlags, readJson, writeJson } from "./lib/common.mjs";

function findFirstPullRequestUrl(evidenceDir) {
  const files = findFiles(evidenceDir, (filePath) => statSync(filePath).size <= 1_000_000);
  for (const filePath of files) {
    const content = readFileSync(filePath, "utf8");
    const match = content.match(/https:\/\/github\.com\/[^/\s"']+\/[^/\s"']+\/pull\/\d+/);
    if (match) {
      return match[0];
    }
  }
  return "";
}

function findPullRequestUrlInMetadata(metadataDir, repository) {
  if (!metadataDir || !repository) {
    return "";
  }
  const maps = findFiles(
    metadataDir,
    (filePath) => path.basename(filePath) === "temporary-id-map.json" && statSync(filePath).size <= 1_000_000
  );
  const prefix = `https://github.com/${repository}/pull/`;
  const urls = new Set();
  function visit(value) {
    if (typeof value === "string" && value.startsWith(prefix) && /^\d+$/.test(value.slice(prefix.length))) {
      urls.add(value);
    } else if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (value && typeof value === "object") {
      if (value.repo === repository && Number.isInteger(value.number) && value.number > 0) {
        urls.add(`${prefix}${value.number}`);
      }
      Object.values(value).forEach(visit);
    }
  }
  for (const filePath of maps) {
    visit(readJson(filePath));
  }
  return urls.size === 1 ? [...urls][0] : "";
}

function finalizeEvidence({ evidenceDir, conclusion, runUrl, endTime, safeOutputMetadataDir = "", repository = "" }) {
  const manifests = findFiles(evidenceDir, (filePath) => path.basename(filePath) === "run-manifest.json");
  const stageManifest = manifests.length ? readJson(manifests[0]) : null;
  return {
    schemaVersion: 1,
    finalizedAt: endTime,
    conclusion,
    runUrl,
    issueUrl: stageManifest?.urls?.issue ?? "",
    pullRequestUrl: findPullRequestUrlInMetadata(safeOutputMetadataDir, repository)
      || findFirstPullRequestUrl(evidenceDir)
      || stageManifest?.urls?.pullRequest
      || "",
    artifactUrl: `${runUrl}#artifacts`,
    stageEvidence: stageManifest
  };
}

function main() {
  let flags;
  try {
    flags = parseFlags(process.argv.slice(2), {
      boolean: ["help"],
      value: ["evidence", "out", "conclusion", "run-url", "end-time", "safe-output-metadata", "repository"]
    });
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
  if (flags.help) {
    console.log("Usage: node .github/scripts/finalize-agentic-evidence.mjs --evidence DIR --out PATH --conclusion VALUE --run-url URL --end-time ISO [--safe-output-metadata DIR --repository OWNER/REPO]");
    return;
  }
  for (const required of ["evidence", "out", "conclusion", "run-url", "end-time"]) {
    if (!flags[required]) {
      console.error(`--${required} is required.`);
      process.exit(2);
    }
  }
  const result = finalizeEvidence({
    evidenceDir: path.resolve(flags.evidence),
    conclusion: flags.conclusion,
    runUrl: flags["run-url"],
    endTime: flags["end-time"],
    safeOutputMetadataDir: flags["safe-output-metadata"] ? path.resolve(flags["safe-output-metadata"]) : "",
    repository: flags.repository ?? ""
  });
  writeJson(path.resolve(flags.out), result);
  console.log(`Finalized evidence: ${flags.out}`);
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entryUrl) {
  main();
}

export { finalizeEvidence, findFirstPullRequestUrl, findPullRequestUrlInMetadata };
