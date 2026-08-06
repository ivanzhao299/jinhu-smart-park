import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";

@Injectable()
export class PartySensitiveDataService {
  constructor(private readonly configService: ConfigService) {}

  encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key(), iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return `${PREFIX}${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${encrypted.toString("hex")}`;
  }

  decrypt(value: string | null): string | null {
    if (!value?.startsWith(PREFIX)) return null;
    const [ivHex, tagHex, payloadHex] = value.slice(PREFIX.length).split(":");
    if (!ivHex || !tagHex || !payloadHex) return null;
    const decipher = createDecipheriv("aes-256-gcm", this.key(), Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return Buffer.concat([decipher.update(Buffer.from(payloadHex, "hex")), decipher.final()]).toString("utf8");
  }

  hash(value: string): string {
    return `hmac256:${createHmac("sha256", this.key()).update(value.trim()).digest("hex")}`;
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
    encryptionKeyId: "party-data-v1";
    payloadFormatVersion: 1;
  } {
    return {
      encrypted: this.encrypt(value),
      hash: this.hash(value),
      masked: this.mask(value),
      hashAlgorithm: "hmac-sha256",
      hashVersion: 1,
      encryptionKeyId: "party-data-v1",
      payloadFormatVersion: 1
    };
  }

  private key(): Buffer {
    const seed =
      this.configService.get<string>("PARTY_DATA_ENCRYPTION_KEY") ??
      this.configService.get<string>("IOT_DEVICE_SECRET_ENCRYPTION_KEY") ??
      this.configService.get<string>("JWT_SECRET") ??
      "jinhu-smart-park-dev-secret";
    return createHash("sha256").update(seed).digest();
  }
}
