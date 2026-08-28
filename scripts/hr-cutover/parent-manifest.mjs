#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { verifyManifest, ContractError } from "./verify-full-domain-contract.mjs";

const SHA = /^[0-9a-f]{64}$/;
const FORBIDDEN = /password|passwd|token|secret|connectionstring|credential|privatekey|bankaccount|idcard|insureaccount|employeename|fullname|mobile|phone|salaryamount|grosspay|netpay/i;
const FORBIDDEN_VALUE = /postgres(?:ql)?:\/\/|sqlserver:\/\/|Bearer\s+|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|AKIA[0-9A-Z]{16}/i;
const FORBIDDEN_PII_VALUE = /(?<!\d)(?:1[3-9]\d{9}|\d{17}[0-9Xx]|\d{16,19})(?!\d)/;
const SAFE_KEYS = new Set(["containsSecrets", "redactionContractVersion"]);

export class ManifestChainError extends Error {
  constructor(code, detail) { super(`${code}: ${detail}`); this.code = code; this.name = "ManifestChainError"; }
}
const fail = (code, detail) => { throw new ManifestChainError(code, detail); };
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const canonicalJson = (value) => {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};
export const manifestHash = (manifest) => sha256(Buffer.from(`${canonicalJson(manifest)}\n`));

function scan(value, at = "$", trustedDigest = false) {
  if (Array.isArray(value)) return value.forEach((item, index) => scan(item, `${at}[${index}]`));
  if (value && typeof value === "object") return Object.entries(value).forEach(([key, child]) => {
    if (FORBIDDEN.test(key) && !SAFE_KEYS.has(key)) fail("SECRET_PATTERN_DETECTED", `${at}.${key}`);
    scan(child, `${at}.${key}`, /sha256$/i.test(key) && typeof child === "string" && SHA.test(child));
  });
  if (typeof value === "string" && FORBIDDEN_VALUE.test(value)) fail("SECRET_PATTERN_DETECTED", at);
  if (!trustedDigest && typeof value === "string" && FORBIDDEN_PII_VALUE.test(value)) fail("SECRET_PATTERN_DETECTED", at);
}

function controlledFile(root, relativePath) {
  if (typeof relativePath !== "string" || !relativePath || isAbsolute(relativePath) || relativePath.split(/[\\/]/).includes("..")) fail("EVIDENCE_PATH_ESCAPE", String(relativePath));
  const resolvedRoot = realpathSync(resolve(root));
  const candidate = resolve(resolvedRoot, relativePath);
  if (!candidate.startsWith(`${resolvedRoot}${sep}`) || !existsSync(candidate) || lstatSync(candidate).isSymbolicLink()) fail("EVIDENCE_PATH_ESCAPE", relativePath);
  const actual = realpathSync(candidate);
  if (!actual.startsWith(`${resolvedRoot}${sep}`) || !statSync(actual).isFile()) fail("EVIDENCE_PATH_ESCAPE", relativePath);
  return actual;
}

export function buildEvidenceIndex(evidenceRoot, declarations) {
  const root = realpathSync(resolve(evidenceRoot));
  if ((statSync(root).mode & 0o777) !== 0o700) fail("UNSAFE_FILE_PERMISSION", "evidence root must be 0700");
  const seenHash = new Set();
  return declarations.map(({ kind, relativePath }) => {
    const file = controlledFile(root, relativePath);
    if ((statSync(file).mode & 0o777) !== 0o600) fail("UNSAFE_FILE_PERMISSION", relativePath);
    const bytes = readFileSync(file);
    const content = bytes.toString("utf8");
    if (FORBIDDEN_VALUE.test(content)) fail("SECRET_PATTERN_DETECTED", relativePath);
    if (/\.jsonl?$/.test(relativePath)) {
      const rows = relativePath.endsWith(".jsonl") ? content.trim().split("\n").filter(Boolean).map(JSON.parse) : [JSON.parse(content)];
      rows.forEach((row, index) => scan(row, `${relativePath}[${index}]`));
    }
    const digest = sha256(bytes);
    if (seenHash.has(digest)) fail("EVIDENCE_HASH_DUPLICATE", digest);
    seenHash.add(digest);
    return { kind, relativePath, sha256: digest, bytes: bytes.length, mode: "0600", redacted: true };
  }).sort((left, right) => left.sha256.localeCompare(right.sha256));
}

export function writeImmutableManifest(outputPath, manifest) {
  verifyManifest(manifest);
  scan(manifest);
  const absolute = resolve(outputPath);
  mkdirSync(dirname(absolute), { recursive: true, mode: 0o700 });
  chmodSync(dirname(absolute), 0o700);
  const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  if (existsSync(absolute)) {
    if (lstatSync(absolute).isSymbolicLink() || !statSync(absolute).isFile() || (statSync(absolute).mode & 0o777) !== 0o600) fail("UNSAFE_FILE_PERMISSION", basename(absolute));
    const current = readFileSync(absolute);
    if (!current.equals(bytes)) fail("MANIFEST_IMMUTABLE", basename(absolute));
    return { path: absolute, sha256: manifestHash(manifest), bytes: current.length };
  }
  writeFileSync(absolute, bytes, { flag: "wx", mode: 0o600 });
  chmodSync(absolute, 0o600);
  return { path: absolute, sha256: manifestHash(manifest), bytes: bytes.length };
}

export function verifyManifestChain(records, options = {}) {
  if (!Array.isArray(records) || records.length === 0) fail("MANIFEST_CHAIN_EMPTY", "at least one manifest is required");
  const hashes = new Map();
  const successor = new Map();
  const first = records[0]?.manifest;
  for (const record of records) {
    if (!record || !record.manifest || !SHA.test(record.sha256 ?? "")) fail("MANIFEST_CHAIN_INVALID", "record shape");
    if (hashes.has(record.sha256)) fail("MANIFEST_CHAIN_DUPLICATE", record.sha256);
    hashes.set(record.sha256, record.manifest);
    if (record.manifest.parentRunId !== first.parentRunId || canonicalJson(record.manifest.triple) !== canonicalJson(first.triple)) fail("MANIFEST_SUPERSEDE_BINDING_MISMATCH", record.sha256);
  }
  for (const record of records) {
    const previous = record.manifest.supersedesManifestSha256;
    if (!previous) continue;
    if (!hashes.has(previous)) fail("MANIFEST_SUPERSEDE_BROKEN", previous);
    if (successor.has(previous)) fail("MANIFEST_SUPERSEDE_FORK", previous);
    successor.set(previous, record.sha256);
  }
  for (const start of hashes.keys()) {
    const path = new Set();
    let cursor = start;
    while (cursor && hashes.has(cursor)) {
      if (path.has(cursor)) fail("MANIFEST_SUPERSEDE_CYCLE", cursor);
      path.add(cursor);
      cursor = successor.get(cursor);
    }
  }
  const roots = records.filter(({ manifest }) => !manifest.supersedesManifestSha256);
  if (roots.length !== 1) fail("MANIFEST_SUPERSEDE_ROOT_INVALID", String(roots.length));
  const visited = new Set();
  let cursor = roots[0].sha256;
  while (cursor) {
    if (visited.has(cursor)) fail("MANIFEST_SUPERSEDE_CYCLE", cursor);
    visited.add(cursor);
    cursor = successor.get(cursor);
  }
  if (visited.size !== records.length) fail("MANIFEST_SUPERSEDE_DISCONNECTED", `${visited.size}/${records.length}`);
  const stateOrder = ["planned", "provisioned", "extracting", "loading", "verifying", "uat_ready", "rollback_ready", "cleaned"];
  for (const [previousHash, nextHash] of successor) {
    const previous = hashes.get(previousHash);
    const next = hashes.get(nextHash);
    const previousIndex = stateOrder.indexOf(previous.state);
    const nextIndex = stateOrder.indexOf(next.state);
    if (previousIndex < 0 || nextIndex < previousIndex || nextIndex > previousIndex + 1) fail("MANIFEST_STATE_TRANSITION_INVALID", `${previous.state} -> ${next.state}`);
  }
  for (const record of records) {
    verifyManifest(record.manifest, options);
    if (manifestHash(record.manifest) !== record.sha256) fail("MANIFEST_TAMPERED", record.sha256);
  }
  return { ok: true, rootSha256: roots[0].sha256, headSha256: [...visited].at(-1), length: records.length };
}

function parse(argv) {
  const args = { command: argv[0] };
  for (let i = 1; i < argv.length; i += 1) {
    if (argv[i] === "--chain") args.chain = argv[++i];
    else fail("CLI_ARGUMENT_INVALID", argv[i]);
  }
  return args;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  try {
    const args = parse(process.argv.slice(2));
    if (args.command !== "verify-chain" || !args.chain) fail("CLI_ARGUMENT_INVALID", "verify-chain --chain <json>");
    const rows = JSON.parse(readFileSync(resolve(args.chain), "utf8"));
    process.stdout.write(`${JSON.stringify(verifyManifestChain(rows))}\n`);
  } catch (error) {
    const code = error instanceof ManifestChainError || error instanceof ContractError ? error.code : "MANIFEST_TOOL_ERROR";
    process.stderr.write(`${code}: ${error.message}\n`); process.exitCode = 1;
  }
}
