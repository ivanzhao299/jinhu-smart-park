import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { sha256 } from "./canonical.mjs";
import { computeProfileChecksum } from "./profile.mjs";
import {
  REVIEWED_BOOTSTRAP_SHA256,
  REVIEWED_MIGRATION_175_SHA256
} from "./reviewed-bootstrap-contract.mjs";
import { validateSchema } from "./strict-decoder.mjs";

export const A_BASE_ARTIFACT_HASH_KEYS = Object.freeze([
  "a/provision-evidence.json",
  "a/cleanup-evidence.json",
  "b/provision-evidence.json",
  "b/cleanup-evidence.json",
  "source/actor-oracle.json",
  "source/traceability.json",
  "source/evidence-catalog.json"
]);

export const A_BASE_CLEANUP_JOURNAL_HASH_KEYS = Object.freeze([
  "a/cleanup-manifest.jsonl",
  "b/cleanup-manifest.jsonl"
]);

const A_BASE_SOURCE_ROOT = "scripts/e2e/property-remediation";
const A_BASE_SOURCE_DIRECTORIES = Object.freeze([
  "contracts",
  "lib",
  "profiles",
  "roles",
  "tests",
  "traceability"
]);
const A_BASE_SOURCE_FILES = Object.freeze([
  `${A_BASE_SOURCE_ROOT}/a-base-core.mjs`,
  `${A_BASE_SOURCE_ROOT}/bootstrap/ephemeral-postgres.mjs`,
  `${A_BASE_SOURCE_ROOT}/README.md`
]);
const A_BASE_GIT_SCOPE_PATHS = Object.freeze([
  `${A_BASE_SOURCE_ROOT}/a-base-core.mjs`,
  `${A_BASE_SOURCE_ROOT}/bootstrap/ephemeral-postgres.mjs`,
  `${A_BASE_SOURCE_ROOT}/README.md`,
  ...A_BASE_SOURCE_DIRECTORIES.map(
    (directory) => `${A_BASE_SOURCE_ROOT}/${directory}`
  )
]);

function exactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const frozen = [...expected].sort();
  if (
    actual.length !== frozen.length ||
    actual.some((key, index) => key !== frozen[index])
  ) {
    throw new Error(
      `${label} keys drift: expected ${frozen.join(",")}; got ${actual.join(",")}`
    );
  }
}

function assertSameObject(actual, expected, label) {
  exactKeys(actual, Object.keys(expected), label);
  for (const [key, value] of Object.entries(expected)) {
    if (!Number.isInteger(actual[key]) || actual[key] !== value) {
      throw new Error(`${label}.${key} must equal frozen profile count ${value}`);
    }
  }
}

export function validateProvisionEvidenceContract({
  value,
  schema,
  profile,
  source = "provision-evidence"
}) {
  validateSchema(value, schema, source);
  const checksum = computeProfileChecksum(profile);
  if (value.profile_checksum !== checksum) {
    throw new Error(`${source}.profile_checksum does not match frozen profile`);
  }
  assertSameObject(
    value.expected_counts,
    profile.expected_counts,
    `${source}.expected_counts`
  );
  assertSameObject(
    value.actual_counts,
    {
      ...profile.expected_counts,
      sys_file_valid_association: profile.expected_counts.sys_file
    },
    `${source}.actual_counts`
  );
  const [skipped] = value.migrations.skipped;
  if (
    value.migrations.bootstrap_sha256 !== REVIEWED_BOOTSTRAP_SHA256 ||
    skipped.filename !==
      "000175_2026_responsibility_user_role_queue.sql" ||
    skipped.sha256 !== REVIEWED_MIGRATION_175_SHA256 ||
    skipped.reason_code !==
      "production-data-patch-empty-db-fail-fast" ||
    skipped.rollback_residual !== "0|0|0|0"
  ) {
    throw new Error(`${source}.migrations does not match reviewed bootstrap`);
  }
  return value;
}

export function projectABaseDatabaseCounts({ rawCounts, profile }) {
  const expectedRawKeys = [
    ...Object.keys(profile.expected_counts),
    "sys_file_valid_association",
    ...profile.track_b_tables.map((table) => `track_b:${table}`)
  ];
  exactKeys(rawCounts, expectedRawKeys, "raw database counts");
  const actualCounts = {};
  for (const [key, expected] of Object.entries(profile.expected_counts)) {
    const actual = rawCounts[key];
    if (!Number.isInteger(actual) || actual !== expected) {
      throw new Error(`${key}: expected ${expected}, got ${actual}`);
    }
    actualCounts[key] = actual;
  }
  const fileAssociations = rawCounts.sys_file_valid_association;
  if (
    !Number.isInteger(fileAssociations) ||
    fileAssociations !== profile.expected_counts.sys_file
  ) {
    throw new Error(
      `sys_file association: expected ${profile.expected_counts.sys_file}, got ${fileAssociations}`
    );
  }
  actualCounts.sys_file_valid_association = fileAssociations;
  const trackBDependencyCount = profile.track_b_tables.reduce(
    (sum, table) => {
      const value = rawCounts[`track_b:${table}`];
      if (!Number.isInteger(value) || ![0, -1].includes(value)) {
        throw new Error(`track_b:${table}: invalid dependency probe ${value}`);
      }
      return sum + Math.abs(value);
    },
    0
  );
  if (trackBDependencyCount !== 0) {
    throw new Error("A-base unexpectedly depends on a Track B table");
  }
  exactKeys(
    actualCounts,
    [...Object.keys(profile.expected_counts), "sys_file_valid_association"],
    "projected actual counts"
  );
  return { actualCounts, trackBDependencyCount };
}

export function validateHandoffContract({
  value,
  schema,
  expected,
  source = "handoff"
}) {
  validateSchema(value, schema, source);
  exactKeys(
    value.artifact_hashes,
    A_BASE_ARTIFACT_HASH_KEYS,
    `${source}.artifact_hashes`
  );
  exactKeys(
    value.cleanup_journal_hashes,
    A_BASE_CLEANUP_JOURNAL_HASH_KEYS,
    `${source}.cleanup_journal_hashes`
  );
  const scalarChecks = {
    profile_checksum: expected.profileChecksum,
    generator_sha256: expected.generatorSha256,
    contract_sha256: expected.contractSha256,
    schema_sha256: expected.schemaSha256,
    bootstrap_sha256: REVIEWED_BOOTSTRAP_SHA256,
    actor_oracle_sha256: expected.actorOracleSha256,
    traceability_sha256: sha256(
      `${value.artifact_hashes["source/traceability.json"]}:` +
        value.artifact_hashes["source/evidence-catalog.json"]
    ),
    current_commit: expected.currentCommit
  };
  for (const [key, expectedValue] of Object.entries(scalarChecks)) {
    if (value[key] !== expectedValue) {
      throw new Error(`${source}.${key} does not match its authoritative source`);
    }
  }
  if (
    value.artifact_hashes["source/actor-oracle.json"] !==
    value.actor_oracle_sha256
  ) {
    throw new Error(`${source} actor oracle hashes disagree`);
  }
  exactKeys(
    expected.artifactHashes,
    A_BASE_ARTIFACT_HASH_KEYS,
    "computed artifact_hashes"
  );
  exactKeys(
    expected.cleanupJournalHashes,
    A_BASE_CLEANUP_JOURNAL_HASH_KEYS,
    "computed cleanup_journal_hashes"
  );
  for (const key of A_BASE_ARTIFACT_HASH_KEYS) {
    if (value.artifact_hashes[key] !== expected.artifactHashes[key]) {
      throw new Error(`${source}.artifact_hashes.${key} is not the file hash`);
    }
  }
  for (const key of A_BASE_CLEANUP_JOURNAL_HASH_KEYS) {
    if (
      value.cleanup_journal_hashes[key] !==
      expected.cleanupJournalHashes[key]
    ) {
      throw new Error(
        `${source}.cleanup_journal_hashes.${key} is not the journal hash`
      );
    }
  }
  return value;
}

export function discoverABaseSourcePaths(rootDir) {
  const discovered = [...A_BASE_SOURCE_FILES];
  for (const directory of A_BASE_SOURCE_DIRECTORIES) {
    const directoryPath = resolve(rootDir, A_BASE_SOURCE_ROOT, directory);
    for (const entry of readdirSync(directoryPath, { recursive: true })) {
      if (/\.(json|mjs)$/.test(entry)) {
        discovered.push(`${A_BASE_SOURCE_ROOT}/${directory}/${entry}`);
      }
    }
  }
  return [...new Set(discovered)].sort();
}

function defaultRunGit(rootDir, args) {
  const result = spawnSync("git", args, {
    cwd: rootDir,
    encoding: "utf8"
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `git ${args[0]} failed: ${result.error?.message ?? result.stderr.trim()}`
    );
  }
  return result.stdout;
}

export function assertFinalHandoffSourceState({
  rootDir,
  sourcePaths = discoverABaseSourcePaths(rootDir),
  runGit = (args) => defaultRunGit(rootDir, args)
}) {
  const currentCommit = runGit(["rev-parse", "HEAD"]).trim();
  if (!/^[a-f0-9]{40}$/.test(currentCommit)) {
    throw new Error("final handoff requires a full 40-hex HEAD commit");
  }
  const missing = sourcePaths.filter((path) => {
    try {
      runGit(["cat-file", "-e", `HEAD:${path}`]);
      return false;
    } catch {
      return true;
    }
  });
  if (missing.length > 0) {
    throw new Error(
      `final handoff HEAD does not contain A-base source: ${missing.join(",")}`
    );
  }
  const status = runGit([
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
    "--",
    ...A_BASE_GIT_SCOPE_PATHS
  ]).trim();
  if (status !== "") {
    throw new Error(
      `final handoff requires clean tracked A-base sources: ${status}`
    );
  }
  return currentCommit;
}
