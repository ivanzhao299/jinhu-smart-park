import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parseLegacySchemaRelations, scanRoutineTableDependencies } from "../hr-cutover/legacy-relational-model.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");

function fixtureInventory(routineSource) {
  const table = (name, columns) => ({ name, columns: columns.map(column => ({ name: column })) });
  return {
    inventoryKind: "yuzhou_hr_legacy_structural_atomic_inventory",
    tables: [table("person", ["person"]), table("family", ["id", "person"]), table("departmentcode", ["department"]), table("sample", ["department"])],
    routines: [{ id: "RULE-FIXTURE", kind: "procedure", name: "fixture", sourceArtifactSha256: hash(routineSource) }],
  };
}

test("declared and implicit relationships remain separate", () => {
  const routineSource = "select * from dbo.family join dbo.person on family.person=person.person";
  const inventory = fixtureInventory(routineSource);
  const schema = `CREATE TABLE [dbo].[person](\n [person] varchar(10) NOT NULL,\n CONSTRAINT [PK_person] PRIMARY KEY ([person])\n);\nCREATE TABLE [dbo].[family](\n [id] int NOT NULL,\n [person] varchar(10),\n CONSTRAINT [PK_family] PRIMARY KEY ([id])\n);\nCREATE TABLE [dbo].[departmentcode](\n [department] varchar(20) NOT NULL,\n CONSTRAINT [PK_departmentcode] PRIMARY KEY ([department])\n);\nCREATE TABLE [dbo].[sample](\n [department] varchar(20)\n);\nALTER TABLE [dbo].[family] WITH CHECK ADD CONSTRAINT [FK_family_person] FOREIGN KEY([person]) REFERENCES [dbo].[person] ([person]);`;
  const relations = parseLegacySchemaRelations(schema, inventory, { validateInventory: false });
  assert.equal(relations.primaryKeys.length, 3);
  assert.equal(relations.foreignKeys.length, 1);
  assert.equal(relations.inferredRelations.length, 1);
  assert.deepEqual(relations.inferredRelations[0].sourceColumns, ["department"]);
  assert.equal(relations.inferredRelations[0].reviewStatus, "candidate");
});

test("routine scan emits table names only", () => {
  const routineSource = "declare @leave varchar(10); -- update departmentcode ignored\nselect * from dbo.family join dbo.person on family.person=person.person";
  const inventory = fixtureInventory(routineSource);
  const directory = mkdtempSync(join(tmpdir(), "yuzhou-relations-"));
  writeFileSync(join(directory, "SQL_STORED_PROCEDURE_fixture_sql"), routineSource);
  const result = scanRoutineTableDependencies(directory, inventory);
  assert.deepEqual(result, [{ routineId: "RULE-FIXTURE", kind: "procedure", routine: "fixture", tables: ["person", "family"] }]);
});
