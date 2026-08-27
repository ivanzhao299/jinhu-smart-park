#!/usr/bin/env node
import { lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";
import { LegacyAtomicInventoryError, validateLegacyAtomicInventory } from "./legacy-atomic-inventory-lib.mjs";

try {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--inventory" || !isAbsolute(args[1])) throw new LegacyAtomicInventoryError("CLI_ARGUMENT_INVALID", "--inventory requires an absolute path");
  const path = realpathSync(args[1]);
  if (!statSync(path).isFile() || lstatSync(args[1]).isSymbolicLink()) throw new LegacyAtomicInventoryError("INVENTORY_PATH_INVALID", "inventory must be a regular non-symlink file");
  const inventory = JSON.parse(readFileSync(path, "utf8"));
  process.stdout.write(`${JSON.stringify(validateLegacyAtomicInventory(inventory))}\n`);
} catch (error) {
  const code = error instanceof LegacyAtomicInventoryError ? error.code : error instanceof SyntaxError ? "INVENTORY_JSON_INVALID" : "LEGACY_INVENTORY_VERIFICATION_FAILED";
  process.stderr.write(`${code}: ${error.message}\n`);
  process.exitCode = 1;
}
