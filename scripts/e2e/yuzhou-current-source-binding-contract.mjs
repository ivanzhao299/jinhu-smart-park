#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const read = path => readFileSync(resolve(root, path), "utf8");
const verifier = read("scripts/hr-cutover/verify-source-restore-binding.mjs");

for (const value of [
  "verifySourceRestoreReceiptFile", "sourceRestoreReceiptFileHash", "sourceBackupFileHash",
  "createDefaultSourceRestoreProbe", "SOURCE_RESTORE_BINDING_VERIFIED", "productionImport"
]) assert.match(verifier, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

for (const entry of [
  "scripts/extract-yuzhou-t5-legacy-history.sh",
  "scripts/extract-yuzhou-t3-attendance-insurance.sh",
  "scripts/extract-yuzhou-t4-payroll-history.sh"
]) {
  const source = read(entry);
  assert.match(source, /verify-source-restore-binding\.mjs/);
  assert.match(source, /YUZHOU_SOURCE_RESTORE_RECEIPT_PATH/);
  assert.match(source, /YUZHOU_SOURCE_BACKUP_FILE/);
  assert.match(source, /--receipt "\$SOURCE_RESTORE_RECEIPT_PATH"/);
  assert.match(source, /--backup "\$BACKUP_FILE"/);
  assert.match(source, /--etl-env "\$CREDENTIAL_FILE"/);
}

console.log("Yuzhou current source restore binding contract passed.");
