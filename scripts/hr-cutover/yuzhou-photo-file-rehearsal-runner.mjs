import {
  YUZHOU_PHOTO_FILE_MATERIALIZATION_MODE,
  YuzhouPhotoFileMaterializationError,
  finalizeYuzhouPhotoFileRehearsalRollback,
  materializeYuzhouPhotoFileRehearsal,
  prepareYuzhouPhotoFileRehearsalRollback,
  restoreYuzhouPhotoFileRehearsalRollback
} from "./yuzhou-photo-file-materialization-rehearsal.mjs";
import {
  persistYuzhouPhotoFileRehearsal,
  rollbackYuzhouPhotoFileRehearsalPersistence
} from "./yuzhou-photo-file-rehearsal-persistence.mjs";

const fail = (code, detail) => { throw new YuzhouPhotoFileMaterializationError(code, detail); };

function transactionRunner(transaction) {
  if (typeof transaction !== "function") fail("YUZHOU_PHOTO_FILE_REHEARSAL_TRANSACTION_INVALID", "transaction callback required");
  return transaction;
}

export async function runYuzhouPhotoFileRehearsal({ materialization, batchId, tenantId, parkId, transaction }) {
  const execute = transactionRunner(transaction);
  const receipt = await materializeYuzhouPhotoFileRehearsal(materialization);
  try {
    const persistence = await execute(tx => persistYuzhouPhotoFileRehearsal({
      mode: YUZHOU_PHOTO_FILE_MATERIALIZATION_MODE, batchId, tenantId, parkId, files: receipt.files, tx
    }));
    return Object.freeze({ productionImport: "HOLD", receipt, persistence });
  } catch (error) {
    const pending = await prepareYuzhouPhotoFileRehearsalRollback({ mode: receipt.mode, runId: receipt.runId, storageRoot: materialization.storageRoot, files: receipt.files });
    await finalizeYuzhouPhotoFileRehearsalRollback(pending);
    throw error;
  }
}

export async function rollbackYuzhouPhotoFileRehearsalRun({ receipt, persistence, tenantId, parkId, storageRoot, transaction }) {
  if (!receipt || !persistence || receipt.productionImport !== "HOLD" || persistence.productionImport !== "HOLD") fail("YUZHOU_PHOTO_FILE_REHEARSAL_RECEIPT_INVALID", "materialization and persistence receipts required");
  const execute = transactionRunner(transaction);
  const pending = await prepareYuzhouPhotoFileRehearsalRollback({ mode: receipt.mode, runId: receipt.runId, storageRoot, files: receipt.files });
  try {
    const database = await execute(tx => rollbackYuzhouPhotoFileRehearsalPersistence({
      mode: YUZHOU_PHOTO_FILE_MATERIALIZATION_MODE, batchId: persistence.batchId, tenantId, parkId, files: receipt.files, tx
    }));
    const files = await finalizeYuzhouPhotoFileRehearsalRollback(pending);
    return Object.freeze({ productionImport: "HOLD", database, files });
  } catch (error) {
    await restoreYuzhouPhotoFileRehearsalRollback(pending);
    throw error;
  }
}
