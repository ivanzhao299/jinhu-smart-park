import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import process from 'node:process';
import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { diagnosePersonnelAlias, diagnosePersonnelAliasPlan, personnelAliasExplainSql, personnelAliasSql, profileBaselineSetCtes, profileBaselineSetSelect, sanitizePersonnelAliasPlan } from '../../diagnose-yuzhou-personnel-alias.mjs';

const zeroField = () => ({ targetNullSourceValid: 0, existingEqualPreserved: 0, existingDifferentPreserved: 0, whitespaceOnlySource: 0, missingOrInvalidSource: 0 });
const result = (overrides = {}) => {
  const fields = overrides.fields ?? { nativePlace: { ...zeroField(), targetNullSourceValid: 2 }, degree: { ...zeroField(), missingOrInvalidSource: 2 } };
  const profileMatchedCount = overrides.profileMatchedCount ?? 2;
  const nativePlaceFills = fields.nativePlace.targetNullSourceValid;
  const degreeFills = fields.degree.targetNullSourceValid;
  return { operationCount: 1, sourceRecords: 2, receiptMatchedSourceRecords: 2, missingSourceReceiptCount: 0, mappedRecords: 2,
    unmappedRecords: 0, otherOwnerStatusRecords: 0, duplicateSourceRows: 0, t0MappedRecords: 2, profileMatchedCount,
    duplicateProfiles: 0, ambiguousArchiveRegistryCount: 0, missingArchiveCount: 0, sourceSetSha256: 'a'.repeat(64),
    originalBaselineSet: { operationCount: overrides.operationCount ?? 1, validOperationCount: overrides.operationCount ?? 1,
      nonEmptyProfileSetCount: overrides.operationCount ?? 1, matchingProfileSetCount: overrides.operationCount ?? 1,
      matchingReceiptSetCount: overrides.operationCount ?? 1, intactWholeSetCount: overrides.operationCount ?? 1 },
    ...overrides, fields,
    profileGaps: { matched: profileMatchedCount, receiptMissing: 0, receiptSourceMismatch: 0, receiptNotInserted: 0,
      targetMissing: 0, targetDeleted: 0, targetScopeOrOwnerMismatch: 0, targetSourceMismatch: 0, ambiguousActiveProfiles: 0,
      ...overrides.profileGaps },
    profileNonInsertSummary: { reasons: { identityAmbiguous: 0, sourceMaterializationQuarantined: 0, employeeNotMapped: 0, other: 0 },
      employmentStatus: { departed: 0, nonDeparted: 0, unknown: 0 }, linkedAccountCount: 0, currentContractCandidateCount: 0,
      ...overrides.profileNonInsertSummary },
    correctionPlan: { sealVersion: 1, mappingVersion: 'yuzhou-personnel-alias-null-fill-v1', plannedProfiles: Math.max(nativePlaceFills, degreeFills),
      nativePlaceFills, degreeFills, planSha256: 'b'.repeat(64), beforeSha256: 'c'.repeat(64), afterSha256: 'd'.repeat(64),
      ...overrides.correctionPlan } };
};
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

test('whole-set observation is separate from alias seals and never certifies a write', () => {
  const intact = diagnosePersonnelAlias('/srv/jinhu-prod', runnerFor(result()));
  assert.equal(intact.originalBaselineSetStatus, 'OBSERVED_INTACT_FOR_API_RECHECK');
  const changed = diagnosePersonnelAlias('/srv/jinhu-prod', runnerFor(result({ originalBaselineSet: {
    operationCount: 1,validOperationCount: 1,nonEmptyProfileSetCount: 1,
    matchingProfileSetCount: 0,matchingReceiptSetCount: 1,intactWholeSetCount: 0,
  } })));
  assert.equal(changed.correctionPlanStatus,'MATCHED_SUBSET_FOR_REVIEW');
  assert.equal(changed.originalBaselineSetStatus,'ORIGINAL_SET_NOT_PROVEN');
  assert.equal(changed.authorizationGranted,false);
  assert.equal(changed.writerPresent,false);
  for (const originalBaselineSet of [null,{}, { ...intact.originalBaselineSet,privateRows: [] },
    { ...intact.originalBaselineSet,matchingProfileSetCount: 0 },
    { ...intact.originalBaselineSet,validOperationCount: '1' }]) {
    assert.throws(() => diagnosePersonnelAlias('/srv/jinhu-prod',runnerFor(result({ originalBaselineSet }))),
      /^Error: PERSONNEL_ALIAS_RESULT_INVALID$/);
  }
  assert.match(personnelAliasSql,/SET LOCAL TIME ZONE 'Asia\/Shanghai'/);
  assert.doesNotMatch(personnelAliasSql,/LOCK TABLE|FOR UPDATE|FOR SHARE/);
});

test('profile gap categories are aggregate-only, disjoint, and conserve mapped owners', () => {
  const gaps = { matched: 1, receiptMissing: 0, receiptSourceMismatch: 0, receiptNotInserted: 0, targetMissing: 1,
    targetDeleted: 0, targetScopeOrOwnerMismatch: 0, targetSourceMismatch: 0, ambiguousActiveProfiles: 0 };
  const observed = diagnosePersonnelAlias('/srv/jinhu-prod', runnerFor(result({ profileMatchedCount: 1, profileGaps: gaps,
    fields: { nativePlace: { ...zeroField(), targetNullSourceValid: 1 }, degree: { ...zeroField(), missingOrInvalidSource: 1 } } })));
  assert.deepEqual(observed.profileGaps, gaps);
  assert.equal(observed.t0MappedRecords, 2);
  assert.equal(observed.profileMatchedCount, 1);
  assert.equal(observed.classification, 'NOT_READY');
  assert.doesNotMatch(JSON.stringify(observed.profileGaps), /identity|employee|private|reason/i);
  assert.throws(() => diagnosePersonnelAlias('/srv/jinhu-prod', runnerFor(result({ profileGaps: { ...gaps, targetMissing: 0 } }))),
    /^Error: PERSONNEL_ALIAS_RESULT_INVALID$/);
  assert.throws(() => diagnosePersonnelAlias('/srv/jinhu-prod', runnerFor(result({ profileGaps: { ...gaps, privateReason: 1 } }))),
    /^Error: PERSONNEL_ALIAS_RESULT_INVALID$/);
});

test('non-insert summary returns only fixed reason and current-impact aggregates', () => {
  const summary = { reasons: { identityAmbiguous: 1, sourceMaterializationQuarantined: 0, employeeNotMapped: 0, other: 1 },
    employmentStatus: { departed: 1, nonDeparted: 0, unknown: 1 }, linkedAccountCount: 1, currentContractCandidateCount: 1 };
  const profileGaps = { matched: 0, receiptMissing: 0, receiptSourceMismatch: 0, receiptNotInserted: 2, targetMissing: 0,
    targetDeleted: 0, targetScopeOrOwnerMismatch: 0, targetSourceMismatch: 0, ambiguousActiveProfiles: 0 };
  const observed = diagnosePersonnelAlias('/srv/jinhu-prod', runnerFor(result({ t0MappedRecords: 2, profileMatchedCount: 0,
    profileGaps, profileNonInsertSummary: summary, fields: { nativePlace: zeroField(), degree: zeroField() } })));
  assert.deepEqual(observed.profileNonInsertSummary, summary);
  assert.equal(observed.classification, 'NOT_READY');
  assert.doesNotMatch(JSON.stringify(observed.profileNonInsertSummary), /EMPLOYEE_PROFILE|SOURCE_MATERIALIZATION|EMPLOYEE_NOT_MAPPED|legacy|employee_id|user_id|reason_code/i);
  assert.throws(() => diagnosePersonnelAlias('/srv/jinhu-prod', runnerFor(result({ t0MappedRecords: 2, profileMatchedCount: 0,
    profileGaps, profileNonInsertSummary: { ...summary, reasons: { ...summary.reasons, other: 0 } },
    fields: { nativePlace: zeroField(), degree: zeroField() } }))), /^Error: PERSONNEL_ALIAS_RESULT_INVALID$/);
  assert.throws(() => diagnosePersonnelAlias('/srv/jinhu-prod', runnerFor(result({ profileNonInsertSummary: { ...summary, linkedAccountCount: 3 } }))),
    /^Error: PERSONNEL_ALIAS_RESULT_INVALID$/);
});

test('correction plan exposes only stable seals and aggregate fill counts while staying HOLD', () => {
  const raw = result();
  const first = diagnosePersonnelAlias('/srv/jinhu-prod', runnerFor(raw));
  const second = diagnosePersonnelAlias('/srv/jinhu-prod', runnerFor(raw));
  assert.deepEqual(first.correctionPlan, second.correctionPlan);
  assert.deepEqual(first.correctionPlan, { sealVersion: 1, mappingVersion: 'yuzhou-personnel-alias-null-fill-v1', plannedProfiles: 2,
    nativePlaceFills: 2, degreeFills: 0, planSha256: 'b'.repeat(64), beforeSha256: 'c'.repeat(64), afterSha256: 'd'.repeat(64) });
  assert.equal(first.correctionPlanStatus, 'MATCHED_SUBSET_FOR_REVIEW');
  assert.equal(first.classification, 'OBSERVED_READY_FOR_REVIEW');
  assert.equal(first.productionImport, 'HOLD');
  assert.equal(first.authorizationGranted, false);
  assert.equal(first.writerPresent, false);
  assert.doesNotMatch(JSON.stringify(first.correctionPlan), /"(?:profileId|employeeId|sourceIdentitySha256|native_place|degree)"|籍贯|学位/);
});

test('correction plan fills only null fields and preserves a different modern value', () => {
  const fields = { nativePlace: { ...zeroField(), existingDifferentPreserved: 1, missingOrInvalidSource: 1 },
    degree: { ...zeroField(), targetNullSourceValid: 1, missingOrInvalidSource: 1 } };
  const correctionPlan = { plannedProfiles: 1, nativePlaceFills: 0, degreeFills: 1 };
  const observed = diagnosePersonnelAlias('/srv/jinhu-prod', runnerFor(result({ fields, correctionPlan })));
  assert.equal(observed.fields.nativePlace.existingDifferentPreserved, 1);
  assert.equal(observed.correctionPlan.nativePlaceFills, 0);
  assert.equal(observed.correctionPlan.degreeFills, 1);
  assert.equal(observed.correctionPlan.plannedProfiles, 1);
  assert.throws(() => diagnosePersonnelAlias('/srv/jinhu-prod', runnerFor(result({ fields,
    correctionPlan: { plannedProfiles: 1, nativePlaceFills: 1, degreeFills: 1 } }))), /^Error: PERSONNEL_ALIAS_RESULT_INVALID$/);
  assert.throws(() => diagnosePersonnelAlias('/srv/jinhu-prod', runnerFor(result({ correctionPlan: { planSha256: 'not-a-hash' } }))),
    /^Error: PERSONNEL_ALIAS_RESULT_INVALID$/);
});

test('correction plan status is separate from NOT_READY and requires only proven identity-quarantine gaps', () => {
  const profileGaps = { matched: 1, receiptMissing: 0, receiptSourceMismatch: 0, receiptNotInserted: 1, targetMissing: 0,
    targetDeleted: 0, targetScopeOrOwnerMismatch: 0, targetSourceMismatch: 0, ambiguousActiveProfiles: 0 };
  const fields = { nativePlace: { ...zeroField(), targetNullSourceValid: 1 }, degree: { ...zeroField(), missingOrInvalidSource: 1 } };
  const profileNonInsertSummary = { reasons: { identityAmbiguous: 1, sourceMaterializationQuarantined: 0, employeeNotMapped: 0, other: 0 },
    employmentStatus: { departed: 1, nonDeparted: 0, unknown: 0 }, linkedAccountCount: 0, currentContractCandidateCount: 0 };
  const common = { operationCount: 1, sourceRecords: 3, receiptMatchedSourceRecords: 3, mappedRecords: 2, unmappedRecords: 1,
    t0MappedRecords: 2, profileMatchedCount: 1, profileGaps, profileNonInsertSummary, fields,
    correctionPlan: { plannedProfiles: 1, nativePlaceFills: 1, degreeFills: 0 } };
  const observed = diagnosePersonnelAlias('/srv/jinhu-prod', runnerFor(result(common)));
  assert.equal(observed.classification, 'NOT_READY');
  assert.equal(observed.correctionPlanStatus, 'MATCHED_SUBSET_FOR_REVIEW');
  assert.equal(observed.productionImport, 'HOLD');
  const unknownReason = diagnosePersonnelAlias('/srv/jinhu-prod', runnerFor(result({ ...common,
    profileNonInsertSummary: { ...profileNonInsertSummary,
      reasons: { identityAmbiguous: 0, sourceMaterializationQuarantined: 0, employeeNotMapped: 0, other: 1 } } })));
  assert.equal(unknownReason.classification, 'NOT_READY');
  assert.equal(unknownReason.correctionPlanStatus, 'NOT_READY');
  const whitespace = diagnosePersonnelAlias('/srv/jinhu-prod', runnerFor(result({ ...common,
    fields: { nativePlace: { ...zeroField(), whitespaceOnlySource: 1 }, degree: { ...zeroField(), targetNullSourceValid: 1 } },
    correctionPlan: { plannedProfiles: 1, nativePlaceFills: 0, degreeFills: 1 } })));
  assert.equal(whitespace.classification, 'NOT_READY');
  assert.equal(whitespace.correctionPlanStatus, 'NOT_READY');
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
  const clone = value => globalThis.structuredClone(value);
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
    "profile_receipt_summary", "profile_gap_classified", "receiptMissing", "receiptSourceMismatch", "receiptNotInserted",
    "targetMissing", "targetDeleted", "targetScopeOrOwnerMismatch", "targetSourceMismatch", "ambiguousActiveProfiles",
    "profile_source_identity_sha256 IS DISTINCT FROM source_identity_sha256", "profile_source_row_sha256 IS DISTINCT FROM source_row_sha256",
    "min(pr.reason_code) FILTER", "EMPLOYEE_PROFILE_IDENTITY_AMBIGUOUS", "SOURCE_MATERIALIZATION_QUARANTINED", "EMPLOYEE_NOT_MAPPED",
    "employment_status_bucket", "e.employment_status='departed'", "e.user_id IS NOT NULL", "profileNonInsertSummary",
    "CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai'", "c.status='active'", "c.is_deleted",
    "correction_rows", "correction_documents", "correction_seal", "archive_count=1",
    "jsonb_build_object('native_place',c.native_place,'degree',c.degree) before_image",
    "jsonb_agg(jsonb_build_object('binding',binding,'patch',patch)", "ORDER BY source_identity_sha256::text COLLATE \"C\",profile_id::text COLLATE \"C\"",
    "digest(convert_to(jsonb_build_object('sealVersion',1,'mappingVersion','yuzhou-personnel-alias-null-fill-v1'",
    "'planSha256'", "'beforeSha256'", "'afterSha256'", "'plannedProfiles'", "'nativePlaceFills'", "'degreeFills'",
    "reg.owner_employee_id=s.employee_id", "reg.owner_record_map_id=s.owner_record_map_id",
    "reg.owner_source_identity_sha256=m.source_identity_sha256",
    "count(DISTINCT reg.id) registry_count", "missingSourceReceiptCount",
    "p.legacy_source_identity_sha256=s.source_identity_sha256", "p.legacy_source_row_sha256=s.source_row_sha256",
    "pr.target_table='hr_employee_profile'", "ar.target_table='hr_legacy_archive_record'",
    "rr.target_table='hr_legacy_identity_registry'", "->'legacyFields'->'oldaddr'", "->'legacyFields'->'edulevel'",
    "'whitespaceOnlySource'", "oldaddr_json#>>'{}'<>''", "edulevel_json#>>'{}'<>''",
    "source_identity_sha256::text||':'||source_row_sha256::text", 'COLLATE "C"', "E'\\n'", 'ROLLBACK;',
  ]) assert.ok(sql.includes(fragment), `missing SQL contract fragment: ${fragment}`);
  const correctionJson = sql.slice(sql.indexOf("'correctionPlan',json_build_object("), sql.indexOf("'sourceSetSha256'", sql.indexOf("'correctionPlan',json_build_object(")));
  assert.doesNotMatch(correctionJson, /'(?:employeeId|profileId|sourceIdentitySha256|native_place|degree|patch|before_image|after_image)'/);
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

test('real PostgreSQL whole-set observation catches profile edits, receipt edits and empty or invalid operations',
  { skip: process.env.HR_PROFILE_SET_OBSERVER_PG !== '1' }, async () => {
  const { Client } = createRequire(new URL('../../../apps/api/package.json',import.meta.url))('pg');
  const name = `jinhu_hr_profile_set_observer_${randomBytes(12).toString('hex')}`;
  const config = {host:'127.0.0.1',port:55491,user:process.env.POSTGRES_USER,password:process.env.POSTGRES_PASSWORD};
  const admin = new Client({...config,database:'postgres'});
  let created = false, client;
  try {
    await admin.connect();
    await admin.query(`CREATE DATABASE "${name}" TEMPLATE template0`);created=true;
    client=new Client({...config,database:name});await client.connect();
    assert.equal((await client.query('SELECT current_database() db')).rows[0].db,name);
    await client.query(`CREATE EXTENSION pgcrypto;
      CREATE TABLE hr_yuzhou_t5_followon_operation(operation_id text,status text,finished_at timestamptz,rolled_back_at timestamptz,owned_state jsonb);
      CREATE TABLE hr_employee_profile(id text,tenant_id text,park_id text,version int,native_place text,updated_at timestamptz);
      CREATE TABLE hr_yuzhou_t5_followon_projection_receipt(operation_id text,target_id text,target_table text,disposition text,source_row_sha256 text);
      INSERT INTO hr_yuzhou_t5_followon_operation VALUES('synthetic','succeeded',now(),null,null);
      INSERT INTO hr_employee_profile VALUES('p1','10000001','20000001',1,null,'2026-10-01T12:00:00+08:00'),('p2','10000001','20000001',1,null,'2026-10-02T12:00:00+08:00');
      INSERT INTO hr_yuzhou_t5_followon_projection_receipt VALUES('synthetic','p1','hr_employee_profile','insert','one'),('synthetic','p2','hr_employee_profile','insert','two');
      SET TIME ZONE 'Asia/Shanghai';`);
    const seal=async table=>{
      const rows=(await client.query(`SELECT to_jsonb(t)::text text FROM ${table} t`)).rows;
      const sha=v=>createHash('sha256').update(v).digest('hex');
      return {count:rows.length,sha256:sha(rows.map(r=>sha(r.text)).sort().join(''))};
    };
    const owned={hr_employee_profile:await seal('hr_employee_profile'),receipts:await seal('hr_yuzhou_t5_followon_projection_receipt')};
    await client.query('UPDATE hr_yuzhou_t5_followon_operation SET owned_state=$1',[owned]);
    await client.query("SET TIME ZONE 'UTC'");
    const observe=async()=>{
      const rows=await client.query(`BEGIN TRANSACTION READ ONLY;
        SET LOCAL statement_timeout='5s'; SET LOCAL enable_nestloop=off;
        SET LOCAL TIME ZONE 'Asia/Shanghai';
        WITH ops AS (SELECT operation_id FROM hr_yuzhou_t5_followon_operation),${profileBaselineSetCtes}
        SELECT ${profileBaselineSetSelect} result; ROLLBACK;`);
      assert.equal((await client.query('SHOW timezone')).rows[0].TimeZone,'UTC');
      return rows.find(r=>r.rows?.[0]?.result)?.rows[0].result;
    };
    assert.deepEqual(await observe(),{operationCount:1,validOperationCount:1,nonEmptyProfileSetCount:1,
      matchingProfileSetCount:1,matchingReceiptSetCount:1,intactWholeSetCount:1});
    await client.query("UPDATE hr_employee_profile SET version=version+1 WHERE id='p1'");
    assert.equal((await observe()).matchingProfileSetCount,0);
    await client.query("UPDATE hr_employee_profile SET version=1 WHERE id='p1'");
    await client.query("UPDATE hr_yuzhou_t5_followon_projection_receipt SET source_row_sha256='changed' WHERE target_id='p1'");
    assert.equal((await observe()).matchingReceiptSetCount,0);
    await client.query("UPDATE hr_yuzhou_t5_followon_projection_receipt SET source_row_sha256='one' WHERE target_id='p1'");
    await client.query('UPDATE hr_yuzhou_t5_followon_operation SET rolled_back_at=now()');
    assert.equal((await observe()).intactWholeSetCount,0);
    await client.query('UPDATE hr_yuzhou_t5_followon_operation SET rolled_back_at=null,owned_state=null');
    assert.equal((await observe()).intactWholeSetCount,0);
    await client.query('DELETE FROM hr_employee_profile');
    assert.equal((await observe()).nonEmptyProfileSetCount,0);
  } finally {
    if(client)await client.end();
    if(created) {
      await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
      assert.equal((await admin.query('SELECT count(*)::int n FROM pg_database WHERE datname=$1',[name])).rows[0].n,0);
    }
    await admin.end();
  }
});
