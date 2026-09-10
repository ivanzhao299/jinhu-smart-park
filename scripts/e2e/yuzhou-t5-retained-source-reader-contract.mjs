import assert from "node:assert/strict";
import { createHash, createDecipheriv } from "node:crypto";
import { Buffer } from "node:buffer";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { compileFunction } from "node:vm";
import { URL } from "node:url";
import { createT5ProtectedValueMaterializer } from "../hr-cutover/t5-nonfile-field-projection.mjs";
import test from "node:test";
import { readT5RetainedSource, projectT5RetainedRecord } from "../hr-cutover/t5-retained-source-reader.mjs";

const sha = value => createHash("sha256").update(value).digest("hex");
const rowFor = value => ({ source: { value }, sourceRowSha256: sha(JSON.stringify({ value })) });
const legacy = { encoding: "json_backslash_doubled_v1" };

// Execute current API source, not a copied decrypt/hash implementation or stale dist.
function apiProtectionService(config) {
  const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
  const ts = require("typescript");
  const load = name => {
    const url = new URL(`../../apps/api/src/shared/security/${name}.ts`, import.meta.url);
    const output = ts.transpileModule(readFileSync(url, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true }
    }).outputText;
    const module = { exports: {} };
    compileFunction(output, ["require", "module", "exports"])(
      dependency => dependency === "./party-data-keyring" ? load("party-data-keyring") : require(dependency), module, module.exports
    );
    return module.exports;
  };
  const { ConfigService } = require("@nestjs/config");
  const { PartySensitiveDataService } = load("party-sensitive-data.service");
  return new PartySensitiveDataService(new ConfigService(config));
}

test("T5 protection agrees with actual API under legacy and independent identity keys", () => {
  const seed = "a".repeat(64), identityHashSeed = `  ${"stable-fixture-".repeat(4)}  `;
  for (const separate of [false, true]) {
    const api = apiProtectionService({ PARTY_DATA_ENCRYPTION_KEY: seed,
      ...(separate ? { PARTY_DATA_IDENTITY_HASH_KEY: identityHashSeed } : {}) });
    const protect = createT5ProtectedValueMaterializer(seed, separate ? { identityHashSeed } : {});
    for (const value of [" short ", "synthetic-person", "汉字合成测试"]) {
      const result = protect(value, "fixture:api");
      assert.equal(api.decrypt(result.encrypted), value.trim());
      assert.equal(result.fingerprint, api.hash(value));
      assert.equal(result.masked, api.mask(value));
    }
  }
  const old = createT5ProtectedValueMaterializer(seed)("synthetic", "fixture");
  const split = createT5ProtectedValueMaterializer(seed, { identityHashSeed })("synthetic", "fixture");
  assert.equal(old.encrypted, split.encrypted);
  assert.notEqual(old.fingerprint, split.fingerprint);
  const rotated = createT5ProtectedValueMaterializer("b".repeat(64), { identityHashSeed })("synthetic", "fixture");
  assert.equal(rotated.fingerprint, split.fingerprint);
  assert.notEqual(rotated.encrypted, split.encrypted);
  const api = apiProtectionService({ PARTY_DATA_ENCRYPTION_KEY: seed,
    PARTY_DATA_ENCRYPTION_KEYRING: JSON.stringify({ rotated: "b".repeat(64) }),
    PARTY_DATA_ENCRYPTION_ACTIVE_KEY_ID: "rotated", PARTY_DATA_IDENTITY_HASH_KEY: identityHashSeed });
  assert.equal(api.decrypt(rotated.encrypted, "rotated"), "synthetic");
  assert.throws(() => api.decrypt(rotated.encrypted, "party-data-v1"));
});

test("explicit invalid fingerprint keys fail without echoing their content", () => {
  for (const identityHashSeed of [null, "short-private-fixture", 123]) {
    assert.throws(() => createT5ProtectedValueMaterializer("a".repeat(64), { identityHashSeed }),
      { message: "T5_IDENTITY_HASH_KEY_INVALID" });
  }
});

test("blank environment-template hash keys match API legacy fallback", () => {
  const seed = "a".repeat(64), value = "synthetic-person";
  const expected = createT5ProtectedValueMaterializer(seed)(value, "fixture");
  for (const identityHashSeed of [undefined, "", " \t\n "]) {
    const actual = createT5ProtectedValueMaterializer(seed, { identityHashSeed })(value, "fixture");
    const api = apiProtectionService({ PARTY_DATA_ENCRYPTION_KEY: seed, PARTY_DATA_IDENTITY_HASH_KEY: identityHashSeed });
    assert.deepEqual(actual, expected);
    assert.equal(actual.fingerprint, api.hash(value));
    assert.equal(api.decrypt(actual.encrypted), value);
  }
});

test("shared protection preserves deterministic context and decryptable legacy envelope without plaintext", () => {
  const seed = "a".repeat(64), protect = createT5ProtectedValueMaterializer(seed);
  assert.deepEqual(protect(null, "fixture"), { encrypted: null, masked: null, fingerprint: null });
  const value = protect("  synthetic-person  ", "fixture:1");
  assert.deepEqual(protect("synthetic-person", "fixture:1"), value);
  assert.notEqual(protect("synthetic-person", "fixture:2").encrypted, value.encrypted);
  const [, , iv, tag, encrypted] = value.encrypted.split(":");
  const decipher = createDecipheriv("aes-256-gcm", createHash("sha256").update(seed).digest(), Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  assert.equal(Buffer.concat([decipher.update(Buffer.from(encrypted, "hex")), decipher.final()]).toString(), "synthetic-person");
  assert.equal(JSON.stringify(value).includes("synthetic-person"), false);
  assert.throws(() => createT5ProtectedValueMaterializer("invalid"));
});

test("retained skill projection uses verified source rather than stale materialized fields", () => {
  const source = { knowhow: "Skill", memo: "line\nnext" };
  const row = { sourceTable: "dbo.knowhow", source, sourceRowSha256: sha(JSON.stringify(source)), materialized: { skillName: "stale" } };
  const staged = globalThis.structuredClone(row);
  staged.source.memo = "line\\nnext";
  const result = projectT5RetainedRecord(staged, legacy);
  assert.equal(result.record.materialized.skillName, "Skill");
  assert.equal(result.record.materialized.note, "line\nnext");
  assert.equal(result.record.sourceRowSha256, row.sourceRowSha256);
  assert.equal(staged.materialized.skillName, "stale");
  assert.throws(() => projectT5RetainedRecord({ ...row, sourceTable: "dbo.docs" }, legacy), { code: "T5_RETAINED_SOURCE_INVALID" });
});

test("matching original source wins, including literal escapes; result does not alias input", () => {
  for (const value of ["a\nb", "literal\\n", "\\u0000", "\0", '"quoted"', "汉字", 0, null]) {
    const row = rowFor(value), before = globalThis.structuredClone(row);
    const result = readT5RetainedSource(row, legacy);
    assert.deepEqual(result, { source: row.source, decoding: "unchanged" });
    result.source.value = "changed";
    assert.deepEqual(row, before);
  }
});

test("one explicitly declared legacy layer is accepted only against the original digest", () => {
  for (const value of ["a\r\nb\tc", '"quoted"', "C:\\new\\test", "\0", "\b\f", "literal\\n", "汉字"]) {
    const row = rowFor(value);
    row.source.value = JSON.stringify(value).slice(1, -1);
    const before = globalThis.structuredClone(row);
    assert.deepEqual(readT5RetainedSource(row, legacy).source, { value });
    assert.deepEqual(row, before);
    if (value !== row.source.value) assert.throws(() => readT5RetainedSource(row), { code: "T5_RETAINED_SOURCE_INVALID" });
  }
  const row = rowFor("汉字");
  row.source.value = "\\u6c49\\u5b57";
  assert.deepEqual(readT5RetainedSource(row, legacy).source, { value: "汉字" });
});

test("wrong digest, invalid values, undeclared encoding and repeated decoding fail closed without contents", () => {
  const row = rowFor("private-fixture\n");
  row.source.value = "private-fixture\\\\n";
  for (const [input, options] of [[row, legacy], [{ ...row, sourceRowSha256: "0".repeat(64) }, legacy],
    [rowFor("x"), { encoding: "guess" }], [rowFor("x"), { encoding: null }],
    [{ ...rowFor("x"), source: { value: undefined } }, legacy],
    [{ ...rowFor("x"), source: { value: Infinity } }, legacy]]) {
    assert.throws(() => readT5RetainedSource(input, options), error => error.message === "T5_RETAINED_SOURCE_INVALID");
  }
});
