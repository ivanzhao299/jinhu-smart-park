#!/usr/bin/env node
/* global process */
import { existsSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  UErrandrecordsSourceReceiptError,
  verifyUErrandrecordsSourceReceiptFile,
} from "./u-errandrecords-source-receipt.mjs";

function fail(code, detail) {
  throw new UErrandrecordsSourceReceiptError(code, detail);
}

function args(argv) {
  const result = {};
  const allowed = new Set([
    "--receipt",
    "--receipt-sha",
    "--source-receipt-sha",
    "--mapping-sha",
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!allowed.has(key) || index + 1 >= argv.length || Object.hasOwn(result, key)) {
      fail("U_ERRANDRECORDS_SOURCE_VERIFY_ARGUMENT_INVALID", key);
    }
    result[key] = argv[++index];
  }
  for (const key of allowed) {
    if (!result[key]) fail("U_ERRANDRECORDS_SOURCE_VERIFY_ARGUMENT_MISSING", key);
  }
  return result;
}

async function main() {
  const input = args(process.argv.slice(2));
  const result = verifyUErrandrecordsSourceReceiptFile({
    receiptPath: resolve(input["--receipt"]),
    receiptSha256: input["--receipt-sha"],
    sourceRestoreReceiptSha256: input["--source-receipt-sha"],
    mappingContractSha256: input["--mapping-sha"],
  });
  process.stdout.write(
    `${JSON.stringify({
      status: "U_ERRANDRECORDS_SOURCE_RECEIPT_VERIFIED",
      receiptSha256: result.receiptSha256,
      productionImport: "HOLD",
    })}\n`,
  );
}

if (
  process.argv[1] &&
  existsSync(process.argv[1]) &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    process.stderr.write(`${error.code ?? "U_ERRANDRECORDS_SOURCE_RECEIPT_VERIFY_FAILED"}\n`);
    process.exitCode = 1;
  });
}
