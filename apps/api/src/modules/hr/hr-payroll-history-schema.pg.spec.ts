import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { DataSource } from "typeorm";

const required=process.env.HR_PAYROLL_HISTORY_PG_REQUIRED==="1";
if(required&&!process.env.POSTGRES_PASSWORD)throw new Error("POSTGRES_PASSWORD is required for the T4 PostgreSQL gate");
const suite=required?describe:describe.skip;
const gateSuffix=`${process.pid}-${Date.now()}`;
const scope={tenantId:`hr-t4-${gateSuffix}`,parkId:`hr-t4-${gateSuffix}`};
const hash="a".repeat(64);

suite("HR T4 payroll history PostgreSQL schema",()=>{
 let db:DataSource; let bookId:string; let batchId:string;
 before(async()=>{
  db=new DataSource({type:"postgres",host:process.env.POSTGRES_HOST??"127.0.0.1",port:Number(process.env.POSTGRES_PORT??5432),database:process.env.POSTGRES_DB??"jinhu_hr_t4_gate",username:process.env.POSTGRES_USER??"jinhu",password:process.env.POSTGRES_PASSWORD});
  await db.initialize();
  const books=await db.query("INSERT INTO hr_payroll_book(tenant_id,park_id,legacy_scheme,source_hash) VALUES($1,$2,1,$3) RETURNING id",[scope.tenantId,scope.parkId,hash]) as Array<{id:string}>; bookId=books[0]!.id;
  const batches=await db.query("INSERT INTO hr_payroll_legacy_batch(tenant_id,park_id,batch_code,source_backup_hash,catalog_hash,manifest_hash,source_row_count) VALUES($1,$2,$3,$4,$4,$4,1) RETURNING id",[scope.tenantId,scope.parkId,`gate-${gateSuffix}`,hash]) as Array<{id:string}>; batchId=batches[0]!.id;
 });
 after(async()=>{if(db?.isInitialized)await db.destroy();});
 it("rejects cross-scope owner references",async()=>{
  await assert.rejects(db.query("INSERT INTO hr_payroll_item_definition(tenant_id,park_id,book_id,legacy_item_name,item_code) VALUES($1,'foreign-park',$2,'Sbase','SBASE')",[scope.tenantId,bookId]),/foreign key/i);
 });
 it("installs typed value and numeric(20,4) constraints",async()=>{
  const rows=await db.query("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname IN ('ck_hr_payroll_legacy_snapshot_item_value','ck_hr_payroll_legacy_snapshot_item_amount') ORDER BY conname") as Array<{definition:string}>;
  assert.equal(rows.length,2); assert.match(rows.map(row=>row.definition).join(" "),/is_source_null/); assert.match(rows.map(row=>row.definition).join(" "),/decimal_value/);
 });
 it("makes a published batch immutable and conservation-gated",async()=>{
  await assert.rejects(db.query("UPDATE hr_payroll_legacy_batch SET status='published',published_at=now(),published_by=gen_random_uuid() WHERE id=$1",[batchId]),/check constraint/i);
  await db.query("UPDATE hr_payroll_legacy_batch SET quarantined_row_count=1,status='published',published_at=now(),published_by=gen_random_uuid() WHERE id=$1",[batchId]);
  await assert.rejects(db.query("UPDATE hr_payroll_legacy_batch SET remark='mutated' WHERE id=$1",[batchId]),/immutable/i);
  await db.query("SET app.yuzhou_t4_loader_rollback='on'");
  await assert.rejects(db.query("DELETE FROM hr_payroll_legacy_batch WHERE id=$1",[batchId]),/immutable/i);
 });
 it("does not trust a caller-controlled rollback GUC",async()=>{
  const rows=await db.query("INSERT INTO hr_payroll_legacy_batch(tenant_id,park_id,batch_code,source_backup_hash,catalog_hash,manifest_hash,source_row_count) VALUES($1,$2,$3,$4,$4,$4,0) RETURNING id",[scope.tenantId,scope.parkId,`unpublished-${gateSuffix}`,hash]) as Array<{id:string}>;
  await db.query("SET app.yuzhou_t4_loader_rollback='on'");
  await assert.rejects(db.query("DELETE FROM hr_payroll_legacy_batch WHERE id=$1",[rows[0]!.id]),/dedicated rollback procedure/i);
 });
 it("keeps review decisions append-only and case-scoped",async()=>{
  const batches=await db.query("INSERT INTO hr_payroll_legacy_batch(tenant_id,park_id,batch_code,source_backup_hash,catalog_hash,manifest_hash,source_row_count) VALUES($1,$2,$3,$4,$4,$4,0) RETURNING id",[scope.tenantId,scope.parkId,`review-${gateSuffix}`,hash]) as Array<{id:string}>;
  const cases=await db.query("INSERT INTO hr_payroll_review_case(tenant_id,park_id,batch_id,case_type,subject_hash,evidence_summary) VALUES($1,$2,$3,'other',$4,'{}') RETURNING id",[scope.tenantId,scope.parkId,batches[0]!.id,"b".repeat(64)]) as Array<{id:string}>;
  const action=await db.query("INSERT INTO hr_payroll_review_action(tenant_id,park_id,review_case_id,sequence_no,action,decision,comment,actor_id) VALUES($1,$2,$3,1,'resolve','accepted_exception','reviewed',gen_random_uuid()) RETURNING id",[scope.tenantId,scope.parkId,cases[0]!.id]) as Array<{id:string}>;
  await assert.rejects(db.query("UPDATE hr_payroll_review_action SET comment='changed' WHERE id=$1",[action[0]!.id]),/append-only/i);
  await assert.rejects(db.query("DELETE FROM hr_payroll_review_action WHERE id=$1",[action[0]!.id]),/append-only/i);
  await assert.rejects(db.query("INSERT INTO hr_payroll_review_action(tenant_id,park_id,review_case_id,sequence_no,action,decision,comment,actor_id) VALUES($1,'foreign-park',$2,2,'comment','needs_follow_up','x',gen_random_uuid())",[scope.tenantId,cases[0]!.id]),/foreign key/i);
  const openCases=await db.query("INSERT INTO hr_payroll_review_case(tenant_id,park_id,batch_id,case_type,subject_hash,evidence_summary) VALUES($1,$2,$3,'other',$4,'{}') RETURNING id",[scope.tenantId,scope.parkId,batches[0]!.id,"c".repeat(64)]) as Array<{id:string}>;
  await assert.rejects(db.query("INSERT INTO hr_payroll_review_action(tenant_id,park_id,review_case_id,sequence_no,action,decision,comment,actor_id) VALUES($1,$2,$3,1,'comment','mapping_confirmed','x',gen_random_uuid())",[scope.tenantId,scope.parkId,openCases[0]!.id]),/check constraint/i);
  await assert.rejects(db.query("INSERT INTO hr_payroll_review_action(tenant_id,park_id,review_case_id,sequence_no,action,decision,comment,actor_id) VALUES($1,$2,$3,2,'comment','needs_follow_up','x',gen_random_uuid())",[scope.tenantId,scope.parkId,cases[0]!.id]),/terminal action/i);
  const indexes=await db.query("SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='hr_payroll_review_action' AND indexname='idx_hr_payroll_review_action_case_fk'") as Array<{indexdef:string}>;
  assert.equal(indexes.length,1);assert.match(indexes[0]!.indexdef,/\(tenant_id, park_id, review_case_id\)/);assert.doesNotMatch(indexes[0]!.indexdef,/ WHERE /i);
 });
});
