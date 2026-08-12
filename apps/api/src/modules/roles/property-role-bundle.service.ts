import { createHash } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import type { TenantParkScope } from "@jinhu/shared";
import { DataSource, EntityManager, In } from "typeorm";
import { PermissionEntity } from "../permissions/entities/permission.entity";
import { RolePermissionEntity } from "../permissions/entities/role-permission.entity";
import {
  ApplyPropertyRoleBundlesDto,
  CreatePropertyRoleFromBundlesDto,
  PreviewPropertyRoleBundlesDto,
  PropertyRoleBundleReferenceDto
} from "./dto/property-role-bundle.dto";
import { RoleEntity } from "./entities/role.entity";

interface BundleRow {
  id: string;
  code: string;
  name: string;
  definitionVersion: number;
  definitionHash: string;
  actualHash: string;
  version: number;
}

interface PreviewPermission {
  id: string;
  code: string;
  name: string;
}

export function computePropertyRoleBundleDiff(
  bundlePermissions: PreviewPermission[],
  currentPermissions: PreviewPermission[],
  mode: "merge" | "sync"
) {
  const bundleByCode = new Map(bundlePermissions.map((permission) => [permission.code, permission]));
  const currentByCode = new Map(currentPermissions.map((permission) => [permission.code, permission]));
  const add = bundlePermissions.filter((permission) => !currentByCode.has(permission.code));
  const extras = currentPermissions.filter((permission) => !bundleByCode.has(permission.code));
  const keepExtra = mode === "merge" ? extras : [];
  const removeExtra = mode === "sync" ? extras : [];
  const finalByCode = new Map(bundleByCode);
  for (const permission of keepExtra) finalByCode.set(permission.code, permission);
  return {
    add,
    keepExtra,
    removeExtra,
    final: [...finalByCode.values()].sort((a, b) => a.code.localeCompare(b.code))
  };
}

export interface PropertyRoleBundlePreview {
  roleId: string | null;
  roleVersion: number | null;
  mode: "merge" | "sync";
  bundles: Array<Omit<BundleRow, "id" | "actualHash">>;
  add: PreviewPermission[];
  keepExtra: PreviewPermission[];
  removeExtra: PreviewPermission[];
  final: PreviewPermission[];
  bundleSignature: string;
  previewSignature: string;
  requiresRemovalConfirmation: boolean;
}

@Injectable()
export class PropertyRoleBundleService {
  constructor(private readonly dataSource: DataSource) {}

  async listBundles() {
    const rows = await this.dataSource.query<Array<{
      code: string;
      name: string;
      definitionVersion: number;
      definitionHash: string;
      actualHash: string;
      version: number;
      permissionCount: string;
    }>>(`
      SELECT bundle.bundle_code AS "code", bundle.bundle_name AS "name",
             bundle.definition_version AS "definitionVersion",
             bundle.definition_hash AS "definitionHash",
             encode(digest(convert_to(
               'property-bundle-v1' || chr(10) || bundle.bundle_code || chr(9)
               || bundle.bundle_name || chr(10)
               || string_agg(lpad(member.member_ordinal::text,4,'0') || chr(9)
                    || member.permission_code || chr(10), '' ORDER BY member.member_ordinal),
               'UTF8'), 'sha256'), 'hex') AS "actualHash",
             bundle.version,
             count(member.permission_code)::text AS "permissionCount"
      FROM sys_property_permission_bundle bundle
      JOIN rel_property_permission_bundle_member member
        ON member.bundle_id=bundle.id AND member.is_deleted=false
      WHERE bundle.status='enabled' AND bundle.is_deleted=false
      GROUP BY bundle.id,bundle.bundle_code,bundle.bundle_name,
               bundle.definition_version,bundle.definition_hash,bundle.version
      ORDER BY bundle.bundle_code
    `);
    this.assertStoredBundleHashes(rows);
    return rows.map(({ actualHash: _actualHash, ...row }) => ({ ...row, permissionCount: Number(row.permissionCount) }));
  }

  preview(scope: TenantParkScope, dto: PreviewPropertyRoleBundlesDto, roleId?: string) {
    return this.resolvePreview(this.dataSource.manager, scope, dto, roleId, false);
  }

  async create(
    scope: TenantParkScope,
    actorId: string,
    dto: CreatePropertyRoleFromBundlesDto
  ): Promise<RoleEntity> {
    try {
      return await this.dataSource.transaction(async (manager) => {
      const preview = await this.resolvePreview(manager, scope, dto, undefined, true);
      this.assertPreviewSignature(preview, dto.previewSignature);
      const repository = manager.getRepository(RoleEntity);
      const existing = await repository.findOne({
        where: { tenantId: scope.tenantId, code: dto.code, isDeleted: false }
      });
      if (existing) throw new ConflictException("Role code already exists in tenant");

      const role = repository.create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        code: dto.code,
        name: dto.name.trim(),
        parentId: null,
        rolePath: dto.code,
        roleLevel: 1,
        level: 1,
        sortNo: 0,
        roleType: "property_bundle",
        roleScope: "park",
        dataScope: "40",
        dataScopeConfig: {},
        isTemplate: false,
        managedTemplateCode: null,
        templateDefinitionVersion: null,
        templateDefinitionHash: null,
        appliedBundleCodes: preview.bundles.map((bundle) => bundle.code),
        appliedBundleSignature: preview.bundleSignature,
        isSystem: false,
        isBuiltin: false,
        isSuper: false,
        editable: true,
        isEditable: true,
        isDeletable: true,
        isEnabled: true,
        status: "enabled",
        createBy: actorId,
        updateBy: actorId,
        remark: dto.remark?.trim() || "PR262 role created from property permission bundles"
      });
      const saved = await repository.save(role);
      await this.replacePermissions(manager, scope, actorId, saved.id, preview.final);
      await this.ensureCurrentParkScope(manager, scope, actorId, saved.id);
        return saved;
      });
    } catch (error) {
      const databaseError = error as { code?: unknown; constraint?: unknown; driverError?: { code?: unknown; constraint?: unknown } };
      const code = String(databaseError.code ?? databaseError.driverError?.code ?? "");
      const constraint = String(databaseError.constraint ?? databaseError.driverError?.constraint ?? "");
      if (code === "23505" && constraint === "uq_sys_role_tenant_code_active") {
        throw new ConflictException("Role code already exists in tenant");
      }
      throw error;
    }
  }

  async apply(
    scope: TenantParkScope,
    actorId: string,
    roleId: string,
    dto: ApplyPropertyRoleBundlesDto
  ): Promise<RoleEntity> {
    return this.dataSource.transaction(async (manager) => {
      const role = await manager.getRepository(RoleEntity)
        .createQueryBuilder("role")
        .setLock("pessimistic_write")
        .where("role.id=:roleId", { roleId })
        .andWhere("role.tenant_id=:tenantId", { tenantId: scope.tenantId })
        .andWhere("role.park_id=:parkId", { parkId: scope.parkId })
        .andWhere("role.role_scope='park'")
        .andWhere("role.is_deleted=false")
        .getOne();
      if (!role) throw new NotFoundException("Role not found");
      if (role.version !== dto.roleVersion) throw new ConflictException("Role version changed; preview again");
      if (role.isTemplate || role.isSystem || role.isBuiltin || !role.editable || !role.isEditable) {
        throw new ForbiddenException("Protected role cannot be updated from bundles");
      }

      const preview = await this.resolvePreview(manager, scope, dto, roleId, true, role);
      this.assertPreviewSignature(preview, dto.previewSignature);
      if (preview.removeExtra.length > 0 && dto.mode === "sync" && dto.confirmRemovals !== true) {
        throw new BadRequestException("Sync mode requires explicit removal confirmation");
      }

      await this.replacePermissions(manager, scope, actorId, roleId, preview.final);
      role.appliedBundleCodes = preview.bundles.map((bundle) => bundle.code);
      role.appliedBundleSignature = preview.bundleSignature;
      role.dataScope = "40";
      role.dataScopeConfig = {};
      role.updateBy = actorId;
      const saved = await manager.getRepository(RoleEntity).save(role);
      await this.ensureCurrentParkScope(manager, scope, actorId, roleId);
      return saved;
    });
  }

  private async resolvePreview(
    manager: EntityManager,
    scope: TenantParkScope,
    dto: PreviewPropertyRoleBundlesDto,
    roleId?: string,
    lockBundles = false,
    lockedRole?: RoleEntity
  ): Promise<PropertyRoleBundlePreview> {
    const references = [...dto.bundles].sort((a, b) => a.code.localeCompare(b.code));
    if (new Set(references.map((item) => item.code)).size !== references.length) {
      throw new BadRequestException("Duplicate bundle codes are not allowed");
    }
    if (lockBundles) {
      await manager.query(`
        SELECT bundle.id,member.id
        FROM sys_property_permission_bundle bundle
        JOIN rel_property_permission_bundle_member member
          ON member.bundle_id=bundle.id AND member.is_deleted=false
        WHERE bundle.bundle_code = ANY($1::varchar[])
          AND bundle.status='enabled' AND bundle.is_deleted=false
        FOR SHARE OF bundle,member
      `, [references.map((item) => item.code)]);
    }
    const bundles = await manager.query<BundleRow[]>(`
      SELECT bundle.id,bundle.bundle_code AS "code",bundle.bundle_name AS "name",
             bundle.definition_version AS "definitionVersion",
             bundle.definition_hash AS "definitionHash",
             encode(digest(convert_to(
               'property-bundle-v1' || chr(10) || bundle.bundle_code || chr(9)
               || bundle.bundle_name || chr(10)
               || string_agg(lpad(member.member_ordinal::text,4,'0') || chr(9)
                    || member.permission_code || chr(10), '' ORDER BY member.member_ordinal),
               'UTF8'), 'sha256'), 'hex') AS "actualHash",
             bundle.version
      FROM sys_property_permission_bundle bundle
      JOIN rel_property_permission_bundle_member member
        ON member.bundle_id=bundle.id AND member.is_deleted=false
      WHERE bundle.bundle_code = ANY($1::varchar[]) AND bundle.status='enabled' AND bundle.is_deleted=false
      GROUP BY bundle.id,bundle.bundle_code,bundle.bundle_name,bundle.definition_version,
               bundle.definition_hash,bundle.version
      ORDER BY bundle.bundle_code
    `, [references.map((item) => item.code)]);
    this.assertStoredBundleHashes(bundles);
    this.assertBundleReferences(references, bundles);

    const bundlePermissions = await manager.query<PreviewPermission[]>(`
      SELECT DISTINCT permission.id,permission.code,permission.name
      FROM sys_property_permission_bundle bundle
      JOIN rel_property_permission_bundle_member member
        ON member.bundle_id=bundle.id AND member.is_deleted=false
      JOIN sys_permission permission
        ON permission.tenant_id=$2 AND permission.code=member.permission_code
       AND permission.is_enabled=true AND permission.status='enabled' AND permission.is_deleted=false
      WHERE bundle.bundle_code = ANY($1::varchar[])
        AND bundle.status='enabled' AND bundle.is_deleted=false
      ORDER BY permission.code
    `, [references.map((item) => item.code), scope.tenantId]);
    const memberCounts = await manager.query<Array<{ expectedCount: string }>>(`
      SELECT count(DISTINCT member.permission_code)::text AS "expectedCount"
      FROM sys_property_permission_bundle bundle
      JOIN rel_property_permission_bundle_member member
        ON member.bundle_id=bundle.id AND member.is_deleted=false
      WHERE bundle.bundle_code = ANY($1::varchar[])
        AND bundle.status='enabled' AND bundle.is_deleted=false
    `, [references.map((item) => item.code)]);
    if (Number(memberCounts[0]?.expectedCount ?? -1) !== bundlePermissions.length) {
      throw new ConflictException("Bundle permission catalog is incomplete; reconcile before retrying");
    }

    let role = lockedRole;
    let current: PreviewPermission[] = [];
    if (roleId) {
      role ??= await manager.getRepository(RoleEntity).findOne({
        where: { id: roleId, tenantId: scope.tenantId, parkId: scope.parkId, roleScope: "park", isDeleted: false }
      }) ?? undefined;
      if (!role) throw new NotFoundException("Role not found");
      current = await manager.query<PreviewPermission[]>(`
        SELECT permission.id,permission.code,permission.name
        FROM rel_role_perm link
        JOIN sys_permission permission ON permission.id=link.permission_id
          AND permission.tenant_id=$2 AND permission.status='enabled'
          AND permission.is_enabled=true AND permission.is_deleted=false
        WHERE link.role_id=$1 AND link.tenant_id=$2 AND link.park_id=$3 AND link.is_deleted=false
        ORDER BY permission.code
      `, [roleId, scope.tenantId, scope.parkId]);
    }

    const { add, keepExtra, removeExtra, final } = computePropertyRoleBundleDiff(bundlePermissions, current, dto.mode);
    const bundleSignature = this.hash(references.map((item) => `${item.code}@${item.version}:${item.hash}`).join("\n"));
    const previewSignature = this.hash([
      "property-role-bundle-preview-v1",
      role?.id ?? "new",
      String(role?.version ?? 0),
      dto.mode,
      bundleSignature,
      final.map((permission) => permission.code).join(","),
      removeExtra.map((permission) => permission.code).join(",")
    ].join("\n"));
    return {
      roleId: role?.id ?? null,
      roleVersion: role?.version ?? null,
      mode: dto.mode,
      bundles: bundles.map(({ id: _id, actualHash: _actualHash, ...bundle }) => bundle),
      add,
      keepExtra,
      removeExtra,
      final,
      bundleSignature,
      previewSignature,
      requiresRemovalConfirmation: removeExtra.length > 0
    };
  }

  private assertBundleReferences(references: PropertyRoleBundleReferenceDto[], bundles: BundleRow[]) {
    if (bundles.length !== references.length) throw new ConflictException("Bundle catalog changed; reload and preview again");
    for (const reference of references) {
      const bundle = bundles.find((item) => item.code === reference.code);
      if (!bundle || Number(bundle.definitionVersion) !== reference.version || bundle.definitionHash !== reference.hash) {
        throw new ConflictException(`Bundle definition changed: ${reference.code}`);
      }
    }
  }

  private assertStoredBundleHashes(bundles: Array<Pick<BundleRow, "code" | "definitionHash" | "actualHash">>) {
    const drifted = bundles.find((bundle) => bundle.definitionHash !== bundle.actualHash);
    if (drifted) throw new ConflictException(`Bundle member definition drifted: ${drifted.code}`);
  }

  private assertPreviewSignature(preview: PropertyRoleBundlePreview, submitted: string) {
    if (preview.previewSignature !== submitted) throw new ConflictException("Preview is stale; preview again");
  }

  private async replacePermissions(
    manager: EntityManager,
    scope: TenantParkScope,
    actorId: string,
    roleId: string,
    permissions: PreviewPermission[]
  ) {
    const repository = manager.getRepository(RolePermissionEntity);
    await repository.update(
      { tenantId: scope.tenantId, parkId: scope.parkId, roleId, isDeleted: false },
      { isDeleted: true, updateBy: actorId }
    );
    if (permissions.length === 0) return;
    const permissionRows = await manager.getRepository(PermissionEntity)
      .createQueryBuilder("permission")
      .setLock("pessimistic_read")
      .where({
        id: In(permissions.map((permission) => permission.id)),
        tenantId: scope.tenantId,
        status: "enabled",
        isEnabled: true,
        isDeleted: false
      })
      .getMany();
    if (permissionRows.length !== permissions.length) throw new ConflictException("Permission catalog changed; preview again");
    await repository.save(permissionRows.map((permission) => repository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      roleId,
      permissionId: permission.id,
      createBy: actorId,
      updateBy: actorId,
      remark: "PR262 property bundle role permission"
    })));
  }

  private async ensureCurrentParkScope(manager: EntityManager, scope: TenantParkScope, actorId: string, roleId: string) {
    const rules = await manager.query<Array<{ id: string }>>(`
      SELECT id FROM sys_data_scope_rule
      WHERE tenant_id=$1 AND park_id=$2 AND rule_code='current_park'
        AND dimension='park' AND scope_type='park' AND status='enabled' AND is_deleted=false
    `, [scope.tenantId, scope.parkId]);
    if (rules.length !== 1) throw new ConflictException("Current park data-scope rule is missing or ambiguous");
    const currentParkRule = rules[0];
    if (!currentParkRule) throw new ConflictException("Current park data-scope rule is missing or ambiguous");
    await manager.query(`
      UPDATE rel_role_data_scope
      SET is_deleted=true,update_by=$5,update_time=clock_timestamp(),version=version+1,
          remark='PR262 superseded by property bundle current_park scope'
      WHERE tenant_id=$1 AND park_id=$2 AND role_id=$3 AND rule_id<>$4 AND is_deleted=false
    `, [scope.tenantId, scope.parkId, roleId, currentParkRule.id, actorId]);
    await manager.query(`
      INSERT INTO rel_role_data_scope (
        tenant_id,park_id,role_id,rule_id,create_by,update_by,
        create_time,update_time,is_deleted,version,remark
      ) VALUES ($1,$2,$3,$4,$5,$5,clock_timestamp(),clock_timestamp(),false,1,$6)
      ON CONFLICT (tenant_id,park_id,role_id,rule_id) WHERE is_deleted=false
      DO UPDATE SET is_deleted=false,update_by=EXCLUDED.update_by,
        update_time=clock_timestamp(),remark=EXCLUDED.remark
    `, [scope.tenantId, scope.parkId, roleId, currentParkRule.id, actorId, "PR262 property bundle current_park scope"]);
  }

  private hash(value: string) {
    return createHash("sha256").update(value, "utf8").digest("hex");
  }
}
