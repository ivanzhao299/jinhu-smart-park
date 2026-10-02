import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Minimal structural fixtures in a fresh disposable database; no production rows.
const container = 'jinhu_hr_migration_lab_import_20261001_b';
const database = `jinhu_hr_migration_lab_freeze_${randomBytes(6).toString('hex')}`;
function sql(text, db = database) {
  const result = spawnSync('docker', ['exec', '-i', container, 'sh', '-c',
    'exec psql -X -q -A -t -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$1"', 'sh', db],
  {input:text, encoding:'utf8', timeout:30000});
  if(result.status !== 0) throw new Error((result.stderr || 'PostgreSQL test command failed').slice(-1500));
  return result.stdout;
}
let created = false;
try {
  sql(`CREATE DATABASE ${database};`, 'postgres'); created = true;
  sql(`CREATE EXTENSION "uuid-ossp"; CREATE EXTENSION pgcrypto;
CREATE TABLE hr_yuzhou_t4_followon_operation(operation_id varchar(64) PRIMARY KEY,status text,binding_sha256 char(64),binding jsonb);
CREATE TABLE migration_batch(id uuid PRIMARY KEY,run_id text,t4_followon_operation_id text,target_database text,status text);
CREATE TABLE legacy_record_map(batch_id uuid,target_table text,target_id uuid,is_active boolean,mapping_status text);
CREATE TABLE hr_payroll_legacy_batch(id uuid,tenant_id varchar(64),park_id varchar(64),batch_code text,status text,published_at timestamptz,source_backup_hash char(64),is_deleted boolean,UNIQUE(tenant_id,park_id,id));
CREATE TABLE hr_payroll_book(id uuid,tenant_id varchar(64),park_id varchar(64),UNIQUE(tenant_id,park_id,id));
CREATE TABLE hr_payroll_book_period(id uuid,tenant_id varchar(64),park_id varchar(64),book_id uuid,period_month date,is_deleted boolean);
CREATE TABLE hr_payroll_legacy_snapshot(id uuid PRIMARY KEY,tenant_id varchar(64),park_id varchar(64),batch_id uuid,book_period_id uuid,employee_id uuid,mapping_status text,net_amount numeric(20,4),source_hash char(64),is_deleted boolean);
CREATE TABLE hr_payroll_legacy_snapshot_item(id uuid PRIMARY KEY,tenant_id varchar(64),park_id varchar(64),snapshot_id uuid,item_version_id uuid,decimal_value numeric(20,4),is_source_null boolean,source_hash char(64),is_deleted boolean);
CREATE FUNCTION hr_payroll_reconciliation_append_only_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Payroll reconciliation evidence is append-only'; END $$;
`);
  sql(readFileSync(new URL('../database/migrations/000319_hr_payroll_reconciliation_source.sql',import.meta.url),'utf8'));
  sql(`CREATE TABLE hr_payroll_reconciliation_run(tenant_id varchar(64),park_id varchar(64),legacy_batch_id uuid);`);
  sql(readFileSync(new URL('../database/migrations/000320_hr_payroll_reconciliation_source_binding.sql',import.meta.url),'utf8'));
  sql(`INSERT INTO hr_yuzhou_t4_followon_operation VALUES('fixture-operation','succeeded',repeat('a',64),jsonb_build_object('targetScope',jsonb_build_object('tenantId','t','parkId','p'),'triple',jsonb_build_object('sourceSnapshotHash',repeat('b',64))));
INSERT INTO migration_batch VALUES('10000000-0000-0000-0000-000000000001','fixture-operation','fixture-operation',current_database(),'succeeded');
INSERT INTO hr_payroll_legacy_batch VALUES('20000000-0000-0000-0000-000000000001','t','p','fixture-operation','staged',NULL,repeat('b',64),false);
INSERT INTO hr_payroll_book VALUES('30000000-0000-0000-0000-000000000001','t','p');
INSERT INTO hr_payroll_book_period VALUES('40000000-0000-0000-0000-000000000001','t','p','30000000-0000-0000-0000-000000000001','2026-07-01',false);
INSERT INTO hr_payroll_legacy_snapshot VALUES('50000000-0000-0000-0000-000000000001','t','p','20000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','mapped',100.1250,repeat('c',64),false);
INSERT INTO hr_payroll_legacy_snapshot_item VALUES('70000000-0000-0000-0000-000000000001','t','p','50000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000001',100.1250,false,repeat('d',64),false);
INSERT INTO legacy_record_map SELECT '10000000-0000-0000-0000-000000000001','hr_payroll_legacy_snapshot',id,true,'loaded' FROM hr_payroll_legacy_snapshot;
INSERT INTO legacy_record_map SELECT '10000000-0000-0000-0000-000000000001','hr_payroll_legacy_snapshot_item',id,true,'loaded' FROM hr_payroll_legacy_snapshot_item;
CREATE FUNCTION fixture_hash() RETURNS text LANGUAGE sql AS $$
SELECT encode(digest(jsonb_build_object('formatVersion',1,'tenantId','t','parkId','p',
'legacyBatchId','20000000-0000-0000-0000-000000000001'::uuid,'bookId','30000000-0000-0000-0000-000000000001'::uuid,'periodMonth','2026-07-01'::date,
'operationId','fixture-operation','bindingSha256',repeat('a',64),
'snapshots',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM hr_payroll_legacy_snapshot s),
'items',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM hr_payroll_legacy_snapshot_item i))::text,'sha256'),'hex') $$;
CREATE FUNCTION fixture_freeze(h text DEFAULT fixture_hash(),n integer DEFAULT 1) RETURNS uuid LANGUAGE sql AS $$
SELECT hr_freeze_payroll_reconciliation_source('t','p','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','2026-07-01',repeat('a',64),h,1,n,'90000000-0000-0000-0000-000000000001','isolated test fixture') $$;
DO $$ DECLARE a uuid; b uuid; preview jsonb; BEGIN
 preview=hr_build_payroll_reconciliation_source('t','p','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','2026-07-01');
 IF encode(digest(preview::text,'sha256'),'hex')<>fixture_hash() THEN RAISE EXCEPTION 'preview hash differs from freeze'; END IF;
 IF jsonb_array_length(preview->'snapshots')<>1 OR jsonb_array_length(preview->'items')<>1 THEN RAISE EXCEPTION 'preview counts differ'; END IF;
 IF (SELECT count(*) FROM hr_payroll_reconciliation_source)<>0 THEN RAISE EXCEPTION 'preview wrote a source'; END IF;
 a=fixture_freeze(); b=fixture_freeze();
 IF a<>b OR (SELECT count(*) FROM hr_payroll_reconciliation_source)<>1 THEN RAISE EXCEPTION 'replay failed'; END IF;
 IF (SELECT status FROM hr_payroll_legacy_batch)<>'staged' THEN RAISE EXCEPTION 'publication changed'; END IF;
 IF (SELECT frozen_input->'items'->0->>'decimal_value' FROM hr_payroll_reconciliation_source)<>'100.1250' THEN RAISE EXCEPTION 'decimal precision lost'; END IF;
 BEGIN PERFORM fixture_freeze(repeat('f',64)); RAISE EXCEPTION 'wrong hash accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'RECONCILIATION_SOURCE_CONTENT_DRIFT' THEN RAISE; END IF; END;
 BEGIN PERFORM fixture_freeze(fixture_hash(),2); RAISE EXCEPTION 'wrong count accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'RECONCILIATION_SOURCE_ITEM_COUNT_DRIFT' THEN RAISE; END IF; END;
 BEGIN UPDATE hr_payroll_reconciliation_source SET item_count=2; RAISE EXCEPTION 'update accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Payroll reconciliation evidence is append-only' THEN RAISE; END IF; END;
 BEGIN DELETE FROM hr_payroll_reconciliation_source; RAISE EXCEPTION 'delete accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Payroll reconciliation evidence is append-only' THEN RAISE; END IF; END;
END $$;
`);
  const negatives = [
    ["UPDATE hr_yuzhou_t4_followon_operation SET status='rolled_back'",'RECONCILIATION_SOURCE_RECEIPT_MISMATCH'],
    ["UPDATE hr_yuzhou_t4_followon_operation SET binding=jsonb_set(binding,'{targetScope,parkId}','\"wrong\"')",'RECONCILIATION_SOURCE_RECEIPT_MISMATCH'],
    ["UPDATE migration_batch SET target_database='wrong'",'RECONCILIATION_SOURCE_CONTROL_MISMATCH'],
    ["UPDATE legacy_record_map SET is_active=false",'RECONCILIATION_SOURCE_OWNERSHIP_MISMATCH'],
    ["UPDATE hr_payroll_legacy_batch SET status='failed'",'RECONCILIATION_SOURCE_STAGED_BATCH_REQUIRED'],
    ["UPDATE hr_payroll_book_period SET period_month='2026-06-01'",'RECONCILIATION_SOURCE_SNAPSHOT_COUNT_DRIFT'],
  ];
  for(const [mutation,error] of negatives) sql(`BEGIN; ${mutation}; DO $$ BEGIN
    BEGIN PERFORM fixture_freeze(); RAISE EXCEPTION 'invalid source accepted';
    EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'${error}' THEN RAISE; END IF; END;
    END $$; ROLLBACK;`);
  sql(`BEGIN ISOLATION LEVEL REPEATABLE READ; DO $$ BEGIN BEGIN PERFORM fixture_freeze();
    RAISE EXCEPTION 'isolation accepted'; EXCEPTION WHEN OTHERS THEN
    IF SQLERRM<>'RECONCILIATION_SOURCE_READ_COMMITTED_REQUIRED' THEN RAISE; END IF; END; END $$; ROLLBACK;`);
  const holder=spawn('docker',['exec','-i',container,'sh','-c',
    'PGAPPNAME=freeze_source_concurrency exec psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$1"','sh',database],{stdio:['pipe','ignore','pipe']});
  let holderError='';holder.stderr.on('data',chunk=>{holderError+=chunk.toString();});
  const completed=new Promise((resolve,reject)=>{holder.once('error',reject);holder.once('exit',code=>code===0?resolve():reject(new Error(holderError)));});
  holder.stdin.end('BEGIN; SELECT fixture_freeze(); SELECT pg_sleep(5); ROLLBACK;');
  try {
    let ready=false;
    for(let attempt=0;attempt<30;attempt++){
      if(sql("SELECT count(*) FROM pg_stat_activity WHERE application_name='freeze_source_concurrency' AND wait_event='PgSleep';").trim()==='1'){ready=true;break;}
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    if(!ready)throw new Error('Concurrency holder did not reach freeze lock gate');
    for(const command of [
      "INSERT INTO hr_payroll_legacy_snapshot_item SELECT uuid_generate_v4(),tenant_id,park_id,snapshot_id,item_version_id,decimal_value,is_source_null,source_hash,is_deleted FROM hr_payroll_legacy_snapshot_item",
      "UPDATE hr_yuzhou_t4_followon_operation SET status='rolled_back'",
      "ALTER TABLE hr_payroll_legacy_snapshot DISABLE TRIGGER ALL",
    ]){
      let rejected=false;
      try { sql(`SET lock_timeout='150ms'; ${command};`); }
      catch(error){if(/lock timeout/.test(error.message))rejected=true;else throw error;}
      if(!rejected)throw new Error('Concurrent source mutation escaped freeze locks');
    }
  } finally { await completed; }
  sql(`DO $$ BEGIN IF (SELECT count(*) FROM hr_payroll_legacy_snapshot_item)<>1
    OR (SELECT status FROM hr_yuzhou_t4_followon_operation)<>'succeeded'
    OR (SELECT source_sha256 FROM hr_payroll_reconciliation_source)<>fixture_hash()
    THEN RAISE EXCEPTION 'Concurrent attempt changed protected source'; END IF; END $$;`);
  sql(`BEGIN;
UPDATE hr_payroll_legacy_snapshot SET net_amount=900719925474.1234;
UPDATE hr_payroll_legacy_snapshot_item SET decimal_value=900719925474.1234;
SELECT fixture_freeze();
DO $$ DECLARE projected numeric(20,4); BEGIN
 SELECT x.net_amount INTO projected FROM hr_payroll_reconciliation_source s,
 jsonb_to_recordset(s.frozen_input->'snapshots') AS x(net_amount numeric(20,4))
 WHERE s.source_sha256=fixture_hash();
 IF projected<>900719925474.1234 THEN RAISE EXCEPTION 'Frozen numeric projection lost precision'; END IF;
END $$;
ROLLBACK;
INSERT INTO hr_payroll_legacy_batch SELECT '20000000-0000-0000-0000-000000000002',tenant_id,park_id,'fixture-other-batch',status,published_at,source_backup_hash,is_deleted FROM hr_payroll_legacy_batch LIMIT 1;
DO $$ BEGIN
 BEGIN INSERT INTO hr_payroll_reconciliation_run SELECT 't','p','20000000-0000-0000-0000-000000000002',id FROM hr_payroll_reconciliation_source;
 RAISE EXCEPTION 'Cross-batch source accepted'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 INSERT INTO hr_payroll_reconciliation_run SELECT 't','p',legacy_batch_id,id FROM hr_payroll_reconciliation_source;
END $$;
`);
  console.log('PASS: frozen JSONB numeric projection retains 4 decimals; cross-batch run binding rejected.');
  console.log('PASS: concurrent item append, receipt rollback and rollback DDL blocked; source unchanged.');
  console.log('PASS: read-only preview hash/count equality; exact period, receipt, ownership, replay, precision, immutable evidence and failed-source rollback (17 assertions).');
} finally {
  if(created) { sql(`DROP DATABASE ${database} WITH (FORCE);`, 'postgres');
    const remaining=sql(`SELECT count(*) FROM pg_database WHERE datname='${database}';`,'postgres');
    if(remaining.trim()!=='0')throw new Error('Disposable database cleanup failed');
    console.log('PASS: disposable database removed.');
  }
}
