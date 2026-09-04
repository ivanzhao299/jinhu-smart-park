#!/usr/bin/env node
/* global Buffer, process */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateSourceRestoreReceipt } from "./source-restore-receipt.mjs";
import {
  assertLegacyClientPermissionReadonlyAuthority,
  buildLegacyClientPermissionSourceReceipt,
  LEGACY_CLIENT_PERMISSION_PRIVATE_CAPABILITY_SQL,
  LEGACY_CLIENT_PERMISSION_SAFE_AGGREGATE_SQL,
} from "./legacy-client-permission-source-receipt.mjs";

const DATABASE = /^YuzhouHR_Lab_[A-Za-z0-9_]{6,40}$/u;
const CONTAINER = /^[A-Za-z0-9][A-Za-z0-9_.-]{1,127}$/u;
const LOGIN = /^[A-Za-z0-9][A-Za-z0-9_.-]{1,127}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const ENV_KEYS = ["YUZHOU_SQLSERVER_DATABASE", "YUZHOU_SQLSERVER_ETL_LOGIN", "YUZHOU_SQLSERVER_ETL_PASSWORD"];
const SAFE_FACT_KEYS = [
  "rightsRows", "templateRows", "usersRows", "rightsDistinctUnitcodes", "templateDistinctUnitcodes",
  "sharedUnitcodes", "capabilityUnionUnitcodes", "rightsOrphanUnitcodes", "templateUnusedUnitcodes",
  "duplicateGrantPrimaryKeys", "structuralConflictUnitcodes", "blankTemplateSemantics",
  "grantEdgeSetSha256", "capabilitySetSha256",
];
const contract = JSON.parse(readFileSync(new URL("./contracts/legacy-client-permission-source-receipt-v1.json", import.meta.url), "utf8"));

export class LegacyClientPermissionSourceReceiptCliError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyClientPermissionSourceReceiptCliError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new LegacyClientPermissionSourceReceiptCliError(code, detail); };
const digest = value => createHash("sha256").update(value).digest("hex");
const canonical = value => `${JSON.stringify(value, null, 2)}\n`;
const mode = path => statSync(path).mode & 0o777;

function privateInput(path, label) {
  if (typeof path !== "string" || !isAbsolute(path) || resolve(path) !== path) fail("PERMISSION_SOURCE_FILE_UNSAFE", label);
  let link;
  let actual;
  let info;
  try {
    link = lstatSync(path);
    actual = realpathSync(path);
    info = statSync(actual);
  } catch {
    fail("PERMISSION_SOURCE_FILE_UNSAFE", `${label}:missing`);
  }
  if (link.isSymbolicLink() || !info.isFile() || info.nlink !== 1 || mode(actual) !== 0o600) fail("PERMISSION_SOURCE_FILE_UNSAFE", label);
  return actual;
}

function parseEnv(path) {
  const parsed = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) fail("PERMISSION_SOURCE_ENV_INVALID", "invalid line");
    const key = line.slice(0, separator);
    if (!ENV_KEYS.includes(key) || Object.hasOwn(parsed, key)) fail("PERMISSION_SOURCE_ENV_INVALID", "unexpected or duplicate key");
    parsed[key] = line.slice(separator + 1);
  }
  if (Object.keys(parsed).sort().join("|") !== [...ENV_KEYS].sort().join("|")
    || !DATABASE.test(parsed.YUZHOU_SQLSERVER_DATABASE ?? "")
    || !LOGIN.test(parsed.YUZHOU_SQLSERVER_ETL_LOGIN ?? "")
    || parsed.YUZHOU_SQLSERVER_ETL_LOGIN.toLowerCase() === "sa"
    || typeof parsed.YUZHOU_SQLSERVER_ETL_PASSWORD !== "string"
    || parsed.YUZHOU_SQLSERVER_ETL_PASSWORD.length < 1
    || /[\r\n\0]/u.test(parsed.YUZHOU_SQLSERVER_ETL_PASSWORD)) fail("PERMISSION_SOURCE_ENV_INVALID", "required least-privilege binding unavailable");
  return parsed;
}

function runDockerQuery({ sourceContainer, database, login, password, sql }) {
  const result = spawnSync("docker", [
    "exec", "-i", sourceContainer, "bash", "-lc",
    "IFS= read -r SQLCMDUSER; IFS= read -r SQLCMDPASSWORD; export SQLCMDUSER SQLCMDPASSWORD; exec /opt/mssql-tools18/bin/sqlcmd -b -V 16 -C -S localhost -d \"$1\" -h -1 -W -w 65535 -s \"|\" -Q \"$2\"",
    "q", database, sql,
  ], {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    input: `${login}\n${password}\n`,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error?.code === "ENOENT") fail("PERMISSION_SOURCE_DOCKER_UNAVAILABLE", "docker command unavailable");
  if (result.error || result.status !== 0) fail("PERMISSION_SOURCE_QUERY_FAILED", "read-only SQL query failed");
  return String(result.stdout ?? "").replaceAll("\r", "").trim();
}

function parseCount(value, label) {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value ?? "")) fail("PERMISSION_SOURCE_QUERY_SHAPE_INVALID", label);
  const result = Number(value);
  if (!Number.isSafeInteger(result)) fail("PERMISSION_SOURCE_QUERY_SHAPE_INVALID", label);
  return result;
}

function parseAggregate(output) {
  const lines = output.split("\n").map(line => line.trim()).filter(Boolean);
  if (lines.length !== 1) fail("PERMISSION_SOURCE_QUERY_SHAPE_INVALID", "aggregate rows");
  const values = lines[0].split("|").map(value => value.trim());
  if (values.length !== SAFE_FACT_KEYS.length + 8) fail("PERMISSION_SOURCE_QUERY_SHAPE_INVALID", "aggregate columns");
  const safeFacts = {};
  for (let index = 0; index < 12; index += 1) safeFacts[SAFE_FACT_KEYS[index]] = parseCount(values[index], SAFE_FACT_KEYS[index]);
  for (let index = 12; index < 14; index += 1) {
    if (!SHA256.test(values[index] ?? "")) fail("PERMISSION_SOURCE_QUERY_SHAPE_INVALID", SAFE_FACT_KEYS[index]);
    safeFacts[SAFE_FACT_KEYS[index]] = values[index];
  }
  const flags = values.slice(14);
  if (flags.some(value => !/^[01]$/u.test(value))) fail("PERMISSION_SOURCE_QUERY_SHAPE_INVALID", "authority flags");
  const authority = {
    databaseReadOnly: flags[0] === "1",
    sysadmin: flags[1] === "1",
    dbDatareader: flags[2] === "1",
    viewDefinition: flags[3] === "1",
    insert: flags[4] === "1",
    update: flags[5] === "1",
    delete: flags[6] === "1",
    execute: flags[7] === "1",
  };
  assertLegacyClientPermissionReadonlyAuthority(authority);
  return safeFacts;
}

function decodeHex(value, label) {
  if (value === "NULL") return null;
  if (!/^(?:[0-9A-F]{4})*$/u.test(value ?? "")) fail("PERMISSION_SOURCE_QUERY_SHAPE_INVALID", label);
  const decoded = Buffer.from(value, "hex").toString("utf16le");
  if (decoded.length > 1000 || /\0/u.test(decoded)) fail("PERMISSION_SOURCE_QUERY_SHAPE_INVALID", label);
  return decoded;
}

function scalar(value, label) {
  if (value === "NULL") return null;
  if (/^-?(?:0|[1-9][0-9]*)$/u.test(value ?? "")) {
    const number = Number(value);
    if (Number.isSafeInteger(number)) return number;
  }
  if (typeof value !== "string" || value.length > 120 || /[\r\n\0|]/u.test(value)) fail("PERMISSION_SOURCE_QUERY_SHAPE_INVALID", label);
  return value;
}

function parseCapabilities(output, expectedCount, expectedSetSha256) {
  const lines = output.split("\n").map(line => line.trim()).filter(Boolean);
  if (lines.length !== expectedCount) fail("PERMISSION_SOURCE_CAPABILITY_COUNT_MISMATCH", `${lines.length}/${expectedCount}`);
  const items = lines.map((line, index) => {
    const values = line.split("|").map(value => value.trim());
    if (values.length !== 6) fail("PERMISSION_SOURCE_QUERY_SHAPE_INVALID", `capability:${index}:columns`);
    const unitcode = parseCount(values[0], `capability:${index}:unitcode`);
    return {
      unitcode,
      programgroup: decodeHex(values[1], `capability:${index}:programgroup`),
      programunit: decodeHex(values[2], `capability:${index}:programunit`),
      grade: scalar(values[3], `capability:${index}:grade`),
      authorise: scalar(values[4], `capability:${index}:authorise`),
      rightstates: scalar(values[5], `capability:${index}:rightstates`),
    };
  });
  if (new Set(items.map(item => item.unitcode)).size !== items.length) fail("PERMISSION_SOURCE_CAPABILITY_DUPLICATE", "unitcode");
  items.sort((left, right) => left.unitcode - right.unitcode);
  const actualSetSha256 = digest(items.map(item => `${item.unitcode};`).join(""));
  if (actualSetSha256 !== expectedSetSha256) fail("PERMISSION_SOURCE_CAPABILITY_HASH_MISMATCH", actualSetSha256);
  return items;
}

function prepareOutputDirectory(path) {
  if (typeof path !== "string" || !isAbsolute(path) || resolve(path) !== path || existsSync(path)) fail("PERMISSION_SOURCE_OUTPUT_UNSAFE", "new absolute output directory required");
  const parent = dirname(path);
  let parentInfo;
  try { parentInfo = statSync(realpathSync(parent)); } catch { fail("PERMISSION_SOURCE_OUTPUT_UNSAFE", "parent unavailable"); }
  if (!parentInfo.isDirectory()) fail("PERMISSION_SOURCE_OUTPUT_UNSAFE", "parent is not a directory");
  try { mkdirSync(path, { mode: 0o700 }); } catch { fail("PERMISSION_SOURCE_OUTPUT_UNSAFE", "directory creation failed"); }
  chmodSync(path, 0o700);
  return path;
}

function writePrivateJson(path, value) {
  try {
    writeFileSync(path, canonical(value), { flag: "wx", mode: 0o600 });
    chmodSync(path, 0o600);
  } catch {
    fail("PERMISSION_SOURCE_OUTPUT_WRITE_FAILED", "private artifact write failed");
  }
}

export function captureLegacyClientPermissionSourceReceipt(input, { queryRunner = runDockerQuery } = {}) {
  if (!input || Object.keys(input).sort().join("|") !== ["etlEnvPath", "outputDirectory", "sourceContainer", "sourceRestoreReceiptPath"].sort().join("|")) fail("PERMISSION_SOURCE_ARGUMENT_INVALID", "input shape");
  if (!CONTAINER.test(input.sourceContainer ?? "")) fail("PERMISSION_SOURCE_ARGUMENT_INVALID", "source container");
  const envPath = privateInput(input.etlEnvPath, "etl env");
  const sourceReceiptPath = privateInput(input.sourceRestoreReceiptPath, "source restore receipt");
  const env = parseEnv(envPath);
  const sourceReceiptBytes = readFileSync(sourceReceiptPath);
  let sourceRestoreReceipt;
  try { sourceRestoreReceipt = validateSourceRestoreReceipt(JSON.parse(sourceReceiptBytes)); }
  catch { fail("PERMISSION_SOURCE_RESTORE_RECEIPT_INVALID", "source restore receipt validation failed"); }
  if (digest(env.YUZHOU_SQLSERVER_DATABASE) !== sourceRestoreReceipt.identities.databaseSha256) fail("PERMISSION_SOURCE_DATABASE_BINDING_MISMATCH", "ETL database differs from source restore receipt");

  const query = sql => {
    try {
      return queryRunner({
        sourceContainer: input.sourceContainer,
        database: env.YUZHOU_SQLSERVER_DATABASE,
        login: env.YUZHOU_SQLSERVER_ETL_LOGIN,
        password: env.YUZHOU_SQLSERVER_ETL_PASSWORD,
        sql,
      });
    } catch (error) {
      if (error instanceof LegacyClientPermissionSourceReceiptCliError) throw error;
      fail("PERMISSION_SOURCE_QUERY_FAILED", "read-only SQL query failed");
    }
  };

  const aggregate = parseAggregate(query(LEGACY_CLIENT_PERMISSION_SAFE_AGGREGATE_SQL));
  const permissionReceipt = buildLegacyClientPermissionSourceReceipt({
    contract,
    aggregate,
    sourceRestoreReceiptSha256: digest(sourceReceiptBytes),
    databaseIdentitySha256: sourceRestoreReceipt.identities.databaseSha256,
    queryIdentitySha256: digest(`${LEGACY_CLIENT_PERMISSION_SAFE_AGGREGATE_SQL}\n${LEGACY_CLIENT_PERMISSION_PRIVATE_CAPABILITY_SQL}\n`),
  });
  const capabilities = parseCapabilities(query(LEGACY_CLIENT_PERMISSION_PRIVATE_CAPABILITY_SQL), aggregate.capabilityUnionUnitcodes, aggregate.capabilitySetSha256);
  const capabilityBody = {
    formatVersion: 1,
    artifactKind: "yuzhou_hr_legacy_client_private_permission_capabilities",
    sourcePermissionReceiptSha256: permissionReceipt.receiptSha256,
    capabilitySetSha256: aggregate.capabilitySetSha256,
    count: capabilities.length,
    fields: [...contract.privateCapabilityExportFields],
    items: capabilities,
    containsUserBoundRows: false,
    productionImport: "HOLD",
  };
  const capabilityArtifact = { ...capabilityBody, artifactSha256: digest(canonical(capabilityBody)) };
  const outputDirectory = prepareOutputDirectory(input.outputDirectory);
  const receiptPath = resolve(outputDirectory, "permission-source-receipt.json");
  const capabilityPath = resolve(outputDirectory, "private-permission-capabilities.json");
  writePrivateJson(receiptPath, permissionReceipt);
  writePrivateJson(capabilityPath, capabilityArtifact);
  return {
    status: "PERMISSION_SOURCE_RECEIPT_CAPTURED",
    authorizationGrantEdges: aggregate.rightsRows,
    capabilityCount: capabilities.length,
    permissionReceiptSha256: permissionReceipt.receiptSha256,
    capabilitySetSha256: aggregate.capabilitySetSha256,
    capabilityArtifactSha256: capabilityArtifact.artifactSha256,
    productionImport: "HOLD",
  };
}

function parseArgs(argv) {
  const allowed = new Set(["--etl-env", "--source-receipt", "--source-container", "--output-dir"]);
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!allowed.has(key) || Object.hasOwn(result, key) || index + 1 >= argv.length) fail("PERMISSION_SOURCE_ARGUMENT_INVALID", key ?? "missing");
    result[key] = argv[++index];
  }
  for (const key of allowed) if (!result[key]) fail("PERMISSION_SOURCE_ARGUMENT_INVALID", key);
  return {
    etlEnvPath: result["--etl-env"],
    sourceRestoreReceiptPath: result["--source-receipt"],
    sourceContainer: result["--source-container"],
    outputDirectory: result["--output-dir"],
  };
}

async function main() {
  const result = captureLegacyClientPermissionSourceReceipt(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    const code = error instanceof LegacyClientPermissionSourceReceiptCliError ? error.code : "PERMISSION_SOURCE_CAPTURE_FAILED";
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
}
