#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const loader = readFileSync(resolve(root, "scripts/load-yuzhou-t3-attendance-insurance.sh"), "utf8");
assert.match(loader, /INSURANCE_PERIOD_INVALID/);
assert.match(loader, /sourceTable.*dbo\.person_insure/);
assert.match(loader, /sourceRelation.*dbo\.person\.person = dbo\.person_insure\.person/);
assert.match(loader, /targetTables.*hr_employee_insurance_period.*hr_employee_insurance_item/s);
assert.match(loader, /dependentItemCount.*6/);
assert.match(loader, /quarantine_parent_and_children/);
assert.match(loader, /hr_employee_insurance_period\.id = hr_employee_insurance_item\.period_id/);
const sqlBlocks = [...loader.matchAll(/<<'SQL'\n([\s\S]*?)\nSQL/g)].map(match => match[1]);
const block = sqlBlocks.find(sql => sql.includes("UPDATE migration_error e"));
assert.ok(block, "relation evidence SQL must exist");
assert.match(block, /BEGIN;/);
assert.match(block, /UPDATE migration_error e[\s\S]*COMMIT;/);
assert.doesNotMatch(block.slice(0, block.indexOf("UPDATE migration_error e")), /COMMIT;/);
console.log("Yuzhou T3 exception relation contract passed.");
