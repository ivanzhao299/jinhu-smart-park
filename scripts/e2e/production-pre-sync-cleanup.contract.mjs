import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const workflow = readFileSync(resolve('.github/workflows/deploy-production.yml'), 'utf8');
const start = workflow.indexOf('      - name: Reclaim unused Docker storage before release transfer');
const end = workflow.indexOf('      - name: Ensure required production secrets', start);
assert.ok(start > workflow.indexOf('Enforce verified deployment scope'));
assert.ok(start < end && end < workflow.indexOf('rollback_root='));
const step = workflow.slice(start, end);
assert.ok(step.includes(`contains(fromJSON('["web","api","full"]'), steps.deploy-mode.outputs.mode)`));
const body = step.split("<<'PRE_SYNC_CLEANUP'\n")[1].split('          PRE_SYNC_CLEANUP')[0]
  .split('\n').map(line => line.replace(/^ {10}/, '')).join('\n');
assert.ok(body.includes('MODE=full sh'));
assert.ok(body.includes('DOCKER_BUILD_CACHE_KEEP_STORAGE=0gb'));
assert.doesNotMatch(body, /volume prune|compose.*(?:build|down)|rm -rf|rsync/);

const temporary = mkdtempSync(join(tmpdir(), 'jinhu-pre-sync-'));
let cases = 0;
try {
  for (const scenario of ['enough', 'root-low', 'docker-low', 'health-fail', 'cleanup-fail', 'still-low', 'invalid-before', 'invalid-after', 'df-fail', 'bootstrap']) {
    const root = join(temporary, scenario);
    const bin = join(root, 'bin');
    const scripts = join(root, 'scripts');
    mkdirSync(bin, { recursive: true });
    mkdirSync(scripts);
    const log = join(root, 'calls');
    const state = join(root, 'cleaned');
    const executable = (path, text) => writeFileSync(path, `#!/bin/sh\nset -eu\n${text}\n`, { mode: 0o700 });
    executable(join(bin, 'docker'), 'test "$1" = info\nprintf "%s\\n" "$FIXTURE_ROOT/docker-root"');
    executable(join(bin, 'df'), `
test "$1" = -Pk
free=20000000
case "$SCENARIO" in
  root-low|health-fail|cleanup-fail|still-low|invalid-after) free=81052 ;;
  docker-low) case "$2" in */docker-root) free=81052 ;; esac ;;
  invalid-before) free=unknown ;;
esac
if [ -f "$STATE_FILE" ]; then
  free=20000000
  case "$SCENARIO" in still-low) free=81052 ;; invalid-after) free=unknown ;; esac
fi
printf 'Filesystem 1024-blocks Used Available Capacity Mounted\\n/dev/test 100000000 80000000 %s 80%% /\\n' "$free"
test "$SCENARIO" != df-fail
`);
    executable(join(scripts, 'prod-healthcheck.sh'), `
test "$MODE" = full
echo health >> "$CALL_LOG"
test "$SCENARIO" != health-fail
`);
    executable(join(scripts, 'prod-docker-cleanup.sh'), `
test "$PRUNE_DOCKER_BUILD_CACHE" = yes
test "$DOCKER_BUILD_CACHE_KEEP_STORAGE" = 0gb
echo cleanup >> "$CALL_LOG"
test "$SCENARIO" != cleanup-fail
touch "$STATE_FILE"
`);
    if (scenario !== 'bootstrap') writeFileSync(join(root, '.env.production'), '');
    const result = spawnSync('sh', ['-s', '--', root], {
      input: body, encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, SCENARIO: scenario, FIXTURE_ROOT: root, CALL_LOG: log, STATE_FILE: state },
    });
    assert.ifError(result.error);
    const called = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [];
    const failures = ['health-fail', 'cleanup-fail', 'still-low', 'invalid-before', 'invalid-after', 'df-fail'];
    assert.equal(result.status === 0, !failures.includes(scenario), `${scenario}: ${result.stderr}`);
    if (['enough', 'bootstrap', 'invalid-before', 'df-fail'].includes(scenario)) assert.deepEqual(called, [], scenario);
    else if (scenario === 'health-fail') assert.deepEqual(called, ['health']);
    else assert.deepEqual(called, ['health', 'cleanup'], scenario);
    if (['still-low', 'invalid-after', 'invalid-before'].includes(scenario)) assert.match(result.stderr, /PRODUCTION_PRE_SYNC_FREE_SPACE_/);
    cases += 1;
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
console.log(`Production pre-sync storage: ${cases} executed scenarios PASS`);
