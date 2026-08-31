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

  decrypt(value: string | null, keyId = this.keyring.activeKeyId): string | null {
    if (!value?.startsWith(PREFIX)) return null;
    const [ivHex, tagHex, payloadHex] = value.slice(PREFIX.length).split(":");
    if (!ivHex || !tagHex || !payloadHex) return null;
    const decipher = createDecipheriv("aes-256-gcm", this.key(keyId), Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return Buffer.concat([decipher.update(Buffer.from(payloadHex, "hex")), decipher.final()]).toString("utf8");
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
