import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { captureEvidence } from "./capture-evidence.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");

function fixture(cleanupResidual = 0) {
  const temp = mkdtempSync(join(tmpdir(), "property-evidence-"));
  const inputs = {};
  for (const name of ["environment", "dataset", "profile"]) {
    const path = join(temp, `${name}.json`);
    const value = `${JSON.stringify({ name })}\n`;
    writeFileSync(path, value);
    inputs[name] = { path, sha256: hash(value) };
  }
  return { output: join(temp, "evidence"), spec: { schemaVersion: "property-track-c-evidence-spec-v1", commitSha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), ...inputs, reviewer: "automated-self-test", commands: [{ id: "gate", executable: "/usr/bin/printf", args: ["pass"] }], cleanup: { id: "cleanup", executable: process.execPath, args: ["-e", `process.stdout.write(JSON.stringify({residualCount:${cleanupResidual}}))`] } } };
}

function failingFixture(cleanupResidual = 0) {
  const value = fixture(cleanupResidual);
  value.spec.commands = [{ id: "gate", executable: process.execPath, args: ["-e", "process.exit(1)"] }];
  return value;
}

test("captures command hashes and cleanup proof", () => {
  const value = fixture();
  const result = captureEvidence(value);
  assert.equal(result.status, "PASS");
  assert.match(result.manifestSha256, /^[0-9a-f]{64}$/u);
  assert.equal(JSON.parse(readFileSync(join(value.output, "manifest.json"))).cleanup.residualCount, 0);
});

test("fails closed on cleanup residue", () => {
  const value = fixture(1);
  assert.equal(captureEvidence(value).status, "FAIL");
});

test("preserves cleanup residue when an earlier command already failed", () => {
  const value = failingFixture(3);
  const result = captureEvidence(value);
  assert.equal(result.failure.stage, "gate");
  assert.equal(result.cleanup.residualCount, 3);
});
