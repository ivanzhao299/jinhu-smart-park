/* global process, fetch */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, chmodSync, existsSync, createWriteStream } from 'node:fs';
import { resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { EXECUTOR_SHA, fail, fileHash, nonceRoot, writePrivate, copyPgTree } from './yuzhou-private-import-packet.mjs';

const REPOSITORY = 'ivanzhao299/jinhu-smart-park';
const e = process.env;
const mode = e.TRANSPORT_MODE;
const nonce = e.TRANSPORT_NONCE;
const packetHash = e.TRANSPORT_PACKET_SHA256;
let root;
let stage;
let releaseVerified = false;
let remoteCreated = false;
const run = (command, args, options = {}) => {
  const r = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, ...options });
  if (r.status !== 0) {
    if (stage && !existsSync(resolve(stage, 'failure.log'))) writePrivate(resolve(stage, 'failure.log'), `${r.stdout ?? ''}\n${r.stderr ?? ''}`);
    let code;
    try { code = JSON.parse(r.stdout).code; } catch { /* Preserve detailed subprocess output only in the private log. */ }
    if (/^(?:TRANSPORT|PRODUCTION_IMPORT)_[A-Z0-9_]+$/u.test(code ?? '')) fail(code);
    fail('TRANSPORT_DISPATCH_SUBPROCESS_FAILED');
  }
  return r.stdout;
};
const sshArgs = () => ['-p', e.PROD_SSH_PORT, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=20', `${e.PROD_SSH_USER}@${e.PROD_SSH_HOST}`];
const remote = (command, options) => run('ssh', [...sshArgs(), command], options);
const api = async (suffix, options = {}) => {
  const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/${suffix}`, { headers: { Authorization: `Bearer ${e.GH_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, ...options });
  if (!response.ok) fail('TRANSPORT_GITHUB_FAILED');
  return response;
};

try {
  if (!['prepare', 'execute'].includes(mode) || !/^[a-f0-9]{64}$/u.test(packetHash ?? '') || e.GITHUB_REPOSITORY !== REPOSITORY) fail('TRANSPORT_ARGUMENT_INVALID');
  root = nonceRoot(nonce);
  if (!/^[A-Za-z0-9.-]+$/u.test(e.PROD_SSH_HOST ?? '') || !/^[A-Za-z0-9_-]+$/u.test(e.PROD_SSH_USER ?? '') || !/^\d{1,5}$/u.test(e.PROD_SSH_PORT ?? '') || !/^\/[A-Za-z0-9_./-]+$/u.test(e.PROD_DEPLOY_PATH ?? '')) fail('TRANSPORT_SSH_CONFIG_INVALID');
  stage = resolve(e.RUNNER_TEMP, `yuzhou-transport-${nonce}`);
  mkdirSync(stage, { mode: 0o700 });
  if (mode === 'prepare') {
    if (!/^[1-9][0-9]{0,18}$/u.test(e.TRANSPORT_RELEASE_ID ?? '') || !/^[a-f0-9]{64}$/u.test(e.YUZHOU_IMPORT_TRANSPORT_KEY ?? '')) fail('TRANSPORT_RELEASE_INPUT_INVALID');
    const release = await (await api(`releases/${e.TRANSPORT_RELEASE_ID}`)).json();
    if (release.draft !== true || release.tag_name !== `yuzhou-private-${nonce}` || release.assets?.length !== 1 || release.assets[0].name !== 'packet.bin' || !Number.isSafeInteger(release.assets[0].id) || release.assets[0].size > 2_100_000_000) fail('TRANSPORT_DRAFT_INVALID');
    releaseVerified = true;
    const response = await api(`releases/assets/${release.assets[0].id}`, { headers: { Authorization: `Bearer ${e.GH_TOKEN}`, Accept: 'application/octet-stream', 'X-GitHub-Api-Version': '2022-11-28' } });
    const packet = resolve(stage, 'packet.bin');
    await pipeline(Readable.fromWeb(response.body), createWriteStream(packet, { mode: 0o600, flags: 'wx' }));
    if (await fileHash(packet) !== packetHash) fail('TRANSPORT_PACKET_HASH_MISMATCH');
    const executor = resolve('executor-source');
    if (run('git', ['rev-parse', 'HEAD'], { cwd: executor }).trim() !== EXECUTOR_SHA) fail('TRANSPORT_SOURCE_DRIFT');
    run('git', ['diff', '--quiet', '--'], { cwd: executor });
    run('git', ['diff', '--cached', '--quiet', '--'], { cwd: executor });
    run('git', ['bundle', 'create', resolve(stage, 'source.bundle'), 'HEAD'], { cwd: executor });
    copyPgTree(executor, resolve(stage, 'node_modules'));
    run('tar', ['-czf', resolve(stage, 'runtime.tgz'), '-C', stage, 'source.bundle', 'node_modules']);
    for (const name of ['yuzhou-private-import-packet.mjs', 'yuzhou-private-import-host.mjs']) cpSync(resolve('scripts/hr-cutover', name), resolve(stage, name));
    chmodSync(resolve(stage, 'runtime.tgz'), 0o600);
    const runtimeHash = await fileHash(resolve(stage, 'runtime.tgz'));
    remote(`umask 077; mkdir '${root}'`); remoteCreated = true;
    const files = ['packet.bin', 'runtime.tgz', 'yuzhou-private-import-packet.mjs', 'yuzhou-private-import-host.mjs'].map(name => resolve(stage, name));
    run('scp', ['-q', '-P', e.PROD_SSH_PORT, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', ...files, `${e.PROD_SSH_USER}@${e.PROD_SSH_HOST}:${root}/`]);
    remote(`umask 077; cat > '${root}/transport-key.txt'`, { input: e.YUZHOU_IMPORT_TRANSPORT_KEY });
    remote(`set -eu; cd '${root}'; chmod 600 packet.bin runtime.tgz *.mjs; printf '%s  runtime.tgz\n' '${runtimeHash}' | sha256sum -c - >/dev/null; tar -xzf runtime.tgz; git clone -q source.bundle executor 2>clone.log; mv node_modules executor/node_modules; chmod 600 clone.log; rm source.bundle runtime.tgz`);
  }
  // Literal command and fixed allowlisted arguments only. No packet-controlled
  // commands, repository URLs, branches, or deployment action are accepted.
  const output = remote(`node '${root}/yuzhou-private-import-host.mjs' '${mode}' '${nonce}' '${packetHash}' '${e.PROD_DEPLOY_PATH}'`);
  const summary = JSON.parse(output);
  if (!/^TRANSPORT_(PROBE_PASS|PREPARED|EXECUTED_EXACT_SCOPE)$/u.test(summary.code ?? '')) fail('TRANSPORT_RESULT_INVALID');
  for (const [key, value] of Object.entries(summary)) {
    if (key === 'code') continue;
    if (key === 'codeSha' && value === EXECUTOR_SHA) continue;
    if (['packetSha256', 'receiptSha256', 'sealedPlanSha256'].includes(key) && /^[a-f0-9]{64}$/u.test(value)) continue;
    if (['artifactCount', 'recordCount'].includes(key) && Number.isSafeInteger(value) && value >= 0) continue;
    fail('TRANSPORT_RESULT_INVALID');
  }
  process.stdout.write(`${JSON.stringify(summary)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ code: /^(?:TRANSPORT|PRODUCTION_IMPORT)_[A-Z0-9_]+$/u.test(error.code ?? '') ? error.code : 'TRANSPORT_DISPATCH_FAILED' })}\n`);
  process.exitCode = 1;
} finally {
  // Actions' contents token cannot delete repository secrets. The custodian
  // deletes YUZHOU_IMPORT_TRANSPORT_KEY after prepare, including failed runs.
  delete e.YUZHOU_IMPORT_TRANSPORT_KEY;
  if (remoteCreated) {
    try { remote(`rm -f '${root}/transport-key.txt' '${root}/packet.bin'`); }
    catch { process.stdout.write('{"code":"TRANSPORT_REMOTE_CLEANUP_REQUIRED"}\n'); process.exitCode = 1; }
  }
  if (releaseVerified) {
    try { await api(`releases/${e.TRANSPORT_RELEASE_ID}`, { method: 'DELETE' }); }
    catch { process.stdout.write('{"code":"TRANSPORT_DRAFT_CLEANUP_REQUIRED"}\n'); process.exitCode = 1; }
  }
  if (stage) for (const name of ['packet.bin', 'node_modules', 'source.bundle', 'runtime.tgz']) rmSync(resolve(stage, name), { recursive: true, force: true });
}
