import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { Buffer } from "node:buffer";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { canonicalSha256, exactKeys, repoRoot, resolveInside, sha256 } from "./lib.mjs";

const require = createRequire(resolve(repoRoot, "apps/web/package.json"));
const ts = require("typescript");

const TEST_PATH_PATTERN = /(?:^|\/)[^/]+\.(?:spec|test)\.[^/]+$/u;

function contractFor(rehearsalCase) {
  const contract = rehearsalCase.rollbackSemanticContract;
  if (!contract) throw new Error(`rollback semantic contract is missing: ${rehearsalCase.id}`);
  exactKeys(contract, ["mustChangeProductionPaths", "postApply", "retainedShell", "protectedExternalPaths", "immutableTestPaths", "allowedInvariantIds", "allowedGateIds"], "rollback semantic contract");
  if (!Array.isArray(contract.mustChangeProductionPaths) || contract.mustChangeProductionPaths.length === 0) throw new Error("semantic contract requires a production path change");
  if (!Array.isArray(contract.postApply) || contract.postApply.length === 0) throw new Error("semantic contract requires post-apply anchors");
  for (const name of ["retainedShell", "protectedExternalPaths", "immutableTestPaths", "allowedInvariantIds", "allowedGateIds"]) if (!Array.isArray(contract[name])) throw new Error(`semantic contract ${name} must be an array`);
  return contract;
}

export function assertSemanticContractsReady(profile) {
  const missing = profile.cases.filter(({ rollbackSemanticContract }) => !rollbackSemanticContract).map(({ id }) => id);
  if (missing.length > 0) throw new Error(`formal rollback is blocked until every case has a semantic contract: ${missing.join(",")}`);
  for (const rehearsalCase of profile.cases) contractFor(rehearsalCase);
  return true;
}

export function protectedRollbackPaths(profile, rehearsalCase) {
  return new Set([
    ...profile.cases.flatMap(({ targetedTestFiles = [] }) => targetedTestFiles),
    ...profile.commandSpec.postgresqlFiles,
    profile.commandSpec.canonicalPortFile,
    profile.commandSpec.contractFile,
    ...contractFor(rehearsalCase).protectedExternalPaths.map(({ path }) => path)
  ]);
}

function globRegex(pattern) {
  let expression = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "*" && pattern[index + 1] === "*" && pattern[index + 2] === "/") { expression += "(?:.*/)?"; index += 2; }
    else if (character === "*" && pattern[index + 1] === "*") { expression += ".*"; index += 1; }
    else if (character === "*") expression += "[^/]*";
    else if (character === "?") expression += "[^/]";
    else expression += character.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  }
  return new RegExp(`${expression}$`, "u");
}

export function immutablePathMatches(path, patterns) { return patterns.some((pattern) => globRegex(pattern).test(path)); }
export function immutableSyntheticAnchorId(path) { return `immutable-test:${path}`; }

export function expandImmutableTestPaths(root, patterns) {
  const files = new Set();
  const visit = (relativePath, matcher) => {
    const absolute = resolveInside(root, relativePath, "immutable test path"); const info = lstatSync(absolute);
    if (info.isSymbolicLink()) throw new Error(`immutable test path is a symlink: ${relativePath}`);
    if (info.isDirectory()) for (const name of readdirSync(absolute)) visit(relativePath ? `${relativePath}/${name}` : name, matcher);
    else if (info.isFile() && matcher.test(relativePath)) files.add(relativePath);
  };
  for (const pattern of patterns) {
    const matcher = globRegex(pattern); const wildcardAt = pattern.search(/[?*]/u);
    const prefix = wildcardAt < 0 ? pattern : pattern.slice(0, wildcardAt).replace(/[^/]*$/u, "").replace(/\/$/u, "");
    const start = prefix || ""; const absolute = resolveInside(root, start, "immutable test glob root");
    if (!existsSync(absolute)) throw new Error(`immutable test glob root is absent: ${start || "."}`);
    visit(start, matcher);
  }
  const result = [...files].sort();
  if (result.length === 0) throw new Error("immutable test patterns expand to an empty set");
  return result;
}

export function assertRollbackPatchPathAllowed(path, profile, rehearsalCase) {
  const contract = contractFor(rehearsalCase);
  if (TEST_PATH_PATTERN.test(path)
    || path.startsWith("scripts/e2e/")
    || path.startsWith(".trellis/")
    || path.startsWith("database/migrations/")
    || protectedRollbackPaths(profile, rehearsalCase).has(path)
    || immutablePathMatches(path, contract.immutableTestPaths)) {
    throw new Error(`rollback patch may not modify a protected verification/contract path: ${path}`);
  }
  return path;
}

function validateAnchor(anchor, label) {
  exactKeys(anchor, ["id", "intentGroupId", "path", "pathState", "mustContain", "mustNotContain", "mustMatch", "mustNotMatch", "astMatchers"], label);
  if (![anchor.id, anchor.intentGroupId, anchor.path].every((value) => typeof value === "string" && value.length > 0)
    || !["present", "absent"].includes(anchor.pathState) || !Array.isArray(anchor.mustContain) || !Array.isArray(anchor.mustNotContain)
    || !Array.isArray(anchor.mustMatch) || !Array.isArray(anchor.mustNotMatch) || !Array.isArray(anchor.astMatchers)
    || anchor.mustContain.length + anchor.mustNotContain.length + anchor.mustMatch.length + anchor.mustNotMatch.length + anchor.astMatchers.length === 0
    || [...anchor.mustContain, ...anchor.mustNotContain, ...anchor.mustMatch, ...anchor.mustNotMatch].some((value) => typeof value !== "string" || value.length === 0)
    || anchor.astMatchers.some((entry) => {
      try { exactKeys(entry, ["kind", "name", "source", "owner", "enclosingOwner", "minCount", "maxCount"], "AST matcher contract"); } catch { return true; }
      return !["identifier", "import", "class", "provider", "constructorParameter", "call", "awaitedCall", "export"].includes(entry.kind) || typeof entry.name !== "string" || entry.name.length === 0 || typeof entry.source !== "string" || typeof entry.owner !== "string" || typeof entry.enclosingOwner !== "string" || !Number.isSafeInteger(entry.minCount) || !Number.isSafeInteger(entry.maxCount) || entry.minCount < 0 || entry.maxCount < entry.minCount;
    })
  ) throw new Error(`invalid ${label}`);
  return anchor;
}

function validateRetainedShell(shell) {
  const { allowsIntentionalOmission, ...anchor } = shell;
  validateAnchor(anchor, "retained-shell contract");
  if (anchor.pathState !== "present" || typeof allowsIntentionalOmission !== "boolean" || anchor.astMatchers.length === 0) throw new Error("invalid retained-shell contract");
  return shell;
}

function validateExternal(anchor) {
  const { allowsIntentionalOmission, ...shared } = anchor;
  validateAnchor(shared, "protected external anchor");
  if (allowsIntentionalOmission !== true) throw new Error("protected external anchors must explicitly allow intentional omission");
  return anchor;
}

function readContractFile(root, path) {
  const absolute = resolveInside(root, path, "semantic contract file");
  if (!existsSync(absolute)) return null;
  const info = lstatSync(absolute);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`semantic contract path is not a regular file: ${path}`);
  return readFileSync(absolute, "utf8");
}

function astCounts(path, text, matchers) {
  const counts = new Map(matchers.map((matcher) => [matcher, 0]));
  if (!/\.[cm]?[jt]sx?$/u.test(path)) return counts;
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const identifierName = (node) => ts.isIdentifier(node) ? node.text : ts.isPropertyAccessExpression(node) ? node.name.text : "";
  const ownerName = (node) => ts.isPropertyAccessExpression(node) ? node.expression.getText(source) : "";
  const enclosingOwner = (node) => {
    let current = node.parent;
    while (current) {
      if ((ts.isMethodDeclaration(current) || ts.isFunctionDeclaration(current) || ts.isFunctionExpression(current)) && current.name) return current.name.getText(source);
      if ((ts.isArrowFunction(current) || ts.isFunctionExpression(current)) && ts.isVariableDeclaration(current.parent) && ts.isIdentifier(current.parent.name)) return current.parent.name.text;
      current = current.parent;
    }
    return "";
  };
  const importMatches = (node, matcher) => {
    const clause = node.importClause;
    if (!clause) return false;
    if (clause.name?.text === matcher.name && (!matcher.owner || matcher.owner === clause.name.text)) return true;
    if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) return clause.namedBindings.name.text === matcher.name && (!matcher.owner || matcher.owner === clause.namedBindings.name.text);
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) return clause.namedBindings.elements.some((specifier) => {
      const imported = specifier.propertyName?.text ?? specifier.name.text; const local = specifier.name.text;
      return imported === matcher.name && (!matcher.owner || local === matcher.owner);
    });
    return false;
  };
  const moduleProviderNames = (node) => {
    if (!ts.isPropertyAssignment(node) || node.name.getText(source).replace(/["']/gu, "") !== "providers" || !ts.isArrayLiteralExpression(node.initializer)) return new Set();
    const metadata = node.parent; const call = metadata.parent; const decorator = call?.parent;
    if (!ts.isObjectLiteralExpression(metadata) || !ts.isCallExpression(call) || call.arguments[0] !== metadata || !ts.isIdentifier(call.expression) || call.expression.text !== "Module" || !ts.isDecorator(decorator)) return new Set();
    return new Set(node.initializer.elements.filter(ts.isIdentifier).map(({ text: name }) => name));
  };
  const visit = (node) => {
    for (const matcher of matchers) {
      let matched = false;
      if (matcher.kind === "identifier") matched = ts.isIdentifier(node) && node.text === matcher.name;
      else if (matcher.kind === "class") matched = ts.isClassDeclaration(node) && node.name?.text === matcher.name;
      else if (matcher.kind === "import" && ts.isImportDeclaration(node)) matched = node.moduleSpecifier.text === matcher.source && importMatches(node, matcher);
      else if (matcher.kind === "provider") matched = moduleProviderNames(node).has(matcher.name);
      else if (matcher.kind === "constructorParameter" && ts.isParameter(node) && ts.isConstructorDeclaration(node.parent)) matched = (identifierName(node.name) === matcher.name || node.type?.getText(source) === matcher.name) && (!matcher.owner || node.parent.parent.name?.text === matcher.owner);
      else if (["call", "awaitedCall"].includes(matcher.kind) && ts.isCallExpression(node)) matched = identifierName(node.expression) === matcher.name && (!matcher.owner || ownerName(node.expression) === matcher.owner) && (matcher.kind !== "awaitedCall" || ts.isAwaitExpression(node.parent));
      else if (matcher.kind === "export") matched = (ts.isExportSpecifier(node) && identifierName(node.name) === matcher.name) || ((ts.isClassDeclaration(node) || ts.isFunctionDeclaration(node)) && node.name?.text === matcher.name && node.modifiers?.some(({ kind }) => kind === ts.SyntaxKind.ExportKeyword));
      if (matched && matcher.enclosingOwner && enclosingOwner(node) !== matcher.enclosingOwner) matched = false;
      if (matched) counts.set(matcher, counts.get(matcher) + 1);
    }
    ts.forEachChild(node, visit);
  };
  visit(source); return counts;
}

function anchorPasses(anchor, text) {
  if (anchor.pathState === "absent") return text === null;
  if (text === null) return false;
  const counts = astCounts(anchor.path, text, anchor.astMatchers);
  return anchor.mustContain.every((token) => text.includes(token))
    && anchor.mustNotContain.every((token) => !text.includes(token))
    && anchor.mustMatch.every((pattern) => new RegExp(pattern, "u").test(text))
    && anchor.mustNotMatch.every((pattern) => !new RegExp(pattern, "u").test(text))
    && anchor.astMatchers.every((matcher) => counts.get(matcher) >= matcher.minCount && counts.get(matcher) <= matcher.maxCount);
}

export function captureImmutableTestFiles(root, rehearsalCase) {
  const paths = expandImmutableTestPaths(root, contractFor(rehearsalCase).immutableTestPaths);
  return Object.fromEntries(paths.map((path) => { const text = readContractFile(root, path); if (text === null) throw new Error(`immutable test file is absent: ${path}`); return [path, sha256(text)]; }));
}

export function evaluateRollbackSemanticContract({ root, rehearsalCase, patch, immutableBefore, immutablePaths, readFile = (path) => readContractFile(root, path) }) {
  const contract = contractFor(rehearsalCase);
  const anchors = contract.postApply.map((entry) => validateAnchor(entry, "post-apply anchor"));
  const shells = contract.retainedShell.map(validateRetainedShell);
  const externals = contract.protectedExternalPaths.map(validateExternal);
  const allAnchors = [...anchors, ...shells, ...externals]; const anchorIds = new Set(allAnchors.map(({ id }) => id));
  if (anchorIds.size !== allAnchors.length) throw new Error("semantic contract anchor IDs must be unique");
  const expandedImmutablePaths = immutablePaths ?? expandImmutableTestPaths(root, contract.immutableTestPaths);
  const requiredPaths = [...new Set([...allAnchors.map(({ path }) => path), ...expandedImmutablePaths])];
  const files = Object.fromEntries(requiredPaths.map((path) => { const text = readFile(path); return [path, { sha256: text === null ? null : sha256(text), text }]; }));
  const anchorResults = anchors.map((anchor) => ({
    id: anchor.id,
    intentGroupId: anchor.intentGroupId,
    path: anchor.path,
    passed: anchorPasses(anchor, files[anchor.path].text)
  }));
  const shellResults = shells.map((shell) => ({ id: shell.id, intentGroupId: shell.intentGroupId, path: shell.path, passed: anchorPasses(shell, files[shell.path].text) }));
  const externalResults = externals.map((anchor) => ({ id: anchor.id, intentGroupId: anchor.intentGroupId, path: anchor.path, passed: anchorPasses(anchor, files[anchor.path].text) }));
  const groups = [...new Set([...anchors, ...shells].map(({ intentGroupId }) => intentGroupId))];
  if (anchorResults.some(({ passed }) => !passed)) throw new Error("a protected post-apply anchor is not satisfied");
  if (groups.some((group) => ![...anchorResults, ...shellResults].some((entry) => entry.intentGroupId === group && entry.passed))) throw new Error("a production intent group has no satisfied post-apply anchor");
  if (shellResults.some(({ passed }) => !passed)) throw new Error("a retained-shell contract is not satisfied");
  if (externalResults.some(({ passed }) => !passed)) throw new Error("a protected external contract is not satisfied");
  const changedPaths = new Set(patch.semanticChangedPaths);
  const intentPaths = new Set([...anchors, ...shells].map(({ path }) => path));
  if (patch.paths.some((path) => !intentPaths.has(path))) throw new Error("rollback patch contains a production path without an intent-group contract");
  if (contract.mustChangeProductionPaths.some((path) => !changedPaths.has(path))) throw new Error("rollback patch lacks a required non-comment production change");
  const omitted = patch.deviations.filter(({ action }) => action === "intentionally-omitted");
  if (omitted.length === patch.deviations.length) throw new Error("rollback patch may not intentionally omit the entire case");
  for (const deviation of omitted) {
    if (immutablePathMatches(deviation.path, contract.immutableTestPaths) && deviation.contractAnchorId === immutableSyntheticAnchorId(deviation.path)) continue;
    const anchor = [...shells, ...externals].find(({ id }) => id === deviation.contractAnchorId);
    const passed = [...shellResults, ...externalResults].find(({ id }) => id === anchor?.id)?.passed;
    if (!anchor?.allowsIntentionalOmission || !passed) throw new Error("intentional omission lacks an explicitly allowed retained-shell/external anchor");
  }
  const immutableAfter = Object.fromEntries(expandedImmutablePaths.map((path) => [path, files[path]?.sha256 ?? null]));
  const frozenBefore = immutableBefore ?? immutableAfter;
  if (canonicalSha256(immutableAfter) !== canonicalSha256(frozenBefore) || Object.values(immutableAfter).some((value) => value === null)) throw new Error("immutable test expansion/blob SHA changed across rollback");
  const result = {
    schemaVersion: "property-track-c-rollback-semantic-result-v1",
    status: "PASS",
    contractSha256: canonicalSha256(contract),
    patchSha256: patch.sha256,
    semanticChangedPaths: [...changedPaths].sort(),
    files: Object.fromEntries(Object.entries(files).map(([path, value]) => [path, value.sha256])),
    immutableTestFilesBefore: frozenBefore,
    immutableTestFilesAfter: immutableAfter,
    anchors: anchorResults,
    retainedShells: shellResults,
    protectedExternalPaths: externalResults
  };
  return { result, resultSha256: canonicalSha256(result), fileContents: Object.fromEntries(Object.entries(files).map(([path, value]) => [path, value.text])) };
}

export function validateSemanticResult({ result, root, rehearsalCase, patch, readFile }) {
  const recomputed = evaluateRollbackSemanticContract({ root: resolve(root), rehearsalCase, patch, immutableBefore: result.immutableTestFilesBefore, immutablePaths: Object.keys(result.immutableTestFilesAfter).sort(), readFile }).result;
  if (canonicalSha256(result) !== canonicalSha256(recomputed)) throw new Error("semantic result differs from protected contract recomputation");
  return recomputed;
}

export function readSemanticFilesFromGitTree({ cwd, treeSha, paths }) {
  if (!/^[0-9a-f]{40}$/u.test(treeSha)) throw new Error("observed semantic tree SHA is invalid");
  const options = { cwd: resolve(cwd), env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8", TZ: "UTC" }, maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] };
  try { execFileSync("/usr/bin/git", ["cat-file", "-e", `${treeSha}^{tree}`], options); }
  catch { throw new Error("observed semantic tree object is unavailable"); }
  return Object.fromEntries(paths.map((path) => {
    try {
      const bytes = execFileSync("/usr/bin/git", ["cat-file", "blob", `${treeSha}:${path}`], { ...options, encoding: "buffer" });
      const text = bytes.toString("utf8");
      if (!Buffer.from(text, "utf8").equals(bytes)) throw new Error(`observed semantic tree contains non-UTF-8 bytes: ${path}`);
      return [path, text];
    } catch (error) {
      if (error.message?.startsWith("observed semantic tree contains")) throw error;
      return [path, null];
    }
  }));
}
