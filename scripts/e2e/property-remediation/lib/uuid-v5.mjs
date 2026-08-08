import { createHash } from "node:crypto";

function uuidBytes(uuid) {
  const hex = uuid.replaceAll("-", "");
  if (!/^[a-f0-9]{32}$/i.test(hex)) throw new Error("invalid UUID namespace");
  return Buffer.from(hex, "hex");
}

export function uuidV5(name, namespace) {
  const hash = createHash("sha1")
    .update(uuidBytes(namespace))
    .update(String(name), "utf8")
    .digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20)
  ].join("-");
}
