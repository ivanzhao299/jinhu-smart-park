import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const here = resolve(fileURLToPath(new URL(".", import.meta.url)));
const root = resolve(here, "../../../..");
const profilePath = join(here, "complexity-profile.v1.json");

function lines(text) {
  return text === "" ? 0 : text.replace(/\r\n/gu, "\n").split("\n").length;
}

function sourceKind(path) {
  return extname(path) === ".tsx" ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

function functionName(node, ordinal) {
  if (node.name?.getText) return `${ts.SyntaxKind[node.kind]}:${node.name.getText()}#${ordinal}`;
  const parent = node.parent;
  if (parent && ts.isVariableDeclaration(parent) && parent.name?.getText) {
    return `${ts.SyntaxKind[node.kind]}:${parent.name.getText()}#${ordinal}`;
  }
  if (parent && ts.isPropertyAssignment(parent) && parent.name?.getText) {
    return `${ts.SyntaxKind[node.kind]}:${parent.name.getText()}#${ordinal}`;
  }
  return `${ts.SyntaxKind[node.kind]}:<anonymous>#${ordinal}`;
}

function isFunction(node) {
  return ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)
    || ts.isArrowFunction(node) || ts.isFunctionExpression(node)
    || ts.isConstructorDeclaration(node) || ts.isGetAccessorDeclaration(node)
    || ts.isSetAccessorDeclaration(node);
}

function complexityOf(node) {
  let value = 1;
  function visit(child) {
    if (child !== node && isFunction(child)) return;
    if (ts.isIfStatement(child) || ts.isForStatement(child) || ts.isForInStatement(child)
      || ts.isForOfStatement(child) || ts.isWhileStatement(child) || ts.isDoStatement(child)
      || ts.isConditionalExpression(child) || ts.isCaseClause(child) || ts.isCatchClause(child)) value += 1;
    if (ts.isBinaryExpression(child)
      && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken]
        .includes(child.operatorToken.kind)) value += 1;
    ts.forEachChild(child, visit);
  }
  ts.forEachChild(node, visit);
  return value;
}

export function analyzeSource(path, text) {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, sourceKind(path));
  const counts = new Map();
  const functions = new Map();
  function visit(node) {
    if (isFunction(node)) {
      const base = functionName(node, 0).replace(/#0$/u, "");
      const ordinal = (counts.get(base) ?? 0) + 1;
      counts.set(base, ordinal);
      const start = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      const end = source.getLineAndCharacterOfPosition(node.end).line + 1;
      functions.set(functionName(node, ordinal), { lines: end - start + 1, complexity: complexityOf(node) });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return { lines: lines(text), functions };
}

function trackedAt(commit, path) {
  try {
    return execFileSync("git", ["show", `${commit}:${path}`], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

function collect(path) {
  const absolute = resolve(root, path);
  try {
    if (statSync(absolute).isFile()) return /\.tsx?$/u.test(path) && !/\.(spec|test)\.[cm]?tsx?$/u.test(path) ? [path] : [];
  } catch { return []; }
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name).replaceAll("\\", "/");
    if (entry.isDirectory()) return collect(child);
    return /\.tsx?$/u.test(child) && !/\.(spec|test)\.[cm]?tsx?$/u.test(child) ? [child] : [];
  });
}

function fileLimit(path, limits) {
  if (/Client\.tsx$/u.test(path)) return limits.routeClientLines;
  if (/\.tsx$/u.test(path) && !/\/page\.tsx$/u.test(path)) return limits.componentLines;
  return null;
}

export function evaluate({ profile, currentSources, baselineSources }) {
  const violations = [];
  const reports = [];
  for (const [path, text] of currentSources) {
    const current = analyzeSource(path, text);
    const baselineText = baselineSources.get(path) ?? null;
    const baseline = baselineText === null ? null : analyzeSource(path, baselineText);
    const limit = fileLimit(path, profile.limits);
    if (limit !== null) {
      const allowed = baseline && baseline.lines > limit ? baseline.lines : limit;
      if (current.lines > allowed) violations.push({ path, metric: "file_lines", actual: current.lines, allowed });
    }
    for (const [name, metric] of current.functions) {
      if (name.includes(":<anonymous>#") && baseline) continue;
      const prior = baseline?.functions.get(name);
      const allowedLines = prior && prior.lines > profile.limits.functionLines ? prior.lines : profile.limits.functionLines;
      const allowedComplexity = prior && prior.complexity > profile.limits.cyclomaticComplexity
        ? prior.complexity : profile.limits.cyclomaticComplexity;
      if (metric.lines > allowedLines) violations.push({ path, function: name, metric: "function_lines", actual: metric.lines, allowed: allowedLines });
      if (metric.complexity > allowedComplexity) violations.push({ path, function: name, metric: "cyclomatic_complexity", actual: metric.complexity, allowed: allowedComplexity });
    }
    if (baseline) {
      const anonymous = (analysis, metric) => [...analysis.functions]
        .filter(([name]) => name.includes(":<anonymous>#"))
        .map(([, value]) => value[metric]).sort((left, right) => right - left);
      for (const [metric, limit, label] of [["lines", profile.limits.functionLines, "function_lines"], ["complexity", profile.limits.cyclomaticComplexity, "cyclomatic_complexity"]]) {
        const now = anonymous(current, metric);
        const before = anonymous(baseline, metric);
        now.forEach((actual, index) => {
          const allowed = Math.max(limit, before[index] ?? limit);
          if (actual > allowed) violations.push({ path, function: `<anonymous-rank-${index + 1}>`, metric: label, actual, allowed });
        });
      }
    }
    reports.push({ path, lines: current.lines, baselineLines: baseline?.lines ?? null, functions: current.functions.size });
  }
  return { status: violations.length === 0 ? "PASS" : "FAIL", violations, reports };
}

export function runGate(profile = JSON.parse(readFileSync(profilePath, "utf8"))) {
  if (profile.schemaVersion !== "property-track-c-complexity-v1" || !/^[0-9a-f]{7,40}$/u.test(profile.baselineCommit)) {
    throw new Error("invalid complexity profile");
  }
  execFileSync("git", ["merge-base", "--is-ancestor", profile.baselineCommit, "HEAD"], { cwd: root });
  const paths = [...new Set(profile.roots.flatMap(collect))].sort();
  const currentSources = new Map(paths.map((path) => [path, readFileSync(join(root, path), "utf8")]));
  const baselineSources = new Map(paths.map((path) => [path, trackedAt(profile.baselineCommit, path)]).filter(([, text]) => text !== null));
  return evaluate({ profile, currentSources, baselineSources });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = runGate();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status !== "PASS") process.exitCode = 1;
}
