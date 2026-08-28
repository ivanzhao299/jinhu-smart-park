#!/usr/bin/env node
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const extractor = resolve(repositoryRoot, "scripts/extract-yuzhou-t2-contracts.sh");
const source = readFileSync(extractor, "utf8");

assert.match(source, /sqlcmd -b -V 16/);
assert.match(source, /CONVERT\(varbinary\(max\),CONVERT\(nvarchar\(max\),compacttext\)\)/);
assert.doesNotMatch(source, /CONVERT\(varbinary\(max\),compacttext\)/);

const sandbox = mkdtempSync(resolve(tmpdir(), "jinhu-yuzhou-t2-extract-"));
const binDirectory = resolve(sandbox, "bin");
const stagingRoot = resolve(sandbox, "staging");
const credentialFile = resolve(sandbox, "etl.env");
mkdirSync(binDirectory, { recursive: true, mode: 0o700 });
mkdirSync(stagingRoot, { recursive: true, mode: 0o700 });
writeFileSync(
  credentialFile,
  "YUZHOU_SQLSERVER_ETL_LOGIN=fixture_reader\nYUZHOU_SQLSERVER_ETL_PASSWORD=fixture_secret\nYUZHOU_SQLSERVER_DATABASE=fixture_database\n",
  { mode: 0o600 },
);

const fakeDocker = resolve(binDirectory, "docker");
writeFileSync(fakeDocker, `#!/usr/bin/env sh
set -eu
if [ "$1" = inspect ]; then
  printf '%s\\n' jinhu_yuzhou_migration_lab
  exit 0
fi
case "$*" in
  *is_read_only*) printf '%s\\n' 1 ;;
  *compacttypecode*) printf '%s\\n' '[]' ;;
  *'GROUP BY state'*) printf '%s\\n' '[]' ;;
  *'FROM dbo.compact ORDER BY'*)
    if [ "\${T2_FIXTURE_SQL_FAILURE:-no}" = yes ]; then
      printf '%s\\n' 'SENSITIVE_SQL_OUTPUT_MUST_NOT_ESCAPE'
      printf '%s\\n' 'sql failure detail' >&2
      exit 1
    fi
    printf '%s\\n' '[]'
    ;;
  *'FROM dbo.compact_c'*) printf '%s\\n' '[]' ;;
  *) exit 2 ;;
esac
`, { mode: 0o700 });
chmodSync(fakeDocker, 0o700);

const commonEnvironment = {
  ...process.env,
  PATH: `${binDirectory}${delimiter}${process.env.PATH ?? ""}`,
  ALLOW_YUZHOU_MIGRATION: "yes",
  YUZHOU_SQLSERVER_DATABASE: "fixture_database",
  YUZHOU_SQLSERVER_CONTAINER: "fixture_container",
  YUZHOU_ETL_CREDENTIAL_FILE: credentialFile,
  YUZHOU_STAGING_ROOT: stagingRoot,
};
const run = (runId, extraEnvironment = {}) => spawnSync("sh", [extractor], {
  cwd: repositoryRoot,
  encoding: "utf8",
  env: { ...commonEnvironment, YUZHOU_MIGRATION_RUN_ID: runId, ...extraEnvironment },
});

try {
  const successful = run("fixture-t2-success");
  assert.equal(successful.status, 0, successful.stderr);
  assert.match(successful.stdout, /YUZHOU_T2_EXTRACT_OK/);
  const successDirectory = resolve(stagingRoot, "staging-fixture-t2-success");
  assert.equal(statSync(successDirectory).mode & 0o777, 0o700);
  for (const name of ["contract-types.raw.json", "contract-states.raw.json", "contracts.raw.json", "contract-changes.raw.json", "contract-types.jsonl", "contracts.jsonl", "contract-changes.jsonl", "manifest.json"]) {
    assert.equal(statSync(resolve(successDirectory, name)).mode & 0o777, 0o600, name);
  }

  const failed = run("fixture-t2-failure", { T2_FIXTURE_SQL_FAILURE: "yes" });
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /ERROR: SQL query failed for contracts\.raw\.json/);
  assert.doesNotMatch(`${failed.stdout}\n${failed.stderr}`, /SENSITIVE_SQL_OUTPUT_MUST_NOT_ESCAPE|sql failure detail/);
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}

process.stdout.write("Yuzhou T2 direct extract contract passed.\n");
