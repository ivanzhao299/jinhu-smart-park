import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { sealSourceRestoreReceipt } from "../hr-cutover/source-restore-receipt.mjs";
import {
  captureLegacyClientPermissionSourceReceipt,
  LegacyClientPermissionSourceReceiptCliError,
} from "../hr-cutover/legacy-client-permission-source-receipt-cli.mjs";
import {
  LEGACY_CLIENT_PERMISSION_PRIVATE_CAPABILITY_SQL,
  LEGACY_CLIENT_PERMISSION_SAFE_AGGREGATE_SQL,
} from "../hr-cutover/legacy-client-permission-source-receipt.mjs";

const sha256 = value => createHash("sha256").update(value).digest("hex");
const canonical = value => JSON.stringify(value, null, 2) + "\n";
const fileMode = path => statSync(path).mode & 0o777;
const encode = value => Buffer.from(value, "utf16le").toString("hex").toUpperCase();
const rejects = (code, action) => assert.throws(action, error => error instanceof LegacyClientPermissionSourceReceiptCliError && error.code === code);

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "permission-source-cli-"));
  chmodSync(root, 0o700);
  const database = "YuzhouHR_Lab_synthetic01";
  const envPath = join(root, "etl.env");
  writeFileSync(envPath, [
    "YUZHOU_SQLSERVER_DATABASE=" + database,
    "YUZHOU_SQLSERVER_ETL_LOGIN=synthetic_reader",
    "YUZHOU_SQLSERVER_ETL_PASSWORD=synthetic-only-not-real",
    "",
  ].join("\n"), { mode: 0o600 });
  const sourceReceiptPath = join(root, "source-restore-receipt.json");
  const sourceReceipt = sealSourceRestoreReceipt({
    formatVersion: 1,
    artifactKind: "yuzhou_hr_source_restore_receipt",
    sourceSnapshotSha256: "a".repeat(64),
    backup: { sha256: "a".repeat(64), bytes: 10, containerCopySha256: "a".repeat(64), containerCopyBytes: 10 },
    identities: {
      containerSha256: "b".repeat(64),
      imageSha256: "c".repeat(64),
      databaseSha256: sha256(database),
      restoreSha256: "d".repeat(64),
      catalogSha256: "e".repeat(64),
    },
    state: { online: true, readOnly: true },
    etlAuthority: {
      loginSucceeded: true, sysadmin: false, dbDatareader: true, viewDefinition: true,
      insert: false, update: false, delete: false, execute: false,
    },
    productionImport: "HOLD",
  });
  writeFileSync(sourceReceiptPath, canonical(sourceReceipt), { mode: 0o600 });
  const capabilitySetSha256 = sha256("1;2;");
  const aggregate = [
    915, 2, 10, 2, 2, 2, 2, 0, 0, 0, 0, 0,
    "f".repeat(64), capabilitySetSha256,
    1, 0, 1, 1, 0, 0, 0, 0,
  ].join("|");
  const capabilities = [
    ["1", encode("organization"), encode("read"), "1", "0", "1"].join("|"),
    ["2", encode("payroll"), encode("review"), "2", "1", "1"].join("|"),
  ].join("\n");
  const calls = [];
  const queryRunner = input => {
    calls.push(input);
    if (input.sql === LEGACY_CLIENT_PERMISSION_SAFE_AGGREGATE_SQL) return aggregate;
    if (input.sql === LEGACY_CLIENT_PERMISSION_PRIVATE_CAPABILITY_SQL) return capabilities;
    throw new Error("unexpected query");
  };
  return { root, envPath, sourceReceiptPath, outputDirectory: join(root, "output"), queryRunner, calls, aggregate, capabilities };
}

function capture(value, queryRunner = value.queryRunner) {
  return captureLegacyClientPermissionSourceReceipt({
    etlEnvPath: value.envPath,
    sourceRestoreReceiptPath: value.sourceReceiptPath,
    sourceContainer: "synthetic-source-sqlserver",
    outputDirectory: value.outputDirectory,
  }, { queryRunner });
}

test("synthetic capture writes a 0700 directory and two 0600 hash-bound artifacts", () => {
  const value = fixture();
  const result = capture(value);
  assert.equal(result.status, "PERMISSION_SOURCE_RECEIPT_CAPTURED");
  assert.equal(result.authorizationGrantEdges, 915);
  assert.equal(result.capabilitySetSha256, sha256("1;2;"));
  assert.equal(fileMode(value.outputDirectory), 0o700);
  const receiptPath = resolve(value.outputDirectory, "permission-source-receipt.json");
  const capabilityPath = resolve(value.outputDirectory, "private-permission-capabilities.json");
  assert.equal(fileMode(receiptPath), 0o600);
  assert.equal(fileMode(capabilityPath), 0o600);
  const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
  const privateCapabilities = JSON.parse(readFileSync(capabilityPath, "utf8"));
  assert.equal(receipt.safeFacts.rightsRows, 915);
  assert.equal(receipt.safeFacts.capabilityUnionUnitcodes, 2);
  assert.equal(privateCapabilities.count, 2);
  assert.deepEqual(privateCapabilities.items.map(item => item.unitcode), [1, 2]);
  assert.equal(privateCapabilities.containsUserBoundRows, false);
  assert.equal(privateCapabilities.artifactSha256, result.capabilityArtifactSha256);
  for (const artifact of [receipt, privateCapabilities, result]) {
    assert.doesNotMatch(JSON.stringify(artifact), /synthetic_reader|synthetic-only-not-real|username|password/iu);
  }
  assert.equal(value.calls.length, 2);
  assert.deepEqual(value.calls.map(call => call.sql), [
    LEGACY_CLIENT_PERMISSION_SAFE_AGGREGATE_SQL,
    LEGACY_CLIENT_PERMISSION_PRIVATE_CAPABILITY_SQL,
  ]);
});

test("credentials cross only the query boundary and never enter the returned report", () => {
  const value = fixture();
  const result = capture(value);
  assert.equal(value.calls.every(call => call.login === "synthetic_reader" && call.password === "synthetic-only-not-real"), true);
  assert.doesNotMatch(JSON.stringify(result), /synthetic_reader|synthetic-only-not-real/u);
});

test("unsafe inputs and existing output directories fail closed", () => {
  const relative = fixture();
  rejects("PERMISSION_SOURCE_FILE_UNSAFE", () => captureLegacyClientPermissionSourceReceipt({
    etlEnvPath: "relative.env",
    sourceRestoreReceiptPath: relative.sourceReceiptPath,
    sourceContainer: "synthetic-source-sqlserver",
    outputDirectory: relative.outputDirectory,
  }, { queryRunner: relative.queryRunner }));
  const modeDrift = fixture();
  chmodSync(modeDrift.envPath, 0o644);
  rejects("PERMISSION_SOURCE_FILE_UNSAFE", () => capture(modeDrift));
  const existing = fixture();
  writeFileSync(existing.outputDirectory, "occupied", { mode: 0o600 });
  rejects("PERMISSION_SOURCE_OUTPUT_UNSAFE", () => capture(existing));
});

test("database binding, authority and capability hash drift fail closed", () => {
  const binding = fixture();
  const lines = readFileSync(binding.envPath, "utf8").replace("YuzhouHR_Lab_synthetic01", "YuzhouHR_Lab_different01");
  writeFileSync(binding.envPath, lines, { mode: 0o600 });
  rejects("PERMISSION_SOURCE_DATABASE_BINDING_MISMATCH", () => capture(binding));

  const authority = fixture();
  const writableAggregate = authority.aggregate.split("|");
  writableAggregate[18] = "1";
  assert.throws(() => capture(authority, input => input.sql === LEGACY_CLIENT_PERMISSION_SAFE_AGGREGATE_SQL ? writableAggregate.join("|") : authority.capabilities), error => {
    assert.equal(error.code, "PERMISSION_SOURCE_AUTHORITY_INVALID");
    return true;
  });

  const hashDrift = fixture();
  rejects("PERMISSION_SOURCE_CAPABILITY_HASH_MISMATCH", () => capture(hashDrift, input => input.sql === LEGACY_CLIENT_PERMISSION_SAFE_AGGREGATE_SQL ? hashDrift.aggregate : hashDrift.capabilities.replace(/^1\|/u, "3|")));
});

test("query failures collapse to a stable code without original diagnostics", () => {
  const value = fixture();
  assert.throws(() => capture(value, () => { throw new Error("sensitive synthetic diagnostic"); }), error => {
    assert.equal(error instanceof LegacyClientPermissionSourceReceiptCliError, true);
    assert.equal(error.code, "PERMISSION_SOURCE_QUERY_FAILED");
    assert.doesNotMatch(error.message, /sensitive synthetic diagnostic/u);
    return true;
  });
});

test("the real runner uses stdin credentials and emits only stable result or error objects", () => {
  const source = readFileSync(resolve(import.meta.dirname, "../hr-cutover/legacy-client-permission-source-receipt-cli.mjs"), "utf8");
  assert.match(source, /SQLCMDUSER SQLCMDPASSWORD/u);
  assert.match(source, /stdio: \["pipe", "pipe", "pipe"\]/u);
  assert.doesNotMatch(source, /"-U",\s*login|"-P",\s*password/u);
  assert.match(source, /JSON\.stringify\(result\)/u);
  assert.doesNotMatch(source, /result\.stderr|error\.message\)/u);
});
