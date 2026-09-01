import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
const source=readFileSync(resolve(import.meta.dirname,"../../scripts/load-yuzhou-training-reward-history.sh"),"utf8");
const rollback=readFileSync(resolve(import.meta.dirname,"../../scripts/rollback-yuzhou-training-reward-history.sh"),"utf8");
test("training reward loader is lab-only, validates staged hashes, and does not create online side effects",()=>{
 for(const value of ["ALLOW_YUZHOU_MIGRATION","^jinhu_hr_migration_lab_","controlled staging directory required","staging hash drift","sourceRows,loadedRows,quarantinedRows","source_rows=\"$SOURCE_ROWS\"","'source_rows'::bigint","'loaded_rows'::bigint","'quarantined_rows'::bigint","duplicate migration run","hr_training_course","hr_training_plan","hr_training_participant","hr_reward_discipline_category","hr_legacy_training_reward_projection","legacy_record_map","migration_error","'productionImport','HOLD'"])assert.match(source,new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
 assert.doesNotMatch(source,/sourceRows',10|loadedRows',7|quarantinedRows',3|count\(\*\) FROM source_rows\)<>10/);
 for(const forbidden of ["biz_user_message","hr_payroll_run","hr_payslip","hr_performance","UPDATE hr_employee","DISABLE TRIGGER","session_replication_role"])assert.doesNotMatch(source,new RegExp(forbidden));
 const preflight=source.slice(source.indexOf("DO $$BEGIN\n IF"),source.indexOf("END$$;",source.indexOf("DO $$BEGIN\n IF")));
 for(const setting of ["run","tenant","park","actor","source_rows"])assert.match(source,new RegExp(`set_config\\('yuzhou\\.training_reward_${setting}'`));
 assert.match(preflight,/current_setting\('yuzhou\.training_reward_source_rows'\)::bigint/);
 assert.doesNotMatch(preflight,/:'(?:run|tenant|park|actor|source_rows)'/);
});
test("training reward rollback derives its accounting from the recorded batch",()=>{
 assert.match(rollback,/counts->>'loadedRows'/);
 assert.match(rollback,/projected<>expected OR mapped<>expected/);
 assert.doesNotMatch(rollback,/projected<>7 OR mapped<>7/);
});
