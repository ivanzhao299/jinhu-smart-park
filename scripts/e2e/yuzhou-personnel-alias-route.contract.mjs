import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '../..');
const workflow = readFileSync(join(root, '.github/workflows/deploy-production.yml'), 'utf8');
const observer = readFileSync(join(root, 'scripts/diagnose-yuzhou-personnel-alias.mjs'), 'utf8');
const read = relative => readFileSync(join(root, relative), 'utf8');
const start = name => workflow.indexOf(`      - name: ${name}`);
const end = (from, name) => workflow.indexOf(`      - name: ${name}`, from);
const stepBlock = at => {
  const next = workflow.indexOf('\n      - name:', at + 1);
  return workflow.slice(at, next < 0 ? workflow.length : next);
};
const runBlock = block => block.split('        run: |\n')[1]?.split('\n').map(line => line.replace(/^          /u, '')).join('\n') ?? '';
const runtimeMode = 'diagnose-production-runtime-revision';
const stepStart = start('Diagnose Yuzhou personnel alias counts and hash (read-only)');
const stepEnd = end(stepStart, 'Diagnose production runtime image revisions (read-only)');
const runtimeArtifact = start('Retain production runtime image observation');
const artifactStart = start('Retain Yuzhou personnel alias observation');
const artifactEnd = end(artifactStart, 'Diagnose 000189 asset scope parity (read-only)');
assert.ok(stepStart >= 0 && stepEnd > stepStart && runtimeArtifact > stepEnd
  && artifactStart > runtimeArtifact && artifactEnd > artifactStart,
'optional observer and artifact must follow the successful paired runtime observation');
const diagnostic = workflow.slice(stepStart, stepEnd);
const artifact = workflow.slice(artifactStart, artifactEnd);

// Existing runtime-revision mode remains ops-only; the alias flag adds no route or mode.
assert.match(workflow, /diagnose_personnel_alias:\n\s+description:[^\n]+\n\s+required: false\n\s+default: false\n\s+type: boolean/);
assert.match(workflow, new RegExp(`- ${runtimeMode}`));
assert.doesNotMatch(workflow.slice(workflow.indexOf('      deploy_mode:'), workflow.indexOf('      source_manifest_json:')),
  /diagnose-yuzhou-personnel-alias/);
const classification = workflow.slice(workflow.indexOf('      - name: Resolve pre-verification scope'), workflow.indexOf('  verify:\n'));
assert.match(classification, /diagnose-production-runtime-revision\|diagnose-000189-scope/);
assert.match(classification, /echo "mode=ops-only"/);
const verify = workflow.slice(workflow.indexOf('  verify:\n'), workflow.indexOf('  deploy:\n'));
assert.ok(verify.includes('node --test scripts/hr-cutover/tests/legacy-personnel-alias-observation.test.mjs'));
assert.ok(verify.includes('node scripts/e2e/yuzhou-personnel-alias-route.contract.mjs'));

// Path boundary validation must precede SSH execution of this stdin observer.
const pathGate = workflow.indexOf('Enforce Studio and production deployment path separation');
assert.ok(pathGate >= 0 && pathGate < stepStart, 'validated deployment path gate must run first');
assert.ok(workflow.slice(pathGate, stepStart).includes('scripts/validate-production-deploy-path.sh'));
assert.match(diagnostic, new RegExp(`if: \\$\\{\\{ inputs\\.deploy_mode == '${runtimeMode}' && inputs\\.diagnose_personnel_alias \\}\\}`));
assert.match(diagnostic, /PROD_DEPLOY_PATH: \$\{\{ secrets\.PROD_DEPLOY_PATH \}\}/);
assert.match(diagnostic, /case "\$PROD_DEPLOY_PATH" in[\s\S]*?PERSONNEL_ALIAS_PATH_INVALID[\s\S]*?\*\[!A-Za-z0-9_\.\/-\]\*/);
assert.ok(diagnostic.indexOf('case "$PROD_DEPLOY_PATH" in') < diagnostic.indexOf('if ! observation_error='),
  'shell-safe deploy-path validation must run before constructing the SSH command');
assert.match(diagnostic, /node --input-type=module - '\$PROD_DEPLOY_PATH'/);
assert.match(diagnostic, /< scripts\/diagnose-yuzhou-personnel-alias\.mjs/);
assert.match(diagnostic, /RUNNER_TEMP\/personnel-alias-observation\.json/);
assert.match(diagnostic, /2>&1 > "\$RUNNER_TEMP\/personnel-alias-observation\.json"/);
assert.match(diagnostic, /PERSONNEL_ALIAS_PATH_INVALID\|PERSONNEL_ALIAS_PROBE_FAILED\|PERSONNEL_ALIAS_RESULT_INVALID\|PERSONNEL_ALIAS_DB_TIMEOUT_57014\|PERSONNEL_ALIAS_DB_SCHEMA_INVALID\|PERSONNEL_ALIAS_DB_ACCESS_DENIED/);
assert.match(diagnostic, /PERSONNEL_ALIAS_REMOTE_OBSERVATION_FAILED/);
assert.doesNotMatch(diagnostic, /cat\s+"?\$RUNNER_TEMP|echo\s+"\$observation_error|printf[^\n]*\$PROD_DEPLOY_PATH/);
assert.doesNotMatch(diagnostic, /(?:rsync|\.release\.json|pnpm|prod:deploy|db:migrate|db:seed|docker\s+(?:build|create|up|restart|prune)|chmod|rm\s+-rf)/);
assert.match(artifact, new RegExp(`if: \\$\\{\\{ inputs\\.deploy_mode == '${runtimeMode}' && inputs\\.diagnose_personnel_alias && success\\(\\) \\}\\}`));
assert.match(artifact, /uses: actions\/upload-artifact@v6/);
assert.match(artifact, /name: personnel-alias-observation/);
assert.match(artifact, /path: \$\{\{ runner\.temp \}\}\/personnel-alias-observation\.json/);
assert.match(artifact, /retention-days: 7/);
assert.doesNotMatch(artifact, /always\(\)|failure\(\)/);

// No release mutation or acceptance step may run for the existing diagnostic mode.
for (const name of ['Resolve deployment mode', 'Enforce verified deployment scope', 'Ensure required production secrets',
  'Enforce 000189 asset scope parity before deployment', 'Repair retired 000194 runtime owner rows before deployment',
  'Enforce 000194 runtime control parity before deployment', 'Write release marker', 'Deploy',
  'Verify protected acceptance accounts in Production']) {
  const at = start(name);
  if (at < 0) continue;
  const block = stepBlock(at);
  const header = block.split('\n        env:')[0];
  assert.ok(header.includes(`inputs.deploy_mode != '${runtimeMode}'`),
    `${name} must exclude the read-only runtime diagnostic`);
  assert.doesNotMatch(block, /diagnose_personnel_alias/);
}
assert.match(read('scripts/diagnose-yuzhou-personnel-alias.mjs'), /authorizationGranted: false[\s\S]*writerPresent: false/);
assert.match(observer, /BEGIN TRANSACTION READ ONLY/);

// Execute the actual extracted route shell with a fake SSH binary: success writes only the
// bounded JSON file, and unknown remote stderr is replaced by the stable generic error.
const temp = mkdtempSync(join(tmpdir(), 'personnel-alias-route-'));
try {
  const ssh = join(temp, 'ssh');
  writeFileSync(ssh, '#!/bin/sh\ntouch "$TEST_SSH_CALLED"\nprintf "%s\\n" "$TEST_REMOTE_STDOUT"\nprintf "%s\\n" "$TEST_REMOTE_STDERR" >&2\nexit "${TEST_SSH_STATUS:-0}"\n', { mode: 0o700 });
  chmodSync(ssh, 0o700);
  const script = runBlock(diagnostic);
  assert.ok(script.length > 0, 'diagnostic workflow shell must be executable');
  const resultPath = join(temp, 'personnel-alias-observation.json');
  const run = (status, stderr = '', stdout = '') => spawnSync('sh', ['-s'], { cwd: root, input: script, encoding: 'utf8', env: {
    ...process.env, PATH: `${temp}:${process.env.PATH}`, RUNNER_TEMP: temp, PROD_SSH_HOST: 'synthetic-host',
    PROD_SSH_USER: 'synthetic-user', PROD_SSH_PORT: '22', PROD_DEPLOY_PATH: '/srv/jinhu-prod',
    TEST_SSH_STATUS: String(status), TEST_REMOTE_STDERR: stderr, TEST_REMOTE_STDOUT: stdout,
    TEST_SSH_CALLED: join(temp, 'ssh-called'),
  } });
  const notReady = '{"classification":"NOT_READY","productionImport":"HOLD","authorizationGranted":false,"writerPresent":false}';
  let executed = run(0, '', notReady);
  assert.equal(executed.status, 0, executed.stderr);
  assert.equal(executed.stdout, '', 'aggregate result is retained as an artifact input, not dumped to logs');
  assert.equal(readFileSync(resultPath, 'utf8'), `${notReady}\n`);
  for (const invalidPath of ['relative/path', '/srv/../srv/jinhu-prod', "/srv/jinhu-prod'quoted", '/srv/jinhu-prod\nextra']) {
    const marker = join(temp, 'ssh-called');
    if (existsSync(marker)) unlinkSync(marker);
    if (existsSync(resultPath)) unlinkSync(resultPath);
    executed = spawnSync('sh', ['-s'], { cwd: root, input: script, encoding: 'utf8', env: {
      ...process.env, PATH: `${temp}:${process.env.PATH}`, RUNNER_TEMP: temp, PROD_SSH_HOST: 'synthetic-host',
      PROD_SSH_USER: 'synthetic-user', PROD_SSH_PORT: '22', PROD_DEPLOY_PATH: invalidPath,
      TEST_SSH_CALLED: marker,
    } });
    assert.equal(executed.status, 1);
    assert.equal(executed.stdout, '');
    assert.equal(executed.stderr, 'PERSONNEL_ALIAS_PATH_INVALID\n');
    assert.equal(existsSync(marker), false, 'invalid paths must not reach SSH');
    assert.equal(existsSync(resultPath), false, 'invalid paths must not create a result artifact');
  }
  for (const [remoteError, expected] of [
    ['PERSONNEL_ALIAS_PROBE_FAILED', 'PERSONNEL_ALIAS_PROBE_FAILED\n'],
    ['PERSONNEL_ALIAS_DB_TIMEOUT_57014', 'PERSONNEL_ALIAS_DB_TIMEOUT_57014\n'],
    ['PERSONNEL_ALIAS_DB_SCHEMA_INVALID', 'PERSONNEL_ALIAS_DB_SCHEMA_INVALID\n'],
    ['PERSONNEL_ALIAS_DB_ACCESS_DENIED', 'PERSONNEL_ALIAS_DB_ACCESS_DENIED\n'],
    ['sensitive password / host path', 'PERSONNEL_ALIAS_REMOTE_OBSERVATION_FAILED\n'],
    ['PERSONNEL_ALIAS_RESULT_INVALID\nsensitive details', 'PERSONNEL_ALIAS_REMOTE_OBSERVATION_FAILED\n'],
  ]) {
    executed = run(1, remoteError, '');
    assert.equal(executed.status, 1);
    assert.equal(executed.stdout, '');
    assert.equal(executed.stderr, expected);
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}

console.log('Yuzhou personnel alias read-only route contract passed.');
