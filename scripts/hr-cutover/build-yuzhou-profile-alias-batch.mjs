#!/usr/bin/env node
/* global process */
import { createHash } from 'node:crypto';
import { lstatSync, realpathSync, readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLegacyPersonnelAliasBackfillPlan } from './legacy-personnel-alias-backfill-plan.mjs';
import { buildYuzhouReusableIncrementalPackage } from './build-yuzhou-reusable-incremental-package.mjs';
import { verifyProfileSource, canonicalProfile } from './yuzhou-profile-incremental-projection.mjs';
import { serializeIncrementalPackage } from './yuzhou-incremental-package-limits.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const fail = code => { throw new Error(`YUZHOU_PROFILE_ALIAS_BATCH_${code}`); };
const plain = value => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
export const YUZHOU_PROFILE_ALIAS_BATCH_CODE_SHA256 = sha(readFileSync(fileURLToPath(import.meta.url)));

/** Offline preparation only. Complete every baseline package before ANY alias package.
 * The server remains responsible for original source/receipt certification and CAS. */
export function buildYuzhouProfileAliasBatch(input) {
  if (!plain(input) || Object.keys(input).sort().join(',') !== 'importInput,originalWitness,plannerInput') fail('INPUT_INVALID');
  const base = input.importInput;
  const allowed = ['recipeVersion', 'recipeSha256', 'sourceSystem', 'extractedAt', 'employeeRecords', 'employeeIndex', 'records', 'profileRecords', 'profileAdmissionEvidence'];
  if (!plain(base) || Object.keys(base).some(key => !allowed.includes(key)) || !Array.isArray(base.profileRecords)
    || !Array.isArray(base.employeeRecords) || base.employeeRecords.length || !Array.isArray(base.records) || base.records.length) fail('PROFILE_ONLY_REQUIRED');
  const plan = buildLegacyPersonnelAliasBackfillPlan(input.plannerInput);
  const mappings = Object.fromEntries(input.plannerInput.contract.mappings.map(rule => [rule.targetField, rule.sourceField]));
  if (base.profileAdmissionEvidence && canonicalProfile(base.profileAdmissionEvidence.targetScope) !== canonicalProfile(plan.targetScope)) fail('SCOPE_MISMATCH');
  const sources = new Map();
  for (const raw of base.profileRecords) {
    const row = verifyProfileSource(raw);
    if (sources.has(row.sourceIdentitySha256)) fail('DUPLICATE_SOURCE');
    sources.set(row.sourceIdentitySha256, row);
  }
  if (sources.size !== plan.records.length) fail('SOURCE_SET_MISMATCH');
  const plannerSources = new Map(input.plannerInput.sourceRecords.map(row => [row.sourceIdentitySha256, row]));
  const profiles = new Map(input.plannerInput.profiles.map(row => [row.sourceIdentitySha256, row]));
  const groups = new Map();
  let nativePlaceFills = 0, degreeFills = 0;
  for (const record of plan.records) {
    const raw = sources.get(record.sourceIdentitySha256), source = plannerSources.get(record.sourceIdentitySha256);
    if (!raw || raw.sourceRowSha256 !== record.sourceRowSha256
      || Object.values(mappings).some(column => !Object.hasOwn(raw.source, column) || raw.source[column] !== source[column])) fail('SOURCE_PLAN_MISMATCH');
    if (sha(`dbo.person\0${raw.source.person.trim()}`) !== profiles.get(record.sourceIdentitySha256).employeeSourceIdentitySha256) fail('EMPLOYEE_MISMATCH');
    if (record.disposition !== 'FILL_NULL_ONLY') continue;
    const fields = record.privatePatch.map(change => change.targetField).sort();
    for (const field of fields) {
      if (!raw.source[mappings[field]].trim()) fail('EMPTY_SOURCE');
      if (field === 'nativePlace') nativePlaceFills++; else degreeFills++;
    }
    const key = fields.join(',');
    if (!groups.has(key)) groups.set(key, { fields, rows: [] });
    groups.get(key).rows.push(raw);
  }
  const baseline = buildYuzhouReusableIncrementalPackage({ ...base, profileBaselineWitness: input.originalWitness });
  const phases = [{ kind: 'baseline', fields: [], result: baseline }];
  for (const [, group] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const acceptance = { ...input.originalWitness, proof: 'original_t5_alias_fields_v1', fields: group.fields };
    phases.push({ kind: 'alias', fields: group.fields, result: buildYuzhouReusableIncrementalPackage({ ...base, profileRecords: group.rows, profileAliasAcceptance: acceptance }) });
  }
  const packages = phases.flatMap(phase => phase.result.packageDtos.map(packageDto => ({ kind: phase.kind, fields: phase.fields, packageDto })));
  const core = { formatVersion: 1, artifactKind: 'yuzhou_profile_alias_ordered_batch', productionImport: 'HOLD', authorizationGranted: false,
    adapterSha256: YUZHOU_PROFILE_ALIAS_BATCH_CODE_SHA256, recipeSha256: base.recipeSha256, plannerSha256: plan.planSha256,
    originalWitness: input.originalWitness, targetScope: plan.targetScope, sourceProfiles: sources.size, aliasProfiles: plan.countByDisposition.FILL_NULL_ONLY,
    nativePlaceFills, degreeFills, dispositions: plan.countByDisposition,
    executionOrder: packages.map((entry, index) => ({ index, kind: entry.kind, fields: entry.fields, manifestId: entry.packageDto.manifestId,
      itemCount: entry.packageDto.items.length, packageSha256: sha(serializeIncrementalPackage(entry.packageDto)) })),
    rule: 'all_baselines_before_any_alias; one_item_per_profile_all_requested_aliases; stop_on_any_failed_or_uncertain_operation' };
  return { packages, receipt: { ...core, receiptSha256: sha(canonicalProfile(core)) } };
}

function privatePath(path, directory = false) {
  if (!isAbsolute(path) || resolve(path) !== path || realpathSync(path) !== path) fail('PATH_UNSAFE');
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() || (stat.mode & 0o777) !== 0o700 : !stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o777) !== 0o600 || stat.size > 64 * 1024 * 1024)) fail('PATH_UNSAFE');
}
export function materializeYuzhouProfileAliasBatch({ inputPath, outputDir }) {
  privatePath(inputPath); privatePath(dirname(inputPath), true); privatePath(dirname(outputDir), true);
  if (!isAbsolute(outputDir) || resolve(outputDir) !== outputDir) fail('PATH_UNSAFE');
  const result = buildYuzhouProfileAliasBatch(JSON.parse(readFileSync(inputPath, 'utf8')));
  mkdirSync(outputDir, { mode: 0o700 }); // Existing output is never overwritten or removed.
  try {
    const packagePaths = result.packages.map((entry, index) => {
      const path = `${outputDir}/${String(index + 1).padStart(4, '0')}-${entry.kind}.json`;
      writeFileSync(path, serializeIncrementalPackage(entry.packageDto), { flag: 'wx', mode: 0o600 }); return path;
    });
    writeFileSync(`${outputDir}/receipt.json`, `${JSON.stringify(result.receipt)}\n`, { flag: 'wx', mode: 0o600 });
    return { packagePaths, receiptPath: `${outputDir}/receipt.json`, sourceProfiles: result.receipt.sourceProfiles,
      aliasProfiles: result.receipt.aliasProfiles, receiptSha256: result.receipt.receiptSha256, productionImport: 'HOLD' };
  } catch (error) { rmSync(outputDir, { recursive: true, force: true }); throw error; }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 4 || args[0] !== '--input' || args[2] !== '--output') fail('ARGUMENT_INVALID');
    process.stdout.write(`${JSON.stringify(materializeYuzhouProfileAliasBatch({ inputPath: args[1], outputDir: args[3] }))}\n`);
  } catch { process.stderr.write('YUZHOU_PROFILE_ALIAS_BATCH_FAILED\n'); process.exitCode = 1; }
}
