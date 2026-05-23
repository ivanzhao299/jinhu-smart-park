import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const SECRET_PREFIX = "enc:v1:";

@Injectable()
export class IotDeviceSecretService {
  constructor(private readonly configService: ConfigService) {}

  generatePlainSecret(): string {
    return randomBytes(24).toString("hex");
  }

  hashSecret(value: string): string {
    return `sha256:${createHash("sha256").update(value).digest("hex")}`;
  }

  encryptSecret(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${SECRET_PREFIX}${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
  }

  decryptSecret(value: string | null): string | null {
    if (!value) {
      return null;
    }
    if (!value.startsWith(SECRET_PREFIX)) {
      return value.startsWith("sha256:") || value.startsWith("legacy-md5:") ? null : value;
    }
    const [ivHex, tagHex, encryptedHex] = value.slice(SECRET_PREFIX.length).split(":");
    if (!ivHex || !tagHex || !encryptedHex) {
      return null;
    }
    const decipher = createDecipheriv("aes-256-gcm", this.encryptionKey(), Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return Buffer.concat([decipher.update(Buffer.from(encryptedHex, "hex")), decipher.final()]).toString("utf8");
  }

  private encryptionKey(): Buffer {
    const seed =
      this.configService.get<string>("IOT_DEVICE_SECRET_ENCRYPTION_KEY") ??
      this.configService.get<string>("JWT_SECRET") ??
      this.configService.get<string>("POSTGRES_PASSWORD") ??
      "jinhu-smart-park-dev-secret";
    return createHash("sha256").update(seed).digest();
  }
}
