#!/usr/bin/env node
import { lstatSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { LegacyDualSourceReconciliationError, verifyObservedGroupWebProfile } from "./legacy-dual-source-reconciliation-lib.mjs";

const root = resolve(import.meta.dirname, "../..");
const fail = (code, detail) => { throw new LegacyDualSourceReconciliationError(code, detail); };

try {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--profile" || !isAbsolute(args[1])) fail("GROUP_WEB_PROFILE_ARGUMENT_INVALID", "--profile must be one absolute path");
  const profilePath = resolve(args[1]);
  const stat = lstatSync(profilePath);
  if (!stat.isFile() || stat.isSymbolicLink() || (statSync(profilePath).mode & 0o077) !== 0) fail("GROUP_WEB_PROFILE_FILE_INVALID", "profile must be a plain mode-0600 file");
  const profile = JSON.parse(readFileSync(profilePath, "utf8"));
  const contract = JSON.parse(readFileSync(resolve(root, "scripts/hr-cutover/contracts/legacy-dual-source-reconciliation-v1.json"), "utf8"));
  process.stdout.write(`${JSON.stringify(verifyObservedGroupWebProfile(profile, contract))}\n`);
} catch (error) {
  const code = error instanceof LegacyDualSourceReconciliationError ? error.code : "GROUP_WEB_PROFILE_VERIFY_FAILED";
  process.stderr.write(`${code}: ${error.message}\n`);
  process.exitCode = 1;
}
