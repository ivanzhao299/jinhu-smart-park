import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
const allowedTargets = new Set(["local", "disposable", "test", "ci"]);
const target = process.env.PROPERTY_APPROVAL_RUNTIME_TARGET ?? "";
const allowWrite = process.env.ALLOW_PROPERTY_APPROVAL_RUNTIME_ENABLE === "yes";
const composeFile = process.env.PROPERTY_APPROVAL_RUNTIME_COMPOSE_FILE ?? "";
const composeProject = process.env.PROPERTY_APPROVAL_RUNTIME_COMPOSE_PROJECT ?? "";
const runId = process.env.PROPERTY_APPROVAL_RUNTIME_RUN_ID ?? "";
const postgresService = process.env.PROPERTY_APPROVAL_RUNTIME_POSTGRES_SERVICE ?? "";
const postgresUser = process.env.POSTGRES_USER ?? "";
const postgresDb = process.env.POSTGRES_DB ?? "";
const tenantId = process.env.PROPERTY_APPROVAL_RUNTIME_TENANT_ID ?? "";
const parkId = process.env.PROPERTY_APPROVAL_RUNTIME_PARK_ID ?? "";
const actorId = process.env.PROPERTY_APPROVAL_RUNTIME_ACTOR_ID ?? "";
const actorName = process.env.PROPERTY_APPROVAL_RUNTIME_ACTOR_NAME ?? "";
const approvalReference = process.env.PROPERTY_APPROVAL_RUNTIME_APPROVAL_REFERENCE ?? "";
const expectedVersion = process.env.PROPERTY_APPROVAL_RUNTIME_EXPECTED_VERSION ?? "";
const requestId = process.env.PROPERTY_APPROVAL_RUNTIME_REQUEST_ID ?? `uat-approval-runtime-${randomUUID()}`;
const auditId = randomUUID();
const contractHash = "e27d523469491916efbda41b0570e146362a0d6037a54454330650dc8b397944";

function fail(message) {
  throw new Error(message);
}

function productionLike(value) {
  return /(^|[._:/-])(prod|production)([._:/-]|$)/i.test(String(value));
}

function requireValue(name, value, pattern = /^[A-Za-z0-9_.:@/-]+$/) {
  if (!value || !pattern.test(value)) fail(`${name} is required and contains only supported characters`);
}

function validate() {
  for (const [name, value] of Object.entries({
    NODE_ENV: process.env.NODE_ENV,
    APP_ENV: process.env.APP_ENV,
    APP_RUNTIME: process.env.APP_RUNTIME,
    PROPERTY_APPROVAL_RUNTIME_TARGET: target,
    PROPERTY_APPROVAL_RUNTIME_COMPOSE_FILE: composeFile,
    PROPERTY_APPROVAL_RUNTIME_COMPOSE_PROJECT: composeProject,
    POSTGRES_DB: postgresDb
  })) {
    if (value && productionLike(value)) fail(`${name} is production-like; approval runtime enable is forbidden`);
  }
  if (!allowedTargets.has(target)) fail(`PROPERTY_APPROVAL_RUNTIME_TARGET must be one of ${[...allowedTargets].join(", ")}`);
  if (!allowWrite) fail("ALLOW_PROPERTY_APPROVAL_RUNTIME_ENABLE=yes is required");
  if (!existsSync(composeFile)) fail(`Compose file does not exist: ${composeFile}`);
  requireValue("PROPERTY_APPROVAL_RUNTIME_COMPOSE_PROJECT", composeProject, /^[A-Za-z0-9_.-]+$/);
  requireValue("PROPERTY_APPROVAL_RUNTIME_RUN_ID", runId, /^\d{8}-\d{6}$/);
  const expectedProject = `jinhu-housing-uat-${runId}`;
  const expectedCompose = `/tmp/${expectedProject}/compose.yml`;
  const expectedDb = `jinhu_housing_uat_${runId.replaceAll("-", "_")}`;
  if (composeProject !== expectedProject || composeFile !== expectedCompose || postgresDb !== expectedDb) {
    fail("compose project, file, and database must match the disposable housing UAT run id");
  }
  requireValue("PROPERTY_APPROVAL_RUNTIME_POSTGRES_SERVICE", postgresService, /^[A-Za-z0-9_.-]+$/);
  requireValue("POSTGRES_USER", postgresUser, /^[A-Za-z0-9_.-]+$/);
  requireValue("POSTGRES_DB", postgresDb, /^[A-Za-z0-9_.-]+$/);
  requireValue("PROPERTY_APPROVAL_RUNTIME_TENANT_ID", tenantId, /^[A-Za-z0-9_.:-]+$/);
  requireValue("PROPERTY_APPROVAL_RUNTIME_PARK_ID", parkId, /^[A-Za-z0-9_.:-]+$/);
  requireValue("PROPERTY_APPROVAL_RUNTIME_ACTOR_ID", actorId, /^[0-9a-f-]{36}$/i);
  requireValue("PROPERTY_APPROVAL_RUNTIME_ACTOR_NAME", actorName, /^[A-Za-z0-9_.@:-]+$/);
  requireValue("PROPERTY_APPROVAL_RUNTIME_APPROVAL_REFERENCE", approvalReference, /^[A-Za-z0-9_.:@/-]+$/);
  requireValue("PROPERTY_APPROVAL_RUNTIME_REQUEST_ID", requestId, /^[A-Za-z0-9_.:@/-]+$/);
  if (!/^\d+$/.test(expectedVersion)) fail("PROPERTY_APPROVAL_RUNTIME_EXPECTED_VERSION must be an integer");
}

function runDocker(args, stdin = "") {
  const executable = process.env.PROPERTY_APPROVAL_RUNTIME_DOCKER_BIN ?? "docker";
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(executable, args, { stdio: [stdin ? "pipe" : "ignore", "pipe", "pipe"] });
    let stdoutBuffer = "";
    let stderrBuffer = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdoutBuffer += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderrBuffer += chunk; });
    child.on("error", rejectPromise);
    child.on("close", (code) => code === 0
      ? resolvePromise({ stdout: stdoutBuffer, stderr: stderrBuffer })
      : rejectPromise(new Error(`docker command failed (${code}): ${stderrBuffer.trim()}`)));
    if (stdin) child.stdin.end(stdin);
  });
}

async function validateDisposableContainer() {
  const composeArgs = ["compose", "-f", composeFile, "-p", composeProject];
  const { stdout: psOutput } = await runDocker([...composeArgs, "ps", "-q", postgresService]);
  const containerIds = psOutput.trim().split(/\s+/).filter(Boolean);
  if (containerIds.length !== 1 || !/^[a-f0-9]{12,64}$/i.test(containerIds[0])) {
    fail("the disposable compose scope must resolve exactly one PostgreSQL container");
  }
  const { stdout: inspectOutput } = await runDocker([
    "inspect", "--format", "{{json .Config}}", containerIds[0]
  ]);
  let config;
  try {
    config = JSON.parse(inspectOutput.trim());
  } catch {
    fail("could not inspect the selected PostgreSQL container identity");
  }
  const labels = config?.Labels ?? {};
  const env = Array.isArray(config?.Env) ? config.Env : [];
  const configuredDb = env.find((entry) => entry.startsWith("POSTGRES_DB="))?.slice("POSTGRES_DB=".length);
  const configFiles = String(labels["com.docker.compose.project.config_files"] ?? "")
    .split(",").filter(Boolean).map((file) => realpathSync(file));
  if (labels["com.docker.compose.project"] !== composeProject
      || labels["com.docker.compose.service"] !== postgresService
      || configFiles.length !== 1 || configFiles[0] !== realpathSync(composeFile)
      || configuredDb !== postgresDb) {
    fail("selected container is not bound to the disposable housing UAT compose and database");
  }
}

const sql = String.raw`
\set QUIET 1
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
  CREATE TEMP TABLE uat_approval_runtime_input ON COMMIT DROP AS
SELECT :'tenant_id'::varchar AS tenant_id, :'park_id'::varchar AS park_id,
       :'actor_id'::uuid AS actor_id, :'actor_name'::varchar AS actor_name,
       :'approval_reference'::varchar AS approval_reference,
       :'request_id'::varchar AS request_id, :'audit_id'::uuid AS audit_id,
       :'expected_version'::integer AS expected_version,
       :'contract_hash'::varchar AS contract_hash;
DO $uat$
DECLARE
  control_row public.sys_property_runtime_control%ROWTYPE;
  after_row public.sys_property_runtime_control%ROWTYPE;
  input_row uat_approval_runtime_input%ROWTYPE;
  actor_row public.sys_user%ROWTYPE;
BEGIN
  SELECT * INTO STRICT input_row FROM uat_approval_runtime_input;
  SELECT * INTO STRICT actor_row FROM public.sys_user
   WHERE id=input_row.actor_id AND tenant_id=input_row.tenant_id
     AND park_id=input_row.park_id AND username=input_row.actor_name
     AND is_enabled=true AND is_deleted=false;
  SELECT * INTO STRICT control_row
    FROM public.sys_property_runtime_control
   WHERE tenant_id = input_row.tenant_id AND park_id = input_row.park_id
     AND control_key = 'approval.enforce'
   FOR UPDATE;
  IF control_row.control_kind <> 'enforce' OR control_row.target <> 'approval'
     OR control_row.adapter_version IS NOT NULL
     OR control_row.enabled OR control_row.control_mode <> 'disabled'
     OR control_row.contract_hash <> input_row.contract_hash
     OR control_row.version <> input_row.expected_version THEN
    RAISE EXCEPTION 'approval runtime control is not the expected signed disabled version';
  END IF;
  UPDATE public.sys_property_runtime_control
     SET enabled = true, control_mode = 'enforce', enabled_by = input_row.actor_id,
         enabled_at = clock_timestamp(), approval_reference = input_row.approval_reference,
         disabled_reason = '',
         update_time = clock_timestamp(), version = version + 1
   WHERE id = control_row.id AND version = input_row.expected_version
   RETURNING * INTO STRICT after_row;
  INSERT INTO public.sys_op_log (
    id, tenant_id, park_id, user_id, username, module, resource, action,
    biz_type, biz_id, before_json, after_json, method, path, success,
    op_time, result, request_id, create_by, update_by, remark
  ) VALUES (
    input_row.audit_id, input_row.tenant_id, input_row.park_id, actor_row.id, actor_row.username,
    'property-approval', 'property.runtime-control', 'uat-enable',
    'property_runtime_control', control_row.id, to_jsonb(control_row), to_jsonb(after_row),
    'UAT', '/scripts/enable-property-approval-runtime', true, clock_timestamp(),
    'success', input_row.request_id, input_row.actor_id, input_row.actor_id,
    left('Non-production UAT enable; approval_reference=' || input_row.approval_reference, 500)
  );
END
$uat$;
COMMIT;
\set QUIET 0
SELECT control_key, enabled, control_mode, version, approval_reference
  FROM public.sys_property_runtime_control
 WHERE tenant_id = :'tenant_id' AND park_id = :'park_id' AND control_key = 'approval.enforce';
SELECT request_id, action, success, op_time
  FROM public.sys_op_log
 WHERE id = :'audit_id'::uuid AND tenant_id = :'tenant_id' AND park_id = :'park_id' AND is_deleted = false;
`;

validate();
await validateDisposableContainer();
const args = [
  "compose", "-f", composeFile, "-p", composeProject, "exec", "-T", postgresService,
  "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", postgresUser, "-d", postgresDb,
  "-v", `tenant_id=${tenantId}`, "-v", `park_id=${parkId}`, "-v", `actor_id=${actorId}`,
  "-v", `actor_name=${actorName}`, "-v", `approval_reference=${approvalReference}`,
  "-v", `request_id=${requestId}`, "-v", `expected_version=${expectedVersion}`,
  "-v", `audit_id=${auditId}`,
  "-v", `contract_hash=${contractHash}`
];
const { stdout, stderr } = await runDocker(args, sql);
if (stderr.trim()) process.stderr.write(stderr);
process.stdout.write(`[AUDIT] target=${target} compose_project=${composeProject} tenant=${tenantId} park=${parkId} actor=${actorName} approval_reference=${approvalReference} request_id=${requestId}\n`);
process.stdout.write(stdout);
