import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { diagnosePersonnelAlias, personnelAliasSql } from '../../diagnose-yuzhou-personnel-alias.mjs';

const zeroField = () => ({ targetNullSourceValid: 0, existingEqualPreserved: 0, existingDifferentPreserved: 0, whitespaceOnlySource: 0, missingOrInvalidSource: 0 });
const result = overrides => ({ operationCount: 1, sourceRecords: 2, receiptMatchedSourceRecords: 2, missingSourceReceiptCount: 0, mappedRecords: 2,
  unmappedRecords: 0, otherOwnerStatusRecords: 0, duplicateSourceRows: 0, t0MappedRecords: 2, profileMatchedCount: 2,
  duplicateProfiles: 0, ambiguousArchiveRegistryCount: 0, missingArchiveCount: 0, sourceSetSha256: 'a'.repeat(64),
  fields: { nativePlace: { ...zeroField(), targetNullSourceValid: 2 }, degree: { ...zeroField(), missingOrInvalidSource: 2 } }, ...overrides });
const runnerFor = value => (...args) => {
  assert.equal(args[0], 'docker');
  assert.deepEqual(args[1].slice(0, 7), ['compose','--env-file','.env.production','-f','infra/docker/docker-compose.prod.yml','exec','-T']);
  assert.match(args[1].at(-1), /ON_ERROR_STOP=1/);
  assert.equal(args[2].timeout, 15000);
  assert.equal(args[2].cwd, '/srv/jinhu-prod');
  assert.match(args[2].input, /BEGIN TRANSACTION READ ONLY/);
  return JSON.stringify(value);
};

test('observer passes a bounded read-only SQL probe and exposes HOLD-only counts', () => {
  const observed = diagnosePersonnelAlias('/srv/jinhu-prod', runnerFor(result()));
  assert.equal(observed.classification, 'OBSERVED_READY_FOR_REVIEW');
  assert.equal(observed.productionImport, 'HOLD');
  assert.equal(observed.authorizationGranted, false);
  assert.equal(observed.writerPresent, false);
  assert.equal(observed.fields.nativePlace.targetNullSourceValid, 2);
  assert.equal(observed.fields.degree.missingOrInvalidSource, 2);
});

test('empty source scope is NOT_READY and never a pass', () => {
  const empty = result({ operationCount: 0, sourceRecords: 0, receiptMatchedSourceRecords: 0, missingSourceReceiptCount: 0,
    mappedRecords: 0, unmappedRecords: 0, t0MappedRecords: 0, profileMatchedCount: 0,
    sourceSetSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    fields: { nativePlace: zeroField(), degree: zeroField() } });
  const observed = diagnosePersonnelAlias('/srv/jinhu-prod', runnerFor(empty));
  assert.equal(observed.classification, 'NOT_READY');
  assert.equal(observed.productionImport, 'HOLD');
});

test('whitespace-only legacy values are surfaced and keep the observation NOT_READY', () => {
  const fields = result().fields;
  fields.nativePlace = { ...zeroField(), targetNullSourceValid: 1, whitespaceOnlySource: 1 };
  fields.degree = { ...zeroField(), missingOrInvalidSource: 2 };
  const observed = diagnosePersonnelAlias('/srv/jinhu-prod', runnerFor(result({ fields })));
  assert.equal(observed.fields.nativePlace.whitespaceOnlySource, 1);
  assert.equal(observed.classification, 'NOT_READY');
});

test('incomplete source receipts and ambiguous ownership evidence are counted and stay NOT_READY', () => {
  for (const changes of [
    { duplicateSourceRows: 1 },
    { duplicateProfiles: 1 },
    { ambiguousArchiveRegistryCount: 1 },
    { missingArchiveCount: 1 },
    { otherOwnerStatusRecords: 1, mappedRecords: 1, unmappedRecords: 0, t0MappedRecords: 1, profileMatchedCount: 1,
      fields: { nativePlace: { ...zeroField(), targetNullSourceValid: 1 }, degree: { ...zeroField(), missingOrInvalidSource: 1 } } },
  ]) {
    let observed;
    try { observed = diagnosePersonnelAlias('/srv/jinhu-prod', runnerFor(result(changes))); }
    catch (error) { error.message += ` ${JSON.stringify(changes)}`; throw error; }
    assert.equal(observed.classification, 'NOT_READY');
    assert.equal(observed.productionImport, 'HOLD');
  }
});

test('missing source receipt stays in raw owner counts while projections require matched receipts', () => {
  const missingReceipt = result({ receiptMatchedSourceRecords: 1, missingSourceReceiptCount: 1,
    t0MappedRecords: 1, profileMatchedCount: 1,
    fields: { nativePlace: { ...zeroField(), targetNullSourceValid: 1 }, degree: { ...zeroField(), missingOrInvalidSource: 1 } } });
  const observed = diagnosePersonnelAlias('/srv/jinhu-prod', runnerFor(missingReceipt));
  assert.equal(observed.mappedRecords, 2);
  assert.equal(observed.t0MappedRecords, 1);
  assert.equal(observed.profileMatchedCount, 1);
  assert.equal(observed.missingSourceReceiptCount, 1);
  assert.equal(observed.classification, 'NOT_READY');
});

test('unmapped historical rows remain in the inventory while a fully proven matched subset is reviewable', () => {
  const subset = result({ mappedRecords: 1, unmappedRecords: 1, t0MappedRecords: 1, profileMatchedCount: 1,
    fields: { nativePlace: { ...zeroField(), targetNullSourceValid: 1 }, degree: { ...zeroField(), missingOrInvalidSource: 1 } } });
  const observed = diagnosePersonnelAlias('/srv/jinhu-prod', runnerFor(subset));
  assert.equal(observed.classification, 'OBSERVED_MATCHED_SUBSET_FOR_REVIEW');
  assert.equal(observed.unmappedRecords, 1);
  assert.equal(observed.productionImport, 'HOLD');
  assert.equal(observed.authorizationGranted, false);
});

test('invalid deployment paths and probe errors reveal no private process detail', () => {
  for (const path of ['relative','/srv/../srv/jinhu-prod','/','/srv/jinhu-prod\nsecret']) {
    assert.throws(() => diagnosePersonnelAlias(path, runnerFor(result())), /^Error: PERSONNEL_ALIAS_PATH_INVALID$/);
  }
  assert.throws(() => diagnosePersonnelAlias('/srv/jinhu-prod', () => { throw new Error('/private/db-password ciphertext'); }),
    /^Error: PERSONNEL_ALIAS_PROBE_FAILED$/);
});

test('strict output schema rejects extra keys, invalid types, and count drift', () => {
  const cases = [
    result({ privatePath: '/private/host/path' }),
    result({ sourceRecords: '2' }),
    result({ mappedRecords: 1 }),
    result({ fields: { nativePlace: zeroField(), degree: { ...zeroField(), missingOrInvalidSource: 3 } } }),
  ];
  for (const value of cases) assert.throws(() => diagnosePersonnelAlias('/srv/jinhu-prod', runnerFor(value)),
    /^Error: PERSONNEL_ALIAS_RESULT_INVALID$/);
});

test('SQL statically binds source, T0 owner, archive, profile, and hash evidence without reading ciphertext', () => {
  const sql = personnelAliasSql;
  for (const fragment of [
    "SET LOCAL statement_timeout='5s'", "SET LOCAL lock_timeout='2s'", "'10000001'", "'20000001'",
    "s.source_domain='person_core'", "s.source_table='dbo.person.core_residue'", "o.status='succeeded'", "parent.status='succeeded'",
    "follow_batch.status='succeeded'", "follow_batch.t5_followon_operation_id=o.operation_id",
    "parent.code_sha=o.binding->'triple'->>'codeSha'",
    "sr.target_table='hr_yuzhou_t5_followon_source'", "ir.phase='T0'", "m.is_active", "m.source_table='dbo.person'",
    'ir.source_identity_sha256=m.source_identity_sha256', 'ir.source_row_sha256=m.source_row_sha256',
    'm.id=s.owner_record_map_id', "batch.execution_context='production_import'", "batch.status='succeeded'",
    "count(*) OVER (PARTITION BY s.operation_id,s.source_table,s.source_identity_sha256)", "sr.target_id=s.id AND sr.disposition='insert'",
    "reg.owner_employee_id=s.employee_id", "reg.owner_record_map_id=s.owner_record_map_id",
    "reg.owner_source_identity_sha256=m.source_identity_sha256",
    "count(DISTINCT reg.id) registry_count", "missingSourceReceiptCount",
    "p.legacy_source_identity_sha256=s.source_identity_sha256", "p.legacy_source_row_sha256=s.source_row_sha256",
    "pr.target_table='hr_employee_profile'", "ar.target_table='hr_legacy_archive_record'",
    "rr.target_table='hr_legacy_identity_registry'", "->'legacyFields'->'oldaddr'", "->'legacyFields'->'edulevel'",
    "'whitespaceOnlySource'", "oldaddr_json#>>'{}'<>''", "edulevel_json#>>'{}'<>''",
    "source_identity_sha256::text||':'||source_row_sha256::text", 'COLLATE "C"', "E'\\n'", 'ROLLBACK;',
  ]) assert.ok(sql.includes(fragment), `missing SQL contract fragment: ${fragment}`);
  assert.doesNotMatch(sql, /SELECT[^;]*encrypted_source/s);
  assert.doesNotMatch(sql, /SELECT\s+s\.\*/i);
  assert.doesNotMatch(sql, /ir\.source_identity_sha256=s\.source_identity_sha256/);
  assert.match(sql, /BEGIN TRANSACTION READ ONLY/);
});

test('test remains independent of retained production rows and credentials', () => {
  const source = readFileSync(new URL('../../diagnose-yuzhou-personnel-alias.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /hr_legacy_t5_record/);
  assert.doesNotMatch(source, /decrypt|ciphertext/i);
});
