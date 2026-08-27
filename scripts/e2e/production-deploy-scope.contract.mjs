import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const resolver = resolve(import.meta.dirname, "../resolve-production-deploy-scope.mjs");
const classify = (files, requested = "auto") => {
  const result = spawnSync(process.execPath, [resolver, `--requested=${requested}`], {
    input: `${files.join("\n")}\n`, encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
};
const reject = (files, requested) => {
  const result = spawnSync(process.execPath, [resolver, `--requested=${requested}`], {
    input: `${files.join("\n")}\n`, encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /does not match safely classified mode/);
};

assert.equal(classify(["apps/web/public/runtime-design-system.css"]).mode, "fast-css");
assert.equal(classify(["apps/web/app/hr/page.tsx", "docs/ui.md"]).mode, "web");
assert.equal(classify(["apps/api/src/app.module.ts"]).mode, "api");
assert.equal(classify(["database/migrations/000265_example.sql"]).mode, "database");
assert.equal(classify(["apps/api/src/app.module.ts", "database/migrations/000265_example.sql"]).mode, "full");
assert.equal(classify(["apps/web/app/page.tsx", "apps/api/src/app.module.ts"]).mode, "full");
assert.equal(classify(["packages/shared/src/index.ts"]).mode, "full");
assert.equal(classify(["pnpm-lock.yaml"]).mode, "full");
assert.equal(classify(["apps/web/package.json"]).mode, "full");
assert.equal(classify(["apps/api/Dockerfile"]).mode, "full");
assert.equal(classify(["infra/docker/docker-compose.prod.yml"]).mode, "full");
assert.equal(classify(["unknown/runtime.file"]).mode, "full");
assert.equal(classify(["docs/release/note.md", ".trellis/tasks/demo/prd.md"]).mode, "ops-only");
assert.equal(classify([], "auto").mode, "full");
assert.equal(classify(["apps/web/app/page.tsx"], "full").mode, "full");
assert.equal(classify(["database/migrations/000265_example.sql"], "database").mode, "database");
reject(["apps/web/app/page.tsx"], "database");
reject(["apps/api/src/app.module.ts"], "web");

const database = classify(["database/seeds/production/000028_example.sql"]);
assert.deepEqual(
  { build_web: database.build_web, build_api: database.build_api, run_migrations: database.run_migrations, deploy: database.deploy },
  { build_web: false, build_api: false, run_migrations: true, deploy: true },
);
assert.equal(classify(["apps/api/src/app.module.ts"]).run_migrations, false);

console.log("Production deploy scope contract passed.");
