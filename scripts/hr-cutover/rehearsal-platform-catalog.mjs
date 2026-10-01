import { createHash } from "node:crypto";

// pg_dump/parser round trips move a varchar[] -> text[] cast onto each
// varchar literal. Preserve every literal and all surrounding SQL; recognize
// only this lossless built-in cast, never arbitrary casts or expressions.
const literal = "'(?:''|[^'])*'";
const varchar = `${literal}::character varying`;
const list = `${varchar}(?:, ${varchar})*`;
const arrayCast = `(?:\\(ARRAY\\[(${list})\\]\\)|ARRAY\\[(${list})\\])::text\\[\\]`;
const element = `(?:\\(${varchar}\\)|${varchar})::text`;
const elementCast = `ARRAY\\[${element}(?:, ${element})*\\]`;

function quotedPositions(sql) {
  const inside = new Uint8Array(sql.length);
  let quote = null, escaped = false;
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    if (quote) {
      inside[i] = 1;
      if (escaped && ch === "\\") { if (i + 1 < sql.length) inside[++i] = 1; }
      else if (ch === quote) {
        if (sql[i + 1] === quote) inside[++i] = 1;
        else quote = null;
      }
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      escaped = ch === "'" && /(?:^|[^A-Za-z0-9_$])[eE]$/u.test(sql.slice(0, i));
    }
  }
  return inside;
}

export function canonicalVarcharLiteralArrayCasts(sql) {
  const positions = quotedPositions(sql), pattern = new RegExp(`${arrayCast}|${elementCast}`, "gu");
  const parts = []; let cursor = 0;
  for (const match of sql.matchAll(pattern)) {
    if (positions[match.index] || /[A-Za-z0-9_$]/u.test(sql[match.index - 1] ?? "")) continue;
    parts.push(sql.slice(cursor, match.index));
    parts.push({ postgresVarcharLiteralArrayToText: match[0].match(new RegExp(literal, "gu")) });
    cursor = match.index + match[0].length;
  }
  parts.push(sql.slice(cursor));
  return parts;
}

export function canonicalPlatformCatalogRows(rows) {
  if (!Array.isArray(rows)) throw new TypeError("platform catalog must be an array");
  return rows.map(row => {
    if (!Array.isArray(row)) throw new TypeError("platform catalog row must be an array");
    const copy = [...row], definition = copy.at(-1);
    const check = copy.length === 5 && ["c", "x"].includes(copy[3]);
    const index = copy.length === 4 && typeof definition === "string" && /^CREATE (?:UNIQUE )?INDEX /u.test(definition);
    const trigger = copy.length === 4 && typeof definition === "string" && /^CREATE TRIGGER /u.test(definition);
    if ((check || index || trigger) && typeof definition === "string") copy[copy.length - 1] = canonicalVarcharLiteralArrayCasts(definition);
    return JSON.stringify(copy);
  }).sort();
}

export function platformCatalogSha256(rows) {
  return createHash("sha256").update(JSON.stringify(canonicalPlatformCatalogRows(rows))).digest("hex");
}
