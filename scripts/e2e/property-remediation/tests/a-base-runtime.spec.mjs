import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  decodeJsonFile,
  decodeJsonText,
  validateSchema
} from "../lib/strict-decoder.mjs";

const enabled = process.env.PROPERTY_A_BASE_RUNTIME_TEST === "yes";
const rootDir = resolve(".");
const runner = resolve(
  "scripts/e2e/property-remediation/a-base-core.mjs"
);
const cleanupEvidenceSchema = decodeJsonFile(
  resolve("scripts/e2e/property-remediation/contracts/cleanup-evidence.schema.json")
);

function environment(runId, extra = {}) {
  const clean = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        ![
          "DATABASE_URL",
          "POSTGRES_URL",
          "PROPERTY_RBAC_FIXTURE_DATABASE_URL",
          "PROPERTY_EPHEMERAL_DB_DATABASE_URL"
        ].includes(key)
    )
  );
  return {
    ...clean,
    TMPDIR: "/tmp",
    PROPERTY_A_BASE_RUN_ID: runId,
    PROPERTY_A_BASE_HANDOFF_MODE: "non-final",
    ...extra
  };
}

function run(runId, extra = {}) {
  return spawnSync(process.execPath, [runner], {
    cwd: rootDir,
    env: environment(runId, extra),
    encoding: "utf8",
    timeout: 240_000,
    maxBuffer: 20 * 1024 * 1024
  });
}

function assertNoContainer(runId) {
  const result = spawnSync(
    "docker",
    [
      "ps",
      "-a",
      "--filter",
      `label=com.jinhu.fixture.run-id=${runId}a`,
      "--format",
      "{{.ID}}"
    ],
    { cwd: rootDir, encoding: "utf8" }
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "");
}

function cleanupEvidence(runId) {
  const path = resolve(
    `artifacts/property-remediation/runs/${runId}/a/cleanup-evidence.json`
  );
  assert.ok(existsSync(path), path);
  return validateSchema(
    decodeJsonText(readFileSync(path, "utf8"), path),
    cleanupEvidenceSchema,
    path
  );
}

test(
  "A0-PROVISION-RUNTIME normal provision twice has stable checksum and zero residual",
  { skip: !enabled },
  () => {
    const runId = "abasertnormal001";
    const result = run(runId);
    assert.equal(result.status, 0, result.stderr);
    const summary = decodeJsonText(result.stdout.trim(), "runner stdout");
    assert.equal(summary.status, "A-base-core non-final provision validated");
    assert.equal(summary.residual_count, 0);
    assert.equal(
      existsSync(
        resolve(
          `artifacts/property-remediation/runs/${runId}/handoff.json`
        )
      ),
      false
    );
    assertNoContainer(runId);
  }
);

for (const [name, fault] of [
  ["physical-file-crash", "during_physical_files"],
  ["cleanup-crash", "during_cleanup"]
]) {
  test(
    `A0-PROVISION-RUNTIME ${name} is recoverable`,
    { skip: !enabled },
    () => {
      const runId =
        fault === "during_cleanup" ? "abasertcleanup01" : "abasertfiles001";
      const failed = run(runId, { PROPERTY_A_BASE_FAULT_POINT: fault });
      assert.notEqual(failed.status, 0);
      assertNoContainer(runId);
      if (fault === "during_cleanup") {
        const reconciled = run(runId, {
          PROPERTY_A_BASE_RECONCILE_ONLY: "yes"
        });
        assert.equal(reconciled.status, 0, reconciled.stderr);
      }
      const evidence = cleanupEvidence(runId);
      assert.equal(evidence.database_residual_count, 0);
      assert.equal(evidence.physical_file_residual_count, 0);
    }
  );
}

for (const signal of ["SIGINT", "SIGTERM", "SIGKILL"]) {
  test(
    `A0-PROVISION-RUNTIME ${signal} exact reconcile removes all resources`,
    { skip: !enabled },
    async () => {
      const runId = `abasert${signal.toLowerCase().slice(3)}001`;
      const child = spawn(process.execPath, [runner], {
        cwd: rootDir,
        env: environment(runId),
        stdio: ["ignore", "pipe", "pipe"]
      });
      await new Promise((resolveStarted, rejectStarted) => {
        const timer = setTimeout(resolveStarted, 5_000);
        child.once("error", rejectStarted);
        child.stderr.once("data", () => {
          clearTimeout(timer);
          setTimeout(resolveStarted, 1_000);
        });
      });
      child.kill(signal);
      await new Promise((resolveExit) => child.once("exit", resolveExit));
      const reconciled = run(runId, {
        PROPERTY_A_BASE_RECONCILE_ONLY: "yes"
      });
      assert.equal(reconciled.status, 0, reconciled.stderr);
      assertNoContainer(runId);
    }
  );
}
