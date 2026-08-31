import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SYSTEM_PERMISSIONS } from "@jinhu/shared";
import { PartyDataKeyRotationService } from "./modules/property-identity/party-data-key-rotation.service";
import { PropertyIdentityModule } from "./modules/property-identity/property-identity.module";
import { UsersModule } from "./modules/users/users.module";
import { UsersService } from "./modules/users/users.service";

@Module({
  imports: [
    ConfigModule.forRoot({ envFilePath: [".env", "../../.env"], isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: "postgres" as const,
        host: config.get<string>("POSTGRES_HOST", "localhost"),
        port: config.get<number>("POSTGRES_PORT", 5432),
        database: config.get<string>("POSTGRES_DB", "jinhu_smart_park"),
        username: config.get<string>("POSTGRES_USER", "jinhu"),
        password: config.getOrThrow<string>("POSTGRES_PASSWORD"),
        autoLoadEntities: true,
        synchronize: false
      })
    }),
    UsersModule,
    PropertyIdentityModule
  ]
})
class PartyDataKeyRotationCliModule {}

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
  const app = await NestFactory.createApplicationContext(PartyDataKeyRotationCliModule, {
    logger: ["error", "warn"]
  });
  try {
    const scope = { tenantId, parkId };
    const actor = await app.get(UsersService).resolveJwtPrincipal(scope, actorId);
    if (actor.tenantId !== tenantId || actor.parkId !== parkId) {
      throw new Error("Rotation actor scope does not match the requested tenant and park");
    }
    if (!actor.permissions.includes("*")
      && !actor.permissions.includes(SYSTEM_PERMISSIONS.PARTY_IDENTITY_VERIFY)) {
      throw new Error("Rotation actor lacks party identity verification permission");
    }
    const result = await app.get(PartyDataKeyRotationService).rotate(
      scope,
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
