#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { LifecycleError, resolveVerifiedExtractBindings } from "../hr-cutover/full-domain-lifecycle.mjs";

const sandbox = mkdtempSync(join(tmpdir(), "yuzhou-extract-binding-"));
const adapterSource = readFileSync(resolve(import.meta.dirname, "../hr-cutover/domain-adapter.mjs"), "utf8");
const sha256 = value => createHash("sha256").update(value).digest("hex");
const expectCode = (code, operation) => assert.throws(operation, error => error instanceof LifecycleError && error.code === code);
const triple = { codeSha: "a".repeat(40), sourceSnapshotHash: "b".repeat(64), mappingContractHash: "c".repeat(64) };
const runId = "yzfull-20260828T120000Z-aaaaaaaa-rA";
const project = "jinhu_hr_migration_lab_full_manifest_bind_a";
const root = join(sandbox, project);
const stagingRoot = join(root, "staging");
const evidenceRoot = join(root, "evidence");
const config = { runId, triple, target: { root, stagingRoot, evidenceRoot } };

function privateFile(path, content) {
  writeFileSync(path, content, { mode: 0o600 });
  chmodSync(path, 0o600);
}

const DOMAIN_FIXTURES = {
  T0: {
    departments: { file: "departments.jsonl", env: "YUZHOU_DEPARTMENTS_SHA256" },
    positions: { file: "positions.jsonl", env: "YUZHOU_POSITIONS_SHA256" },
    employees: { file: "employees.jsonl", env: "YUZHOU_EMPLOYEES_SHA256" },
    employeeJobStates: { file: "employee-job-states.raw.json" },
    jobStateCodeMetadata: { file: "job-state-code-metadata.raw.json" },
    jobStateCodes: { file: "job-state-codes.raw.json" }
  },
  T1: {
    employmentEvents: { file: "employment-events.jsonl", env: "YUZHOU_T1_EVENTS_SHA256" },
    employmentEventTypes: { file: "employment-event-types.json", env: "YUZHOU_T1_TYPES_SHA256" },
    employmentEventStates: { file: "employment-event-states.json" }
  },
  T2: {
    "dbo.compacttypecode": { file: "contract-types.jsonl", env: "YUZHOU_T2_TYPES_SHA256" },
    "dbo.compact": { file: "contracts.jsonl", env: "YUZHOU_T2_CONTRACTS_SHA256" },
    "dbo.compact_c": { file: "contract-changes.jsonl", env: "YUZHOU_T2_CHANGES_SHA256" },
    "dbo.compact.state": { file: "contract-states.raw.json" }
  },
  T3: {
    attendance: { file: "attendance.jsonl", env: "YUZHOU_T3_ATTENDANCE_SHA256" },
    policies: { file: "policies.jsonl", env: "YUZHOU_T3_POLICIES_SHA256" },
    insurance: { file: "insurance.jsonl", env: "YUZHOU_T3_INSURANCE_SHA256" }
  }
};

function writeDomainFixture(domain) {
  const index = Number(domain.slice(1));
  const directory = join(stagingRoot, `staging-${runId}-t${index}`);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const domains = {};
  const env = {};
  for (const [key, definition] of Object.entries(DOMAIN_FIXTURES[domain])) {
    const { file } = definition;
    const bytes = Buffer.from(`${domain}:${key}\n`);
    privateFile(join(directory, file), bytes);
    domains[key] = { rows: 1, file, fileSha256: sha256(bytes) };
    if (definition.env) env[definition.env] = domains[key].fileSha256;
  }
  const manifest = { formatVersion: 1, generatedAt: "2026-08-28T12:00:00.000Z", domains };
  if (domain === "T3") Object.assign(manifest, {
    artifactKind: "yuzhou_t3_attendance_insurance_stage", sourceReadOnly: true,
    sourceSnapshotSha256: triple.sourceSnapshotHash, productionImport: "HOLD"
  });
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  privateFile(join(directory, "manifest.json"), manifestBytes);
  return { domain, directory, env, manifestBytes, domains };
}

function writeJournal(fixture, overrides = {}) {
  mkdirSync(evidenceRoot, { recursive: true, mode: 0o700 });
  chmodSync(evidenceRoot, 0o700);
  const index = Number(fixture.domain.slice(1));
  const record = {
    kind: "child", domain: fixture.domain, phase: "extract", childRunId: `${runId}-t${index}`, status: "verified", triple,
    extractManifestSha256: sha256(fixture.manifestBytes),
    extractBindingSha256: sha256(`${JSON.stringify(fixture.env)}\n`),
    ...overrides
  };
  privateFile(join(evidenceRoot, "lifecycle-journal.jsonl"), `${JSON.stringify(record)}\n`);
}

try {
  assert.match(adapterSource, /config\.backend === "lab" && phase === "load"[\s\S]*resolveVerifiedExtractBindings\(config, domain\)[\s\S]*Object\.assign\(env, bindings\)/u);
  assert.match(adapterSource, /const candidate = error instanceof LifecycleError \? error\.code : error\?\.code;[\s\S]*\^\[A-Z\]\[A-Z0-9_\]\{2,80\}\$/u, "adapter must preserve only a bounded machine error code from a protected child");
  const fixtures = Object.keys(DOMAIN_FIXTURES).map(writeDomainFixture);
  for (const fixture of fixtures) {
    writeJournal(fixture);
    assert.deepEqual(resolveVerifiedExtractBindings(config, fixture.domain), fixture.env);
  }

  const fixture = fixtures[0];
  writeJournal(fixture, { childRunId: `${runId}-t1` });
  expectCode("EXTRACT_MANIFEST_BINDING_MISMATCH", () => resolveVerifiedExtractBindings(config, "T0"));
  writeJournal(fixture, { domain: "T1" });
  expectCode("EXTRACT_MANIFEST_UNVERIFIED", () => resolveVerifiedExtractBindings(config, "T0"));
  writeJournal(fixture, { triple: { ...triple, mappingContractHash: "d".repeat(64) } });
  expectCode("EXTRACT_MANIFEST_BINDING_MISMATCH", () => resolveVerifiedExtractBindings(config, "T0"));

  writeJournal(fixture);
  privateFile(join(fixture.directory, "departments.jsonl"), "drift\n");
  expectCode("EXTRACT_MANIFEST_HASH_DRIFT", () => resolveVerifiedExtractBindings(config, "T0"));
  privateFile(join(fixture.directory, "departments.jsonl"), "T0:departments\n");
  chmodSync(join(fixture.directory, "positions.jsonl"), 0o644);
  expectCode("EXTRACT_MANIFEST_UNVERIFIED", () => resolveVerifiedExtractBindings(config, "T0"));

  console.log("Yuzhou current-run extract manifest binding contract passed (run/triple/domain/hash/permission drift fail closed).");
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
