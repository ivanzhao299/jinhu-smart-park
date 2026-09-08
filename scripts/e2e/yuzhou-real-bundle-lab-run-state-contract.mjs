import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, realpath, rm, readFile, writeFile, chmod, symlink, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createYuzhouLabRunState } from "../hr-cutover/yuzhou-real-bundle-lab-run-state.mjs";
const input = { runId: "fixture-run", manifestSha256: "a".repeat(64), binding: { codeSha: "b".repeat(40), sourceSnapshotHash: "c".repeat(64), mappingSha256: "d".repeat(64), executorSha256: "e".repeat(64) }, state: "apply_commit_intent" };
async function fixture(work) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "lab-run-state-contract-")));
  try { await work(root); } finally { await rm(root, { recursive: true, force: true }); }
}
test("exclusive lease is shared across adapters and released only once", () => fixture(async root => {
  const one = await createYuzhouLabRunState({ stateRoot: root }), two = await createYuzhouLabRunState({ stateRoot: root });
  const results = await Promise.allSettled([one.acquireExclusiveOwner(input), two.acquireExclusiveOwner({ ...input, runId: "other-run" })]);
  assert.equal(results.filter(row => row.status === "fulfilled").length, 1); assert.equal(results.filter(row => row.status === "rejected").length, 1);
  const lease = results.find(row => row.status === "fulfilled").value;
  assert.equal(await lease.release(), true); await assert.rejects(lease.release(), /LAB_RUN_STATE_NOT_OWNER/);
  const next = await two.acquireExclusiveOwner(input); assert.equal(await next.release(), true);
}));
test("checkpoint persists exact binding, allows identical replay, and recovery does not claim DB state", () => fixture(async root => {
  const adapter = await createYuzhouLabRunState({ stateRoot: root }); await assert.rejects(adapter.checkpoint(input), /LAB_RUN_STATE_NOT_OWNER/);
  const lease = await adapter.acquireExclusiveOwner(input); assert.equal(await adapter.checkpoint(input), true);
  const path = join(root, "checkpoint-fixture-run.json"), before = await readFile(path, "utf8");
  assert.equal((await stat(path)).mode & 0o077, 0); assert.equal(await adapter.checkpoint({ ...input, binding: Object.fromEntries(Object.entries(input.binding).reverse()) }), true);
  assert.equal(await readFile(path, "utf8"), before);
  const fresh = await createYuzhouLabRunState({ stateRoot: root }), recovered = await fresh.readRecovery(input);
  assert.equal(recovered.databaseStateVerified, false); assert.equal(recovered.productionImport, "HOLD"); assert.deepEqual(recovered.binding, input.binding);
  await assert.rejects(adapter.checkpoint({ ...input, binding: { ...input.binding, executorSha256: "f".repeat(64) } }), /LAB_RUN_STATE_BINDING_MISMATCH/);
  await assert.rejects(adapter.checkpoint({ ...input, runId: "other-run" }), /LAB_RUN_STATE_BINDING_MISMATCH/);
  assert.equal(await readFile(path, "utf8"), before); await lease.release();
}));
test("stale lease never gets removed and owner token tampering prevents release", () => fixture(async root => {
  const adapter = await createYuzhouLabRunState({ stateRoot: root }), lease = await adapter.acquireExclusiveOwner(input);
  const path = join(root, "exclusive-owner", "owner.json"), owner = JSON.parse(await readFile(path, "utf8")); owner.token = "foreign-owner"; await writeFile(path, JSON.stringify(owner));
  await assert.rejects(lease.release(), /LAB_RUN_STATE_NOT_OWNER/);
  const other = await createYuzhouLabRunState({ stateRoot: root }); await assert.rejects(other.acquireExclusiveOwner(input), /LAB_RUN_STATE_LEASE_BUSY/);
  assert.equal(JSON.parse(await readFile(path, "utf8")).token, "foreign-owner");
}));
test("tampered checkpoint and mismatched recovery identity fail closed", () => fixture(async root => {
  const adapter = await createYuzhouLabRunState({ stateRoot: root }), lease = await adapter.acquireExclusiveOwner(input); await adapter.checkpoint(input);
  await assert.rejects(adapter.readRecovery({ ...input, manifestSha256: "f".repeat(64) }), /LAB_RUN_STATE_BINDING_MISMATCH/);
  const path = join(root, "checkpoint-fixture-run.json"), stored = JSON.parse(await readFile(path, "utf8")); stored.value.binding.codeSha = "f".repeat(40); await writeFile(path, JSON.stringify(stored));
  await assert.rejects(adapter.readRecovery(input), /LAB_RUN_STATE_BINDING_MISMATCH/); await assert.rejects(adapter.checkpoint(input), /LAB_RUN_STATE_BINDING_MISMATCH/); await lease.release();
}));
test("private root, checkpoint permissions and symlinks are mandatory", () => fixture(async root => {
  await chmod(root, 0o755); await assert.rejects(createYuzhouLabRunState({ stateRoot: root }), /LAB_RUN_STATE_PATH_DENIED/); await chmod(root, 0o700);
  const adapter = await createYuzhouLabRunState({ stateRoot: root }), lease = await adapter.acquireExclusiveOwner(input); await adapter.checkpoint(input);
  const path = join(root, "checkpoint-fixture-run.json"); await chmod(path, 0o644); await assert.rejects(adapter.readRecovery(input), /LAB_RUN_STATE_FILE_DENIED/);
  await rm(path); await symlink(join(root, "exclusive-owner", "owner.json"), path); await assert.rejects(adapter.checkpoint(input), /LAB_RUN_STATE_FILE_DENIED/); await lease.release();
}));
