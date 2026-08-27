#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, resolve } from "node:path";

const fail = (code, detail) => { throw new Error(`${code}: ${detail}`); };
const command = (binary, args, options = {}) => {
  const result = spawnSync(binary, args, { encoding: "utf8", stdio: [options.input ? "pipe" : "ignore", "pipe", "pipe"], input: options.input });
  if (result.status !== 0) fail("DUAL_SOURCE_REHEARSAL_COMMAND_FAILED", `${binary}:${args[0]}:${(result.stderr || result.stdout).trim().split("\n").at(-1)}`);
  return result.stdout.trim();
};
const safeInput = path => {
  if (!isAbsolute(path)) fail("DUAL_SOURCE_REHEARSAL_PATH_INVALID", "artifact must be absolute");
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) fail("DUAL_SOURCE_REHEARSAL_PATH_INVALID", "artifact must be plain mode-0600");
  return resolve(path);
};
const safeOutput = path => {
  if (!isAbsolute(path)) fail("DUAL_SOURCE_REHEARSAL_PATH_INVALID", "report must be absolute");
  const output = resolve(path); mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
  if ((statSync(dirname(output)).mode & 0o077) !== 0) fail("DUAL_SOURCE_REHEARSAL_PATH_INVALID", "report parent must be mode-0700");
  return output;
};
const sqlLiteral = value => `'${String(value).replaceAll("'", "''")}'`;

let container = "";
let reportPath = "";
let dockerEnvFile = "";
try {
  if (process.env.ALLOW_YUZHOU_MIGRATION !== "yes") fail("DUAL_SOURCE_REHEARSAL_NOT_ALLOWED", "set migration gate");
  const runId = process.env.YUZHOU_MIGRATION_RUN_ID ?? "";
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{5,40}$/.test(runId)) fail("DUAL_SOURCE_REHEARSAL_RUN_INVALID", "run id");
  const artifactPath = safeInput(process.env.YUZHOU_RECONCILIATION_ARTIFACT ?? "");
  reportPath = safeOutput(process.env.YUZHOU_RECONCILIATION_REHEARSAL_REPORT ?? "");
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  if (artifact.formatVersion !== 1 || artifact.artifactKind !== "yuzhou_hr_dual_source_employee_reconciliation" || artifact.operationMode !== "read_only_hmac" || artifact.nameOnlyMatch !== "forbidden" || artifact.productionImport !== "HOLD" || artifact.summary?.activePendingManualReview !== 115 || !Array.isArray(artifact.pendingManualReview) || artifact.pendingManualReview.length !== 115) fail("DUAL_SOURCE_REHEARSAL_ARTIFACT_INVALID", "identity or accounting");
  const hashes = new Set();
  for (const row of artifact.pendingManualReview) {
    if (row.sourceId !== "yuzhou_group_web_enterprise_hr" || !/^[a-f0-9]{64}$/.test(row.sourceRowHmac) || hashes.has(row.sourceRowHmac) || typeof row.employeeCodePresent !== "boolean" || typeof row.identityPresent !== "boolean" || row.reasonCode !== "NO_CLIENT_IDENTITY_OR_CODE_MATCH" || row.status !== "pending_manual_review") fail("DUAL_SOURCE_REHEARSAL_ARTIFACT_INVALID", "queue row");
    hashes.add(row.sourceRowHmac);
  }
  container = `jinhu_yz_dual_recon_${runId.toLowerCase().replace(/[^a-z0-9_.-]/g, "_")}`;
  if (spawnSync("docker", ["inspect", container], { stdio: "ignore" }).status === 0) fail("DUAL_SOURCE_REHEARSAL_RESOURCE_EXISTS", container);
  const password = randomBytes(24).toString("base64url");
  dockerEnvFile = resolve(dirname(reportPath), `.${runId}.docker.env`);
  {
    const fd = openSync(dockerEnvFile, "wx", 0o600);
    try { writeFileSync(fd, `POSTGRES_PASSWORD=${password}\nPOSTGRES_DB=jinhu_hr_reconciliation_lab\n`); chmodSync(dockerEnvFile, 0o600); }
    catch (error) { try { unlinkSync(dockerEnvFile); } catch {} throw error; }
  }
  command("docker", ["run", "-d", "--name", container, "--label", "cnjinhu.yuzhou.scope=dual-source-reconciliation", "--env-file", dockerEnvFile, "postgres:16"]);
  unlinkSync(dockerEnvFile);
  dockerEnvFile = "";
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (spawnSync("docker", ["exec", container, "pg_isready", "-U", "postgres", "-d", "jinhu_hr_reconciliation_lab"], { stdio: "ignore" }).status === 0) { ready = true; break; }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }
  if (!ready) fail("DUAL_SOURCE_REHEARSAL_NOT_READY", container);
  const psql = sql => command("docker", ["exec", "-i", container, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "jinhu_hr_reconciliation_lab"], { input: sql });
  psql("CREATE TABLE reconciliation_queue(batch_code text NOT NULL,source_id text NOT NULL CHECK(source_id='yuzhou_group_web_enterprise_hr'),source_row_hmac char(64) NOT NULL CHECK(source_row_hmac~'^[a-f0-9]{64}$'),employee_code_present boolean NOT NULL,identity_present boolean NOT NULL,reason_code text NOT NULL CHECK(reason_code='NO_CLIENT_IDENTITY_OR_CODE_MATCH'),status text NOT NULL CHECK(status='pending_manual_review'),PRIMARY KEY(batch_code,source_row_hmac));");
  const values = artifact.pendingManualReview.map(row => `(${sqlLiteral(runId)},${sqlLiteral(row.sourceId)},${sqlLiteral(row.sourceRowHmac)},${row.employeeCodePresent},${row.identityPresent},${sqlLiteral(row.reasonCode)},${sqlLiteral(row.status)})`).join(",");
  const insert = `BEGIN; INSERT INTO reconciliation_queue(batch_code,source_id,source_row_hmac,employee_code_present,identity_present,reason_code,status) VALUES ${values}; COMMIT;`;
  psql(insert);
  const loaded = Number(psql(`SELECT count(*) FROM reconciliation_queue WHERE batch_code=${sqlLiteral(runId)};`));
  if (loaded !== 115) fail("DUAL_SOURCE_REHEARSAL_LOAD_DRIFT", String(loaded));
  psql(`BEGIN; DELETE FROM reconciliation_queue WHERE batch_code=${sqlLiteral(runId)}; COMMIT;`);
  const rollbackResidual = Number(psql(`SELECT count(*) FROM reconciliation_queue WHERE batch_code=${sqlLiteral(runId)};`));
  if (rollbackResidual !== 0) fail("DUAL_SOURCE_REHEARSAL_ROLLBACK_RESIDUAL", String(rollbackResidual));
  psql(insert);
  const reloaded = Number(psql(`SELECT count(*) FROM reconciliation_queue WHERE batch_code=${sqlLiteral(runId)};`));
  if (reloaded !== 115) fail("DUAL_SOURCE_REHEARSAL_RELOAD_DRIFT", String(reloaded));
  command("docker", ["rm", "-f", container]);
  const containerResidual = spawnSync("docker", ["inspect", container], { stdio: "ignore" }).status === 0 ? 1 : 0;
  if (containerResidual !== 0) fail("DUAL_SOURCE_REHEARSAL_CONTAINER_RESIDUAL", container);
  const report = { formatVersion: 1, reportKind: "yuzhou_hr_dual_source_reconciliation_rehearsal", loaded, rollbackResidual, reloaded, containerResidual, personalValuesStored: false, productionImport: "HOLD" };
  const temp = resolve(dirname(reportPath), `.${basename(reportPath)}.${process.pid}.tmp`);
  try { const fd = openSync(temp, "wx", 0o600); writeFileSync(fd, `${JSON.stringify(report, null, 2)}\n`); chmodSync(temp, 0o600); renameSync(temp, reportPath); }
  catch (error) { try { unlinkSync(temp); } catch {} throw error; }
  process.stdout.write(`${JSON.stringify({ ok: true, ...report })}\n`);
} catch (error) {
  if (container && spawnSync("docker", ["inspect", container], { stdio: "ignore" }).status === 0) spawnSync("docker", ["rm", "-f", container], { stdio: "ignore" });
  if (dockerEnvFile) { try { unlinkSync(dockerEnvFile); } catch {} }
  process.stderr.write(`${String(error.message).replace(/(password|secret|token)\s*[=:]\s*\S+/gi, "$1=[REDACTED]")}\n`);
  process.exitCode = 1;
}
