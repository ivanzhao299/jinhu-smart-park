import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import test from "node:test";
import ts from "typescript";

const ROOT = resolve(process.cwd(), "apps/web/features/property-shared");
const ALLOWED_PACKAGES = new Set([
  "@jinhu/shared",
  "@jinhu/ui",
  "next",
  "next/link",
  "react"
]);
const FORBIDDEN_RUNTIME_IMPORTS = [
  "/app/homestay",
  "/app/housing",
  "/app/assets/parties",
  "/features/homestay",
  "/features/housing",
  "/lib/api",
  "/approval",
  "/identity"
];

function runtimeFiles(directory = ROOT): string[] {
  return readdirSync(directory)
    .flatMap((name) => {
      const path = join(directory, name);
      return statSync(path).isDirectory() ? runtimeFiles(path) : [path];
    })
    .filter((path) => [".ts", ".tsx"].includes(extname(path)))
    .filter((path) => !path.endsWith(".spec.ts"));
}

function sourceFile(path: string): ts.SourceFile {
  return ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
}

function moduleSpecifiers(file: ts.SourceFile): string[] {
  const imports: string[] = [];
  file.forEachChild((node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier
      && ts.isStringLiteral(node.moduleSpecifier)
    ) {
      imports.push(node.moduleSpecifier.text);
    }
  });
  return imports;
}

function resolveRelativeModule(owner: string, specifier: string): string | null {
  const candidate = resolve(dirname(owner), specifier);
  try {
    if (statSync(candidate).isFile()) return candidate;
  } catch {
    // Extensionless TypeScript imports are resolved below.
  }
  for (const suffix of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const path = `${candidate}${suffix}`;
    try {
      if (statSync(path).isFile()) return path;
    } catch {
      // Try the next TypeScript module shape.
    }
  }
  return null;
}

function functionName(node: ts.FunctionLikeDeclaration, file: ts.SourceFile): string {
  if (node.name) return node.name.getText(file);
  const parent = node.parent;
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return parent.name.text;
  }
  return "<anonymous>";
}

function functionComplexity(node: ts.FunctionLikeDeclaration): number {
  let complexity = 1;
  function visit(current: ts.Node) {
    if (
      current !== node.body
      && (
        ts.isFunctionDeclaration(current)
        || ts.isFunctionExpression(current)
        || ts.isArrowFunction(current)
        || ts.isMethodDeclaration(current)
      )
    ) {
      return;
    }
    if (
      ts.isIfStatement(current)
      || ts.isConditionalExpression(current)
      || ts.isForStatement(current)
      || ts.isForInStatement(current)
      || ts.isForOfStatement(current)
      || ts.isWhileStatement(current)
      || ts.isDoStatement(current)
      || ts.isCatchClause(current)
      || ts.isCaseClause(current)
    ) {
      complexity += 1;
    }
    ts.forEachChild(current, visit);
  }
  if (node.body) visit(node.body);
  return complexity;
}

test("runtime imports stay business-neutral and effect-free", () => {
  for (const path of runtimeFiles()) {
    const text = readFileSync(path, "utf8");
    const file = sourceFile(path);
    for (const specifier of moduleSpecifiers(file)) {
      if (specifier.startsWith(".")) {
        const resolved = resolveRelativeModule(path, specifier);
        assert.ok(resolved, `${relative(ROOT, path)} has unresolved import ${specifier}`);
        assert.ok(
          resolved.startsWith(`${ROOT}/`),
          `${relative(ROOT, path)} imports outside the foundation: ${specifier}`
        );
      } else {
        assert.ok(
          ALLOWED_PACKAGES.has(specifier),
          `${relative(ROOT, path)} imports unapproved package ${specifier}`
        );
      }
      assert.equal(
        FORBIDDEN_RUNTIME_IMPORTS.some((segment) => specifier.includes(segment)),
        false,
        `${relative(ROOT, path)} imports forbidden domain/Track B module ${specifier}`
      );
    }
    assert.doesNotMatch(text, /\b(?:apiRequest|apiFormRequest|fetch|useQuery|useMutation)\s*\(/);
    assert.doesNotMatch(text, /\b(?:Persona|Role)\b|:\s*operations\b/);
    assert.doesNotMatch(text, /\b(?:console\.(?:log|debug)|debugger)\b/);
  }
});

test("relative runtime dependency graph has no cycles", () => {
  const graph = new Map<string, string[]>();
  for (const path of runtimeFiles()) {
    const dependencies = moduleSpecifiers(sourceFile(path))
      .filter((specifier) => specifier.startsWith("."))
      .map((specifier) => resolveRelativeModule(path, specifier))
      .filter((dependency): dependency is string => Boolean(dependency));
    graph.set(path, dependencies);
  }

  const visited = new Set<string>();
  const active = new Set<string>();
  function visit(path: string, stack: readonly string[]) {
    assert.equal(
      active.has(path),
      false,
      `circular dependency: ${[...stack, path].map((item) => relative(ROOT, item)).join(" -> ")}`
    );
    if (visited.has(path)) return;
    active.add(path);
    for (const dependency of graph.get(path) ?? []) visit(dependency, [...stack, path]);
    active.delete(path);
    visited.add(path);
  }
  for (const path of graph.keys()) visit(path, []);
});

test("component and function boundaries remain reviewable", () => {
  for (const path of runtimeFiles()) {
    const text = readFileSync(path, "utf8");
    if (path.endsWith(".tsx")) {
      assert.ok(
        text.split(/\r?\n/).length <= 300,
        `${relative(ROOT, path)} exceeds the 300-line component-file limit`
      );
    }
    const file = sourceFile(path);
    function visit(node: ts.Node) {
      if (
        ts.isFunctionDeclaration(node)
        || ts.isFunctionExpression(node)
        || ts.isArrowFunction(node)
        || ts.isMethodDeclaration(node)
      ) {
        const start = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
        const end = file.getLineAndCharacterOfPosition(node.end).line + 1;
        const name = functionName(node, file);
        assert.ok(
          end - start + 1 <= 80,
          `${relative(ROOT, path)}:${start} ${name} exceeds 80 lines`
        );
        assert.ok(
          functionComplexity(node) <= 15,
          `${relative(ROOT, path)}:${start} ${name} exceeds cyclomatic complexity 15`
        );
      }
      ts.forEachChild(node, visit);
    }
    visit(file);
  }
});

test("public barrel exports only the integration contract", () => {
  const barrel = readFileSync(join(ROOT, "index.ts"), "utf8");
  assert.doesNotMatch(barrel, /export\s+\*/);
  assert.doesNotMatch(
    barrel,
    /\b(?:RemotePickerLoadCoordinator|PickerLoadRequest|propertySurfaceCount|propertyDetailRouteCount|remotePickerReducer|createRemotePickerState|invokeTaskAction|visibleTaskActions)\b/
  );
  for (const publicName of [
    "projectPropertyCapabilities",
    "PropertyActionCapability",
    "RemoteEntityPicker",
    "CanonicalDetailShell",
    "ConsequenceDialog",
    "PropertyResponsiveRecords",
    "propertyAccessibleControlClassName",
    "PageState",
    "TaskPresentation"
  ]) {
    assert.match(barrel, new RegExp(`\\b${publicName}\\b`));
  }
});

test("handoff document records frozen inputs and the deferred UI gate", () => {
  const handoff = readFileSync(join(ROOT, "README.md"), "utf8");
  assert.match(handoff, /e709459a034807b3575db604a76bc69bf1c5ff5b/);
  assert.match(handoff, /b1a0625b59f7c2263a1909126e335b85c81d8c13/);
  assert.match(handoff, /API response contract only/);
  assert.match(handoff, /is_super.*system `\*` permission/s);
  assert.match(handoff, /Neither `is_super` nor `\*` bypasses module availability/);
  assert.match(handoff, /eight high-risk actions marked `blocked-until-track-b`/);
  assert.match(handoff, /final UI gate/);
  assert.match(handoff, /real canonical domain route/);
});
