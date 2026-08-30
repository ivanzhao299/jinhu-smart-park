#!/usr/bin/env node
import { createHash } from "node:crypto";
import { lstat, readFile, rename, rm, stat, chmod } from "node:fs/promises";
import { dirname } from "node:path";
import { spawn } from "node:child_process";
import {
  YUZHOU_PHOTO_NORMALIZATION_PREFLIGHT_POLICY,
  preflightYuzhouPhotoBinary
} from "./yuzhou-photo-normalization-preflight.mjs";

const INPUT_PATH = "/input/source";
const OUTPUT_PATH = "/output/normalized.jpg";
const TEMPORARY_OUTPUT_PATH = "/output/.normalized.tmp.jpg";
const WORKER_MODE = "isolated_rehearsal";
const FFMPEG_TIMEOUT_MS = 20_000;

class YuzhouPhotoNormalizationWorkerError extends Error {
  constructor(code) {
    super(code);
    this.name = "YuzhouPhotoNormalizationWorkerError";
    this.code = code;
  }
}

const fail = code => { throw new YuzhouPhotoNormalizationWorkerError(code); };
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

const assertRegularFile = async path => {
  const entry = await lstat(path);
  if (!entry.isFile() || entry.isSymbolicLink()) fail("YUZHOU_PHOTO_WORKER_INPUT_UNSAFE");
  return entry;
};

const assertOutputDirectory = async () => {
  const entry = await lstat(dirname(OUTPUT_PATH));
  if (!entry.isDirectory() || entry.isSymbolicLink()) fail("YUZHOU_PHOTO_WORKER_OUTPUT_UNSAFE");
};

const removeOutput = async () => {
  await rm(TEMPORARY_OUTPUT_PATH, { force: true });
  await rm(OUTPUT_PATH, { force: true });
};

const runFfmpeg = () => new Promise(resolve => {
  const child = spawn("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-max_alloc", "67108864",
    "-noautorotate", "-i", INPUT_PATH,
    "-map_metadata", "-1", "-map_chapters", "-1", "-an", "-sn", "-dn",
    "-frames:v", "1", "-c:v", "mjpeg", "-q:v", "3", "-pix_fmt", "yuvj420p",
    "-y", TEMPORARY_OUTPUT_PATH
  ], { stdio: ["ignore", "ignore", "ignore"] });
  let settled = false;
  const finish = value => {
    if (!settled) {
      settled = true;
      clearTimeout(timer);
      resolve(value);
    }
  };
  const timer = setTimeout(() => {
    child.kill("SIGKILL");
    finish(false);
  }, FFMPEG_TIMEOUT_MS);
  child.once("error", () => finish(false));
  child.once("exit", code => finish(code === 0));
});

const result = value => process.stdout.write(`${JSON.stringify(value)}\n`);

export async function runYuzhouPhotoNormalizationWorker() {
  if (process.argv.length !== 2) fail("YUZHOU_PHOTO_WORKER_ARGUMENTS_FORBIDDEN");
  if (process.env.YUZHOU_PHOTO_WORKER_MODE !== WORKER_MODE) fail("YUZHOU_PHOTO_WORKER_MODE_FORBIDDEN");
  const source = await assertRegularFile(INPUT_PATH);
  if (source.size > YUZHOU_PHOTO_NORMALIZATION_PREFLIGHT_POLICY.maxBytes) {
    await removeOutput();
    return { status: "QUARANTINED", reasonCode: "BYTE_LIMIT_EXCEEDED" };
  }
  await assertOutputDirectory();
  const preflight = preflightYuzhouPhotoBinary(await readFile(INPUT_PATH));
  if (preflight.decision === "QUARANTINE") {
    await removeOutput();
    return { status: "QUARANTINED", reasonCode: preflight.reasonCode, sourceMagic: preflight.sourceMagic, dimensions: preflight.dimensions };
  }
  await removeOutput();
  if (!await runFfmpeg()) return { status: "QUARANTINED", reasonCode: "DECODE_FAILED", sourceMagic: preflight.sourceMagic, dimensions: preflight.dimensions };
  await assertRegularFile(TEMPORARY_OUTPUT_PATH);
  const normalized = await readFile(TEMPORARY_OUTPUT_PATH);
  const normalizedPreflight = preflightYuzhouPhotoBinary(normalized);
  if (normalizedPreflight.decision !== "CONTINUE_SAFE_DECODE" || normalizedPreflight.sourceMagic !== "JPEG") {
    await removeOutput();
    return { status: "QUARANTINED", reasonCode: "DECODE_FAILED", sourceMagic: preflight.sourceMagic, dimensions: preflight.dimensions };
  }
  await chmod(TEMPORARY_OUTPUT_PATH, 0o600);
  await rename(TEMPORARY_OUTPUT_PATH, OUTPUT_PATH);
  const output = await stat(OUTPUT_PATH);
  return {
    status: "NORMALIZED",
    reasonCode: null,
    sourceMagic: preflight.sourceMagic,
    dimensions: normalizedPreflight.dimensions,
    normalizedMime: "image/jpeg",
    normalizedBytes: output.size,
    normalizedContentSha256: sha256(normalized)
  };
}

if (process.argv[1] && new URL(`file:${process.argv[1]}`).href === import.meta.url) {
  runYuzhouPhotoNormalizationWorker().then(result).catch(error => {
    const code = error instanceof YuzhouPhotoNormalizationWorkerError ? error.code : "YUZHOU_PHOTO_WORKER_FAILED";
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
}
