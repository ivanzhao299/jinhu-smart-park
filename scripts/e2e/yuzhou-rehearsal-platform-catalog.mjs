/* global console */
import assert from "node:assert/strict";
import { canonicalVarcharLiteralArrayCasts, platformCatalogSha256 } from "../hr-cutover/rehearsal-platform-catalog.mjs";

const old = "ARRAY['a'::character varying, 'b,c''d'::character varying]::text[]";
const restored = "ARRAY['a'::character varying::text, 'b,c''d'::character varying::text]";
const indexOld = "(ARRAY['a'::character varying, 'b,c''d'::character varying])::text[]";
const indexRestored = "ARRAY[('a'::character varying)::text, ('b,c''d'::character varying)::text]";
const check = expression => ["public", "fixture", "check_fixture", "c", `CHECK (status::text = ANY (${expression}))`];
const index = expression => ["public", "fixture", "index_fixture", `CREATE INDEX index_fixture ON public.fixture USING btree (status) WHERE status::text = ANY (${expression})`];
assert.equal(platformCatalogSha256([check(old), index(indexOld)]), platformCatalogSha256([index(indexRestored), check(restored)]));
const trigger = expression => ["public", "fixture", "trigger_fixture", `CREATE TRIGGER trigger_fixture BEFORE UPDATE ON fixture FOR EACH ROW WHEN (old.status::text = ANY (${expression})) EXECUTE FUNCTION fixture_guard()`];
assert.equal(platformCatalogSha256([trigger(old)]), platformCatalogSha256([trigger(restored)]));
assert.notEqual(platformCatalogSha256([trigger(old)]), platformCatalogSha256([trigger(restored).map(x => typeof x === "string" ? x.replace("fixture_guard()", "other_guard()") : x)]));
for (const expression of [restored.replace("'a'", "'changed'"), restored.replace("::character varying", "::character"), restored.replace("'a'::character varying::text", "status::text")]) {
  assert.notEqual(platformCatalogSha256([check(old)]), platformCatalogSha256([check(expression)]));
}
assert.notEqual(platformCatalogSha256([check(old)]), platformCatalogSha256([check(restored).map((x, i) => i === 4 ? x.replace(" = ANY ", " <> ALL ") : x)]));
assert.notEqual(platformCatalogSha256([check(old)]), platformCatalogSha256([check(old), check(old)]));
assert.notEqual(platformCatalogSha256([check(old)]), platformCatalogSha256([["public", "other", ...check(restored).slice(2)]]));
for (const sql of ["SELECT 'ARRAY[''a''::character varying]::text[]'", 'SELECT "ARRAY[\'a\'::character varying]::text[]"', "SELECT E'escaped\\' ARRAY[\"a\"]'"]) {
  assert.deepEqual(canonicalVarcharLiteralArrayCasts(sql), [sql]);
}
const quotedArray = `SELECT '${old.replaceAll("'", "''")}'`;
assert.deepEqual(canonicalVarcharLiteralArrayCasts(quotedArray), [quotedArray]);
const columnOld = ["public", "fixture", 1, "status", "text[]", false, old];
assert.notEqual(platformCatalogSha256([columnOld]), platformCatalogSha256([[...columnOld.slice(0, -1), restored]]));
assert.deepEqual(canonicalVarcharLiteralArrayCasts("ARRAY[1::integer]::text[]"), ["ARRAY[1::integer]::text[]"]);
assert.deepEqual(canonicalVarcharLiteralArrayCasts("ARRAY[status::character varying]::text[]"), ["ARRAY[status::character varying]::text[]"]);
console.log("Yuzhou rehearsal platform catalog: equivalent varchar literal array casts pass; structural and predicate drift remains rejected.");
