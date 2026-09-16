import { createHash } from "node:crypto";
import { materializeT5NonfileRecord } from "./t5-nonfile-field-projection.mjs";

const SHA256 = /^[0-9a-f]{64}$/u;
const fail = () => { throw Object.assign(new Error("T5_RETAINED_SOURCE_INVALID"), { code: "T5_RETAINED_SOURCE_INVALID" }); };

function canonical(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return fail();
}

function decodeOneLayer(value) {
  if (typeof value === "string") return value.replace(/\\(?:u[0-9a-fA-F]{4}|["\\/bfnrt])/gu, token => JSON.parse(`"${token}"`));
  if (Array.isArray(value)) return value.map(decodeOneLayer);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decodeOneLayer(item)]));
  return value;
}

/** Private-source reader only. Caller must verify the enclosing manifest/file hashes.
 * Never repairs hashes, retries decoding, projects business fields, or grants import authority.
 * The explicit legacy encoding is for retained output of the old T5 writer only.
 */
export function readT5RetainedSource(row, { encoding = "canonical_json_v1" } = {}) {
  if (!["canonical_json_v1", "json_backslash_doubled_v1"].includes(encoding)
    || !row || !row.source || Object.getPrototypeOf(row.source) !== Object.prototype
    || typeof row.sourceRowSha256 !== "string" || !SHA256.test(row.sourceRowSha256)) fail();
  const matches = source => createHash("sha256").update(canonical(source)).digest("hex") === row.sourceRowSha256;
  if (matches(row.source)) return { source: globalThis.structuredClone(row.source), decoding: "unchanged" };
  if (encoding === "json_backslash_doubled_v1") {
    const source = decodeOneLayer(row.source);
    if (matches(source)) return { source, decoding: "legacy_json_escape_layer" };
  }
  return fail();
}

/** Re-project retained facts; never reuse the old, potentially escaped materialized fields. */
export function projectT5RetainedRecord(row, options) {
  const names = { "dbo.person.core_residue": "person_core", "dbo.family": "family", "dbo.knowhow": "knowhow", "dbo.ticket": "ticket" };
  const name = names[row?.sourceTable];
  if (!name) fail();
  const { source, decoding } = readT5RetainedSource(row, options);
  const materialized = materializeT5NonfileRecord(name, source, options);
  return { record: { ...globalThis.structuredClone(row), source, materialized }, decoding };
}
