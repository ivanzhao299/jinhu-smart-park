#!/usr/bin/env node

const allowedModes = new Set(["fast-css", "web", "api", "database", "full", "ops-only"]);
const verified = process.argv.find((arg) => arg.startsWith("--verified="))?.slice(11) || "";
const resolved = process.argv.find((arg) => arg.startsWith("--resolved="))?.slice(11) || "";

if (!allowedModes.has(verified) || !allowedModes.has(resolved)) {
  throw new Error(`Invalid deployment scope comparison: verified=${verified || "(empty)"}, resolved=${resolved || "(empty)"}`);
}
if (verified !== "full" && verified !== resolved) {
  throw new Error(`Verified scope '${verified}' does not cover authoritative production scope '${resolved}'. Re-run with deploy_mode=full.`);
}

process.stdout.write(`Verified deployment scope accepted: verified=${verified}, resolved=${resolved}\n`);
