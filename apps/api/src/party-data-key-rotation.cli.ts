import { Injectable, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { SYSTEM_PERMISSIONS } from "@jinhu/shared";
import type { JwtPrincipal } from "./shared/types/jwt-principal";
import { PartyDataKeyRotationService } from "./modules/property-identity/party-data-key-rotation.service";
import { PropertyIdentityModule } from "./modules/property-identity/property-identity.module";

interface RotationActorRow {
  user_id: string;
  username: string;
  real_name: string | null;
  tenant_id: string;
  auth_version: number;
  is_tenant_super: boolean;
  role_code: string | null;
  role_is_super: boolean | null;
  permission_code: string | null;
}

@Injectable()
export class PartyDataRotationActorResolver {
  constructor(private readonly dataSource: DataSource) {}

  async resolve(tenantId: string, parkId: string, actorId: string): Promise<JwtPrincipal> {
    const rows = await this.dataSource.query<RotationActorRow[]>(
      `WITH principal AS MATERIALIZED (
         SELECT usr.id, usr.username, usr.display_name, usr.tenant_id, usr.park_id, usr.auth_version,
                EXISTS (
                  SELECT 1 FROM public.rel_user_role super_link
                  JOIN public.sys_role super_role ON super_role.id=super_link.role_id
                   AND super_role.tenant_id=usr.tenant_id AND super_role.code='SUPER_ADMIN'
                   AND super_role.role_scope='platform' AND super_role.is_super=true
                   AND super_role.is_system=true AND super_role.is_builtin=true
                   AND super_role.is_enabled=true AND super_role.status='enabled'
                   AND super_role.is_deleted=false
                  WHERE super_link.user_id=usr.id AND super_link.tenant_id=usr.tenant_id
                    AND super_link.is_deleted=false
                ) AS is_tenant_super
         FROM public.sys_user usr
         WHERE usr.id=$1::uuid AND usr.tenant_id=$2 AND usr.is_deleted=false
           AND usr.is_enabled=true AND usr.status='enabled'
       )
       SELECT principal.id::text AS user_id, principal.username,
              principal.display_name AS real_name, principal.tenant_id,
              principal.auth_version, principal.is_tenant_super,
              role.code AS role_code, role.is_super AS role_is_super,
              permission.code AS permission_code
       FROM principal
       LEFT JOIN public.rel_user_role role_link
         ON role_link.user_id=principal.id AND role_link.tenant_id=principal.tenant_id
        AND role_link.park_id=$3 AND role_link.is_deleted=false
       LEFT JOIN public.sys_role role
         ON role.id=role_link.role_id AND role.tenant_id=principal.tenant_id
        AND role.is_deleted=false AND role.is_enabled=true AND role.status='enabled'
        AND (role.role_scope='tenant' OR role.park_id=$3)
       LEFT JOIN public.rel_role_perm permission_link
         ON permission_link.role_id=role.id AND permission_link.tenant_id=principal.tenant_id
        AND permission_link.park_id=$3 AND permission_link.is_deleted=false
       LEFT JOIN public.sys_permission permission
         ON permission.id=permission_link.permission_id AND permission.tenant_id=principal.tenant_id
        AND permission.is_deleted=false AND permission.is_enabled=true AND permission.status='enabled'
       WHERE EXISTS (
         SELECT 1 FROM public.biz_park park
         WHERE park.tenant_id=principal.tenant_id AND park.park_id=$3
           AND park.status=1 AND park.is_deleted=false
       ) AND (
         principal.is_tenant_super
         OR EXISTS (
           SELECT 1 FROM public.rel_user_park access
           WHERE access.user_id=principal.id AND access.tenant_id=principal.tenant_id
             AND access.park_id=$3 AND access.status='enabled' AND access.is_deleted=false
         )
         OR (principal.park_id=$3 AND NOT EXISTS (
           SELECT 1 FROM public.rel_user_park explicit_home
           WHERE explicit_home.user_id=principal.id AND explicit_home.tenant_id=principal.tenant_id
             AND explicit_home.park_id=$3
         ))
       )`,
      [actorId, tenantId, parkId]
    );
    const first = rows[0];
    if (!first) throw new Error("Rotation actor is not enabled in the requested tenant and park");
    const roles = [...new Set(rows.flatMap((row) => row.role_code ? [row.role_code] : []))];
    const isSuper = first.is_tenant_super || rows.some((row) => row.role_is_super === true)
      || rows.some((row) => row.permission_code === "*");
    return {
      sub: first.user_id,
      username: first.username,
      realName: first.real_name ?? undefined,
      tenantId: first.tenant_id,
      parkId,
      roles: first.is_tenant_super && !roles.includes("SUPER_ADMIN") ? [...roles, "SUPER_ADMIN"] : roles,
      permissions: isSuper
        ? ["*"]
        : [...new Set(rows.flatMap((row) => row.permission_code ? [row.permission_code] : []))],
      dataScope: isSuper ? "all" : undefined,
      isSuper,
      isTenantSuper: first.is_tenant_super,
      authVersion: Number(first.auth_version)
    };
  }
}

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
    PropertyIdentityModule
  ],
  providers: [PartyDataRotationActorResolver]
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
    const actor = await app.get(PartyDataRotationActorResolver).resolve(tenantId, parkId, actorId);
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

if (require.main === module) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Party data key rotation failed"}\n`);
    process.exitCode = 1;
  });
}
