#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const runId = `photo-worker-${process.pid}-${Date.now()}`;
const image = `jinhu-yuzhou-photo-worker-contract:${runId}`;
const container = `jinhu-yuzhou-photo-worker-contract-${runId}`;
const sandbox = mkdtempSync(join(root, ".tmp-yuzhou-photo-worker-"));
const buildContext = join(sandbox, "build-context");
const input = join(sandbox, "source.bmp");
const outputDirectory = join(sandbox, "output");
const normalizedOutput = join(outputDirectory, "normalized.jpg");
const digest = bytes => createHash("sha256").update(bytes).digest("hex");

const command = (program, args, { allowFailure = false, cwd = root } = {}) => {
  const result = spawnSync(program, args, { cwd, encoding: "utf8", maxBuffer: 1024 * 1024 });
  if (!allowFailure && result.status !== 0) throw new Error(`YUZHOU_PHOTO_WORKER_DOCKER_COMMAND_FAILED:${program}:${result.status ?? "signal"}`);
  return result;
};

const fixtureBmp = () => {
  const bytes = Buffer.alloc(58);
  bytes.write("BM", 0, "ascii");
  bytes.writeUInt32LE(58, 2);
  bytes.writeUInt32LE(54, 10);
  bytes.writeUInt32LE(40, 14);
  bytes.writeInt32LE(1, 18);
  bytes.writeInt32LE(1, 22);
  bytes.writeUInt16LE(1, 26);
  bytes.writeUInt16LE(24, 28);
  bytes.writeUInt32LE(4, 34);
  bytes.set([0x00, 0x00, 0xff, 0x00], 54);
  return bytes;
};

try {
  chmodSync(sandbox, 0o700);
  for (const directory of [join(buildContext, "infra/docker"), join(buildContext, "scripts/hr-cutover")]) mkdirSync(directory, { recursive: true, mode: 0o700 });
  for (const artifact of ["infra/docker/Dockerfile.yuzhou-photo-worker", "scripts/hr-cutover/yuzhou-photo-normalization-preflight.mjs", "scripts/hr-cutover/yuzhou-photo-normalization-worker.mjs"]) {
    copyFileSync(resolve(root, artifact), join(buildContext, artifact), 0);
  }
  mkdirSync(outputDirectory, { mode: 0o777 });
  chmodSync(outputDirectory, 0o777);
  const source = fixtureBmp();
  writeFileSync(input, source, { mode: 0o600 });
  const sourceHash = digest(source);
  command("docker", ["build", "--file", "infra/docker/Dockerfile.yuzhou-photo-worker", "--tag", image, "."], { cwd: buildContext });
  command("docker", [
    "run", "--name", container,
    "--network", "none", "--read-only", "--pids-limit", "64", "--memory", "256m", "--cpus", "0.5",
    "--tmpfs", "/tmp:rw,noexec,nosuid,size=16m",
    "--mount", `type=bind,src=${input},dst=/input/source,readonly`,
    "--mount", `type=bind,src=${outputDirectory},dst=/output`,
    "--env", "YUZHOU_PHOTO_WORKER_MODE=isolated_rehearsal",
    image
  ]);
  const logs = command("docker", ["logs", container]).stdout.trim();
  const result = JSON.parse(logs);
  assert.equal(result.status, "NORMALIZED", JSON.stringify(result));
  assert.equal(result.reasonCode, null);
  assert.equal(result.sourceMagic, "BMP");
  assert.deepEqual(result.dimensions, { width: 1, height: 1 });
  assert.equal(result.normalizedMime, "image/jpeg");
  assert.match(result.normalizedContentSha256, /^[0-9a-f]{64}$/u);
  assert.ok(result.normalizedBytes > 0);
  const normalized = readFileSync(normalizedOutput);
  assert.equal(normalized[0], 0xff);
  assert.equal(normalized[1], 0xd8);
  assert.equal(digest(normalized), result.normalizedContentSha256);
  assert.equal(digest(readFileSync(input)), sourceHash);
  process.stdout.write("Yuzhou photo normalization worker Docker rehearsal passed.\n");
} finally {
  command("docker", ["rm", "-f", container], { allowFailure: true });
  command("docker", ["image", "rm", image], { allowFailure: true });
  rmSync(sandbox, { recursive: true, force: true });
}
