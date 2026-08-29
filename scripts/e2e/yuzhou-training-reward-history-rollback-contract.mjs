import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
const source=readFileSync(resolve(import.meta.dirname,"../../scripts/rollback-yuzhou-training-reward-history.sh"),"utf8");
test("training reward rollback is run-bound, reverse ordered, and leaves no active mapping",()=>{
 for(const value of ["ALLOW_YUZHOU_ROLLBACK","SET CONSTRAINTS ALL DEFERRED","yuzhou.training_reward_rollback","rollbackable batch not found","rollback target accounting drift","DELETE FROM hr_training_participant","DELETE FROM hr_training_plan","DELETE FROM hr_training_course_version","DELETE FROM hr_training_course","DELETE FROM hr_reward_discipline_category_version","DELETE FROM hr_reward_discipline_category","DELETE FROM hr_legacy_training_reward_projection","mapping_status='rolled_back'","rollback residual","'productionImport','HOLD'"])assert.match(source,new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
 assert.doesNotMatch(source,/DISABLE TRIGGER|session_replication_role|DELETE FROM hr_employee/);
});
