import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { URL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const bin = process.env.PG_BIN || '/opt/homebrew/opt/postgresql@16/bin';
const dir = mkdtempSync(join(tmpdir(), 'jinhu-hr-role-test-'));
const sql = readFileSync(new URL('../../database/seeds/production/000033_wu_enguo_hr_manager.sql', import.meta.url), 'utf8');
let started = false;
const query = (input) => execFileSync(join(bin, 'psql'), ['-h', dir, '-p', '55489', '-d', 'postgres', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1'], { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
try {
  execFileSync(join(bin, 'initdb'), ['-D', join(dir, 'data'), '-A', 'trust', '--no-locale'], { stdio: 'pipe' });
  execFileSync(join(bin, 'pg_ctl'), ['-D', join(dir, 'data'), '-l', join(dir, 'postgres.log'), '-o', `-k ${dir} -p 55489 -c listen_addresses=''`, '-w', 'start'], { stdio: 'pipe' });
  started = true;
  query(`CREATE TABLE sys_user(id int PRIMARY KEY,tenant_id text,park_id text,username text,display_name text,is_deleted boolean);
    CREATE TABLE sys_role(id int PRIMARY KEY,tenant_id text,park_id text,code text,is_deleted boolean,is_enabled boolean,is_super boolean);
    CREATE TABLE rel_user_role(tenant_id text,park_id text,user_id int,role_id int,create_time timestamptz,update_time timestamptz,is_deleted boolean,version int,remark text);
    CREATE UNIQUE INDEX role_active ON rel_user_role(tenant_id,park_id,user_id,role_id) WHERE is_deleted=false;
    INSERT INTO sys_user VALUES(1,'10000001','20000001','wu_enguo','吴恩国',false),(2,'other','other','wu_enguo','吴恩国',false);
    INSERT INTO sys_role VALUES(1,'10000001','20000001','HR_MANAGER',false,true,false),(2,'other','other','HR_MANAGER',false,true,false);
  `);
  query(sql); query(sql);
  assert.equal(query('SELECT count(*) FROM rel_user_role WHERE user_id=1 AND role_id=1 AND NOT is_deleted').trim(), '1');
  assert.equal(query('SELECT count(*) FROM rel_user_role WHERE user_id=2').trim(), '0');
  query("UPDATE rel_user_role SET is_deleted=true; INSERT INTO sys_user VALUES(3,'10000001','20000001','wuenguo','吴恩国',false)");
  assert.throws(() => query(sql), /one exact scoped identity/);
  assert.equal(query('SELECT count(*) FROM rel_user_role WHERE NOT is_deleted').trim(), '0');
  query('DELETE FROM sys_user WHERE id=3; UPDATE sys_role SET is_super=true WHERE id=1');
  assert.throws(() => query(sql), /HR_MANAGER role missing or ambiguous/);
  console.log('wu-enguo-hr-manager-postgres: PASS (repeat, isolation, ambiguity, super-role rejection)');
} finally {
  if (started) execFileSync(join(bin, 'pg_ctl'), ['-D', join(dir, 'data'), '-m', 'fast', '-w', 'stop'], { stdio: 'pipe' });
}
