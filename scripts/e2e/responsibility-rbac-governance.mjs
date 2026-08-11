import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration=await readFile(new URL("../../database/migrations/000175_2026_responsibility_user_role_queue.sql",import.meta.url),"utf8");
const reconcile=await readFile(new URL("../../database/seeds/production/000014_responsibility_system_admin_reconcile.sql",import.meta.url),"utf8");
const risky=[...migration.matchAll(/\('([^']+)', 'SYSTEM_ADMIN'\)/g)].map(match=>match[1]).sort();
assert.deepEqual(risky,["liu_xia","wang_xinxin","wu_enguo"]);
for(const username of risky)assert.match(reconcile,new RegExp(`\\('${username}'\\)`),`missing SYSTEM_ADMIN convergence for ${username}`);
assert.match(reconcile,/role\.code='SYSTEM_ADMIN'/);
assert.match(reconcile,/RAISE EXCEPTION 'legacy responsibility SYSTEM_ADMIN bindings remain'/);
console.log("responsibility-rbac-governance: PASS");
