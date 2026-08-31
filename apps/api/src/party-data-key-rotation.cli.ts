import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { PartyDataKeyRotationService } from "./modules/property-identity/party-data-key-rotation.service";
import type { JwtPrincipal } from "./shared/types/jwt-principal";

function argument(name: string): string {
  const prefix = `--${name}=`;
  const value = process.argv.slice(2).find((item) => item.startsWith(prefix))?.slice(prefix.length).trim();
  if (!value) throw new Error(`Missing required argument ${prefix}<value>`);
  return value;
}

async function main(): Promise<void> {
  const tenantId = argument("tenant-id");
  const parkId = argument("park-id");
  const actorId = argument("actor-id");
  const requestKey = argument("request-key");
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });
  try {
    const actor: JwtPrincipal = {
      sub: actorId,
      username: "party-data-key-rotation-cli",
      tenantId,
      parkId,
      roles: ["SECURITY_OPERATOR"],
      permissions: []
    };
    const result = await app.get(PartyDataKeyRotationService).rotate(
      { tenantId, parkId },
      actor,
      requestKey
    );
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Party data key rotation failed"}\n`);
  process.exitCode = 1;
});
