#!/usr/bin/env node
import { chmodSync, lstatSync, mkdirSync, openSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { buildLegacyAtomicInventory, LegacyAtomicInventoryError, validateLegacyAtomicInventory } from "./legacy-atomic-inventory-lib.mjs";

function fail(code, detail) {
  throw new LegacyAtomicInventoryError(code, detail);
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!["--legacy-root", "--output"].includes(key) || !value) fail("CLI_ARGUMENT_INVALID", key ?? "missing argument");
    if (Object.hasOwn(values, key)) fail("CLI_ARGUMENT_INVALID", `${key}:duplicate`);
    values[key] = value;
  }
  if (!values["--legacy-root"] || !values["--output"]) fail("CLI_ARGUMENT_INVALID", "--legacy-root and --output are required");
  return values;
}

function validateOutputPath(output, legacyRoot) {
  if (!isAbsolute(output)) fail("OUTPUT_PATH_INVALID", "--output must be absolute");
  if (basename(output).toLowerCase() === "legacy-compatibility-ledger-v1.json") fail("REVIEWED_LEDGER_OVERWRITE_FORBIDDEN", basename(output));
  const parent = dirname(resolve(output));
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const realParent = realpathSync(parent);
  const realLegacy = realpathSync(legacyRoot);
  if (realParent === realLegacy || realParent.startsWith(`${realLegacy}${sep}`)) fail("OUTPUT_PATH_ESCAPE", "output cannot be inside the legacy source root");
  if (statSync(realParent).mode & 0o077) fail("OUTPUT_PARENT_PERMISSIONS_INVALID", "output parent must be mode 0700");
  try {
    if (lstatSync(output).isSymbolicLink()) fail("OUTPUT_PATH_INVALID", "output cannot be a symlink");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return { output: resolve(output), parent: realParent };
}

try {
  const args = parseArgs(process.argv.slice(2));
  const target = validateOutputPath(args["--output"], args["--legacy-root"]);
  const inventory = buildLegacyAtomicInventory(args["--legacy-root"]);
  const report = validateLegacyAtomicInventory(inventory);
  const temp = join(target.parent, `.${basename(target.output)}.${process.pid}.tmp`);
  try {
    const fd = openSync(temp, "wx", 0o600);
    writeFileSync(fd, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
    chmodSync(temp, 0o600);
    renameSync(temp, target.output);
  } catch (error) {
    try { unlinkSync(temp); } catch {}
    throw error;
  }
  process.stdout.write(`${JSON.stringify({ ok: true, outputFile: basename(target.output), ...report })}\n`);
} catch (error) {
  const code = error instanceof LegacyAtomicInventoryError ? error.code : "LEGACY_INVENTORY_GENERATION_FAILED";
  process.stderr.write(`${code}: ${error.message}\n`);
  process.exitCode = 1;
}
