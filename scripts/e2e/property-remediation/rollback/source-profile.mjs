import { lstatSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { canonicalSha256, loadProfile } from "./lib.mjs";
import { captureDurableSnapshot, databaseUrlForName } from "./runtime-control.mjs";

function readCredential(path) {
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || (statSync(path).mode & 0o077) !== 0) throw new Error("source-profile credential must be a regular mode-0600 file");
  const value = JSON.parse(readFileSync(path, "utf8"));
  const allowed = new Set(["adminDatabaseUrl", "sourceDatabase", "sourceDatasetProfileId", "sourceDatasetSha256", "jwtSecret", "partyDataEncryptionKey", "adminUsername", "adminPassword", "tenantId", "parkId"]);
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !allowed.has(key))) throw new Error("source-profile credential has unknown fields");
  if (typeof value.adminDatabaseUrl !== "string" || typeof value.sourceDatabase !== "string") throw new Error("source-profile credential lacks database authority");
  return value;
}

export async function inspectSourceProfile({ credentialFile, signal }) {
  const credential = readCredential(resolve(credentialFile)); const { profile } = loadProfile();
  const sourceUrl = databaseUrlForName(credential.adminDatabaseUrl, credential.sourceDatabase);
  const snapshot = await captureDurableSnapshot({ databaseUrl: sourceUrl, expectedDatabase: credential.sourceDatabase, profile, signal });
  const counts = Object.fromEntries(snapshot.tables.map(({ table, count }) => [table, count]));
  if (Object.values(counts).every((count) => count === 0)) throw new Error("source profile is empty");
  const sentinels = Object.fromEntries(profile.requiredDatasetSentinels.map((table) => [table, counts[table]]));
  if (Object.values(sentinels).some((count) => !Number.isSafeInteger(count) || count < 1)) throw new Error("source profile sentinel is empty");
  return { schemaVersion: "property-track-c-source-profile-v1", profileId: profile.sourceDatasetProfileId, tablesSha256: canonicalSha256(snapshot.tables), counts, sentinels };
}

function parse(argv) {
  if (argv.length !== 2 || argv[0] !== "--credential-file") throw new Error("usage: source-profile.mjs --credential-file <mode-0600-json>");
  return argv[1];
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(await inspectSourceProfile({ credentialFile: parse(process.argv.slice(2)) }), null, 2)}\n`); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
