#!/usr/bin/env node
import { EXIT, parseFlags, readJson } from "./lib/common.mjs";

const REFUSAL_CLASSES = new Set([
  "human_cancellation",
  "cancelled",
  "auth",
  "authentication",
  "authorization",
  "permission",
  "policy",
  "scope",
  "scope_failure",
  "unsafe_output"
]);

const RETRYABLE_CLASSES = new Set([
  "retryable",
  "transient",
  "timeout",
  "timed_out",
  "runner",
  "infrastructure",
  "infra",
  "engine",
  "validation",
  "safe_output",
  "safe-output",
  "unknown"
]);

function usage() {
  return [
    "Usage: node .github/scripts/evaluate-agentic-retry.mjs --conclusion VALUE --attempt NUMBER [options]",
    "",
    "Options:",
    "  --failure-class VALUE        Optional explicit failure class.",
    "  --safe-output-state VALUE    complete, truncated, unsafe, missing, partial, or applied.",
    "  --safe-output-result PATH    JSON file produced by collect-agentic-evidence.mjs.",
    "  --json                      Accepted for consistency; output is always JSON.",
    "",
    "Exit codes: 0 retry authorized or no retry needed, 10 retry refused, 11 escalation required, 2 usage error."
  ].join("\n");
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
}

function readSafeOutputState(flags) {
  if (flags["safe-output-state"]) {
    return normalize(flags["safe-output-state"]);
  }
  if (flags["safe-output-result"]) {
    const result = readJson(flags["safe-output-result"]);
    if (result.state) {
      return normalize(result.state);
    }
    if (result.ok === false && result.truncated) {
      return "truncated";
    }
    if (result.ok === true) {
      return "complete";
    }
  }
  return "missing";
}

function classify({ conclusion, failureClass, safeOutputState }) {
  const normalizedConclusion = normalize(conclusion);
  const normalizedClass = normalize(failureClass);
  const normalizedSafeOutput = normalize(safeOutputState);

  if (normalizedConclusion === "success") {
    return { category: "success", retryable: false, terminal: true, reason: "run succeeded" };
  }
  if (normalizedConclusion === "cancelled" || normalizedClass === "human_cancellation" || normalizedClass === "cancelled") {
    return { category: "refuse", retryable: false, terminal: true, reason: "human cancellation is not retryable" };
  }
  if (REFUSAL_CLASSES.has(normalizedClass)) {
    return { category: "refuse", retryable: false, terminal: true, reason: `${normalizedClass} failures are not retryable` };
  }
  if (normalizedSafeOutput === "unsafe") {
    return { category: "refuse", retryable: false, terminal: true, reason: "unsafe output is a policy failure" };
  }
  if (normalizedSafeOutput === "partial" || normalizedSafeOutput === "applied") {
    return { category: "refuse", retryable: false, terminal: true, reason: `safe output state ${normalizedSafeOutput} must not be retried` };
  }
  if (normalizedConclusion === "action_required" || normalizedConclusion === "startup_failure") {
    return { category: "refuse", retryable: false, terminal: true, reason: `${normalizedConclusion} requires human attention` };
  }
  if (normalizedConclusion === "timed_out" || normalizedClass === "timeout" || normalizedClass === "timed_out") {
    return { category: "retryable", retryable: true, terminal: false, reason: "timeout may be transient" };
  }
  if (normalizedSafeOutput === "truncated" || normalizedSafeOutput === "missing") {
    return { category: "retryable", retryable: true, terminal: false, reason: `safe output state is ${normalizedSafeOutput}` };
  }
  if (RETRYABLE_CLASSES.has(normalizedClass)) {
    return { category: "retryable", retryable: true, terminal: false, reason: `${normalizedClass} failure may be transient` };
  }
  if (normalizedConclusion === "failure" || normalizedConclusion === "failed") {
    return { category: "retryable", retryable: true, terminal: false, reason: "failure has no non-retryable class" };
  }
  return { category: "refuse", retryable: false, terminal: true, reason: `unrecognized conclusion '${conclusion}' is not retryable` };
}

function decisionFor({ conclusion, attempt, failureClass, safeOutputState }) {
  const classification = classify({ conclusion, failureClass, safeOutputState });
  const base = {
    schemaVersion: 1,
    conclusion,
    attempt,
    failureClass: failureClass || "",
    safeOutputState,
    classification: classification.category,
    reason: classification.reason,
    authorizeRetry: false,
    nextAttempt: null,
    action: "refuse"
  };

  if (classification.category === "success") {
    return { ...base, action: "none", exitCode: EXIT.OK };
  }
  if (!classification.retryable) {
    return { ...base, action: "refuse", exitCode: EXIT.RETRY_DENIED };
  }
  if (attempt === 1) {
    return {
      ...base,
      authorizeRetry: true,
      nextAttempt: 2,
      action: "retry",
      exitCode: EXIT.OK
    };
  }
  if (attempt >= 2) {
    return {
      ...base,
      action: "escalate",
      reason: `${classification.reason}; attempt ${attempt} must escalate`,
      exitCode: EXIT.RETRY_ESCALATE
    };
  }
  return {
    ...base,
    action: "refuse",
    reason: "retry authorization is only available for retry attempt 1",
    exitCode: EXIT.RETRY_DENIED
  };
}

function main() {
  let flags;
  try {
    flags = parseFlags(process.argv.slice(2), {
      boolean: ["json", "help"],
      value: ["conclusion", "attempt", "failure-class", "safe-output-state", "safe-output-result"]
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
  if (!flags.conclusion || !flags.attempt) {
    console.error("--conclusion and --attempt are required.");
    console.error(usage());
    process.exit(EXIT.USAGE);
  }
  const attempt = Number(flags.attempt);
  if (!Number.isInteger(attempt) || attempt < 0) {
    console.error("--attempt must be a non-negative integer.");
    process.exit(EXIT.USAGE);
  }

  const safeOutputState = readSafeOutputState(flags);
  const decision = decisionFor({
    conclusion: normalize(flags.conclusion),
    attempt,
    failureClass: normalize(flags["failure-class"] ?? ""),
    safeOutputState
  });
  const { exitCode, ...jsonDecision } = decision;
  console.log(JSON.stringify(jsonDecision, null, 2));
  process.exit(exitCode);
}

main();
