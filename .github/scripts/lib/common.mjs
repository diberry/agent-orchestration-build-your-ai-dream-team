import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

export const EXIT = Object.freeze({
  OK: 0,
  VALIDATION_FAILED: 1,
  USAGE: 2,
  SCOPE_FAILED: 4,
  RETRY_DENIED: 10,
  RETRY_ESCALATE: 11
});

export function parseFlags(argv, options = {}) {
  const result = { _: [] };
  const booleanFlags = new Set(options.boolean ?? []);
  const valueFlags = new Set(options.value ?? []);

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      result._.push(...argv.slice(index + 1));
      break;
    }
    if (!arg.startsWith("--")) {
      result._.push(arg);
      continue;
    }

    const equalIndex = arg.indexOf("=");
    const name = equalIndex === -1 ? arg.slice(2) : arg.slice(2, equalIndex);
    if (booleanFlags.has(name)) {
      result[name] = equalIndex === -1 ? true : arg.slice(equalIndex + 1) !== "false";
      continue;
    }
    if (!valueFlags.has(name)) {
      throw new Error(`Unknown option --${name}`);
    }
    if (equalIndex !== -1) {
      result[name] = arg.slice(equalIndex + 1);
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for --${name}`);
    }
    result[name] = value;
    index += 1;
  }
  return result;
}

export function readText(filePath) {
  return readFileSync(filePath, "utf8");
}

export function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

export function fileExists(filePath) {
  return existsSync(filePath) && statSync(filePath).isFile();
}

export function directoryExists(filePath) {
  return existsSync(filePath) && statSync(filePath).isDirectory();
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeRepoPath(value) {
  return String(value ?? "")
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "")
    .replace(/\/+/g, "/")
    .trim();
}

export function uniqueSorted(values) {
  return [...new Set(values.map(normalizeRepoPath).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export function ensureDir(dirPath) {
  mkdirSync(dirPath, { recursive: true });
}

export function writeJson(filePath, data) {
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export function findFiles(startDirectory, predicate, ignoredNames = new Set([".git", "node_modules"])) {
  const found = [];
  if (!directoryExists(startDirectory)) {
    return found;
  }
  const entries = readdirSync(startDirectory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (ignoredNames.has(entry.name)) {
      continue;
    }
    const fullPath = path.join(startDirectory, entry.name);
    if (entry.isDirectory()) {
      found.push(...findFiles(fullPath, predicate, ignoredNames));
    } else if (entry.isFile() && predicate(fullPath)) {
      found.push(fullPath);
    }
  }
  return found;
}

export function createReporter({ json = false } = {}) {
  const checks = [];
  return {
    pass(id, message, details = undefined) {
      checks.push({ id, ok: true, message, ...(details === undefined ? {} : { details }) });
    },
    fail(id, message, details = undefined) {
      checks.push({ id, ok: false, message, ...(details === undefined ? {} : { details }) });
    },
    result(extra = {}) {
      const failures = checks.filter((check) => !check.ok);
      return {
        ok: failures.length === 0,
        failures: failures.length,
        checks,
        ...extra
      };
    },
    print(result, heading = "Validation") {
      if (json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(`${heading}: ${result.ok ? "passed" : "failed"}`);
      for (const check of result.checks) {
        console.log(`${check.ok ? "✓" : "✗"} ${check.id}: ${check.message}`);
      }
      if (!result.ok) {
        console.error(`${result.failures} check${result.failures === 1 ? "" : "s"} failed.`);
      }
    }
  };
}

export function redactValue(value) {
  const text = String(value ?? "");
  if (!text) {
    return text;
  }
  let redacted = text;
  redacted = redacted.replace(
    /^(\s*(?:authorization|proxy-authorization|cookie|set-cookie)\s*:\s*)[^\r\n]*$/gim,
    "$1[REDACTED]"
  );
  redacted = redacted.replace(/gh[pousr]_[A-Za-z0-9_]{20,}/g, "[REDACTED]");
  redacted = redacted.replace(/github_pat_[A-Za-z0-9_]{20,}/g, "[REDACTED]");
  redacted = redacted.replace(/\b[A-Za-z0-9+/]{32,}={0,2}\b/g, "[REDACTED]");
  return redacted;
}

export function isSensitiveKey(key) {
  return /(token|secret|password|passwd|credential|private|auth|api[_-]?key|ssh|cookie)/i.test(String(key));
}
