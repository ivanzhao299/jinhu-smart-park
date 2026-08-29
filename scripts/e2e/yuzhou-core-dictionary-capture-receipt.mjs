import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { captureCoreDictionaryReceipt, sealCoreDictionaryCapture } from "../hr-cutover/capture-yuzhou-core-dictionary-receipt.mjs";

const sourceSnapshotSha256 = "a".repeat(64);
const stateRows = (first, second) => [{ sourceValue: "fixture-a", usageCount: first }, { sourceValue: "fixture-b", usageCount: second }];
const contractTypes = () => ["a", "b", "c", "d"].map(value => ({ typeName: `fixture-${value}`, typeCode: value }));

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "yuzhou-core-dictionary-capture-"));
  const paths = { eventStatePath: join(root, "event-state.json"), contractTypePath: join(root, "contract-type.json"), contractStatePath: join(root, "contract-state.json") };
  const write = (path, value) => { writeFileSync(path, `${JSON.stringify(value)}\n`, { mode: 0o600 }); chmodSync(path, 0o600); };
  write(paths.eventStatePath, stateRows(6000, 887));
  write(paths.contractTypePath, contractTypes());
  write(paths.contractStatePath, stateRows(800, 2));
  return { ...paths, write };
}

test("dictionary capture seals only hashed state and type evidence under HOLD", () => {
  const f = fixture();
  const receipt = captureCoreDictionaryReceipt({ sourceSnapshotSha256, ...f });
  assert.equal(receipt.productionImport, "HOLD");
  assert.equal(receipt.dictionaries.employment_event_state.sourceRecordCount, 6887);
  assert.equal(receipt.dictionaries.contract_type.sourceDistinctValueCount, 4);
  assert.equal(receipt.dictionaries.contract_state.sourceRecordCount, 802);
  assert.doesNotMatch(JSON.stringify(receipt), /fixture-a|fixture-b/u);
  const { captureSha256, ...body } = receipt;
  assert.equal(sealCoreDictionaryCapture(body).captureSha256, captureSha256);
});

test("dictionary capture fails closed for duplicate values, count drift, and non-HOLD receipts", () => {
  const f = fixture();
  f.write(f.eventStatePath, [{ sourceValue: "same", usageCount: 6000 }, { sourceValue: "same", usageCount: 887 }]);
  assert.throws(() => captureCoreDictionaryReceipt({ sourceSnapshotSha256, ...f }), /CORE_DICTIONARY_CAPTURE_DUPLICATE_VALUE/u);
  f.write(f.eventStatePath, stateRows(6000, 886));
  assert.throws(() => captureCoreDictionaryReceipt({ sourceSnapshotSha256, ...f }), /CORE_DICTIONARY_CAPTURE_COUNT_DRIFT/u);
  const receipt = captureCoreDictionaryReceipt({ sourceSnapshotSha256, ...fixture() });
  receipt.productionImport = "ALLOW";
  assert.throws(() => sealCoreDictionaryCapture(receipt), /CORE_DICTIONARY_CAPTURE_INVALID/u);
});
