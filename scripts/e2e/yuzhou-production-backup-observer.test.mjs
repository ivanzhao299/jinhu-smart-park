import assert from "node:assert/strict";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const script = fs.readFileSync(new URL("../diagnose-yuzhou-hr-production-capacity.sh", import.meta.url), "utf8");
const source = script.match(/<<'CAPACITY_BACKUP_OBSERVER'\n([\s\S]*?)\nCAPACITY_BACKUP_OBSERVER\n/)[1];
const NOW = 1800000000000;

function fixture(t) {
  const root = fs.mkdtempSync(join(tmpdir(), "capacity-backup-observer-"));
  fs.chmodSync(root, 0o700);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const mapped = path => {
    assert.ok(["/var/backups", "/etc/crontab", "/var/spool/cron/root", "/var/spool/cron/crontabs/root", "/etc/cron.d"].some(base => path === base || path.startsWith(base + "/")));
    return join(root, path.slice(1));
  };
  const write = (path, bytes, age = 60) => {
    const target = mapped(path);
    fs.mkdirSync(dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes, { mode: 0o600 });
    fs.utimesSync(target, (NOW - age * 1000) / 1000, (NOW - age * 1000) / 1000);
  };
  const directory = path => fs.mkdirSync(mapped(path), { recursive: true });
  const observe = (failStat = "") => {
    let output = "";
    const readOnlyFs = {
      constants: fs.constants,
      lstatSync(path) {
        if (path === failStat) throw Object.assign(new Error("PRIVATE_ERROR_PATH"), { code: "EACCES" });
        return fs.lstatSync(mapped(path));
      },
      opendirSync: path => fs.opendirSync(mapped(path)),
      openSync: (path, flags) => {
        assert.equal(flags, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
        return fs.openSync(mapped(path), flags);
      },
      fstatSync: fs.fstatSync, readSync: fs.readSync, closeSync: fs.closeSync,
    };
    runInNewContext(source, {
      require: name => { assert.equal(name, "node:fs"); return readOnlyFs; },
      Buffer, Date: { now: () => NOW },
      process: { stdout: { write: text => { output += text; } } },
    }, { timeout: 2000 });
    assert.doesNotMatch(output, /PRIVATE|PERSON|\/var\/|\/etc\/|\.dump|\.tgz|\.sql|TOKEN|archive_command/);
    const rows = output.trim().split("\n");
    assert.equal(new Set(rows.map(row => row.split("=")[0])).size, rows.length);
    for (const row of rows) assert.match(row, /^[a-z0-9_]+=(?:[0-9]+|true|false|AVAILABLE|NOT_PRESENT|UNAVAILABLE|TRUNCATED)$/);
    return Object.fromEntries(rows.map(row => row.split("=")));
  };
  return { root, mapped, write, directory, observe };
}

test("real inline observer reports mixed immediate ownership, ages and only active cron reference counts", t => {
  const f = fixture(t);
  for (const [name, size, age] of [["jinhu_pg_20261018.dump",11,60],["jinhu-smart-park-backup.tgz",13,120],["jinhu_files_20261018.tar",17,30],["yuzhou-hr.log",19,90],["kingturf-erp-20261018.sql",23,180],["PRIVATE_PERSON.csv",29,240],["jinhu-smart-parkish.dump",31,40]]) f.write(`/var/backups/${name}`, Buffer.alloc(size), age);
  f.directory("/var/backups/jinhu-smart-park");
  // Nested contents are outside the immediate-entry regular-byte count.
  f.write("/var/backups/jinhu-smart-park/PRIVATE_NESTED", Buffer.alloc(100));
  fs.symlinkSync("/PRIVATE_TARGET", f.mapped("/var/backups/yuzhou-hr-link"));
  f.write("/etc/crontab", '# /var/backups/PRIVATE_COMMENT\n0 1 * * * archive_command /var/backups/jinhu-smart-park TOKEN\n0 2 * * * archive_command /var/backups/other\n');
  f.write("/var/spool/cron/root", "0 3 * * * PRIVATE_NO_REFERENCE\n");
  f.write("/etc/cron.d/PRIVATE_CRON", "0 4 * * * root archive_command /var/backups/kingturf-erp\n");
  const result = f.observe();
  assert.equal(result.backup_inventory_status, "AVAILABLE");
  for (const [key, value] of Object.entries({ entries:9,directories:1,regular_files:7,symlinks:1,regular_bytes:143,hr_jinhu_entries:6,hr_jinhu_regular_files:4,hr_jinhu_regular_bytes:60,kingturf_regular_bytes:23,other_regular_bytes:60,oldest_regular_age_seconds:240,newest_regular_age_seconds:30 })) assert.equal(result[`backup_inventory_${key}`], String(value));
  assert.equal(result.cron_reference_status, "AVAILABLE");
  assert.equal(result.cron_files_scanned, "3");
  assert.equal(result.cron_lines_referencing_backups, "3");
  assert.equal(result.cron_lines_referencing_hr, "1");
  assert.equal(result.cron_references_backups, "true");
});

test("absent roots are distinct from empty directories and true zero counts", t => {
  const f = fixture(t);
  assert.equal(f.observe().backup_inventory_status, "NOT_PRESENT");
  assert.equal(f.observe().cron_reference_status, "NOT_PRESENT");
  f.directory("/var/backups");
  const result = f.observe();
  assert.equal(result.backup_inventory_status, "AVAILABLE");
  assert.equal(result.backup_inventory_regular_bytes, "0");
  assert.equal(result.backup_inventory_oldest_regular_age_seconds, "NOT_PRESENT");
});

test("a root symlink is unavailable, not traversed", t => {
  const f = fixture(t);
  fs.mkdirSync(dirname(f.mapped("/var/backups")), { recursive: true });
  fs.symlinkSync("/PRIVATE_TARGET", f.mapped("/var/backups"));
  assert.equal(f.observe().backup_inventory_status, "UNAVAILABLE");
});

test("one failed lstat withholds all partial backup aggregates and redacts its error", t => {
  const f = fixture(t);
  f.write("/var/backups/jinhu_pg_first", "123");
  f.write("/var/backups/PRIVATE_FAILED", "456");
  const result = f.observe("/var/backups/PRIVATE_FAILED");
  assert.equal(result.backup_inventory_status, "UNAVAILABLE");
  assert.equal(result.backup_inventory_regular_bytes, "UNAVAILABLE");
  assert.equal(result.backup_inventory_hr_jinhu_regular_bytes, "UNAVAILABLE");
});

test("backup entry bound truncates without publishing partial ownership counts", t => {
  const f = fixture(t);
  f.directory("/var/backups");
  for (let i=0; i<4097; i++) f.write(`/var/backups/jinhu_pg_${i}`, "");
  const result = f.observe();
  assert.equal(result.backup_inventory_status, "TRUNCATED");
  assert.equal(result.backup_inventory_truncated, "true");
  assert.equal(result.backup_inventory_entries, "UNAVAILABLE");
});

test("cron directory bound and file byte bound fail closed independently of backup inventory", t => {
  const f = fixture(t);
  for (let i=0; i<65; i++) f.write(`/etc/cron.d/PRIVATE_${i}`, "");
  let result = f.observe();
  assert.equal(result.cron_reference_status, "TRUNCATED");
  assert.equal(result.cron_references_backups, "UNAVAILABLE");
  fs.rmSync(f.mapped("/etc/cron.d"), { recursive: true });
  f.write("/etc/crontab", Buffer.alloc(65537));
  result = f.observe();
  assert.equal(result.cron_reference_status, "TRUNCATED");
  assert.equal(result.cron_files_scanned, "UNAVAILABLE");
});

test("fixed cron symlink and stat failures are unavailable without exposing their targets", t => {
  const f = fixture(t);
  fs.mkdirSync(dirname(f.mapped("/etc/crontab")), { recursive: true });
  fs.symlinkSync("/PRIVATE_TARGET", f.mapped("/etc/crontab"));
  assert.equal(f.observe().cron_reference_status, "UNAVAILABLE");
  fs.unlinkSync(f.mapped("/etc/crontab"));
  f.write("/etc/crontab", "0 1 * * * PRIVATE\n");
  assert.equal(f.observe("/etc/crontab").cron_reference_status, "UNAVAILABLE");
});
