#!/usr/bin/env node
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { prepareCoreDictionaryPreflight } from "../hr-cutover/prepare-yuzhou-core-dictionary-preflight.mjs";
import { verifyCoreDictionaryCaptureBinding } from "../hr-cutover/verify-yuzhou-core-dictionary-preflight.mjs";

const root = mkdtempSync(join(tmpdir(), "yuzhou-core-dictionary-preparer-"));
chmodSync(root, 0o700);
const writePrivate = (path, value) => { writeFileSync(path, `${JSON.stringify(value)}\n`, { mode: 0o600 }); chmodSync(path, 0o600); };
const eventState = join(root, "event-state.json"), contractType = join(root, "contract-type.json"), contractState = join(root, "contract-state.json"), eventType = resolve(import.meta.dirname, "../hr-cutover/contracts/yuzhou-t1-employment-event-type-decision-v1.json"), output = join(root, "output");
writePrivate(eventState, [{ sourceValue: "0", usageCount: 887 }, { sourceValue: "1", usageCount: 6000 }]);
writePrivate(contractType, [{ typeCode: "01", typeName: "type-1" }, { typeCode: "02", typeName: "type-2" }, { typeCode: "03", typeName: "type-3" }, { typeCode: "04", typeName: "type-4" }]);
writePrivate(contractState, [{ sourceValue: "terminated", usageCount: 402 }, { sourceValue: "active", usageCount: 400 }]);

test("core dictionary preparer writes source-bound private packages under HOLD", () => {
  const snapshot = JSON.parse(readFileSync(eventType, "utf8")).sourceSnapshotSha256;
  const result = prepareCoreDictionaryPreflight({ sourceSnapshotSha256: snapshot, eventTypePackagePath: eventType, eventStatePath: eventState, contractTypePath: contractType, contractStatePath: contractState, outputRoot: output });
  const packages = Object.fromEntries(Object.entries({ employment_event_type: result.eventTypePackage, employment_event_state: result.eventStatePackage, contract_type: result.contractTypePackage, contract_state: result.contractStatePackage }).map(([key, path]) => [key, JSON.parse(readFileSync(path, "utf8"))]));
  const receipt = JSON.parse(readFileSync(result.dictionaryCaptureReceipt, "utf8"));
  assert.equal(result.packageCount, 4);
  assert.equal(result.productionImport, "HOLD");
  assert.equal(verifyCoreDictionaryCaptureBinding(packages, receipt).packageCount, 4);
  for (const path of [result.eventTypePackage, result.eventStatePackage, result.contractTypePackage, result.contractStatePackage, result.dictionaryCaptureReceipt]) assert.equal((statSync(path).mode & 0o777), 0o600);
  assert.match(JSON.stringify(packages.contract_type), /SOURCE_CAPTURE_BOUND_ONLY/u);
});

test("core dictionary preparer refuses to overwrite an existing receipt root", () => {
  const snapshot = JSON.parse(readFileSync(eventType, "utf8")).sourceSnapshotSha256;
  assert.throws(() => prepareCoreDictionaryPreflight({ sourceSnapshotSha256: snapshot, eventTypePackagePath: eventType, eventStatePath: eventState, contractTypePath: contractType, contractStatePath: contractState, outputRoot: output }), /CORE_DICTIONARY_OUTPUT_EXISTS/u);
});

test("core dictionary preparer accepts pnpm's delimiter once", () => {
  const cliOutput = join(root, "cli-output");
  const snapshot = JSON.parse(readFileSync(eventType, "utf8")).sourceSnapshotSha256;
  const result = spawnSync(process.execPath, ["scripts/hr-cutover/prepare-yuzhou-core-dictionary-preflight.mjs", "--", "--source-snapshot", snapshot, "--event-type-package", eventType, "--event-state", eventState, "--contract-type", contractType, "--contract-state", contractState, "--output-root", cliOutput], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).status, "PASS");
});
