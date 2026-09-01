#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../..");
const dockerfile = readFileSync(resolve(root, "infra/docker/Dockerfile.yuzhou-photo-worker"), "utf8");
const worker = readFileSync(resolve(root, "scripts/hr-cutover/yuzhou-photo-normalization-worker.mjs"), "utf8");
const dockerRehearsal = readFileSync(resolve(root, "scripts/e2e/yuzhou-photo-normalization-worker-docker.mjs"), "utf8");

test("normalization worker is separate from the API image and runs non-root", () => {
  assert.match(dockerfile, /^FROM node:22-bookworm-slim/mu);
  assert.match(dockerfile, /apt_install ca-certificates ffmpeg/u);
  assert.match(dockerfile, /COPY scripts\/hr-cutover\/yuzhou-photo-normalization-preflight\.mjs/u);
  assert.match(dockerfile, /COPY scripts\/hr-cutover\/yuzhou-photo-normalization-worker\.mjs/u);
  assert.match(dockerfile, /USER node/u);
  assert.match(dockerfile, /ENTRYPOINT \["node", "yuzhou-photo-normalization-worker\.mjs"\]/u);
  assert.doesNotMatch(dockerfile, /Dockerfile\.api|COPY \. \./u);
});

test("worker fixes its lab-only input/output boundary and decoder hardening", () => {
  for (const value of ["/input/source", "/output/normalized.jpg", "/output/.normalized.tmp.jpg", "isolated_rehearsal", "-nostdin", "-max_alloc", "-map_metadata", "-map_chapters", "-an", "-sn", "-dn", "USER node"]) {
    if (value === "USER node") continue;
    assert.match(worker, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  }
  assert.match(worker, /process\.argv\.length !== 2/u);
  assert.match(worker, /YUZHOU_PHOTO_WORKER_MODE !== WORKER_MODE/u);
  assert.doesNotMatch(worker, /--network/u);
  assert.match(worker, /preflightYuzhouPhotoBinary/u);
  assert.match(worker, /if \(source\.size > YUZHOU_PHOTO_NORMALIZATION_PREFLIGHT_POLICY\.maxBytes\)/u);
  assert.match(worker, /if \(!await runFfmpeg\(\)\)/u);
  assert.match(worker, /normalizedPreflight\.sourceMagic !== "JPEG"/u);
  assert.doesNotMatch(worker, /process\.env\.(?:INPUT|OUTPUT)_PATH/u);
  assert.doesNotMatch(worker, /console\.log|console\.error/u);
});

test("worker cannot be invoked outside its isolated rehearsal mode", () => {
  const result = spawnSync(process.execPath, [resolve(root, "scripts/hr-cutover/yuzhou-photo-normalization-worker.mjs")], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, YUZHOU_PHOTO_WORKER_MODE: "production" }
  });
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr.trim(), "YUZHOU_PHOTO_WORKER_MODE_FORBIDDEN");
});

test("Docker rehearsal keeps the worker non-networked, read-only and resource-bounded", () => {
  for (const value of ["--network", "none", "--read-only", "--pids-limit", "--memory", "--cpus", "--tmpfs", "YUZHOU_PHOTO_WORKER_MODE", "isolated_rehearsal"]) {
    assert.match(dockerRehearsal, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  }
  assert.match(dockerRehearsal, /docker", \["rm", "-f", container\]/u);
  assert.match(dockerRehearsal, /docker", \["image", "rm", image\]/u);
  assert.match(dockerRehearsal, /const buildContext = join\(sandbox, "build-context"\)/u);
  assert.match(dockerRehearsal, /copyFileSync\(resolve\(root, artifact\), join\(buildContext, artifact\), 0\)/u);
  assert.match(dockerRehearsal, /\{ cwd: buildContext \}/u);
  assert.doesNotMatch(dockerRehearsal, /YUZHOU_PHOTO_WORKER_MODE=production/u);
});
