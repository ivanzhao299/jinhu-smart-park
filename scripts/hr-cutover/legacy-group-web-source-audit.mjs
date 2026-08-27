#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { verifyLegacyGroupWebModuleMapping } from "./legacy-group-web-module-mapping-lib.mjs";

export class LegacyGroupWebSourceAuditError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyGroupWebSourceAuditError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new LegacyGroupWebSourceAuditError(code, detail); };
const normalize = value => value.replaceAll("\\", "/").replace(/^\.\//, "").replace(/^\//, "");
const stripQuery = value => normalize(value.split(/[?#]/, 1)[0]);
const unique = values => [...new Set(values)].sort();
const count = (source, pattern) => [...source.matchAll(pattern)].length;

async function filesUnder(root) {
  const result = [];
  const pending = [root];
  while (pending.length) {
    const directory = pending.pop();
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) pending.push(path);
      else if (entry.isFile()) result.push(path);
    }
  }
  return result;
}

function references(source) {
  const values = [];
  for (const pattern of [
    /(?:href|src|action)\s*=\s*["']([^"']+\.asp(?:[?#][^"']*)?)["']/gi,
    /["']([^"']+\.asp(?:[?#][^"']*)?)["']/gi,
    /<!--\s*#include\s+(?:file|virtual)\s*=\s*["']([^"']+\.asp)["']\s*-->/gi
  ]) for (const match of source.matchAll(pattern)) values.push(match[1]);
  return unique(values);
}

function sourceFacts(source) {
  const controlNames = unique([...source.matchAll(/<(?:input|select|textarea)\b[^>]*\bname\s*=\s*["']?([^\s"'>]+)/gi)].map(match => match[1]));
  const requestKeys = unique([
    ...[...source.matchAll(/Request(?:\.(?:Form|QueryString))?\s*\(\s*["']([^"']+)["']\s*\)/gi)].map(match => match[1]),
    ...[...source.matchAll(/Request(?:\.(?:Form|QueryString))?\s*\[\s*["']([^"']+)["']\s*\]/gi)].map(match => match[1])
  ]);
  const formActions = unique([...source.matchAll(/<form\b[^>]*\baction\s*=\s*["']?([^\s"'>]+)/gi)].map(match => match[1]));
  return {
    forms: count(source, /<form\b/gi),
    controls: controlNames.length,
    requestKeys: requestKeys.length,
    formActions: formActions.length,
    selectStatements: count(source, /\bselect\b[\s\S]{0,80}\bfrom\b/gi),
    insertStatements: count(source, /\binsert\s+into\b/gi),
    updateStatements: count(source, /\bupdate\s+[\[\]A-Za-z0-9_.]+\s+set\b/gi),
    deleteStatements: count(source, /\bdelete\s+from\b/gi),
    stateTransitions: count(source, /\b(?:approve|audit|check|state|status|statu|submit|cancel|close)\b/gi),
    controlsHash: createHash("sha256").update(controlNames.join("\n")).digest("hex"),
    requestKeysHash: createHash("sha256").update(requestKeys.join("\n")).digest("hex")
  };
}

export async function auditLegacyGroupWebSource({ sourceRoot, moduleMapPath }) {
  if (!isAbsolute(sourceRoot) || !isAbsolute(moduleMapPath)) fail("GROUP_WEB_SOURCE_AUDIT_PATH_INVALID", "absolute paths are required at runtime");
  const moduleMap = JSON.parse(await readFile(moduleMapPath, "utf8"));
  verifyLegacyGroupWebModuleMapping(moduleMap);
  const files = await filesUnder(sourceRoot);
  const index = new Map(files.map(path => [normalize(relative(sourceRoot, path)).toLowerCase(), path]));
  const aspFiles = files.filter(path => path.toLowerCase().endsWith(".asp"));
  const decoder = new TextDecoder("gb18030", { fatal: false });
  const items = [];
  for (const module of moduleMap.items.filter(item => item.legacyUrl && !/^\d+$/.test(item.legacyUrl))) {
    const entryRelative = stripQuery(module.legacyUrl);
    const entryPath = index.get(entryRelative.toLowerCase());
    if (!entryPath) fail("GROUP_WEB_SOURCE_ENTRY_MISSING", `${module.legacyId}:${entryRelative}`);
    const scope = entryRelative.includes("/") ? entryRelative.slice(0, entryRelative.lastIndexOf("/") + 1).toLowerCase() : "";
    const visited = new Set();
    const pending = [{ relativePath: entryRelative.toLowerCase(), depth: 0 }];
    const aggregate = { forms: 0, controls: 0, requestKeys: 0, formActions: 0, selectStatements: 0, insertStatements: 0, updateStatements: 0, deleteStatements: 0, stateTransitions: 0 };
    const hashes = [];
    while (pending.length) {
      const current = pending.shift();
      if (visited.has(current.relativePath) || visited.size >= 120) continue;
      const currentPath = index.get(current.relativePath);
      if (!currentPath) continue;
      visited.add(current.relativePath);
      const source = decoder.decode(await readFile(currentPath));
      const facts = sourceFacts(source);
      for (const key of Object.keys(aggregate)) aggregate[key] += facts[key];
      hashes.push(facts.controlsHash, facts.requestKeysHash);
      if (current.depth >= 3) continue;
      const base = current.relativePath.includes("/") ? current.relativePath.slice(0, current.relativePath.lastIndexOf("/") + 1) : "";
      for (const reference of references(source)) {
        if (/^(?:https?:|javascript:|mailto:)/i.test(reference)) continue;
        const candidate = stripQuery(reference).toLowerCase();
        const resolved = /^[\\/]/.test(reference) ? candidate : normalize(resolve("/", base, candidate)).toLowerCase();
        if (!resolved.startsWith(scope) || !index.has(resolved) || visited.has(resolved)) continue;
        pending.push({ relativePath: resolved, depth: current.depth + 1 });
      }
    }
    items.push({
      legacyId: module.legacyId,
      domain: module.domain,
      entryResolved: true,
      traversedAspFiles: visited.size,
      ...aggregate,
      fieldEvidenceHash: createHash("sha256").update(hashes.sort().join("\n")).digest("hex")
    });
  }
  const auditHash = createHash("sha256").update(JSON.stringify(items)).digest("hex");
  return {
    formatVersion: 1,
    auditKind: "yuzhou_hr_legacy_group_web_deployed_source",
    sourceInventoryHash: moduleMap.sourceInventoryHash,
    operationMode: "read_only",
    sourceBoundary: { files: files.length, classicAspFiles: aspFiles.length },
    navigableModules: items.length,
    auditHash,
    items,
    security: { sourceFilesCommitted: false, sourceValuesCommitted: false, credentialsRecorded: false, personalValuesRecorded: false },
    productionImport: "HOLD"
  };
}

async function main() {
  const args = process.argv.slice(2);
  const sourceIndex = args.indexOf("--source-root");
  const mapIndex = args.indexOf("--module-map");
  if (sourceIndex < 0 || mapIndex < 0 || !args[sourceIndex + 1] || !args[mapIndex + 1]) fail("GROUP_WEB_SOURCE_AUDIT_ARGUMENT_INVALID", "--source-root and --module-map are required");
  const report = await auditLegacyGroupWebSource({ sourceRoot: resolve(args[sourceIndex + 1]), moduleMapPath: resolve(args[mapIndex + 1]) });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
