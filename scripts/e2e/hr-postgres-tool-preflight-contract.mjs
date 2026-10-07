import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
const marker = '      - name: Verify HR manager scoped role assignment\n';
assert.equal(workflow.split(marker).length, 2);
const step = workflow.split(marker)[1].split('\n      - name:')[0];
assert.match(step, /timeout-minutes: 5/);
const body = step.split('        run: |\n')[1].split('\n').map(line => line.slice(10)).join('\n');
const root = mkdtempSync(join(tmpdir(), 'jinhu-hr-pg-preflight-'));
const script = join(root, 'workflow.sh');
writeFileSync(script, body, { mode: 0o600 });
execFileSync('/bin/bash', ['-n', script]);
let cases = 0;
function verify(name, { ready = [], override = false, installExit = 0, installsTools = true } = {}) {
  const dir = join(root, name), bin = join(dir, 'bin'), tools = join(dir, 'postgres'), log = join(dir, 'calls');
  mkdirSync(bin, { recursive: true, mode: 0o700 }); mkdirSync(tools, { mode: 0o700 });
  const executable = (file, text) => writeFileSync(file, `#!/bin/sh\n${text}\n`, { mode: 0o700 });
  for (const tool of ready) executable(join(tools, tool), 'exit 0');
  executable(join(bin, 'pg_config'), override ? 'exit 1' : 'printf "%s\\n" "$TEST_PG_TOOLS"');
  executable(join(bin, 'sudo'), `printf 'APT %s\\n' "$*" >> "$TEST_CALLS"
if [ "$TEST_INSTALL_EXIT" != 0 ]; then exit "$TEST_INSTALL_EXIT"; fi
case "$*" in *" install "*)
  if [ "$TEST_INSTALLS_TOOLS" = true ]; then
    for tool in initdb pg_ctl psql; do
      printf '#!/bin/sh\\nexit 0\\n' > "$TEST_PG_TOOLS/$tool"
      chmod 700 "$TEST_PG_TOOLS/$tool"
    done
  fi;; esac`);
  executable(join(bin, 'pnpm'), 'printf "ROLE %s\\n" "$*" >> "$TEST_CALLS"');
  const result = spawnSync('/bin/bash', ['-e', '-o', 'pipefail', script], {
    encoding: 'utf8', timeout: 5000,
    env: { ...process.env, PG_BIN: override ? tools : '', PATH: `${bin}:${process.env.PATH}`, TEST_PG_TOOLS: tools, TEST_CALLS: log, TEST_INSTALL_EXIT: String(installExit), TEST_INSTALLS_TOOLS: String(installsTools) },
  });
  assert.equal(result.error, undefined);
  const calls = readFileSync(log, 'utf8');
  cases++; return { result, calls };
}
try {
  const ready = ['initdb', 'pg_ctl', 'psql'];
  for (const override of [false, true]) {
    const { result, calls } = verify(override ? 'override' : 'ready', { ready, override });
    assert.equal(result.status, 0); assert.doesNotMatch(calls, /APT/);
    assert.equal(calls.trim(), 'ROLE test:e2e:wu-enguo-hr-manager');
  }
  const partial = verify('partial', { ready: ['psql'] });
  assert.equal(partial.result.status, 0); assert.equal(partial.calls.match(/APT/g).length, 2);
  assert.match(partial.calls, /Acquire::Retries=2.*Acquire::http::Timeout=30.*Acquire::https::Timeout=30/);
  assert.match(partial.calls, /ROLE test:e2e:wu-enguo-hr-manager/);
  const failure = verify('install-failure', { installExit: 49 });
  assert.equal(failure.result.status, 49); assert.doesNotMatch(failure.calls, /ROLE/);
  const missing = verify('missing-after-install', { installsTools: false });
  assert.equal(missing.result.status, 1); assert.doesNotMatch(missing.calls, /ROLE/);
  assert.match(missing.result.stdout, /PostgreSQL initdb, pg_ctl and psql are required/);
  console.log(`hr-postgres-tool-preflight-contract: PASS (${cases} executable workflow cases)`);
} finally { rmSync(root, { recursive: true }); }
