import assert from "node:assert/strict";
import test from "node:test";
import { analyzeSource, evaluate } from "./complexity-gate.mjs";

const profile = { limits: { routeClientLines: 450, componentLines: 300, functionLines: 80, cyclomaticComplexity: 15 } };

test("analyzer counts branches and function span", () => {
  const value = analyzeSource("sample.ts", "function decide(a:boolean,b:boolean){ if(a && b){ return 1; } return 0; }\n");
  assert.deepEqual([...value.functions.values()], [{ lines: 1, complexity: 3 }]);
});

test("new oversized function fails closed", () => {
  const source = `export function huge(value: number) {\n${"if (value) value += 1;\n".repeat(16)}return value;\n}`;
  const result = evaluate({ profile, currentSources: new Map([["new.ts", source]]), baselineSources: new Map() });
  assert.equal(result.status, "FAIL");
  assert.equal(result.violations[0].metric, "cyclomatic_complexity");
});

test("grandfathered oversized file may shrink but may not grow", () => {
  const baseline = `${"// baseline\n".repeat(451)}export const value = 1;`;
  const pass = evaluate({ profile, currentSources: new Map([["OldClient.tsx", baseline.slice(0, -1)]]), baselineSources: new Map([["OldClient.tsx", baseline]]) });
  const fail = evaluate({ profile, currentSources: new Map([["OldClient.tsx", `${baseline}\n// growth`]]), baselineSources: new Map([["OldClient.tsx", baseline]]) });
  assert.equal(pass.status, "PASS");
  assert.equal(fail.status, "FAIL");
});
