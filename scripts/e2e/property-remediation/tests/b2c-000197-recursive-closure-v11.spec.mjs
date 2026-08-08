import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import process from "node:process";
import test from "node:test";
import {
  assertTscFileListMatchesV11, classifySpecifierV11, resolveFormalExecutionClosureV11,
} from "../track-b2c-000197-closure-resolver-v11.mjs";

const root = process.cwd();

test("recursive formal closure includes critical PG, authorization, principal and shared dependencies", () => {
  const closure = resolveFormalExecutionClosureV11(root); const files = new Set(closure.repositoryFiles);
  assert.deepEqual(closure.unresolved, []);
  for (const path of [
    "apps/api/src/modules/property-approvals/property-approval.port.pg.spec.ts",
    "apps/api/src/modules/property-approvals/entities/property-approval.entities.ts",
    "apps/api/src/modules/property-approvals/property-approval.ports.ts",
    "apps/api/src/modules/property-approvals/property-approval.error.ts",
    "apps/api/src/modules/property-approvals/property-approval.authorization.ts",
    "apps/api/src/shared/types/jwt-principal.ts",
    "packages/shared/dist/index.d.ts",
    "apps/api/tsconfig.json", "tsconfig.base.json", "apps/api/package.json", "package.json",
    "pnpm-workspace.yaml", "pnpm-lock.yaml",
  ]) assert.ok(files.has(path), path);
  assert.ok(closure.compilerFiles.length > 900);
  assert.ok(closure.repositoryFiles.every((path) => !path.includes("node_modules/")));
});

test("builtin and external dependencies are explicit while repository misses fail closed", () => {
  const importer = resolve(root, "apps/api/src/modules/property-approvals/property-approval.port.pg.spec.ts");
  assert.deepEqual(classifySpecifierV11(importer, "node:test", root), { kind: "builtin", value: "node:test" });
  assert.equal(classifySpecifierV11(importer, "typeorm", root).kind, "external");
  assert.deepEqual(classifySpecifierV11(importer, "./missing-v11-owned-module", root),
    { kind: "unresolved", value: "./missing-v11-owned-module" });
  assert.equal(classifySpecifierV11(importer, "@jinhu/shared", root).kind, "repository");
  const closure = resolveFormalExecutionClosureV11(root);
  assert.ok(closure.builtin.some(({ specifier }) => specifier === "node:test"));
  assert.ok(closure.external.some(({ specifier }) => specifier === "typeorm"));
  assert.ok(closure.external.some(({ specifier }) => specifier === "ts-node/register"));
});

test("TypeScript Program repository files exactly match real tsc listFilesOnly", () => {
  const corepack = resolve(dirname(process.execPath), "corepack");
  const executablePath = `${dirname(process.execPath)}:${process.env.PATH ?? ""}`;
  const child = spawnSync(corepack, ["pnpm", "--filter", "@jinhu/api", "exec", "tsc", "-p", "tsconfig.json", "--noEmit",
    "--listFilesOnly"], { cwd: root, env: { PATH: executablePath }, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  assert.equal(child.error, undefined); assert.equal(child.signal, null); assert.equal(child.status, 0, child.stderr);
  const result = assertTscFileListMatchesV11(child.stdout, root);
  assert.ok(result.files > 900);
});
