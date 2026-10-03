import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { diagnosePersonnelAlias, diagnosePersonnelAliasPlan, personnelAliasExplainSql, personnelAliasSql, sanitizePersonnelAliasPlan } from '../../diagnose-yuzhou-personnel-alias.mjs';

const zeroField = () => ({ targetNullSourceValid: 0, existingEqualPreserved: 0, existingDifferentPreserved: 0, whitespaceOnlySource: 0, missingOrInvalidSource: 0 });
const result = overrides => ({ operationCount: 1, sourceRecords: 2, receiptMatchedSourceRecords: 2, missingSourceReceiptCount: 0, mappedRecords: 2,
  unmappedRecords: 0, otherOwnerStatusRecords: 0, duplicateSourceRows: 0, t0MappedRecords: 2, profileMatchedCount: 2,
  duplicateProfiles: 0, ambiguousArchiveRegistryCount: 0, missingArchiveCount: 0, sourceSetSha256: 'a'.repeat(64),
  fields: { nativePlace: { ...zeroField(), targetNullSourceValid: 2 }, degree: { ...zeroField(), missingOrInvalidSource: 2 } }, ...overrides });
const runnerFor = value => (...args) => {
  assert.equal(args[0], 'docker');
  assert.deepEqual(args[1].slice(0, 7), ['compose','--env-file','.env.production','-f','infra/docker/docker-compose.prod.yml','exec','-T']);
  assert.match(args[1].at(-1), /ON_ERROR_STOP=1/);
  assert.match(args[1].at(-1), /-v VERBOSITY=sqlstate -v SHOW_CONTEXT=never/);
  assert.equal(args[2].timeout, 15000);
  assert.equal(args[2].cwd, '/srv/jinhu-prod');
  assert.match(args[2].input, /BEGIN TRANSACTION READ ONLY/);
  assert.match(args[2].input, /SET LOCAL enable_nestloop=off/);
  return JSON.stringify(value);
};
const planValue = overrides => [{ 'Query Identifier': 123, Plan: {
  'Node Type': 'Aggregate', 'Plan Rows': 1, 'Startup Cost': 2.5, 'Total Cost': 3.5, 'Plan Width': 8,
  Filter: 'private filter text', Output: ['secret alias'], Plans: [{ 'Node Type': 'Seq Scan', 'Plan Rows': 20,
    'Startup Cost': 0, 'Total Cost': 1.25, 'Plan Width': 4, 'Relation Name': 'private_table', 'Alias': 'private_alias',
    'Index Cond': 'sensitive condition' }],
}, 'Planning Time': 1.75, JIT: { Functions: 3, Options: { Inlining: false, Optimization: true, Expressions: true, Deforming: false },
  Timing: { Generation: 99 }, private: 'do not expose' }, ...overrides }];
const planRunner = value => (...args) => {
  assert.equal(args[0], 'docker');
  assert.equal(args[2].timeout, 15000);
  assert.equal(args[2].maxBuffer, 1024 * 1024);
  assert.equal(args[2].cwd, '/srv/jinhu-prod');
  assert.match(args[2].input, /^BEGIN TRANSACTION READ ONLY;/);
  assert.match(args[2].input, /SET LOCAL statement_timeout='5s'/);
  assert.match(args[2].input, /SET LOCAL lock_timeout='2s'/);
  assert.match(args[2].input, /SET LOCAL enable_nestloop=off/);
  assert.match(args[2].input, /EXPLAIN \(FORMAT JSON\)/);
  assert.doesNotMatch(args[2].input, /\bANALYZE\b/i);
  const selected = personnelAliasSql.slice(personnelAliasSql.indexOf('WITH ops AS ('), personnelAliasSql.lastIndexOf('\nROLLBACK;'));
  assert.ok(args[2].input.includes(selected), 'plan must cover the exact count observer SELECT');
  assert.match(args[2].input, /ROLLBACK;$/);
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

test('known PostgreSQL SQLSTATEs map to fixed categories without exposing server text', () => {
  const cases = [
    ['ERROR:  57014\n', 'PERSONNEL_ALIAS_DB_TIMEOUT_57014'],
    ['ERROR:  42P01\n', 'PERSONNEL_ALIAS_DB_SCHEMA_INVALID'],
    ['ERROR:  42501\n', 'PERSONNEL_ALIAS_DB_ACCESS_DENIED'],
    ['ERROR:  57014: canceling query; password=secret; /srv/private/path\n', 'PERSONNEL_ALIAS_DB_TIMEOUT_57014'],
    ['ERROR:  42P01: relation private_table does not exist\n', 'PERSONNEL_ALIAS_DB_SCHEMA_INVALID'],
    ['ERROR:  42703: column private_column does not exist\n', 'PERSONNEL_ALIAS_DB_SCHEMA_INVALID'],
    ['ERROR:  42501: permission denied for private_role\n', 'PERSONNEL_ALIAS_DB_ACCESS_DENIED'],
  ];
  for (const [stderr, expected] of cases) {
    assert.throws(() => diagnosePersonnelAlias('/srv/jinhu-prod', () => {
      const error = new Error('private command output'); error.stderr = Buffer.from(stderr); throw error;
    }), error => error.message === expected && !error.message.includes('secret') && !error.message.includes('private'));
  }
});

test('unknown, malformed, or multi-line PostgreSQL errors remain generic and redacted', () => {
  for (const stderr of [
    'ERROR:  08006: private connection details\n',
    'ERROR: 57014 query canceled\n',
    'prefix ERROR:  57014: sensitive detail\n',
    'ERROR:  42P01: private schema\nDETAIL: credential=secret\n',
    'database password=secret\n',
  ]) {
    assert.throws(() => diagnosePersonnelAlias('/srv/jinhu-prod', () => {
      const error = new Error('private command output'); error.stderr = Buffer.from(stderr); throw error;
    }), /^Error: PERSONNEL_ALIAS_PROBE_FAILED$/);
  }
});

test('EXPLAIN plan is reconstructed from whitelisted structure and never reports execution or raw plan text', () => {
  const observed = diagnosePersonnelAliasPlan('/srv/jinhu-prod', planRunner(planValue()));
  assert.deepEqual(observed, {
    kind: 'yuzhou_personnel_alias_explain',
    nodes: [
      { index: 0, parentIndex: null, nodeType: 'Aggregate', planRows: 1, startupCost: 2.5, totalCost: 3.5, planWidth: 8 },
      { index: 1, parentIndex: 0, nodeType: 'Seq Scan', planRows: 20, startupCost: 0, totalCost: 1.25, planWidth: 4 },
    ], planningTimeMs: 1.75,
    jit: { functions: 3, options: { inlining: false, optimization: true, expressions: true, deforming: false } },
    productionImport: 'HOLD', authorizationGranted: false, writerPresent: false, executedQuery: false,
  });
  assert.doesNotMatch(JSON.stringify(observed), /private|secret|sensitive|Relation Name|Filter|Output|Query Identifier|Timing/);
  assert.match(personnelAliasExplainSql, /BEGIN TRANSACTION READ ONLY;[\s\S]*EXPLAIN \(FORMAT JSON\)/);
  assert.doesNotMatch(personnelAliasExplainSql, /\bANALYZE\b/i);
  const countQueryStart = personnelAliasSql.indexOf('WITH ops AS (');
  const planQueryStart = personnelAliasExplainSql.indexOf('EXPLAIN (FORMAT JSON)');
  assert.equal(personnelAliasExplainSql.slice(0, planQueryStart), personnelAliasSql.slice(0, countQueryStart),
    'count and plan paths must share identical transaction-local planner settings');
});

test('EXPLAIN rejects unbounded, malformed, or unknown structural plans with a fixed error', () => {
  const valid = planValue();
  const clone = value => structuredClone(value);
  const unknown = clone(valid); unknown[0].Plan['Node Type'] = 'Private Node';
  const badCost = clone(valid); badCost[0].Plan['Total Cost'] = Infinity;
  const badType = clone(valid); badType[0].Plan['Plan Rows'] = '1';
  const badJit = clone(valid); badJit[0].JIT.Options.Inlining = 'true';
  const tooDeep = clone(valid); let cursor = tooDeep[0].Plan;
  for (let i = 0; i < 66; i++) {
    cursor.Plans = [{ 'Node Type': 'Result', 'Plan Rows': 0, 'Startup Cost': 0, 'Total Cost': 0, 'Plan Width': 0 }];
    cursor = cursor.Plans[0];
  }
  const tooMany = clone(valid); tooMany[0].Plan.Plans = Array.from({ length: 2048 }, () => ({
    'Node Type': 'Result', 'Plan Rows': 0, 'Startup Cost': 0, 'Total Cost': 0, 'Plan Width': 0,
  }));
  for (const value of [null, [], [{ Plan: {} }], unknown, badCost, badType, badJit, tooDeep, tooMany]) {
    assert.throws(() => sanitizePersonnelAliasPlan(value), /^Error: PERSONNEL_ALIAS_PLAN_INVALID$/);
  }
  assert.throws(() => diagnosePersonnelAliasPlan('/srv/jinhu-prod', planRunner([{ Plan: {} }])),
    /^Error: PERSONNEL_ALIAS_PLAN_INVALID$/);
});

test('EXPLAIN CLI rejects arbitrary flags before connecting and returns only a fixed code', () => {
  const source = new URL('../../diagnose-yuzhou-personnel-alias.mjs', import.meta.url);
  const result = spawnSync(process.execPath, [source.pathname, '--unexpected', '/srv/jinhu-prod'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'PERSONNEL_ALIAS_PATH_INVALID\n');
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
    "SET LOCAL statement_timeout='5s'", "SET LOCAL lock_timeout='2s'", "SET LOCAL enable_nestloop=off", "'10000001'", "'20000001'",
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
