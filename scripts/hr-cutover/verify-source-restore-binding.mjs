#!/usr/bin/env node
/* global process */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createDefaultSourceRestoreProbe,
  sourceBackupFileHash,
  sourceRestoreReceiptFileHash,
  verifySourceRestoreReceiptFile
} from "./source-restore-receipt.mjs";

const fail = (code, detail) => { const error = new Error(`${code}: ${detail}`); error.code = code; throw error; };
const SHA256 = /^[0-9a-f]{64}$/u;

function parseArgs(argv) {
  const result = {}, allowed = new Set(["--receipt", "--backup", "--container", "--database", "--etl-env"]);
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!allowed.has(key) || !argv[index + 1] || Object.hasOwn(result, key)) fail("SOURCE_BINDING_ARGUMENT_INVALID", key);
    result[key] = argv[++index];
  }
  for (const key of allowed) if (!result[key]) fail("SOURCE_BINDING_ARGUMENT_MISSING", key);
  return result;
}

export function verifyCurrentSourceRestoreBinding(input, { probeFactory = createDefaultSourceRestoreProbe } = {}) {
  const receiptPath = resolve(input.receipt), backupPath = resolve(input.backup), etlEnvFile = resolve(input.etlEnv);
  const sourceSnapshotSha256 = sourceBackupFileHash(backupPath);
  if (!SHA256.test(sourceSnapshotSha256)) fail("SOURCE_BINDING_BACKUP_INVALID", "source backup hash");
  const receiptSha256 = sourceRestoreReceiptFileHash(receiptPath);
  const probe = probeFactory({ etlEnvFile });
  return verifySourceRestoreReceiptFile({
    receiptPath,
    receiptSha256,
    sourceSnapshotSha256,
    sourceBackupPath: backupPath,
    sourceContainer: input.container,
    databaseAlias: input.database
  }, { probe });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const input = parseArgs(process.argv.slice(2));
    const result = verifyCurrentSourceRestoreBinding({
      receipt: input["--receipt"], backup: input["--backup"], container: input["--container"], database: input["--database"], etlEnv: input["--etl-env"]
    });
    process.stdout.write(`${JSON.stringify({ status: "SOURCE_RESTORE_BINDING_VERIFIED", receiptSha256: result.receiptSha256, productionImport: result.productionImport })}\n`);
  } catch (error) {
    process.stderr.write(`${error.code ?? "SOURCE_BINDING_FAILED"}\n`);
    process.exitCode = 1;
  }
}
