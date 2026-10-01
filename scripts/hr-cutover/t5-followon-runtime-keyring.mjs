import { Buffer } from "node:buffer";
import { createDecipheriv, createHash, createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { observeProductionRuntimeRevision } from "../diagnose-production-runtime-revision.mjs";
import { canonicalT4, hashT4 } from "./production-import-t4-followon-binding.mjs";

const fail = code => { throw Object.assign(new Error(code), { code }); };
const CANARY = "yuzhou-history-import-keyring-canary";
const script = `
const {readFileSync}=require('node:fs');const {createHash}=require('node:crypto');
const root='/app/apps/api/dist/shared/security/';
const {parsePartyDataKeyring}=require(root+'party-data-keyring.js');
const {PartySensitiveDataService}=require(root+'party-sensitive-data.service.js');
const {ConfigService}=require('node:module').createRequire(root+'party-sensitive-data.service.js')('@nestjs/config');
const keyring=parsePartyDataKeyring(key=>process.env[key]);
const service=new PartySensitiveDataService(new ConfigService());
const canary='${CANARY}',cipher=service.encrypt(canary);
process.stdout.write(JSON.stringify({activeKeyId:keyring.activeKeyId,keys:[...keyring.keys].map(([id,key])=>[id,key.toString('base64')]),
hashKey:keyring.hashKey.toString('base64'),cipher,canaryHmac:service.hash(canary),apiRoundtrip:service.decrypt(cipher)===canary,
compiledKeyringSha256:createHash('sha256').update(readFileSync(root+'party-data-keyring.js')).digest('hex'),
compiledServiceSha256:createHash('sha256').update(readFileSync(root+'party-sensitive-data.service.js')).digest('hex')}));
`;

/** Private host memory only. Never log or serialize the returned keyring. Read
 * the running API's real parser and service; do not replace production keys. */
export function observeT5RuntimeKeyring(executionCodeSha) {
  const before = observeProductionRuntimeRevision(executionCodeSha);
  if (before.status !== "PASS") fail("T5_KEYRING_RUNTIME_DRIFT");
  let raw;
  try {
    raw = JSON.parse(execFileSync("docker", ["--host", "unix:///var/run/docker.sock", "exec", "jinhu-smart-park-prod-api", "node", "-e", script],
      { encoding: "utf8", maxBuffer: 256 * 1024, timeout: 30000, stdio: ["ignore", "pipe", "pipe"] }));
  } catch { fail("T5_ACTUAL_API_KEYRING_UNAVAILABLE"); }
  if (raw.apiRoundtrip !== true || !Array.isArray(raw.keys) || raw.keys.length < 1) fail("T5_ACTUAL_API_KEYRING_INVALID");
  const keyring = { activeKeyId: raw.activeKeyId, keys: new Map(raw.keys.map(([id, key]) => [id, Buffer.from(key, "base64")])), hashKey: Buffer.from(raw.hashKey, "base64") };
  const seed = keyring.keys.get(keyring.activeKeyId);
  if (!seed || seed.toString("utf8").trim().length < 32 || keyring.hashKey.toString("utf8").trim().length < 32
    || keyring.keys.size !== raw.keys.length) fail("T5_ACTUAL_API_KEYRING_INVALID");
  const key = createHash("sha256").update(seed).digest(), hashKey = createHash("sha256").update(keyring.hashKey).digest();
  try {
    const [, , iv, tag, ciphertext] = raw.cipher.split(":");
    const cipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "hex")); cipher.setAuthTag(Buffer.from(tag, "hex"));
    if (Buffer.concat([cipher.update(Buffer.from(ciphertext, "hex")), cipher.final()]).toString("utf8") !== CANARY
      || `hmac256:${createHmac("sha256", hashKey).update(CANARY).digest("hex")}` !== raw.canaryHmac) fail("T5_REAL_API_CRYPTO_INTEROPERABILITY_FAILED");
  } finally { key.fill(0); hashKey.fill(0); }
  const after = observeProductionRuntimeRevision(executionCodeSha);
  if (after.status !== "PASS" || canonicalT4(before.observations) !== canonicalT4(after.observations)) fail("T5_KEYRING_RUNTIME_DRIFT");
  const observation = { status: "ACTUAL_API_KEYRING_VERIFIED", executionCodeSha,
    runtimeObservations: after.observations, compiledKeyringSha256: raw.compiledKeyringSha256,
    compiledServiceSha256: raw.compiledServiceSha256, activeKeyId: keyring.activeKeyId,
    keyFingerprints: [...keyring.keys].map(([id, bytes]) => [id, hashT4(bytes)]), identityHashKeyFingerprint: hashT4(keyring.hashKey) };
  return { keyring, observationSha256: hashT4(canonicalT4(observation)) };
}
