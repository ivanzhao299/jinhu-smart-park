#!/usr/bin/env node
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const extractor = resolve(repositoryRoot, "scripts/extract-yuzhou-t5-legacy-history.sh");
const source = readFileSync(extractor, "utf8");
assert.match(source, /YUZHOU_PARTY_DATA_KEY_FILE/);
assert.match(source, /materialization-key-contract\.mjs" verify/);
assert.match(source, /sqlcmd -b -V 16/);
assert.match(source, /sqlcmd -b -V 16[\s\S]*\[ -s "\$OUT\/\$name" \] \|\| printf '\[\]'/);
assert.match(source, /raw T5 source artifacts were not removed/);

const sandbox = mkdtempSync(resolve(tmpdir(), "jinhu-yuzhou-t5-extract-"));
const binDirectory = resolve(sandbox, "bin");
const stagingRoot = resolve(sandbox, "staging");
const credentialFile = resolve(sandbox, "etl.env");
const keyFile = resolve(sandbox, "materialization-key.hex");
const dockerMarker = resolve(sandbox, "docker-called");
mkdirSync(binDirectory, { recursive: true, mode: 0o700 });
mkdirSync(stagingRoot, { recursive: true, mode: 0o700 });
writeFileSync(credentialFile, "YUZHOU_SQLSERVER_ETL_LOGIN=fixture_reader\nYUZHOU_SQLSERVER_ETL_PASSWORD=fixture_secret\nYUZHOU_SQLSERVER_DATABASE=fixture_database\n", { mode: 0o600 });
writeFileSync(keyFile, `${"ab".repeat(32)}\n`, { mode: 0o600 });

const fakeDocker = resolve(binDirectory, "docker");
writeFileSync(fakeDocker, `#!/usr/bin/env sh
set -eu
: >"\${T5_DOCKER_MARKER}"
if [ "$1" = inspect ]; then
  printf '%s\\n' jinhu_yuzhou_migration_lab
  exit 0
fi
case "$*" in
  *is_read_only*) printf '%s\\n' 1 ;;
  *IS_SRVROLEMEMBER*) printf '%s\\n' 0 ;;
  *)
    printf '%s\\n' 'SENSITIVE_SQL_OUTPUT_MUST_NOT_ESCAPE'
    printf '%s\\n' 'sensitive sql failure detail' >&2
    exit 1
    ;;
esac
`, { mode: 0o700 });
chmodSync(fakeDocker, 0o700);

const baseEnvironment = {
  ...process.env,
  PATH: `${binDirectory}${delimiter}${process.env.PATH ?? ""}`,
  ALLOW_YUZHOU_MIGRATION: "yes",
  YUZHOU_SQLSERVER_DATABASE: "fixture_database",
  YUZHOU_SQLSERVER_CONTAINER: "fixture_container",
  YUZHOU_ETL_CREDENTIAL_FILE: credentialFile,
  YUZHOU_STAGING_ROOT: stagingRoot,
  T5_DOCKER_MARKER: dockerMarker,
};
const run = (runId, extraEnvironment = {}) => spawnSync("sh", [extractor], {
  cwd: repositoryRoot,
  encoding: "utf8",
  env: { ...baseEnvironment, YUZHOU_MIGRATION_RUN_ID: runId, ...extraEnvironment },
});

try {
  const missing = run("fixture-t5-missing-key");
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /ERROR: protected materialization key file is required/);
  assert.equal(existsSync(dockerMarker), false, "source access must not start before key validation");

  chmodSync(keyFile, 0o644);
  const unsafe = run("fixture-t5-unsafe-key", { YUZHOU_PARTY_DATA_KEY_FILE: keyFile });
  assert.equal(unsafe.status, 1);
  assert.match(unsafe.stderr, /materialization key must be a non-symlink 0600 regular file/);
  assert.equal(existsSync(dockerMarker), false, "unsafe key file must fail before source access");
  chmodSync(keyFile, 0o600);

  const invalidKeys = [
    ["short", `${"ab".repeat(31)}\n`],
    ["overlong", `${"ab".repeat(48)}\n`],
    ["nonhex", `${"zz".repeat(32)}\n`],
    ["multiline", `${"ab".repeat(32)}\n${"cd".repeat(32)}\n`],
    ["blank-lines", `\n${"ab".repeat(32)}\n\n`],
    ["crlf", `${"ab".repeat(32)}\r\n`],
  ];
  for (const [label, value] of invalidKeys) {
    writeFileSync(keyFile, value, { mode: 0o600 });
    const rejected = run(`fixture-t5-${label}-key`, { YUZHOU_PARTY_DATA_KEY_FILE: keyFile });
    assert.equal(rejected.status, 1, label);
    assert.match(rejected.stderr, /MATERIALIZATION_KEY_CONTRACT_FAILED/, label);
    assert.equal(existsSync(dockerMarker), false, `${label} key must fail before source access`);
  }
  writeFileSync(keyFile, `${"ab".repeat(32)}\n`, { mode: 0o600 });

  const queryFailure = run("fixture-t5-query-failure", { YUZHOU_PARTY_DATA_KEY_FILE: keyFile });
  assert.equal(queryFailure.status, 1);
  assert.match(queryFailure.stderr, /ERROR: SQL query failed for catalog\.raw\.json/);
  assert.doesNotMatch(`${queryFailure.stdout}\n${queryFailure.stderr}`, /SENSITIVE_SQL_OUTPUT_MUST_NOT_ESCAPE|sensitive sql failure detail/);
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}

process.stdout.write("Yuzhou T5 direct extract contract passed.\n");
