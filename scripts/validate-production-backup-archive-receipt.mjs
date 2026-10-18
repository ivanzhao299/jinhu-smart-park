import { readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';

const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const count = value => Number.isSafeInteger(value) && value >= 0;
const codes = new Set([
  'ACTIVE_HANDLE', 'ARCHIVE_OPERATION_FAILED', 'ARCHIVE_WRITER_BUSY', 'CATALOG_BOUND_EXCEEDED',
  'COPY_CONTENT_MISMATCH', 'DATA_MOUNT_REQUIRED', 'DATA_RESERVE_INSUFFICIENT', 'DEPLOY_ROOT_INVALID',
  'DOCUMENT_INVALID', 'DU_UNAVAILABLE', 'EXPECTED_PLAN_REQUIRED', 'FILE_BOUND_EXCEEDED', 'FILE_DRIFT',
  'HARDLINK_REJECTED', 'HEALTH_GATE_FAILED', 'INVALID_ARGUMENTS', 'JOURNAL_BOUND_EXCEEDED', 'JOURNAL_INVALID',
  'METADATA_INVALID', 'PLAN_BINDING_MISMATCH', 'PLAN_BOUND_EXCEEDED', 'PLAN_CHANGED', 'PRIVATE_MODE_REQUIRED',
  'PROC_BOUND_EXCEEDED', 'PROC_INCOMPLETE', 'PROC_UNAVAILABLE', 'PROTECTED_BUNDLE', 'RETIREMENT_CONFLICT',
  'RETIREMENT_DRIFT', 'RETIREMENT_EXTRA_ENTRY', 'SAFE_CANDIDATES_INSUFFICIENT', 'SEPARATE_DEVICE_REQUIRED',
  'SOURCE_DRIFT', 'SOURCE_REAPPEARED', 'STAGING_CONFLICT', 'STAGING_MISSING', 'TARGET_CONFLICT',
  'TARGET_CONTENT_MISMATCH', 'TARGET_RECEIPT_INVALID', 'TREE_BOUND_EXCEEDED', 'TREE_DEVICE_CHANGED',
  'UNSAFE_ANCESTOR', 'UNSAFE_OWNER_OR_MODE', 'UNSAFE_TYPE', 'VERIFIER_PIN_MISMATCH',
]);

function validated(raw, operation, expected) {
  const value = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
  if (value.status === 'FAIL') {
    if (Object.keys(value).sort().join(',') !== 'fixed_failure_code,status' || !codes.has(value.fixed_failure_code)) throw new Error();
    return value;
  }
  const wanted = operation === 'plan' ? 'PLAN_READY' : 'ARCHIVE_COMPLETED';
  if (value.status !== wanted || !sha(value.plan_sha256)) throw new Error();
  if (operation === 'apply' && value.plan_sha256 !== expected) throw new Error();
  const fields = ['status', 'plan_sha256', 'planned_bundles', 'expected_reclaimed_bytes', 'logical_transfer_bytes', 'retired_bundles'];
  if (operation === 'apply') fields.push('actual_host_free_bytes');
  if (Object.keys(value).sort().join(',') !== fields.sort().join(',')) throw new Error();
  for (const key of ['planned_bundles', 'expected_reclaimed_bytes', 'logical_transfer_bytes', 'retired_bundles']) {
    if (!count(value[key])) throw new Error();
  }
  if (value.planned_bundles < 1 || value.retired_bundles > value.planned_bundles) throw new Error();
  if (operation === 'plan' && value.retired_bundles !== 0) throw new Error();
  if (operation === 'apply' && (!count(value.actual_host_free_bytes) || value.retired_bundles !== value.planned_bundles)) throw new Error();
  return value;
}

const destination = process.env.ARCHIVE_RECEIPT_PATH;
const rawPath = process.env.ARCHIVE_RAW_PATH;
const operation = process.env.ARCHIVE_OPERATION;
const expected = process.env.ARCHIVE_EXPECTED_PLAN;
const transport = Number(process.env.ARCHIVE_SSH_STATUS);
let result;
try {
  if (!destination || !rawPath || !['plan', 'apply'].includes(operation) || !count(transport)) throw new Error();
  if (operation === 'apply' && !sha(expected)) throw new Error();
  if (statSync(rawPath).size > 32768) throw new Error();
  result = validated(readFileSync(rawPath, 'utf8'), operation, expected);
  if (transport && result.status !== 'FAIL') result = { status: 'FAIL', fixed_failure_code: 'TRANSPORT_STATUS_CONFLICT' };
} catch {
  result = { status: 'FAIL', fixed_failure_code: transport ? 'TRANSPORT_FAILED' : 'RECEIPT_INVALID' };
}

try {
  // The always-uploaded artifact remains the preinitialized fixed failure until this rename.
  const staging = `${destination}.sanitized`;
  writeFileSync(staging, JSON.stringify(result) + '\n', { mode: 0o600, flag: 'wx' });
  renameSync(staging, destination);
  console.log(`PRODUCTION_BACKUP_ARCHIVE_${result.status}`);
} catch {
  console.error('PRODUCTION_BACKUP_ARCHIVE_RECEIPT_PUBLICATION_FAILED');
  process.exitCode = 1;
}
if (transport || result.status === 'FAIL') process.exitCode = 1;
