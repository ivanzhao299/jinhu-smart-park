import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { modernPreparationCtes, modernPreparationSelect, validModernPreparation, payrollReadinessSql, diagnosePayrollReadiness } from '../diagnose-hr-payroll-readiness.mjs';

const enabled=process.env.HR_PAYROLL_MODERN_READINESS_PG==='1';
test('owned PostgreSQL distinguishes effective modern rules, latest ordinary inputs and exact rosters without writes', {skip:!enabled}, async()=>{
 const owner=randomUUID(),name=`hr-modern-readiness-${owner}`;
 const run=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',timeout:30000,stdio:['pipe','pipe','pipe']});
 const sql=text=>run(['exec','-i',name,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres'],text).trim();
 const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 const query=`BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
 SET LOCAL statement_timeout='5s';SET LOCAL lock_timeout='2s';
 WITH latest AS(SELECT date '2026-07-01' period_month),
 observed_snapshots AS(SELECT * FROM probe_snapshots WHERE tenant_id='10000001' AND park_id='20000001' AND NOT is_deleted),
 ${modernPreparationCtes} SELECT ${modernPreparationSelect};ROLLBACK;`;
 const counts=()=>{const value=JSON.parse(sql(query));assert.ok(validModernPreparation(value));return value;};
 let created=false;
 try {
  run(['run','-d','--name',name,'--label',`codex.hr-modern-readiness-owner=${owner}`,'--tmpfs','/var/lib/postgresql/data:rw','-e','POSTGRES_PASSWORD=synthetic-local-only','postgres:16-alpine']);created=true;
  let ready=false;
  for(let attempt=0;attempt<100;attempt++){
   try{run(['exec',name,'pg_isready','-U','postgres']);ready=true;break;}catch{await new Promise(resolve=>setTimeout(resolve,200));}
  }
  assert.ok(ready,'Required owned PostgreSQL must start; no fallback or skip');
  // Query-projection fixtures: no application guard or full-schema equivalence claim.
  sql(`CREATE TABLE probe_snapshots(tenant_id text,park_id text,book_id uuid,period_month date,employee_id uuid,mapping_status text,is_deleted boolean DEFAULT false);
   CREATE TABLE hr_payroll_rule_set(id uuid,tenant_id text,park_id text,source_book_id uuid);
   CREATE TABLE hr_payroll_rule_version(id uuid,tenant_id text,park_id text,rule_set_id uuid,status text,effective_from date);
   CREATE TABLE hr_payroll_period(id uuid,tenant_id text,park_id text,period_month date,status text,is_deleted boolean);
   CREATE TABLE hr_payroll_formal_input(id uuid,tenant_id text,park_id text,period_id uuid,rule_set_id uuid,rule_version_id uuid,revision_no integer,status text,correction_window_id uuid,employees jsonb);
   INSERT INTO probe_snapshots VALUES
    ('10000001','20000001','${id(1)}','2026-07-01','${id(101)}','mapped',false),
    ('10000001','20000001','${id(1)}','2026-07-01','${id(102)}','mapped',false),
    ('10000001','20000001','${id(2)}','2026-07-01','${id(101)}','mapped',false),
    ('10000001','20000001','${id(3)}','2026-07-01',NULL,'employee_unmapped',false),
    ('foreign','20000001','${id(4)}','2026-07-01','${id(104)}','mapped',false),
    ('10000001','20000001','${id(5)}','2026-07-01','${id(105)}','mapped',true);
   INSERT INTO hr_payroll_rule_set VALUES
    ('${id(11)}','10000001','20000001','${id(1)}'),('${id(12)}','10000001','20000001','${id(2)}'),
    ('${id(13)}','foreign','20000001','${id(3)}'),('${id(14)}','10000001','foreign','${id(3)}');
   INSERT INTO hr_payroll_rule_version VALUES
    ('${id(21)}','10000001','20000001','${id(11)}','approved','2026-06-01'),
    ('${id(22)}','10000001','20000001','${id(11)}','approved','2026-08-01'),
    ('${id(23)}','10000001','20000001','${id(11)}','draft',NULL),
    ('${id(24)}','10000001','20000001','${id(12)}','approved','2026-06-01'),
    ('${id(25)}','10000001','20000001','${id(12)}','approved','2026-07-01'),
    ('${id(26)}','foreign','20000001','${id(11)}','approved','2026-07-01');
   INSERT INTO hr_payroll_period VALUES
    ('${id(31)}','10000001','20000001','2026-07-01','open',false),
    ('${id(32)}','10000001','20000001','2026-06-01','open',false),
    ('${id(33)}','10000001','foreign','2026-07-01','open',false);
   INSERT INTO hr_payroll_formal_input VALUES
    ('${id(41)}','10000001','20000001','${id(31)}','${id(11)}','${id(21)}',1,'confirmed',NULL,'[{"employeeId":"${id(102)}"},{"employeeId":"${id(101)}"}]'),
    ('${id(42)}','10000001','20000001','${id(31)}','${id(11)}','${id(21)}',2,'draft',NULL,'[{"employeeId":"${id(101)}"}]'),
    ('${id(43)}','10000001','20000001','${id(31)}','${id(12)}','${id(24)}',1,'confirmed',NULL,'[{"employeeId":"${id(101)}"}]'),
    ('${id(44)}','foreign','20000001','${id(31)}','${id(11)}','${id(21)}',9,'confirmed',NULL,'[]'),
    ('${id(45)}','10000001','20000001','${id(32)}','${id(11)}','${id(21)}',3,'confirmed',NULL,'[]'),
    ('${id(46)}','10000001','foreign','${id(33)}','${id(11)}','${id(21)}',9,'confirmed',NULL,'[]');`);
  // Execute the entire generated observer, not only its exported modern CTE.
  // Empty projection tables validate integration syntax/columns without claiming
  // migrated-schema or receipt/business-guard coverage.
  sql(`CREATE TABLE hr_payroll_book(id uuid,tenant_id text,park_id text,is_deleted boolean);
   CREATE TABLE hr_payroll_legacy_batch(id uuid,tenant_id text,park_id text,is_deleted boolean,batch_code text,source_backup_hash text,status text,published_at timestamptz);
   CREATE TABLE hr_yuzhou_t4_followon_operation(operation_id text,status text,binding jsonb,binding_sha256 text);
   CREATE TABLE migration_batch(run_id text,t4_followon_operation_id text,status text,target_database text);
   CREATE TABLE hr_payroll_book_period(id uuid,tenant_id text,park_id text,is_deleted boolean,period_month date,book_id uuid);
   CREATE TABLE hr_payroll_legacy_snapshot(id uuid,tenant_id text,park_id text,is_deleted boolean,batch_id uuid,book_period_id uuid,mapping_status text,employee_id uuid);
   CREATE TABLE hr_payroll_reconciliation_source(id uuid,tenant_id text,park_id text,legacy_batch_id uuid,book_id uuid,period_month date,operation_id text,binding_sha256 text);
   CREATE TABLE hr_attendance_payroll_input_batch(id uuid,tenant_id text,park_id text,period_id uuid,is_deleted boolean,status text);
   CREATE TABLE hr_attendance_period(id uuid,tenant_id text,park_id text,period_month date,is_deleted boolean,status text);
   CREATE TABLE hr_insurance_owned_revision(id uuid,tenant_id text,park_id text,period_month date,previous_revision_id uuid);
   CREATE TABLE hr_insurance_owned_close(id uuid,tenant_id text,park_id text,revision_id uuid);
   CREATE TABLE hr_payroll_run(id uuid,tenant_id text,park_id text,period_id uuid,status text,is_deleted boolean);
   CREATE TABLE hr_payroll_reconciliation_run(id uuid,tenant_id text,park_id text,attendance_input_batch_id uuid,reconciliation_source_id uuid,legacy_batch_id uuid,status text,is_deleted boolean);
   CREATE TABLE hr_payroll_formula_version(book_id uuid,item_version_id uuid,tenant_id text,park_id text,is_deleted boolean,parse_status text);
   CREATE TABLE hr_payroll_item_version(id uuid,item_definition_id uuid,tenant_id text,park_id text,is_deleted boolean,enabled boolean);
   CREATE TABLE hr_payroll_item_definition(id uuid,book_id uuid,tenant_id text,park_id text,is_deleted boolean);
   CREATE TABLE hr_payroll_reconciliation_policy_current(policy_version_id uuid,book_id uuid,tenant_id text,park_id text);
   CREATE TABLE hr_payroll_reconciliation_policy_version(id uuid,book_id uuid,tenant_id text,park_id text,is_deleted boolean,status text);`);
  const integrated=diagnosePayrollReadiness('/synthetic',()=>sql(payrollReadinessSql));
  assert.equal(integrated.latestObservedMonth,null);
  assert.deepEqual(integrated.modernPreparation,Object.fromEntries(Object.keys(counts()).map(key=>[key,0])));
  assert.equal(integrated.modernCalculationReadiness,'UNVERIFIED');
  const expected={sourceBookCount:3,linkedRuleBookCount:2,effectiveRuleBookCount:2,draftInputCount:1,confirmedInputCount:2,currentRuleConfirmedInputCount:1,bookWithCurrentRuleConfirmedInputCount:1,exactRosterBookCount:1};
  assert.deepEqual(counts(),expected,'Future/draft/foreign rules and stale-rule confirmed inputs do not prove modern preparation');
  sql(`UPDATE hr_payroll_formal_input SET rule_version_id='${id(25)}' WHERE id='${id(43)}';`);
  assert.equal(counts().exactRosterBookCount,2,'Same employee in different books remains a valid per-book roster');
  sql(`UPDATE hr_payroll_formal_input SET status='confirmed',employees='[{"employeeId":"${id(101)}"},{"employeeId":"${id(101)}"}]' WHERE id='${id(42)}';`);
  assert.equal(counts().currentRuleConfirmedInputCount,2);assert.equal(counts().exactRosterBookCount,1,'Newest confirmed duplicate/missing roster cannot fall back to older valid revision');
  sql(`UPDATE hr_payroll_formal_input SET employees='[{"employeeId":"${id(101)}"},{"employeeId":"${id(102)}"}]' WHERE id='${id(42)}';`);
  assert.equal(counts().exactRosterBookCount,2);
  sql(`INSERT INTO hr_payroll_formal_input VALUES('${id(47)}','10000001','20000001','${id(31)}','${id(12)}','${id(25)}',2,'confirmed','${id(51)}','[{"employeeId":"${id(101)}"}]');`);
  assert.equal(counts().exactRosterBookCount,1,'Correction revisions are not ordinary-month inputs and still supersede older confirmation');
  sql(`INSERT INTO probe_snapshots VALUES('10000001','20000001','${id(1)}','2026-07-01','${id(101)}','mapped',false);`);
  assert.equal(counts().exactRosterBookCount,0,'Repeated source records within a book never become an exact unique roster');
  const digest=()=>sql(`SELECT md5(string_agg(row_json,'|' ORDER BY row_json)) FROM(SELECT to_jsonb(t)::text row_json FROM hr_payroll_formal_input t UNION ALL SELECT to_jsonb(t)::text FROM hr_payroll_rule_version t) all_rows`);
  const before=digest();counts();assert.equal(digest(),before,'Observer changes no rule/input rows');
  assert.throws(()=>sql(`BEGIN READ ONLY;INSERT INTO probe_snapshots VALUES('x','x','${id(1)}','2026-07-01',NULL,NULL,false);ROLLBACK;`),error=>String(error.stderr).includes('read-only transaction'));
  sql(`UPDATE hr_payroll_period SET status='closed' WHERE id='${id(31)}';`);assert.equal(counts().confirmedInputCount,0,'Closed periods do not supply ordinary trial input');
 } finally {
  // Inspect ownership even when docker run created a container before returning an error.
  let label;
  try{label=run(['inspect','--format','{{index .Config.Labels "codex.hr-modern-readiness-owner"}}',name]).trim();}catch(error){if(created)throw error;}
  if(label!==undefined){assert.equal(label,owner);run(['rm','-fv',name]);assert.equal(run(['ps','-aq','--filter',`name=^/${name}$`]).trim(),'');console.log(`Owned PostgreSQL removed: ${name}`);}
 }
});
