import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const here = resolve(fileURLToPath(new URL(".", import.meta.url)));
const root = resolve(here, "../../../..");
export const BASELINE_COMMIT = "f4797adf";
const paths = [
  "apps/api/src/modules/homestay/homestay.controller.ts",
  "apps/api/src/modules/homestay/dto",
  "apps/api/src/modules/housing/housing.controller.ts",
  "apps/api/src/modules/housing/dto",
  "packages/shared/src/property-business"
];

function sha(value) { return createHash("sha256").update(value).digest("hex"); }
function normalized(node, source) { return node.getText(source).replace(/\s+/gu, " ").trim(); }
function decorators(node, source) { return (ts.canHaveDecorators(node) ? ts.getDecorators(node) ?? [] : []).map((item) => normalized(item, source)); }
function modifiers(node) { return (node.modifiers ?? []).filter((item) => item.kind !== ts.SyntaxKind.Decorator).map((item) => ts.SyntaxKind[item.kind]); }

export function extractContract(path, text) {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const declarations = [];
  for (const node of source.statements) {
    if (ts.isClassDeclaration(node) && node.name) {
      const members = [];
      for (const member of node.members) {
        if (ts.isPropertyDeclaration(member)) {
          members.push({ kind: "property", decorators: decorators(member, source), modifiers: modifiers(member), name: normalized(member.name, source), optional: Boolean(member.questionToken), definite: Boolean(member.exclamationToken), type: member.type ? normalized(member.type, source) : null, initializer: member.initializer ? normalized(member.initializer, source) : null });
        } else if (ts.isMethodDeclaration(member) || ts.isGetAccessorDeclaration(member) || ts.isSetAccessorDeclaration(member)) {
          members.push({ kind: ts.SyntaxKind[member.kind], decorators: decorators(member, source), modifiers: modifiers(member), name: normalized(member.name, source), parameters: member.parameters.map((item) => normalized(item, source)), type: member.type ? normalized(member.type, source) : null });
        }
      }
      declarations.push({ kind: "class", name: node.name.text, decorators: decorators(node, source), modifiers: modifiers(node), members });
    } else if ((ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node)
      || ts.isFunctionDeclaration(node) || ts.isVariableStatement(node))
      && modifiers(node).includes("ExportKeyword")) {
      declarations.push({ kind: ts.SyntaxKind[node.kind], text: normalized(node, source).replace(/\{[\s\S]*\}$/u, (body) => ts.isFunctionDeclaration(node) ? "{}" : body) });
    } else if (ts.isExportDeclaration(node) || ts.isExportAssignment(node)) {
      declarations.push({ kind: ts.SyntaxKind[node.kind], text: normalized(node, source) });
    }
  }
  return { path, declarations };
}

function collect(path) {
  const absolute = join(root, path);
  if (statSync(absolute).isFile()) return [path];
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name).replaceAll("\\", "/");
    return entry.isDirectory() ? collect(child) : (/\.tsx?$/u.test(child) && !/\.(spec|test)\./u.test(child) ? [child] : []);
  });
}

function baselineFiles(commit) {
  return execFileSync("git", ["ls-tree", "-r", "--name-only", commit, "--", ...paths], { cwd: root, encoding: "utf8" }).trim().split("\n").filter((path) => /\.tsx?$/u.test(path) && !/\.(spec|test)\./u.test(path));
}

function snapshot(entries) {
  const json = JSON.stringify(entries.sort((a, b) => a.path.localeCompare(b.path)));
  return { sha256: sha(json), entries: JSON.parse(json) };
}

export function runContractGate(commit = BASELINE_COMMIT) {
  execFileSync("git", ["merge-base", "--is-ancestor", commit, "HEAD"], { cwd: root });
  const currentNames = paths.flatMap(collect).sort();
  const baseNames = baselineFiles(commit).sort();
  const current = snapshot(currentNames.map((path) => extractContract(path, readFileSync(join(root, path), "utf8"))));
  const baseline = snapshot(baseNames.map((path) => extractContract(path, execFileSync("git", ["show", `${commit}:${path}`], { cwd: root, encoding: "utf8" }))));
  const added = currentNames.filter((path) => !baseNames.includes(path));
  const removed = baseNames.filter((path) => !currentNames.includes(path));
  return { schemaVersion: "property-track-c-contract-gate-v1", baselineCommit: commit, status: current.sha256 === baseline.sha256 ? "PASS" : "FAIL", baselineSha256: baseline.sha256, currentSha256: current.sha256, added, removed };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = runContractGate();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status !== "PASS") process.exitCode = 1;
}
