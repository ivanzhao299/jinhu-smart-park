import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { analyzeLegacyRoutineSource } from "../hr-cutover/legacy-routine-logic-ledger.mjs";

const committedLedger=JSON.parse(readFileSync(fileURLToPath(new URL("../hr-cutover/contracts/legacy-routine-logic-ledger-v2.json",import.meta.url)),"utf8"));

test("committed routine ledger accounts for every legacy routine without claiming parity",()=>{
  assert.equal(committedLedger.ledgerKind,"yuzhou_hr_legacy_modern_routine_logic_ledger");
  assert.equal(committedLedger.productionImport,"HOLD");
  assert.equal(committedLedger.summary.sourceRoutines,212);
  assert.equal(committedLedger.summary.mappedRoutines,212);
  assert.equal(new Set(committedLedger.routines.map(row=>row.routineId)).size,212);
  assert.deepEqual(committedLedger.summary.byKind,{function:16,procedure:194,trigger:2});
  assert.equal(committedLedger.summary.routinesWithWrites,44);
  assert.equal(committedLedger.summary.routinesWithDynamicSql,57);
  assert.equal(committedLedger.summary.crossDomainRoutines,119);
  assert.equal(committedLedger.routines.filter(row=>row.dynamicMutationStatus==="detected").length,3);
  assert.equal(committedLedger.routines.filter(row=>row.dynamicMutationStatus==="unknown_requires_review").length,54);
  assert.equal(committedLedger.routines.filter(row=>row.parityStatus==="partial_domain_surface_rule_parity_pending").length,176);
  assert.deepEqual(committedLedger.routines.filter(row=>row.parityStatus==="target_capability_missing").map(row=>row.sourceName).sort(),["getdef","getdefs"]);
  for(const row of committedLedger.routines){
    assert.ok(row.primaryDomain);
    assert.ok(row.businessCapability);
    assert.ok(row.parityStatus);
    assert.ok(row.reviewStatus);
    assert.ok(Array.isArray(row.parameters));
    assert.ok(Array.isArray(row.readTables));
    assert.ok(Array.isArray(row.writeTables));
    assert.ok(Array.isArray(row.dynamicWriteTables));
    assert.ok(Array.isArray(row.joinPredicates));
    assert.ok(Array.isArray(row.logicSignals));
  }
  assert.deepEqual(committedLedger.routines.find(row=>row.sourceName==="bs_readfromLeave").writeTables,["timekeeprecord"]);
  assert.deepEqual(committedLedger.routines.find(row=>row.sourceName==="u_createallcompact").writeTables,["compact"]);
  const tableNames=new Set(committedLedger.routines.flatMap(row=>[...row.readTables,...row.writeTables]));
  for(const falsePositive of ["from","left","round","update"])assert.ok(!tableNames.has(falsePositive));
});

test("routine analyzer extracts parameters, mutations, relationships and calculation signals", () => {
  const result = analyzeLegacyRoutineSource(`
    CREATE PROCEDURE bs_compute @year int, @scope varchar(31) AS
    UPDATE person_insure SET oldage=round(method.rate*person_insure.base/100,2)
    FROM person_insure JOIN person ON person.person=person_insure.person
    WHERE person.department LIKE @scope+'%';
  `);
  assert.deepEqual(result.parameters, [{ name: "year", sourceType: "int" }, { name: "scope", sourceType: "varchar(31)" }]);
  assert.deepEqual(result.writeTables, ["person_insure"]);
  assert.ok(result.referencedTables.includes("person"));
  assert.ok(result.joinPredicates.includes("person.person=person_insure.person"));
  assert.ok(result.signals.includes("decimal_rounding"));
  assert.ok(result.signals.includes("hierarchy_prefix_scope"));
});

test("routine analyzer records generated tables and routine calls without executing source SQL", () => {
  const result = analyzeLegacyRoutineSource(`
    CREATE PROCEDURE ext_tn1insert @year int AS
    INSERT INTO tn1(id) SELECT id FROM tn1a;
    EXEC dbo.next_step @year;
    SELECT dbo.FullDays(@year, 1, 'fixture');
  `, ["next_step", "FullDays"]);
  assert.deepEqual(result.writeTables, ["tn1"]);
  assert.ok(result.referencedTables.includes("tn1a"));
  assert.deepEqual(result.calledRoutines, ["FullDays", "next_step"]);
});

test("routine analyzer recognizes SQL Server DML target variants and merge sources", () => {
  const result = analyzeLegacyRoutineSource(`
    CREATE PROCEDURE dml_variants AS
    INSERT INTO dbo.insert_with_into(id) SELECT id FROM dbo.source_a;
    INSERT dbo.insert_without_into(id) SELECT id FROM dbo.source_b;
    UPDATE dbo.update_target SET value=1;
    DELETE FROM dbo.delete_target;
    MERGE INTO dbo.merge_with_into AS target
      USING dbo.merge_source_a AS source ON source.id=target.id
      WHEN MATCHED THEN UPDATE SET target.value=source.value;
    MERGE dbo.merge_without_into AS target
      USING dbo.merge_source_b AS source ON source.id=target.id
      WHEN NOT MATCHED THEN INSERT (id) VALUES (source.id);
  `);
  assert.deepEqual(result.writeTables, [
    "delete_target",
    "insert_with_into",
    "insert_without_into",
    "merge_with_into",
    "merge_without_into",
    "update_target",
  ]);
  assert.ok(result.readTables.includes("merge_source_a"));
  assert.ok(result.readTables.includes("merge_source_b"));
  assert.deepEqual(result.statementProfile, { select: 2, insert: 2, update: 1, delete: 1, merge: 2, alter: 0 });
});

test("commented dynamic schema code does not become active trigger logic", () => {
  const result = analyzeLegacyRoutineSource(`
    CREATE TRIGGER tr_addtimekeepitem ON dbo.timekeepitemcode FOR INSERT AS
    SELECT 1;
    -- ALTER TABLE timekeeprecord ADD dynamic_col numeric(9,2)
  `);
  assert.equal(result.statementProfile.alter, 0);
  assert.deepEqual(result.writeTables, []);
});

test("commented DML variants do not become active mutation evidence", () => {
  const result = analyzeLegacyRoutineSource(`
    CREATE PROCEDURE commented_dml AS
    SELECT 1;
    -- INSERT dbo.comment_insert(id) VALUES (1);
    /* INSERT INTO dbo.comment_insert_into(id) VALUES (1);
       UPDATE dbo.comment_update SET value=1;
       DELETE FROM dbo.comment_delete;
       MERGE dbo.comment_merge USING dbo.comment_source ON 1=1 WHEN MATCHED THEN DELETE; */
  `);
  assert.deepEqual(result.writeTables, []);
  assert.deepEqual(result.statementProfile, { select: 1, insert: 0, update: 0, delete: 0, merge: 0, alter: 0 });
});

test("dynamic SQL mutations are detected or fail closed as unknown",()=>{
  const detected=analyzeLegacyRoutineSource(`
    CREATE PROCEDURE dynamic_write AS
    DECLARE @sql nvarchar(max)='UPDATE salary01 SET S001=0';
    EXEC sp_executesql @sql;
  `);
  assert.deepEqual(detected.dynamicWriteTables,["salary01"]);
  assert.ok(detected.writeTables.includes("salary01"));
  assert.equal(detected.dynamicMutationStatus,"detected");
  const unknown=analyzeLegacyRoutineSource(`
    CREATE PROCEDURE generated_write AS
    SET @sql='UPDATE '+@table+' SET S001=ROUND(S001, 2)';
    EXEC sp_executesql @sql;
  `);
  assert.equal(unknown.dynamicMutationStatus,"unknown_requires_review");
  assert.deepEqual(unknown.dynamicWriteTables,[]);
  assert.ok(!unknown.writeTables.includes("round"));

  const detectedInsertWithoutInto=analyzeLegacyRoutineSource(`
    CREATE PROCEDURE dynamic_insert AS
    DECLARE @sql nvarchar(max)='INSERT dbo.dynamic_target(id) SELECT id FROM dbo.dynamic_source';
    EXEC sp_executesql @sql;
  `);
  assert.deepEqual(detectedInsertWithoutInto.dynamicWriteTables,["dynamic_target"]);
  assert.equal(detectedInsertWithoutInto.dynamicMutationStatus,"detected");

  const detectedMerge=analyzeLegacyRoutineSource(`
    CREATE PROCEDURE dynamic_merge AS
    DECLARE @sql nvarchar(max)='MERGE dbo.dynamic_merge_target USING dbo.dynamic_merge_source ON 1=0 WHEN NOT MATCHED THEN INSERT (id) VALUES (1);';
    EXEC sp_executesql @sql;
  `);
  assert.deepEqual(detectedMerge.dynamicWriteTables,["dynamic_merge_target"]);
  assert.ok(detectedMerge.readTables.includes("dynamic_merge_source"));
  assert.equal(detectedMerge.dynamicMutationStatus,"detected");

  const unresolvedConcatenatedTarget=analyzeLegacyRoutineSource(`
    CREATE PROCEDURE dynamic_table_suffix AS
    SET @sql='INSERT salary'+@month+' (person) SELECT person FROM person';
    EXEC sp_executesql @sql;
  `);
  assert.deepEqual(unresolvedConcatenatedTarget.dynamicWriteTables,[]);
  assert.ok(!unresolvedConcatenatedTarget.writeTables.includes("salary"));
  assert.equal(unresolvedConcatenatedTarget.dynamicMutationStatus,"unknown_requires_review");
});
