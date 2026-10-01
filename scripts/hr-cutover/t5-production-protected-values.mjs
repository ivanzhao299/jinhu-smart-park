import { Buffer } from "node:buffer";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { validateMaterializationKeyBytes } from "./materialization-key-contract.mjs";

const fail = code => { throw Object.assign(new Error(code), { code }); };
const digest = value => createHash("sha256").update(value).digest();
const masked = value => value.length <= 4 ? "*".repeat(value.length)
  : `${value.slice(0, 2)}${"*".repeat(Math.min(12, value.length - 4))}${value.slice(-2)}`;
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);

/** Translate only typed materialized fields. Source archives and source hashes
 * remain unchanged. The caller must bind the supplied keyring to the actual
 * runtime and validate the source stage before invoking the production writer.
 * This function neither opens a database nor changes any global key. */
export function reencryptT5MaterializedRows(rows, { sourceKeyBytes, productionKeyring }) {
  if (!Array.isArray(rows)) fail("T5_CRYPTO_ROWS_INVALID");
  const sourceKey = digest(validateMaterializationKeyBytes(sourceKeyBytes));
  if (!object(productionKeyring) || !(productionKeyring.keys instanceof Map)
    || !Buffer.isBuffer(productionKeyring.hashKey)
    || productionKeyring.hashKey.toString("utf8").trim().length < 32) fail("T5_CRYPTO_KEYRING_INVALID");
  const seed = productionKeyring.keys.get(productionKeyring.activeKeyId);
  if (!Buffer.isBuffer(seed) || seed.toString("utf8").trim().length < 32) fail("T5_CRYPTO_KEYRING_INVALID");
  const targetKey = digest(seed), hashKey = digest(productionKeyring.hashKey);
  let translated = 0, empty = 0;
  const translate = value => {
    if (Array.isArray(value)) return value.map(translate);
    if (!object(value)) return value;
    const keys = Object.keys(value);
    if (Object.hasOwn(value, "encrypted")) {
      if (keys.length !== 3 || !["encrypted", "masked", "fingerprint"].every(key => Object.hasOwn(value, key))) fail("T5_CRYPTO_PROTECTED_SHAPE_INVALID");
      if (value.encrypted === null) {
        if (value.masked !== null || value.fingerprint !== null) fail("T5_CRYPTO_NULL_DRIFT");
        empty += 1;
        return { ...value };
      }
      if (typeof value.encrypted !== "string" || !/^enc:v1:[a-f0-9]{24}:[a-f0-9]{32}:(?:[a-f0-9]{2})+$/iu.test(value.encrypted)
        || !/^hmac256:[a-f0-9]{64}$/u.test(value.fingerprint ?? "")) fail("T5_CRYPTO_SOURCE_ENVELOPE_INVALID");
      const [, , iv, tag, payload] = value.encrypted.split(":");
      let plain;
      try {
        const decipher = createDecipheriv("aes-256-gcm", sourceKey, Buffer.from(iv, "hex"));
        decipher.setAuthTag(Buffer.from(tag, "hex"));
        plain = Buffer.concat([decipher.update(Buffer.from(payload, "hex")), decipher.final()]).toString("utf8");
      } catch { fail("T5_CRYPTO_SOURCE_AUTHENTICATION_FAILED"); }
      if (!plain || plain.trim() !== plain || value.masked !== masked(plain)) fail("T5_CRYPTO_SOURCE_MASK_DRIFT");
      const nonce = randomBytes(12), cipher = createCipheriv("aes-256-gcm", targetKey, nonce);
      const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
      translated += 1;
      return {
        encrypted: `enc:v1:${nonce.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${encrypted.toString("hex")}`,
        masked: value.masked,
        fingerprint: `hmac256:${createHmac("sha256", hashKey).update(plain).digest("hex")}`,
      };
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, translate(item)]));
  };
  try {
    const records = rows.map(row => {
      if (!object(row)) fail("T5_CRYPTO_ROW_INVALID");
      return Object.hasOwn(row, "materialized") ? { ...row, materialized: translate(row.materialized) } : { ...row };
    });
    return { records, receipt: { status: "T5_PROTECTED_VALUE_TRANSLATION_COMPLETED", sourceRecordCount: rows.length,
      translatedProtectedValues: translated, emptyProtectedValues: empty, sourceArchiveChanged: false,
      sourceRowHashesChanged: false, productionBusinessWrites: 0, productionKeyCompatibilityClaimed: false } };
  } finally { sourceKey.fill(0); targetKey.fill(0); hashKey.fill(0); }
}

/** Preserve the full original source as authenticated ciphertext. The source
 * identity and row digest stay outside the envelope for exact reconciliation;
 * plaintext source fields must not enter public archive projections. */
export function encryptT5OriginalSourceRows(rows, productionKeyring) {
  if (!Array.isArray(rows) || !object(productionKeyring) || !(productionKeyring.keys instanceof Map)) fail("T5_CRYPTO_KEYRING_INVALID");
  const seed = productionKeyring.keys.get(productionKeyring.activeKeyId);
  if (!Buffer.isBuffer(seed) || seed.toString("utf8").trim().length < 32) fail("T5_CRYPTO_KEYRING_INVALID");
  const key = digest(seed), seen = new Set();
  try {
    return rows.map(row => {
      if (!object(row) || !object(row.source) || typeof row.sourceTable !== "string"
        || !/^[a-f0-9]{64}$/u.test(row.sourceIdentitySha256 ?? "")
        || !/^[a-f0-9]{64}$/u.test(row.sourceRowSha256 ?? "")) fail("T5_CRYPTO_SOURCE_ROW_INVALID");
      const identity = `${row.sourceTable}:${row.sourceIdentitySha256}`;
      if (seen.has(identity)) fail("T5_CRYPTO_DUPLICATE_SOURCE_IDENTITY");
      seen.add(identity);
      const plain = JSON.stringify(row.source), iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
      return { sourceTable: row.sourceTable, sourceIdentitySha256: row.sourceIdentitySha256,
        sourceRowSha256: row.sourceRowSha256,
        encryptedSource: `enc:v1:${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${encrypted.toString("hex")}` };
    });
  } finally { key.fill(0); }
}
