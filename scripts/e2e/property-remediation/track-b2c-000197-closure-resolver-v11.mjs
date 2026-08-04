import { builtinModules } from "node:module";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import process from "node:process";
import ts from "typescript";

export const FORMAL_CHILD_ENTRIES_V11 = Object.freeze([
  "scripts/e2e/property-remediation/tests/b2c-000197-preliminary-executor-v11.spec.mjs",
  "scripts/e2e/property-remediation/tests/b2c-000197-preliminary-orchestrator-v11.spec.mjs",
  "scripts/e2e/property-remediation/tests/b2c-000197-capability-closure-v11.spec.mjs",
  "scripts/e2e/property-remediation/tests/b2c-000197-recursive-closure-v11.spec.mjs",
  "scripts/e2e/property-remediation/tests/b2c-000197-frozen-closure-v11.spec.mjs",
  "scripts/e2e/property-remediation/tests/b2c-approval-index-forward-fix.spec.mjs",
  "apps/api/src/modules/property-approvals/property-approval.port.pg-cli.spec.ts",
  "apps/api/src/modules/property-approvals/property-approval.port.pg.spec.ts",
  "apps/api/src/modules/property-approvals/property-approval.port.pg-cli.ts",
]);

export const TYPECHECK_GOVERNANCE_FILES_V11 = Object.freeze([
  "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.base.json",
  "apps/api/package.json", "apps/api/tsconfig.json", "packages/shared/package.json",
]);

const BUILTINS = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);
const SOURCE_EXTENSIONS = ["", ".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs", ".json", ".d.ts"];
const INDEX_FILES = ["index.ts", "index.tsx", "index.mts", "index.cts", "index.js", "index.mjs", "index.cjs", "index.d.ts"];

const inside = (root, path) => path === root || path.startsWith(`${root}${sep}`);
const normalize = (root, path) => relative(root, path).split(sep).join("/");

function repositoryPath(root, candidate) {
  if (!existsSync(candidate)) return null;
  const canonical = realpathSync(candidate);
  if (!inside(root, canonical) || canonical.includes(`${sep}node_modules${sep}`) || statSync(canonical).isDirectory()) return null;
  return canonical;
}

function relativeCandidate(root, importer, specifier) {
  const base = resolve(dirname(importer), specifier);
  for (const suffix of SOURCE_EXTENSIONS) {
    const found = repositoryPath(root, `${base}${suffix}`); if (found) return found;
  }
  if (existsSync(base) && statSync(base).isDirectory()) {
    for (const name of INDEX_FILES) { const found = repositoryPath(root, resolve(base, name)); if (found) return found; }
  }
  return null;
}

function tsconfig(root) {
  const path = resolve(root, "apps/api/tsconfig.json");
  const loaded = ts.readConfigFile(path, ts.sys.readFile);
  if (loaded.error) throw new Error(`v11-tsconfig-read:${JSON.stringify(loaded.error)}`);
  const parsed = ts.parseJsonConfigFileContent(loaded.config, ts.sys, dirname(path), { noEmit: true }, path);
  if (parsed.errors.length) throw new Error(`v11-tsconfig-parse:${JSON.stringify(parsed.errors)}`);
  return parsed;
}

export function compilerRepositoryFilesV11(rootInput = process.cwd()) {
  const root = realpathSync(resolve(rootInput)); const parsed = tsconfig(root);
  const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });
  const files = new Set();
  for (const source of program.getSourceFiles()) {
    const canonical = realpathSync(source.fileName);
    if (inside(root, canonical) && !canonical.includes(`${sep}node_modules${sep}`)) files.add(normalize(root, canonical));
  }
  return Object.freeze([...files].sort());
}

export function parseTscListFilesV11(stdout, rootInput = process.cwd()) {
  const root = realpathSync(resolve(rootInput)); const files = new Set();
  for (const line of String(stdout).split(/\r?\n/u).filter(Boolean)) {
    if (!isAbsolute(line) || !existsSync(line)) continue;
    const canonical = realpathSync(line);
    if (inside(root, canonical) && !canonical.includes(`${sep}node_modules${sep}`)) files.add(normalize(root, canonical));
  }
  return Object.freeze([...files].sort());
}

function resolveSpecifier(root, importer, specifier, compilerOptions) {
  if (specifier.startsWith("node:") || BUILTINS.has(specifier)) return { kind: "builtin", value: specifier };
  if (specifier.startsWith(".") || specifier.startsWith("/")) {
    const found = relativeCandidate(root, importer, specifier);
    return found ? { kind: "repository", value: found } : { kind: "unresolved", value: specifier };
  }
  const resolved = ts.resolveModuleName(specifier, importer, compilerOptions, ts.sys).resolvedModule?.resolvedFileName;
  if (resolved && existsSync(resolved)) {
    const canonical = realpathSync(resolved);
    if (inside(root, canonical) && !canonical.includes(`${sep}node_modules${sep}`)) {
      return { kind: "repository", value: canonical };
    }
  }
  if (specifier.startsWith("@jinhu/")) return { kind: "unresolved", value: specifier };
  return { kind: "external", value: specifier };
}

export function classifySpecifierV11(importerInput, specifier, rootInput = process.cwd()) {
  const root = realpathSync(resolve(rootInput)); const importer = realpathSync(resolve(importerInput));
  const result = resolveSpecifier(root, importer, specifier, tsconfig(root).options);
  return result.kind === "repository" ? { kind: result.kind, value: normalize(root, result.value) } : result;
}

function importedSpecifiers(path) {
  if (!/[.](?:[cm]?[jt]s|tsx)$/u.test(path)) return [];
  const source = readFileSync(path, "utf8");
  const preprocessed = ts.preProcessFile(source, true, true);
  return [...preprocessed.importedFiles, ...preprocessed.referencedFiles].map(({ fileName }) => fileName);
}

export function resolveFormalExecutionClosureV11(rootInput = process.cwd()) {
  const root = realpathSync(resolve(rootInput)); const parsed = tsconfig(root);
  const repository = new Set([...compilerRepositoryFilesV11(root), ...FORMAL_CHILD_ENTRIES_V11,
    ...TYPECHECK_GOVERNANCE_FILES_V11].map((path) => normalize(root, realpathSync(resolve(root, path)))));
  const queue = [...repository].map((path) => resolve(root, path)); const visited = new Set();
  const builtin = new Map(); const external = new Map(); const unresolved = [];
  const record = (map, specifier, importer) => {
    const values = map.get(specifier) ?? new Set(); values.add(normalize(root, importer)); map.set(specifier, values);
  };
  while (queue.length) {
    const importer = realpathSync(queue.shift()); const importerKey = normalize(root, importer);
    if (visited.has(importerKey)) continue; visited.add(importerKey);
    for (const specifier of importedSpecifiers(importer)) {
      const resolved = resolveSpecifier(root, importer, specifier, parsed.options);
      if (resolved.kind === "repository") {
        const path = normalize(root, resolved.value);
        if (!repository.has(path)) { repository.add(path); queue.push(resolved.value); }
      } else if (resolved.kind === "builtin") record(builtin, resolved.value, importer);
      else if (resolved.kind === "external") record(external, resolved.value, importer);
      else unresolved.push({ importer: importerKey, specifier });
    }
  }
  record(external, "ts-node/register", resolve(root, "apps/api/package.json"));
  if (unresolved.length) {
    throw new Error(`b2c-000197-v11-unresolved-repository-specifiers:${JSON.stringify(unresolved)}`);
  }
  const classify = (map) => [...map].sort(([left], [right]) => left.localeCompare(right)).map(([specifier, importers]) =>
    ({ specifier, importers: [...importers].sort() }));
  return Object.freeze({ repositoryFiles: Object.freeze([...repository].sort()),
    compilerFiles: compilerRepositoryFilesV11(root), builtin: Object.freeze(classify(builtin)),
    external: Object.freeze(classify(external)), unresolved: Object.freeze([]) });
}

export function assertTscFileListMatchesV11(stdout, rootInput = process.cwd()) {
  const compiler = compilerRepositoryFilesV11(rootInput); const actual = parseTscListFilesV11(stdout, rootInput);
  if (JSON.stringify(compiler) !== JSON.stringify(actual)) {
    const expected = new Set(compiler); const observed = new Set(actual);
    throw new Error(`b2c-000197-v11-tsc-file-list-drift:${JSON.stringify({
      missing: compiler.filter((path) => !observed.has(path)), excess: actual.filter((path) => !expected.has(path)) })}`);
  }
  return { files: actual.length };
}
