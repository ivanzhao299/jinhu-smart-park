import { lstat, realpath, mkdir, open, unlink, rmdir } from "node:fs/promises";
import { constants } from "node:fs";
import { join, resolve, isAbsolute } from "node:path";
import { randomBytes, createHash } from "node:crypto";
const HASH = /^[0-9a-f]{64}$/u, RUN = /^[A-Za-z0-9][A-Za-z0-9._-]{5,59}$/u;
const fields = ["codeSha", "sourceSnapshotHash", "mappingSha256", "executorSha256"];
class StateError extends Error { constructor(code) { super(code); this.code = code; } }
const fail = code => { throw new StateError(code); };
async function safe(work) { try { return await work(); } catch (error) { if (error instanceof StateError) throw error; fail("LAB_RUN_STATE_IO_FAILED"); } }
async function directory(path) { const stat = await lstat(path); if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) || await realpath(path) !== path) fail("LAB_RUN_STATE_PATH_DENIED"); return stat; }
async function syncDirectory(path) { const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW); try { await file.sync(); } finally { await file.close(); } }
async function readPrivate(path) {
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink() || (before.mode & 0o077) || before.size > 16384) fail("LAB_RUN_STATE_FILE_DENIED");
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { const stat = await file.stat(); if (stat.ino !== before.ino || stat.dev !== before.dev || stat.size !== before.size) fail("LAB_RUN_STATE_FILE_DENIED");
    const bytes = await file.readFile(); const after = await file.stat(); if (bytes.length > 16384 || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs) fail("LAB_RUN_STATE_FILE_DENIED");
    return JSON.parse(bytes.toString("utf8"));
  } finally { await file.close(); }
}
function identity(input) {
  if (!RUN.test(input?.runId ?? "") || !HASH.test(input?.manifestSha256 ?? "")) fail("LAB_RUN_STATE_IDENTITY_INVALID");
  return { runId: input.runId, manifestSha256: input.manifestSha256 };
}
function checkpointValue(input) {
  const base = identity(input), binding = input.binding;
  if (input.state !== "apply_commit_intent" || !/^[0-9a-f]{40}$/u.test(binding?.codeSha ?? "") || fields.slice(1).some(key => !HASH.test(binding?.[key] ?? ""))) fail("LAB_RUN_STATE_IDENTITY_INVALID");
  return { formatVersion: 1, ...base, binding: Object.fromEntries(fields.map(key => [key, binding[key]])), state: "apply_commit_intent" };
}
function digest(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

/** Uses an existing 0700 canonical directory shared by every lab database.
 * No PID liveness inference, stale-lease deletion, database access or CLI.
 * Intent is not proof that COMMIT happened; recovery must inspect the bound DB.
 */
export async function createYuzhouLabRunState({ stateRoot }) {
  return safe(async () => {
    if (typeof stateRoot !== "string" || !isAbsolute(stateRoot) || resolve(stateRoot) !== stateRoot) fail("LAB_RUN_STATE_PATH_DENIED");
    const rootStat = await directory(stateRoot), leasePath = join(stateRoot, "exclusive-owner"), ownerPath = join(leasePath, "owner.json");
    let active;
    async function root() { const stat = await directory(stateRoot); if (stat.ino !== rootStat.ino || stat.dev !== rootStat.dev) fail("LAB_RUN_STATE_PATH_DENIED"); }
    async function own() {
      await root(); if (!active) fail("LAB_RUN_STATE_NOT_OWNER"); const stat = await directory(leasePath), owner = await readPrivate(ownerPath);
      if (stat.ino !== active.ino || stat.dev !== active.dev || owner.token !== active.token || owner.runId !== active.runId || owner.manifestSha256 !== active.manifestSha256) fail("LAB_RUN_STATE_NOT_OWNER");
    }
    const acquireExclusiveOwner = input => safe(async () => {
      const id = identity(input); await root();
      if (active) fail("LAB_RUN_STATE_LEASE_BUSY");
      try { await mkdir(leasePath, { mode: 0o700 }); } catch (error) { if (error?.code === "EEXIST") fail("LAB_RUN_STATE_LEASE_BUSY"); throw error; }
      // Partial acquisition remains fail-closed for explicit recovery, never auto-removed.
      const stat = await directory(leasePath), token = randomBytes(32).toString("hex");
      const file = await open(ownerPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      try { await file.writeFile(JSON.stringify({ ...id, token })); await file.sync(); } finally { await file.close(); }
      await syncDirectory(leasePath); await syncDirectory(stateRoot);
      active = { ...id, token, ino: stat.ino, dev: stat.dev }; const lease = active;
      return { release: () => safe(async () => {
        if (active !== lease) fail("LAB_RUN_STATE_NOT_OWNER"); await own();
        await unlink(ownerPath); await rmdir(leasePath); active = undefined; await syncDirectory(stateRoot); return true;
      }) };
    });
    const checkpoint = input => safe(async () => {
      const value = checkpointValue(input); await own();
      if (active.runId !== value.runId || active.manifestSha256 !== value.manifestSha256) fail("LAB_RUN_STATE_BINDING_MISMATCH");
      const path = join(stateRoot, `checkpoint-${value.runId}.json`), envelope = { value, sha256: digest(value) };
      let file;
      try { file = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); }
      catch (error) {
        if (error?.code !== "EEXIST") throw error;
        const stored = await readPrivate(path);
        if (stored.sha256 !== digest(value) || digest(stored.value) !== stored.sha256) fail("LAB_RUN_STATE_BINDING_MISMATCH");
        // Re-fsync an existing exact checkpoint before reporting durable success.
        file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      }
      try { if ((await file.stat()).size === 0) await file.writeFile(JSON.stringify(envelope)); await file.sync(); } finally { await file.close(); }
      await syncDirectory(stateRoot); return true;
    });
    const readRecovery = input => safe(async () => {
      await root(); const expected = checkpointValue({ ...input, state: "apply_commit_intent" });
      const stored = await readPrivate(join(stateRoot, `checkpoint-${expected.runId}.json`));
      if (stored.sha256 !== digest(expected) || digest(stored.value) !== stored.sha256) fail("LAB_RUN_STATE_BINDING_MISMATCH");
      return { ...expected, checkpointSha256: stored.sha256, databaseStateVerified: false, productionImport: "HOLD" };
    });
    return { acquireExclusiveOwner, checkpoint, readRecovery };
  });
}
