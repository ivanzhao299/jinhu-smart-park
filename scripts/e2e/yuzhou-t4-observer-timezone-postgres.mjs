// Prove timestamp hashing matches the writer even when PostgreSQL defaults UTC.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { Client } from 'pg';
assert.equal(process.argv.length, 2);
const scratch = mkdtempSync(join(tmpdir(), 'jinhu-t4-timezone-')), data = join(scratch, 'pg');
const call = (name, args) => { const r = spawnSync(name, args, { encoding: 'utf8', timeout: 30000 }); assert.equal(r.status, 0, r.stderr); };
let started = false, writer, observer;
try {
  call('initdb', ['-D', data, '-U', 'fixture', '--auth=trust', '--no-locale', '--encoding=UTF8']);
  call('pg_ctl', ['-D', data, '-l', join(scratch, 'server.log'), '-o', `-F -k ${scratch} -c listen_addresses='' -c timezone=UTC -p 55495`, '-w', 'start']); started = true;
  const options = { host: scratch, port: 55495, user: 'fixture', database: 'postgres' };
  writer = new Client(options); await writer.connect();
  await writer.query("CREATE EXTENSION pgcrypto; CREATE TABLE fixture_row(id int,t timestamptz); INSERT INTO fixture_row VALUES(1,'2026-10-01T00:00:00Z')");
  const sql = "SELECT encode(digest(to_jsonb(x)::text,'sha256'),'hex') sha FROM fixture_row x";
  const utc = (await writer.query(sql)).rows[0].sha;
  await writer.query("BEGIN; SET LOCAL TIME ZONE 'Asia/Shanghai'");
  const expected = (await writer.query(sql)).rows[0].sha;
  await writer.query('COMMIT'); assert.notEqual(utc, expected);
  observer = new Client({ ...options, options: '-c default_transaction_read_only=on -c timezone=Asia/Shanghai' }); await observer.connect();
  assert.equal((await observer.query(sql)).rows[0].sha, expected);
  await assert.rejects(observer.query('UPDATE fixture_row SET id=2'), /read-only/u);
  console.log('PASS real PostgreSQL: explicit read-only observer timezone matches writer full-row hash against UTC cluster default');
} finally {
  if (observer) await observer.end(); if (writer) await writer.end();
  if (started) call('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
  rmSync(scratch, { recursive: true });
}
