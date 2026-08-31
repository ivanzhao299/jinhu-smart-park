export const PARTY_DATA_LEGACY_KEY_ID = "party-data-v1";
export const PARTY_DATA_ENCRYPTION_ACTIVE_KEY_ID_ENV = "PARTY_DATA_ENCRYPTION_ACTIVE_KEY_ID";
export const PARTY_DATA_ENCRYPTION_KEYRING_ENV = "PARTY_DATA_ENCRYPTION_KEYRING";
export const PARTY_DATA_IDENTITY_HASH_KEY_ENV = "PARTY_DATA_IDENTITY_HASH_KEY";

const KEY_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const MINIMUM_KEY_LENGTH = 32;

export interface PartyDataKeyring {
  activeKeyId: string;
  keys: ReadonlyMap<string, Buffer>;
  hashKey: Buffer;
}

type ConfigReader = (key: string) => unknown;

function valueAsString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function secretAsString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function assertKeyId(keyId: string): void {
  if (!KEY_ID_PATTERN.test(keyId)) {
    throw new Error("Party data encryption key id is invalid");
  }
}

function addKey(keys: Map<string, Buffer>, keyId: string, value: unknown): void {
  assertKeyId(keyId);
  const secret = secretAsString(value);
  if (secret.trim().length < MINIMUM_KEY_LENGTH) {
    throw new Error(`Party data encryption key ${keyId} must contain at least 32 characters`);
  }
  if (keys.has(keyId)) {
    throw new Error(`Party data encryption key id ${keyId} is configured more than once`);
  }
  keys.set(keyId, Buffer.from(secret, "utf8"));
}

function rejectDuplicateJsonKeys(serialized: string): void {
  const seen = new Set<string>();
  for (const match of serialized.matchAll(/"((?:\\.|[^"\\])*)"\s*:/gu)) {
    const encoded = match[1];
    if (encoded === undefined) continue;
    const key = JSON.parse(`"${encoded}"`) as string;
    if (seen.has(key)) throw new Error(`Party data encryption key id ${key} is configured more than once`);
    seen.add(key);
  }
}

export function parsePartyDataKeyring(read: ConfigReader): PartyDataKeyring {
  const keys = new Map<string, Buffer>();
  const legacyKey = secretAsString(read("PARTY_DATA_ENCRYPTION_KEY"));
  if (legacyKey.trim()) addKey(keys, PARTY_DATA_LEGACY_KEY_ID, legacyKey);

  const serializedKeyring = valueAsString(read(PARTY_DATA_ENCRYPTION_KEYRING_ENV));
  if (serializedKeyring) {
    rejectDuplicateJsonKeys(serializedKeyring);
    let parsed: unknown;
    try {
      parsed = JSON.parse(serializedKeyring);
    } catch {
      throw new Error("PARTY_DATA_ENCRYPTION_KEYRING must be a JSON object");
    }
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error("PARTY_DATA_ENCRYPTION_KEYRING must be a JSON object");
    }
    for (const [keyId, secret] of Object.entries(parsed)) addKey(keys, keyId, secret);
  }

  const activeKeyId = valueAsString(read(PARTY_DATA_ENCRYPTION_ACTIVE_KEY_ID_ENV))
    || PARTY_DATA_LEGACY_KEY_ID;
  assertKeyId(activeKeyId);
  if (!keys.has(activeKeyId)) {
    throw new Error(`Active Party data encryption key ${activeKeyId} is not configured`);
  }
  const configuredHashKey = secretAsString(read(PARTY_DATA_IDENTITY_HASH_KEY_ENV));
  const legacyHashKey = keys.get(PARTY_DATA_LEGACY_KEY_ID);
  const hashKey = configuredHashKey.trim()
    ? Buffer.from(configuredHashKey, "utf8")
    : legacyHashKey;
  if (!hashKey || hashKey.toString("utf8").trim().length < MINIMUM_KEY_LENGTH) {
    throw new Error("PARTY_DATA_IDENTITY_HASH_KEY must contain at least 32 characters");
  }
  return { activeKeyId, keys, hashKey };
}
