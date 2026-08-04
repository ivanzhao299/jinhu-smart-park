import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const digest = (value) => createHash("sha256").update(value).digest("hex");
const fileDigest = (path) => digest(readFileSync(path));

function assertHash(value, label) {
  if (!/^[0-9a-f]{64}$/u.test(value ?? "")) throw new Error(`${label} must be a sha256`);
}

function assertCommit(value) {
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(value ?? "")) throw new Error("commitSha must be a full Git object ID");
}

function safeId(value) {
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/u.test(value ?? "")) throw new Error("unsafe command id");
  return value;
}

function validateInput(input, label) {
  const path = resolve(root, input.path);
  assertHash(input.sha256, `${label}.sha256`);
  if (!existsSync(path) || !statSync(path).isFile() || fileDigest(path) !== input.sha256) throw new Error(`${label} checksum mismatch`);
  return { path: relative(root, path), sha256: input.sha256 };
}

function runCommand(command, output, index, spawn = spawnSync) {
  const id = safeId(command.id);
  if (!isAbsolute(command.executable) || !Array.isArray(command.args) || command.args.some((item) => typeof item !== "string")) throw new Error(`invalid command ${id}`);
  const startedAt = new Date().toISOString();
  const result = spawn(command.executable, command.args, { cwd: command.cwd ? resolve(root, command.cwd) : root, encoding: "utf8", env: { PATH: process.env.PATH, LANG: "C.UTF-8", TZ: "UTC" } });
  const endedAt = new Date().toISOString();
  const stdout = `${result.stdout ?? ""}`;
  const stderr = `${result.stderr ?? result.error?.message ?? ""}`;
  const prefix = `${String(index).padStart(2, "0")}-${id}`;
  const stdoutName = `${prefix}.stdout.log`;
  const stderrName = `${prefix}.stderr.log`;
  writeFileSync(join(output, stdoutName), stdout, { mode: 0o600 });
  writeFileSync(join(output, stderrName), stderr, { mode: 0o600 });
  return { id, command: [command.executable, ...command.args], cwd: command.cwd ?? ".", startedAt, endedAt, exitCode: result.status ?? 127, artifacts: [stdoutName, stderrName].map((path) => ({ path, sha256: fileDigest(join(output, path)), bytes: statSync(join(output, path)).size })) };
}

export function captureEvidence({ spec, output, spawn = spawnSync }) {
  if (spec.schemaVersion !== "property-track-c-evidence-spec-v1") throw new Error("unsupported evidence spec");
  assertCommit(spec.commitSha);
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  if (head !== spec.commitSha) throw new Error("commit SHA drift");
  if (!spec.reviewer || !Array.isArray(spec.commands) || spec.commands.length === 0 || !spec.cleanup) throw new Error("incomplete evidence spec");
  const environment = validateInput(spec.environment, "environment");
  const dataset = validateInput(spec.dataset, "dataset");
  const profile = validateInput(spec.profile, "profile");
  const target = resolve(output);
  if (existsSync(target)) throw new Error("evidence output already exists");
  mkdirSync(target, { recursive: false, mode: 0o700 });
  const records = [];
  let failure = null;
  try {
    for (let index = 0; index < spec.commands.length; index += 1) {
      const record = runCommand(spec.commands[index], target, index + 1, spawn);
      records.push(record);
      if (record.exitCode !== 0) { failure = { stage: record.id, exitCode: record.exitCode }; break; }
    }
  } finally {
    const cleanup = runCommand(spec.cleanup, target, records.length + 1, spawn);
    records.push({ ...cleanup, cleanup: true });
    let cleanupResult;
    try { cleanupResult = JSON.parse(readFileSync(join(target, cleanup.artifacts[0].path), "utf8")); } catch { cleanupResult = null; }
    if (cleanup.exitCode !== 0 || cleanupResult?.residualCount !== 0) failure ??= { stage: "cleanup", exitCode: cleanup.exitCode, residualCount: cleanupResult?.residualCount ?? null };
  }
  const manifest = { schemaVersion: "property-track-c-evidence-v1", status: failure ? "FAIL" : "PASS", commitSha: spec.commitSha, environmentDigest: environment.sha256, datasetChecksum: dataset.sha256, profileChecksum: profile.sha256, reviewer: spec.reviewer, generatedAt: new Date().toISOString(), commands: records, failure, cleanup: { attempted: true, residualCount: failure?.stage === "cleanup" ? failure.residualCount : 0 } };
  const manifestPath = join(target, "manifest.json");
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  return { ...manifest, manifestSha256: fileDigest(manifestPath), output: target };
}

function parseArgs(argv) {
  const value = {};
  for (let index = 0; index < argv.length; index += 2) value[argv[index]] = argv[index + 1];
  if (!value["--spec"] || !value["--output"]) throw new Error("usage: capture-evidence.mjs --spec <json> --output <new-directory>");
  return value;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = captureEvidence({ spec: JSON.parse(readFileSync(resolve(args["--spec"]), "utf8")), output: args["--output"] });
    process.stdout.write(`${JSON.stringify({ status: result.status, manifestSha256: result.manifestSha256, output: result.output })}\n`);
    if (result.status !== "PASS") process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
