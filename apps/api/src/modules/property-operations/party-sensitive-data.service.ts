import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { parsePartyDataKeyring, type PartyDataKeyring } from "./party-data-keyring";

const PREFIX = "enc:v1:";

@Injectable()
export class PartySensitiveDataService {
  private readonly keyring: PartyDataKeyring;

  constructor(configService: ConfigService) {
    const legacyOnlyReader = !(configService instanceof ConfigService);
    this.keyring = parsePartyDataKeyring((key) => {
      if (legacyOnlyReader && key !== "PARTY_DATA_ENCRYPTION_KEY") return undefined;
      return configService.get(key);
    });
  }

  activeKeyId(): string {
    return this.keyring.activeKeyId;
  }

  hasKey(keyId: string): boolean {
    return this.keyring.keys.has(keyId);
  }

  encrypt(value: string, keyId = this.keyring.activeKeyId): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key(keyId), iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return `${PREFIX}${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${encrypted.toString("hex")}`;
  }

  decrypt(value: string | null, keyId?: string): string | null {
    const fail = (message: string): null => {
      if (keyId !== undefined) throw new Error(message);
      return null;
    };
    if (!value?.startsWith(PREFIX)) return fail("Party data ciphertext envelope is invalid");
    const segments = value.slice(PREFIX.length).split(":");
    if (segments.length !== 3) return fail("Party data ciphertext envelope is invalid");
    const [ivHex, tagHex, payloadHex] = segments as [string, string, string];
    if (!/^[0-9a-f]{24}$/iu.test(ivHex)
      || !/^[0-9a-f]{32}$/iu.test(tagHex)
      || !/^(?:[0-9a-f]{2})*$/iu.test(payloadHex)) {
      return fail("Party data ciphertext envelope is invalid");
    }

    const keyIds = keyId === undefined
      ? [this.keyring.activeKeyId, ...this.keyring.keys.keys()].filter(
        (candidate, index, values) => values.indexOf(candidate) === index
      )
      : [keyId];
    for (const candidate of keyIds) {
      const key = this.key(candidate);
      try {
        const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
        decipher.setAuthTag(Buffer.from(tagHex, "hex"));
        return Buffer.concat([
          decipher.update(Buffer.from(payloadHex, "hex")),
          decipher.final()
        ]).toString("utf8");
      } catch (error) {
        // Unversioned legacy consumers have no key-id metadata, so try the next
        // configured Party-domain key. Explicit key-id callers never fall back.
        if (keyId !== undefined) {
          throw new Error("Party data ciphertext authentication failed", { cause: error });
        }
      }
    }
    return null;
  }

  hash(value: string): string {
    const hashKey = createHash("sha256").update(this.keyring.hashKey).digest();
    return `hmac256:${createHmac("sha256", hashKey).update(value.trim()).digest("hex")}`;
  }

  mask(value: string): string {
    const trimmed = value.trim();
    if (trimmed.length <= 4) return "*".repeat(trimmed.length);
    return `${trimmed.slice(0, 2)}${"*".repeat(Math.min(12, trimmed.length - 4))}${trimmed.slice(-2)}`;
  }

  identityProfile(value: string): {
    encrypted: string;
    hash: string;
    masked: string;
    hashAlgorithm: "hmac-sha256";
    hashVersion: 1;
    encryptionKeyId: string;
    payloadFormatVersion: 1;
  } {
    return {
      encrypted: this.encrypt(value),
      hash: this.hash(value),
      masked: this.mask(value),
      hashAlgorithm: "hmac-sha256",
      hashVersion: 1,
      encryptionKeyId: this.keyring.activeKeyId,
      payloadFormatVersion: 1
    };
  }

  private key(keyId: string): Buffer {
    const seed = this.keyring.keys.get(keyId);
    if (!seed) throw new Error(`Party data encryption key ${keyId} is not configured`);
    return createHash("sha256").update(seed).digest();
  }
}
