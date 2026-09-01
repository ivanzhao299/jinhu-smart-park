#!/usr/bin/env node
import { existsSync, lstatSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const fail = code => { process.stderr.write(`${code}\n`); process.exitCode = 1; };

export function formatLightweightFirstProgress(progress, now = Date.now()) {
  if (!progress || progress.formatVersion !== 1 || !Number.isInteger(progress.completedPercent) || progress.completedPercent < 0 || progress.completedPercent > 100 || typeof progress.phase !== "string" || typeof progress.status !== "string" || !Number.isFinite(progress.elapsedMilliseconds) || progress.elapsedMilliseconds < 0 || progress.productionImport !== "HOLD") throw new Error("LIGHTWEIGHT_PROGRESS_INVALID");
  const hasT4Batch = Object.hasOwn(progress, "t4BatchCompleted") || Object.hasOwn(progress, "t4BatchTotal");
  if (hasT4Batch && (progress.phase !== "T4" || !Number.isInteger(progress.t4BatchCompleted) || !Number.isInteger(progress.t4BatchTotal) || progress.t4BatchTotal !== 16 || progress.t4BatchCompleted < 1 || progress.t4BatchCompleted > progress.t4BatchTotal)) throw new Error("LIGHTWEIGHT_PROGRESS_INVALID");
  const elapsedMilliseconds = progress.status === "RUNNING" ? progress.elapsedMilliseconds + Math.max(0, now - progress.updatedAtMilliseconds) : progress.elapsedMilliseconds;
  const filled = Math.round(progress.completedPercent / 5);
  const bar = `${"#".repeat(filled)}${"-".repeat(20 - filled)}`;
  const batch = hasT4Batch ? ` batch=${progress.t4BatchCompleted}/${progress.t4BatchTotal}` : "";
  return `[${bar}] ${String(progress.completedPercent).padStart(3, " ")}% phase=${progress.phase}${batch} status=${progress.status} elapsed=${Math.floor(elapsedMilliseconds / 60000)}m productionImport=HOLD`;
}

export function readLightweightFirstProgress(path) {
  const absolute = resolve(path);
  if (!existsSync(absolute) || lstatSync(absolute).isSymbolicLink() || !statSync(absolute).isFile() || (statSync(absolute).mode & 0o777) !== 0o600) throw new Error("LIGHTWEIGHT_PROGRESS_UNSAFE");
  const progress = JSON.parse(readFileSync(absolute, "utf8"));
  return { ...progress, updatedAtMilliseconds: statSync(absolute).mtimeMs };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [flag, progressPath] = process.argv.slice(2);
  if (flag !== "--progress-file" || !progressPath || process.argv.length !== 4) fail("LIGHTWEIGHT_PROGRESS_ARGUMENT_INVALID");
  else {
    try { process.stdout.write(`${formatLightweightFirstProgress(readLightweightFirstProgress(progressPath))}\n`); }
    catch (error) { fail(error.message === "LIGHTWEIGHT_PROGRESS_UNSAFE" ? error.message : "LIGHTWEIGHT_PROGRESS_INVALID"); }
  }
}
