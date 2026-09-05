#!/usr/bin/env node
import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { setTimeout, clearTimeout } from "node:timers";
import { spawn, execFileSync } from "node:child_process";
import { constants, createReadStream, createWriteStream, closeSync, fsyncSync, linkSync, lstatSync, mkdirSync, mkdtempSync, openSync, realpathSync, statfsSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { pathToFileURL } from "node:url";
import process from "node:process";

const MOUNT = "/srv/jinhu-production-data";
const RESERVE_BYTES = 20n * 1024n ** 3n;
const MAX_ARTIFACT_BYTES = 20 * 1024 ** 3;
const SHA = /^[0-9a-f]{64}$/u;
const fail = code => { throw Object.assign(new Error(code), { code }); };
const hash = bytes => createHash("sha256").update(bytes).digest("hex");

// Exported for synthetic filesystem tests; CLI has no mount/path override.
export function checkRetentionRoot(mount = MOUNT, mountCheck = checkMount) {
  mountCheck(mount);
  let cursor = mount;
  while (cursor !== dirname(cursor)) {
    const stat = lstatSync(cursor);
    if (stat.isSymbolicLink() || !stat.isDirectory()
      || (stat.mode & 0o022) !== 0 || ![0, process.getuid()].includes(stat.uid)) fail("BACKUP_RETENTION_PATH_UNSAFE");
    cursor = dirname(cursor);
  }
  if (realpathSync(mount) !== mount) fail("BACKUP_RETENTION_PATH_UNSAFE");
  const root = join(mount, "hr-preimport-backups");
  try { mkdirSync(root, { mode: 0o700 }); } catch (error) { if (error.code !== "EEXIST") throw error; }
  const stat = lstatSync(root);
  if (stat.isSymbolicLink() || !stat.isDirectory() || (stat.mode & 0o777) !== 0o700 || stat.uid !== process.getuid()
    || stat.dev !== lstatSync(mount).dev) fail("BACKUP_RETENTION_PATH_UNSAFE");
  return root;
}

function checkMount(mount) {
  try {
    execFileSync("mountpoint", ["-q", mount], { stdio: "ignore", timeout: 10000 });
    if (statSync(mount).dev === statSync("/").dev) fail("BACKUP_RETENTION_ROOT_DISK_REFUSED");
  } catch { fail("BACKUP_RETENTION_DATA_MOUNT_REQUIRED"); }
}

export function validateRetentionInput(input) {
  if (!input || Object.keys(input).sort().join(",") !== "artifacts,runId"
    || typeof input.runId !== "string"
    || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/u.test(input.runId ?? "")
    || !Array.isArray(input.artifacts) || input.artifacts.length !== 2) fail("BACKUP_RETENTION_INPUT_INVALID");
  for (const [index, item] of input.artifacts.entries()) {
    if (!item || Object.keys(item).sort().join(",") !== "bytes,kind,sha256"
      || item.kind !== ["database", "files"][index] || typeof item.sha256 !== "string" || !SHA.test(item.sha256)
      || !Number.isSafeInteger(item.bytes) || item.bytes <= 0 || item.bytes > MAX_ARTIFACT_BYTES) fail("BACKUP_RETENTION_INPUT_INVALID");
  }
  return input;
}

function syncPath(path) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

export async function retainVerifiedBackup(input, { root, openSource, freeBytes, timeoutMs = 120000 }) {
  validateRetentionInput(input);
  const rootStat = lstatSync(root);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory() || (rootStat.mode & 0o777) !== 0o700 || rootStat.uid !== process.getuid()) fail("BACKUP_RETENTION_PATH_UNSAFE");
  const capacity = statfsSync(root, { bigint: true });
  const available = freeBytes ?? capacity.bavail * capacity.bsize;
  const required = RESERVE_BYTES + input.artifacts.reduce((total, item) => total + BigInt(item.bytes), 0n);
  if (available < required) fail("BACKUP_RETENTION_DISK_GUARD");
  const directory = mkdtempSync(join(root, "backup-"));
  const backupId = directory.slice(root.length + 1);
  for (const item of input.artifacts) {
    const target = join(directory, item.kind === "database" ? "database.dump" : "files.tgz");
    const source = openSource(item.kind, input.runId);
    const abortController = new globalThis.AbortController();
    const digest = createHash("sha256");
    let count = 0;
    const limit = new Transform({ transform(chunk, encoding, next) {
      count += chunk.length;
      if (count > item.bytes) { next(new Error("BACKUP_RETENTION_SIZE_DRIFT")); return; }
      digest.update(chunk); next(null, chunk);
    } });
    let timer;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("BACKUP_RETENTION_TIMEOUT")), timeoutMs);
    });
    try {
      await Promise.race([deadline, (async () => {
        await Promise.all([pipeline(source.stream, limit, createWriteStream(target, { flags: "wx", mode: 0o600 }),
          { signal: abortController.signal }), source.completed]);
        if (count !== item.bytes || digest.digest("hex") !== item.sha256) fail("BACKUP_RETENTION_CONTENT_DRIFT");
        syncPath(target);
        const diskDigest = createHash("sha256");
        let diskCount = 0;
        for await (const bytes of createReadStream(target, { signal: abortController.signal })) {
          diskCount += bytes.length;
          if (diskCount > item.bytes) fail("BACKUP_RETENTION_SIZE_DRIFT");
          diskDigest.update(bytes);
        }
        if (diskCount !== item.bytes || diskDigest.digest("hex") !== item.sha256) fail("BACKUP_RETENTION_CONTENT_DRIFT");
      })()]);
    } catch {
      abortController.abort();
      source.stream.destroy();
      source.abort();
      fail("BACKUP_RETENTION_COPY_FAILED");
    } finally { clearTimeout(timer); }
  }
  const receipt = { formatVersion: 1, kind: "production_gate19_retained_backup", status: "RETAINED_HASH_VERIFIED",
    backupId, runId: input.runId, retainedAt: new Date().toISOString(), artifacts: input.artifacts,
    productionImport: "HOLD", fullDisasterRecoveryClaimed: false };
  const bytes = Buffer.from(`${JSON.stringify(receipt)}\n`);
  const pendingReceipt = join(directory, "receipt.pending.json");
  const publishedReceipt = join(directory, "receipt.json");
  let published = false;
  try {
    writeFileSync(pendingReceipt, bytes, { flag: "wx", mode: 0o600 });
    syncPath(pendingReceipt); syncPath(directory); syncPath(root);
    // Exclusive atomic publication: no observer can read a partial final receipt.
    linkSync(pendingReceipt, publishedReceipt);
    published = true;
    syncPath(directory); syncPath(root);
  } catch {
    if (published) {
      // Retract only the failed publication marker; never remove either backup artifact.
      try { unlinkSync(publishedReceipt); syncPath(directory); }
      catch { fail("BACKUP_RETENTION_RECEIPT_PUBLICATION_UNCERTAIN"); }
    }
    fail("BACKUP_RETENTION_RECEIPT_FAILED");
  }
  // The durable final receipt exists. A leftover private staging marker is harmless.
  try { unlinkSync(pendingReceipt); } catch { /* Preserve it rather than fail a durable publication. */ }
  return { ...receipt, receiptSha256: hash(bytes) };
}

function dockerSource(envFile, composeFile) {
  return (kind, runId) => {
    const service = kind === "database" ? "postgres" : "api";
    const file = kind === "database" ? `/tmp/${runId}.dump` : `/tmp/${runId}-files.tgz`;
    const child = spawn("docker", ["compose", "--env-file", envFile, "-f", composeFile, "exec", "-T", service, "cat", file], { stdio: ["ignore", "pipe", "ignore"] });
    const completed = new Promise((resolve, reject) => {
      child.once("error", () => reject(new Error("BACKUP_RETENTION_SOURCE_FAILED")));
      child.once("close", code => code === 0 ? resolve() : reject(new Error("BACKUP_RETENTION_SOURCE_FAILED")));
    });
    return { stream: child.stdout, completed, abort: () => child.kill("SIGKILL") };
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 1 && args[0] === "check") {
      checkRetentionRoot();
      process.stdout.write("BACKUP_RETENTION_DESTINATION_READY\n");
    } else if (args.length === 3 && args[0] === "retain") {
      let body = "";
      for await (const chunk of process.stdin) { body += chunk; if (Buffer.byteLength(body) > 4096) fail("BACKUP_RETENTION_INPUT_INVALID"); }
      const input = validateRetentionInput(JSON.parse(body));
      const root = checkRetentionRoot();
      const receipt = await retainVerifiedBackup(input, { root, openSource: dockerSource(args[1], args[2]) });
      process.stdout.write(`${JSON.stringify(receipt)}\n`);
    } else fail("BACKUP_RETENTION_ARGUMENT_INVALID");
  } catch (error) {
    process.stderr.write(`${/^BACKUP_RETENTION_[A-Z_]+$/u.test(error.code ?? "") ? error.code : "BACKUP_RETENTION_FAILED"}\n`);
    process.exitCode = 1;
  }
}
