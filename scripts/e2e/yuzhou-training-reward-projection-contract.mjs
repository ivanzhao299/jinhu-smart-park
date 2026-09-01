import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
const sql=readFileSync(resolve(import.meta.dirname,"../../database/migrations/000286_hr_legacy_training_reward_projection.sql"),"utf8");
test("training reward historical projection has scoped target ownership and a run-bound rollback escape only",()=>{
 for(const value of ["hr_legacy_training_reward_projection","migration_batch_id","source_identity_sha256","training_course_id","training_plan_id","training_participant_id","reward_category_id","status IN('staged','rolled_back')","hr_legacy_training_reward_rollback_allowed","yuzhou.training_reward_rollback","^jinhu_hr_migration_lab_","fk_hr_legacy_training_reward_projection_course_scope","fk_hr_legacy_training_reward_projection_category_scope"])assert.match(sql,new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
 assert.match(sql,/DEFERRABLE INITIALLY IMMEDIATE/);
 assert.match(sql,/IF TG_OP='DELETE' AND hr_legacy_training_reward_rollback_allowed\(TG_TABLE_NAME,OLD\.id\)/);
 assert.match(sql,/IF TG_OP='DELETE' THEN\s+IF hr_legacy_training_reward_rollback_allowed\(TG_TABLE_NAME,OLD\.id\) THEN RETURN OLD;/);
 assert.doesNotMatch(sql,/DISABLE TRIGGER|session_replication_role/);
});
