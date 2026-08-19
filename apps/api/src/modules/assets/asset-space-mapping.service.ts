import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { TenantParkScope } from "@jinhu/shared";
import type { DataSource, EntityManager } from "typeorm";
import type { ConvertAssetUnitDto, MapAssetSpaceDto } from "./dto/map-asset-space.dto";

type SpaceType = "building" | "floor" | "unit";
type SourceRow = Record<string, string | number | boolean | null>;

@Injectable()
export class AssetSpaceMappingService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async listUnitCandidates(scope: TenantParkScope, page: number, pageSize: number, keyword?: string) {
    const pattern = keyword?.trim() ? `%${keyword.trim()}%` : null;
    const parameters = [scope.tenantId, scope.parkId, pattern, pageSize, (page - 1) * pageSize];
    const rows = await this.dataSource.query(
      `SELECT source.id AS "assetUnitId", source.unit_code AS "unitCode", source.unit_name AS "unitName",
              source.unit_no AS "unitNo", source.building_area AS "buildingArea", source.rentable_area AS "rentableArea",
              asset_building.id AS "assetBuildingId", asset_building.building_name AS "buildingName",
              asset_floor.id AS "assetFloorId", asset_floor.floor_name AS "floorName",
              business_building.id AS "operatingBuildingId", business_floor.id AS "operatingFloorId",
              business_unit.id AS "operatingUnitId", count(*) OVER()::int AS "total"
       FROM asset_unit source
       JOIN asset_building ON asset_building.id=source.building_id AND asset_building.is_deleted=false
       JOIN asset_floor ON asset_floor.id=source.floor_id AND asset_floor.is_deleted=false
       LEFT JOIN biz_building business_building ON business_building.tenant_id=source.tenant_id::text
         AND business_building.park_id=source.park_id::text AND business_building.asset_building_id=asset_building.id
         AND business_building.is_deleted=false
       LEFT JOIN biz_floor business_floor ON business_floor.tenant_id=source.tenant_id::text
         AND business_floor.park_id=source.park_id::text AND business_floor.asset_floor_id=asset_floor.id
         AND business_floor.building_id=business_building.id AND business_floor.is_deleted=false
       LEFT JOIN biz_unit business_unit ON business_unit.tenant_id=source.tenant_id::text
         AND business_unit.park_id=source.park_id::text AND business_unit.asset_unit_id=source.id AND business_unit.is_deleted=false
       WHERE source.tenant_id::text=$1 AND source.park_id::text=$2 AND source.is_deleted=false
         AND ($3::text IS NULL OR source.unit_code ILIKE $3 OR source.unit_name ILIKE $3
           OR asset_building.building_name ILIKE $3 OR asset_floor.floor_name ILIKE $3)
       ORDER BY asset_building.sort_order, asset_floor.sort_order, source.unit_code
       LIMIT $4 OFFSET $5`, parameters);
    return { items: rows.map(({ total: _total, ...row }: Record<string, unknown>) => row), total: Number(rows[0]?.total ?? 0), page, page_size: pageSize };
  }

  mapBuilding(scope: TenantParkScope, actorId: string, assetId: string, key: string | undefined, dto: MapAssetSpaceDto) {
    return this.mapParentSpace(scope, actorId, "building", assetId, this.requireKey(key), dto);
  }

  mapFloor(scope: TenantParkScope, actorId: string, assetId: string, key: string | undefined, dto: MapAssetSpaceDto) {
    return this.mapParentSpace(scope, actorId, "floor", assetId, this.requireKey(key), dto);
  }

  convertUnit(scope: TenantParkScope, actorId: string, assetId: string, key: string | undefined, dto: ConvertAssetUnitDto) {
    const idempotencyKey = this.requireKey(key);
    return this.dataSource.transaction(async (manager) => {
      await this.lock(manager, scope, "unit", assetId);
      const replay = await this.replay(manager, scope, "unit", "create", idempotencyKey, assetId);
      if (replay) return replay;

      const [source] = await manager.query(
        `SELECT source.*, building.id AS business_building_id, floor.id AS business_floor_id
           FROM asset_unit source
           LEFT JOIN biz_building building ON building.tenant_id=source.tenant_id::text AND building.park_id=source.park_id::text
             AND building.asset_building_id=source.building_id AND building.is_deleted=false
           LEFT JOIN biz_floor floor ON floor.tenant_id=source.tenant_id::text AND floor.park_id=source.park_id::text
             AND floor.asset_floor_id=source.floor_id AND floor.building_id=building.id AND floor.is_deleted=false
          WHERE source.id=$1 AND source.tenant_id::text=$2 AND source.park_id::text=$3 AND source.is_deleted=false
          FOR UPDATE OF source`,
        [assetId, scope.tenantId, scope.parkId]
      );
      if (!source) throw new NotFoundException("Asset unit not found");
      if (!source.business_building_id || !source.business_floor_id) {
        throw new ConflictException("Map the asset building and floor before creating an operating unit");
      }
      const existing = await this.findMapped(manager, scope, "unit", assetId);
      if (existing) throw new ConflictException("Asset unit is already mapped to an operating unit");

      try {
        const [created] = await manager.query(
          `INSERT INTO biz_unit
             (tenant_id, park_id, unit_code, asset_unit_id, code, building_id, floor_id, unit_name,
              usage_type, unit_area, use_area, rental_status, fitting_status, ref_price, available_date,
              status, create_by, update_by, remark)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::numeric,$11::numeric,$12,$13,$14::numeric,$15,1,$16,$16,$17)
           RETURNING *`,
          [scope.tenantId, scope.parkId, source.unit_code, assetId, source.unit_no, source.business_building_id,
            source.business_floor_id, source.unit_name, dto.usageType, source.building_area,
            dto.useArea === undefined ? source.rentable_area : String(dto.useArea), dto.rentalStatus,
            dto.fittingStatus, String(dto.refPrice ?? 0), dto.availableDate ?? null, actorId, dto.remark ?? null]
        );
        await this.audit(manager, scope, "unit", assetId, created.id, "create", dto.reason, idempotencyKey, actorId, created);
        return created;
      } catch (error) {
        if (this.constraint(error) === "idx_biz_unit_entity_scope_code") {
          throw new ConflictException("Operating unit code already exists in this park");
        }
        if (this.constraint(error) === "uq_biz_unit_asset_unit_active") {
          const winner = await this.findMapped(manager, scope, "unit", assetId);
          if (winner) return winner;
        }
        throw error;
      }
    });
  }

  async linkExistingUnit(manager: EntityManager, scope: TenantParkScope, actorId: string, assetId: string,
    businessId: string, key: string | undefined, reason: string) {
    const idempotencyKey = this.requireKey(key);
    await this.lock(manager, scope, "unit", assetId);
    const replay = await this.replay(manager, scope, "unit", "link", idempotencyKey, assetId);
    if (replay) {
      if (replay.id !== businessId) throw new ConflictException("Idempotency key belongs to another operating unit");
      return replay;
    }
    const [source] = await manager.query(
      `SELECT source.id FROM asset_unit source
       JOIN biz_building building ON building.tenant_id=source.tenant_id::text AND building.park_id=source.park_id::text
         AND building.asset_building_id=source.building_id AND building.is_deleted=false
       JOIN biz_floor floor ON floor.tenant_id=source.tenant_id::text AND floor.park_id=source.park_id::text
         AND floor.asset_floor_id=source.floor_id AND floor.building_id=building.id AND floor.is_deleted=false
       JOIN biz_unit target ON target.id=$4 AND target.tenant_id=source.tenant_id::text AND target.park_id=source.park_id::text
         AND target.building_id=building.id AND target.floor_id=floor.id AND target.is_deleted=false
       WHERE source.id=$1 AND source.tenant_id::text=$2 AND source.park_id::text=$3 AND source.is_deleted=false
       FOR UPDATE OF source, target`,
      [assetId, scope.tenantId, scope.parkId, businessId]);
    if (!source) throw new ConflictException("Asset unit and operating unit parent mappings do not match");
    const mapped = await this.findMapped(manager, scope, "unit", assetId);
    if (mapped) throw new ConflictException("Physical asset unit is already mapped to another operating unit");
    const [target] = await manager.query(
      `UPDATE biz_unit SET asset_unit_id=$1, update_by=$2, update_time=now(), version=version+1
       WHERE id=$3 AND tenant_id=$4 AND park_id=$5 AND is_deleted=false RETURNING *`,
      [assetId, actorId, businessId, scope.tenantId, scope.parkId]);
    await this.audit(manager, scope, "unit", assetId, businessId, "link", reason, idempotencyKey, actorId, target);
    return target;
  }

  async unlinkExistingUnit(manager: EntityManager, scope: TenantParkScope, actorId: string, businessId: string,
    assetId: string, key: string | undefined, reason: string) {
    const idempotencyKey = this.requireKey(key);
    await this.lock(manager, scope, "unit", assetId);
    const replay = await this.replay(manager, scope, "unit", "unlink", idempotencyKey, assetId);
    if (replay) return replay;
    const [target] = await manager.query(
      `UPDATE biz_unit SET asset_unit_id=NULL, update_by=$1, update_time=now(), version=version+1
       WHERE id=$2 AND tenant_id=$3 AND park_id=$4 AND asset_unit_id=$5 AND is_deleted=false RETURNING *`,
      [actorId, businessId, scope.tenantId, scope.parkId, assetId]);
    if (!target) throw new ConflictException("Operating unit asset mapping has changed");
    await this.audit(manager, scope, "unit", assetId, businessId, "unlink", reason, idempotencyKey, actorId, target);
    return target;
  }

  private mapParentSpace(scope: TenantParkScope, actorId: string, type: Exclude<SpaceType, "unit">, assetId: string, key: string, dto: MapAssetSpaceDto) {
    return this.dataSource.transaction(async (manager) => {
      await this.lock(manager, scope, type, assetId);
      const action = dto.mode === "create" ? "create" : "link";
      const replay = await this.replay(manager, scope, type, action, key, assetId);
      if (replay) return replay;
      const source = await this.loadParentSource(manager, scope, type, assetId);
      const existing = await this.findMapped(manager, scope, type, assetId);
      if (existing) throw new ConflictException(`Asset ${type} is already mapped to an operating ${type}`);

      let target: Record<string, unknown>;
      if (dto.mode === "link") {
        if (!dto.businessId) throw new BadRequestException("businessId is required for link mode");
        target = await this.linkExisting(manager, scope, type, source, dto.businessId, actorId);
      } else {
        target = await this.createParent(manager, scope, type, source, actorId);
      }
      await this.audit(manager, scope, type, assetId, String(target.id), action, dto.reason, key, actorId, target);
      return target;
    });
  }

  private async loadParentSource(manager: EntityManager, scope: TenantParkScope, type: Exclude<SpaceType, "unit">, id: string) {
    const table = `asset_${type}`;
    const [source] = await manager.query(
      `SELECT * FROM ${table} WHERE id=$1 AND tenant_id::text=$2 AND park_id::text=$3 AND is_deleted=false FOR UPDATE`,
      [id, scope.tenantId, scope.parkId]
    );
    if (!source) throw new NotFoundException(`Asset ${type} not found`);
    return source;
  }

  private async linkExisting(manager: EntityManager, scope: TenantParkScope, type: Exclude<SpaceType, "unit">, source: SourceRow, businessId: string, actorId: string) {
    const parentClause = type === "floor"
      ? ` AND EXISTS (SELECT 1 FROM biz_building b WHERE b.id=target.building_id AND b.asset_building_id=$5 AND b.is_deleted=false)`
      : "";
    const params = type === "floor"
      ? [source.id, actorId, businessId, scope.tenantId, source.building_id, scope.parkId]
      : [source.id, actorId, businessId, scope.tenantId, scope.parkId];
    const parkParam = type === "floor" ? "$6" : "$5";
    const [target] = await manager.query(
      `UPDATE biz_${type} target SET asset_${type}_id=$1, update_by=$2, update_time=now(), version=version+1
        WHERE target.id=$3 AND target.tenant_id=$4 AND target.park_id=${parkParam} AND target.is_deleted=false${parentClause}
        RETURNING target.*`, params);
    if (!target) throw new ConflictException(`Operating ${type} not found or parent mapping does not match`);
    return target;
  }

  private async createParent(manager: EntityManager, scope: TenantParkScope, type: Exclude<SpaceType, "unit">, source: SourceRow, actorId: string) {
    if (type === "building") {
      const [row] = await manager.query(
        `INSERT INTO biz_building (tenant_id,park_id,building_code,building_name,asset_building_id,floor_count,build_area,status,sort_no,create_by,update_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7::numeric,$8,$9,$10,$10) RETURNING *`,
        [scope.tenantId, scope.parkId, source.building_code, source.building_name, source.id, source.floor_count,
          source.total_area, source.status === "enabled" ? 1 : 0, source.sort_order, actorId]);
      return row;
    }
    const [parent] = await manager.query(
      `SELECT id FROM biz_building WHERE tenant_id=$1 AND park_id=$2 AND asset_building_id=$3 AND is_deleted=false`,
      [scope.tenantId, scope.parkId, source.building_id]);
    if (!parent) throw new ConflictException("Map the asset building before creating an operating floor");
    const [row] = await manager.query(
      `INSERT INTO biz_floor (tenant_id,park_id,building_id,asset_floor_id,floor_code,floor_no,floor_name,floor_area,status,sort_no,create_by,update_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::numeric,$9,$10,$11,$11) RETURNING *`,
      [scope.tenantId, scope.parkId, parent.id, source.id, source.floor_code, source.floor_no, source.floor_name,
        source.gross_area, source.status === "enabled" ? 1 : 0, source.sort_order, actorId]);
    return row;
  }

  private async findMapped(manager: EntityManager, scope: TenantParkScope, type: SpaceType, assetId: string) {
    const [row] = await manager.query(
      `SELECT * FROM biz_${type} WHERE tenant_id=$1 AND park_id=$2 AND asset_${type}_id=$3 AND is_deleted=false`,
      [scope.tenantId, scope.parkId, assetId]);
    return row ?? null;
  }

  private async replay(manager: EntityManager, scope: TenantParkScope, type: SpaceType, action: string, key: string, assetId: string) {
    const [audit] = await manager.query(
      `SELECT asset_id, business_id FROM biz_asset_space_mapping_audit
       WHERE tenant_id=$1 AND park_id=$2 AND entity_type=$3 AND action=$4 AND idempotency_key=$5`,
      [scope.tenantId, scope.parkId, type, action, key]);
    if (!audit) return null;
    if (audit.asset_id !== assetId) throw new ConflictException("Idempotency key belongs to another asset mapping");
    const [row] = await manager.query(`SELECT * FROM biz_${type} WHERE id=$1`, [audit.business_id]);
    if (!row) throw new ConflictException("Idempotent mapping result is no longer available");
    return row;
  }

  private audit(manager: EntityManager, scope: TenantParkScope, type: SpaceType, assetId: string, businessId: string,
    action: string, reason: string, key: string, actorId: string, snapshot: unknown) {
    return manager.query(
      `INSERT INTO biz_asset_space_mapping_audit
       (tenant_id,park_id,entity_type,asset_id,business_id,action,reason,idempotency_key,operator_id,mapping_snapshot)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
      [scope.tenantId, scope.parkId, type, assetId, businessId, action, reason.trim(), key, actorId, JSON.stringify(snapshot)]);
  }

  private lock(manager: EntityManager, scope: TenantParkScope, type: SpaceType, assetId: string) {
    return manager.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`${scope.tenantId}:${scope.parkId}:asset-space:${type}:${assetId}`]);
  }

  private requireKey(key: string | undefined) {
    const value = key?.trim();
    if (!value || value.length < 8 || value.length > 128) throw new BadRequestException("X-Idempotency-Key must contain 8 to 128 characters");
    return value;
  }

  private constraint(error: unknown): string | undefined {
    return typeof error === "object" && error !== null && "constraint" in error ? String((error as { constraint?: unknown }).constraint) : undefined;
  }
}
