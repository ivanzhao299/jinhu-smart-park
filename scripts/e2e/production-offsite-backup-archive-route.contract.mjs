import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const source = readFileSync(new URL('../../.github/workflows/deploy-production.yml', import.meta.url), 'utf8');
const mode = 'archive-smart-control-backups';
const archiveName = 'Plan or apply historical Smart Control backup archival';
const digest = 'a'.repeat(64);
const receiptValidator = readFileSync(new URL('../validate-production-backup-archive-receipt.mjs', import.meta.url), 'utf8');
const ready = operation => ({ status: operation === 'apply' ? 'ARCHIVE_COMPLETED' : 'PLAN_READY', plan_sha256: digest,
  planned_bundles: 2, expected_reclaimed_bytes: 100, logical_transfer_bytes: 200, retired_bundles: operation === 'apply' ? 2 : 0,
  ...(operation === 'apply' ? { actual_host_free_bytes: 1024 } : {}) });

function step(name, text = source) {
  const marker = `      - name: ${name}\n`;
  const start = text.indexOf(marker);
  assert.ok(start >= 0, `missing step ${name}`);
  const end = text.indexOf('\n      - name:', start + marker.length);
  return text.slice(start, end < 0 ? undefined : end);
}

function runBlock(name, text = source) {
  const block = step(name, text);
  const marker = '        run: |\n';
  const start = block.indexOf(marker);
  assert.ok(start >= 0);
  return block.slice(start + marker.length).split('\n').map(line => line.startsWith('          ') ? line.slice(10) : line).join('\n').trimEnd() + '\n';
}

function enabled(block, selectedMode) {
  const expression = block.match(/^\s*if: \$\{\{ (.+) \}\}$/m)?.[1];
  assert.ok(expression, 'explicit route condition required');
  // Evaluate only repository-owned routing expressions against a fixed synthetic context.
  const fn = new Function('inputs', 'steps', 'needs', 'always', 'success', 'startsWith', 'contains', 'fromJSON',
    `return (${expression.replaceAll('steps.deploy-mode', "steps['deploy-mode']")});`);
  return fn({ deploy_mode: selectedMode }, { 'deploy-mode': { outputs: { mode: '' } } },
    { classify: { outputs: { mode: 'ops-only' } } }, () => true, () => true,
    (value, prefix) => value.startsWith(prefix), (values, value) => values.includes(value), JSON.parse);
}

function assertBoundary(text) {
  assert.match(text, /- archive-smart-control-backups\n/);
  assert.match(text, /backup_archive_operation:\n[\s\S]*?default: plan\n/);
  assert.match(text, /prepare-yuzhou-hr-production-data-volume\|archive-smart-control-backups\)/);
  const archive = step(archiveName, text);
  assert.equal(enabled(archive, mode), true);
  assert.equal(enabled(text.slice(text.indexOf('  deploy:\n')), mode), true, 'ops-only archival must reach the protected host job');
  for (const selected of ['auto', 'full', 'web', 'api', 'database', 'prepare-yuzhou-hr-production-data-volume',
    ...[...text.matchAll(/^          - (diagnose-[a-z0-9-]+)$/gm)].map(match => match[1])]) {
    assert.equal(enabled(archive, selected), false, `${selected} must never archive`);
  }
  for (const name of ['Resolve deployment mode', 'Enforce verified deployment scope',
    'Ensure required production secrets', 'Enforce 000189 asset scope parity before deployment',
    'Repair retired 000194 runtime owner rows before deployment', 'Enforce 000194 runtime control parity before deployment',
    'Write release marker', 'Deploy', 'Verify protected acceptance accounts in Production',
    'Reclaim unused Docker storage before release transfer', 'Prepare Yuzhou HR production data volume']) {
    assert.equal(enabled(step(name, text), mode), false, `archive must not enter ${name}`);
  }
  assert.match(archive, /python3 -B - '\$operation' '\$expected' '\$PROD_DEPLOY_PATH'/);
  assert.match(archive, /< scripts\/archive-production-offsite-backups\.py/);
  assert.match(archive, /> "\$raw_receipt"/);
  assert.doesNotMatch(archive, /offsite-backups\.py > "\$receipt"/);
  assert.match(archive, /node scripts\/validate-production-backup-archive-receipt\.mjs/);
  assert.doesNotMatch(archive, /rsync|pg_dump|pg_restore|prod:deploy|\.release\.json/);
  assert.equal(enabled(step('Retain historical backup archival receipt', text), mode), true);
}

function fixture(t, operation = '', expected = '', body = JSON.stringify(ready('plan')), sshExit = 0, sanitizerFailure = '') {
  const root = mkdtempSync(join(tmpdir(), 'backup-archive-route-'));
  chmodSync(root, 0o700);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'bin'));
  mkdirSync(join(root, 'scripts'));
  const payload = '# SYNTHETIC_ARCHIVE_SOURCE\n';
  writeFileSync(join(root, 'scripts/archive-production-offsite-backups.py'), payload);
  writeFileSync(join(root, 'scripts/validate-production-backup-archive-receipt.mjs'), receiptValidator);
  if (sanitizerFailure) {
    writeFileSync(join(root, 'bin/node'), '#!/bin/sh\n' + (sanitizerFailure === 'terminate' ? 'kill -TERM "$PPID"\nexit 0\n' : 'exit 97\n'));
    chmodSync(join(root, 'bin/node'), 0o700);
  }
  writeFileSync(join(root, 'bin/ssh'), `#!${process.execPath}\n` + String.raw`
const fs = require('node:fs');
fs.writeFileSync(process.env.ROUTE_ARGS, JSON.stringify(process.argv.slice(2)));
fs.writeFileSync(process.env.ROUTE_STDIN, fs.readFileSync(0));
process.stdout.write(process.env.ROUTE_BODY);
process.stderr.write('PRIVATE_TRANSPORT_DETAIL\n');
process.exitCode = Number(process.env.ROUTE_EXIT);
`);
  chmodSync(join(root, 'bin/ssh'), 0o700);
  const result = spawnSync('sh', ['-s'], { cwd: root, input: runBlock(archiveName), encoding: 'utf8', timeout: 10000,
    env: { ...process.env, PATH: `${join(root, 'bin')}:${process.env.PATH}`, RUNNER_TEMP: root,
      PROD_SSH_PORT: '2222', PROD_SSH_HOST: 'fixture.invalid', PROD_SSH_USER: 'fixture', PROD_DEPLOY_PATH: '/fixture/deploy',
      ARCHIVE_OPERATION_INPUT: operation, ARCHIVE_PLAN_INPUT: expected,
      ROUTE_ARGS: join(root, 'args.json'), ROUTE_STDIN: join(root, 'stdin.txt'), ROUTE_BODY: body, ROUTE_EXIT: String(sshExit) } });
  assert.equal(result.error, undefined);
  const receipt = JSON.parse(readFileSync(join(root, 'production-backup-archive-receipt.json'), 'utf8'));
  assert.doesNotMatch(result.stdout + result.stderr + JSON.stringify(receipt), /PRIVATE|SECRET_VALUE|\/var\/backups|secret-password/);
  return { root, result, receipt, payload };
}

test('archive routing excludes all diagnostics, application writes and unrelated operations', () => {
  assertBoundary(source);
  const deploy = step('Deploy');
  assert.throws(() => assertBoundary(source.replace(deploy, deploy.replace(` && inputs.deploy_mode != '${mode}'`, '')
    .replace("steps.deploy-mode.outputs.mode != 'ops-only'", 'true'))));
  assert.throws(() => assertBoundary(source.replace(`if: \$\{\{ inputs.deploy_mode == '${mode}' \}\}`, "if: ${{ inputs.deploy_mode == 'diagnose-yuzhou-hr-capacity' }}")));
  assert.throws(() => assertBoundary(source.replace('default: plan\n', 'default: apply\n')));
  assert.throws(() => assertBoundary(source.replace('python3 -B -', 'python3 -')));
});

test('classification executes the ops-only early exit for archive mode', t => {
  const root = mkdtempSync(join(tmpdir(), 'backup-archive-classify-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const out = join(root, 'output');
  const result = spawnSync('sh', ['-s'], { input: runBlock('Resolve pre-verification scope'), encoding: 'utf8', timeout: 5000,
    env: { ...process.env, REQUESTED_DEPLOY_MODE: mode, EVENT_NAME: 'workflow_dispatch', BEFORE_SHA: '', GITHUB_OUTPUT: out } });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(out, 'utf8'), 'mode=ops-only\n');
});

test('default plan streams only the selected source with bytecode cache disabled', t => {
  const f = fixture(t);
  assert.equal(f.result.status, 0, f.result.stderr);
  assert.equal(f.receipt.status, 'PLAN_READY');
  const args = JSON.parse(readFileSync(join(f.root, 'args.json')));
  assert.equal(args.at(-1), "python3 -B - 'plan' '-' '/fixture/deploy'");
  assert.equal(createHash('sha256').update(readFileSync(join(f.root, 'stdin.txt'))).digest('hex'), createHash('sha256').update(f.payload).digest('hex'));
});

test('apply binds the exact lower-case plan digest to its remote command', t => {
  const f = fixture(t, 'apply', digest, JSON.stringify(ready('apply')));
  assert.equal(f.result.status, 0, f.result.stderr);
  assert.equal(f.receipt.status, 'ARCHIVE_COMPLETED');
  assert.equal(JSON.parse(readFileSync(join(f.root, 'args.json'))).at(-1), `python3 -B - 'apply' '${digest}' '/fixture/deploy'`);
});

test('invalid operation or plan input fails before any SSH action', t => {
  for (const [operation, expected] of [['apply', ''], ['apply', 'A'.repeat(64)], ['apply; touch ATTACK', digest], ['plan', digest]]) {
    const f = fixture(t, operation, expected);
    assert.notEqual(f.result.status, 0);
    assert.equal(existsSync(join(f.root, 'args.json')), false);
    assert.equal(existsSync(join(f.root, 'ATTACK')), false);
    assert.equal(f.receipt.fixed_failure_code, 'OPERATION_NOT_COMPLETED');
  }
});

test('transport failure and malformed remote output retain only fixed failure receipts', t => {
  const f = fixture(t, 'plan', '', 'PRIVATE_TRANSPORT_DETAIL secret-password', 255);
  assert.notEqual(f.result.status, 0);
  assert.deepEqual(f.receipt, { status: 'FAIL', fixed_failure_code: 'TRANSPORT_FAILED' });
});

test('helper failure propagates without exposing raw stderr', t => {
  const f = fixture(t, 'apply', digest, JSON.stringify({ status: 'FAIL', fixed_failure_code: 'SOURCE_DRIFT' }), 1);
  assert.notEqual(f.result.status, 0);
  assert.equal(f.receipt.fixed_failure_code, 'SOURCE_DRIFT');
});

test('invalid, private or mode-mismatched receipts cannot become success artifacts', t => {
  for (const body of ['[]', '{}', JSON.stringify({ status: 'PLAN_READY' }),
    JSON.stringify({ ...ready('plan'), raw_path: '/var/backups/private' }),
    JSON.stringify({ ...ready('plan'), private_name: 'SECRET_VALUE' }),
    JSON.stringify({ status: 'FAIL', fixed_failure_code: 'SECRET_VALUE' }),
    JSON.stringify({ ...ready('plan'), retired_bundles: 1 }),
    JSON.stringify(ready('apply')), 'x'.repeat(32769)]) {
    const f = fixture(t, 'plan', '', body);
    assert.notEqual(f.result.status, 0);
    assert.deepEqual(f.receipt, { status: 'FAIL', fixed_failure_code: 'RECEIPT_INVALID' });
  }
});

test('nonzero transport cannot retain a misleading completed result', t => {
  const f = fixture(t, 'apply', digest, JSON.stringify(ready('apply')), 1);
  assert.notEqual(f.result.status, 0);
  assert.equal(f.receipt.status, 'FAIL');
  assert.equal(f.receipt.fixed_failure_code, 'TRANSPORT_STATUS_CONFLICT');
});

test('apply cannot accept a different plan or a partially retired completed receipt', t => {
  for (const bad of [{ ...ready('apply'), plan_sha256: 'b'.repeat(64) }, { ...ready('apply'), retired_bundles: 1 }]) {
    const f = fixture(t, 'apply', digest, JSON.stringify(bad));
    assert.notEqual(f.result.status, 0);
    assert.equal(f.receipt.fixed_failure_code, 'RECEIPT_INVALID');
  }
});

test('cancellation or sanitizer failure cannot upload unsanitized SSH output', t => {
  for (const failure of ['exit', 'terminate']) {
    const f = fixture(t, 'plan', '', JSON.stringify({ private_name: 'SECRET_VALUE' }), 0, failure);
    assert.ok(f.result.status !== 0 || f.result.signal);
    assert.deepEqual(f.receipt, { status: 'FAIL', fixed_failure_code: 'OPERATION_NOT_COMPLETED' });
    assert.match(readFileSync(join(f.root, 'production-backup-archive-raw.json'), 'utf8'), /SECRET_VALUE/);
  }
});
