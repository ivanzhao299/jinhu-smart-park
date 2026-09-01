#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildCoreT0MachinePackage } from "./build-core-t0-machine-package.mjs";
import { validateConfig } from "./full-domain-lifecycle.mjs";

const fail = code => { throw new Error(code); };

export function buildFullT0MachinePackage(configInput, machineRoot) {
  return buildCoreT0MachinePackage(configInput, machineRoot, { validate: validateConfig });
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const [configPath, machineRoot] = process.argv.slice(2);
  if (!configPath || !machineRoot) fail("FULL_T0_MACHINE_ARGUMENT_INVALID");
  const result = buildFullT0MachinePackage(JSON.parse(readFileSync(resolve(configPath), "utf8")), machineRoot);
  process.stdout.write(`${JSON.stringify({ machinePackage: "verified", productionImport: result.productionImport })}\n`);
}
