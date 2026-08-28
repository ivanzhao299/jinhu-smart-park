#!/usr/bin/env node
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { verifyYuzhouJobStateDecisionArtifact } from "./yuzhou-job-state-decision-artifact-lib.mjs";

const fail = (code, detail) => {
  const error = new Error(`${code}: ${detail}`);
  error.code = code;
  throw error;
};

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--artifact") {
  fail("YUZHOU_JOB_STATE_ARTIFACT_ARGUMENT_INVALID", "usage: --artifact <json-file>");
}

const artifactPath = resolve(args[1]);
if (!statSync(artifactPath).isFile()) fail("YUZHOU_JOB_STATE_ARTIFACT_FILE_INVALID", "regular file required");

let artifact;
try {
  artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
} catch {
  fail("YUZHOU_JOB_STATE_ARTIFACT_JSON_INVALID", "valid JSON required");
}

const result = verifyYuzhouJobStateDecisionArtifact(artifact);
process.stdout.write(`${JSON.stringify(result)}\n`);
