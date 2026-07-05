import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { TenantParkScope } from "@jinhu/shared";
import type { Repository } from "typeorm";
import { BuildingEntity } from "../buildings/entities/building.entity";
import { FloorEntity } from "../floors/entities/floor.entity";
import { OrgEntity } from "../orgs/entities/org.entity";
import { ParkTenantEntity } from "../park-tenants/entities/park-tenant.entity";
import { UnitEntity } from "../units/entities/unit.entity";
import { UserEntity } from "../users/entities/user.entity";

const REFERENCE_LIMIT = 200;

export interface ReferenceDataFormOptionsResponse {
  orgs: Array<{ id: string; orgCode: string; orgName: string; status: string }>;
  buildings: Array<{ id: string; buildingCode: string; buildingName: string }>;
  floors: Array<{ id: string; buildingId: string; floorCode: string; floorName: string }>;
  units: Array<{
    id: string;
    code: string | null;
    buildingId: string;
    floorId: string;
    unitCode: string;
    unitName: string;
    currentTenantId: string | null;
    currentTenantName: string | null;
    current_tenant_id: string | null;
    current_tenant_name: string | null;
    building: { buildingCode: string; buildingName: string } | null;
    floor: { floorCode: string; floorName: string } | null;
  }>;
  parkTenants: Array<{ id: string; companyName: string; parkTenantCode: string; contactName: string | null; contactMobile: string | null }>;
  users: Array<{ id: string; username: string; displayName: string | null; realName: string | null; mobile: string | null; status: string }>;
}

@Injectable()
export class ReferenceDataService {
  constructor(
    @InjectRepository(OrgEntity)
    private readonly orgsRepository: Repository<OrgEntity>,
    @InjectRepository(BuildingEntity)
    private readonly buildingsRepository: Repository<BuildingEntity>,
    @InjectRepository(FloorEntity)
    private readonly floorsRepository: Repository<FloorEntity>,
    @InjectRepository(UnitEntity)
    private readonly unitsRepository: Repository<UnitEntity>,
    @InjectRepository(ParkTenantEntity)
    private readonly parkTenantsRepository: Repository<ParkTenantEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>
  ) {}

  async getFormOptions(scope: TenantParkScope): Promise<ReferenceDataFormOptionsResponse> {
    const [orgs, buildings, floors, units, parkTenants, users] = await Promise.all([
      this.listOrgs(scope),
      this.listBuildings(scope),
      this.listFloors(scope),
      this.listUnits(scope),
      this.listParkTenants(scope),
      this.listUsers(scope)
    ]);

    return {
      orgs,
      buildings,
      floors,
      units,
      parkTenants,
      users
    };
  }

  private async listOrgs(scope: TenantParkScope): Promise<ReferenceDataFormOptionsResponse["orgs"]> {
    const items = await this.orgsRepository.find({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        isDeleted: false,
        status: "enabled"
      },
      order: {
        sortOrder: "ASC",
        orgCode: "ASC"
      },
      take: REFERENCE_LIMIT
    });

    return items.map((item) => ({
      id: item.id,
      orgCode: item.orgCode,
      orgName: item.orgName,
      status: item.status
    }));
  }

  private async listBuildings(scope: TenantParkScope): Promise<ReferenceDataFormOptionsResponse["buildings"]> {
    const items = await this.buildingsRepository.find({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        isDeleted: false,
        status: 1
      },
      order: {
        sortNo: "ASC",
        buildingCode: "ASC"
      },
      take: REFERENCE_LIMIT
    });

    return items.map((item) => ({
      id: item.id,
      buildingCode: item.buildingCode,
      buildingName: item.buildingName
    }));
  }

  private async listFloors(scope: TenantParkScope): Promise<ReferenceDataFormOptionsResponse["floors"]> {
    const items = await this.floorsRepository.find({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        isDeleted: false,
        status: 1
      },
      order: {
        buildingId: "ASC",
        floorNo: "ASC"
      },
      take: REFERENCE_LIMIT
    });

    return items.map((item) => ({
      id: item.id,
      buildingId: item.buildingId,
      floorCode: item.floorCode,
      floorName: item.floorName
    }));
  }

  private async listUnits(scope: TenantParkScope): Promise<ReferenceDataFormOptionsResponse["units"]> {
    const items = await this.unitsRepository.find({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        isDeleted: false,
        status: 1
      },
      relations: {
        building: true,
        floor: true
      },
      order: {
        buildingId: "ASC",
        floorId: "ASC",
        unitCode: "ASC"
      },
      take: REFERENCE_LIMIT
    });

    const tenantMap = await this.queryCurrentTenantMap(scope, items.map((item) => item.id));
    return items.map((item) => ({
      id: item.id,
      code: item.code,
      buildingId: item.buildingId,
      floorId: item.floorId,
      unitCode: item.unitCode,
      unitName: item.unitName,
      currentTenantId: tenantMap.get(item.id)?.current_tenant_id ?? null,
      currentTenantName: tenantMap.get(item.id)?.current_tenant_name ?? null,
      current_tenant_id: tenantMap.get(item.id)?.current_tenant_id ?? null,
      current_tenant_name: tenantMap.get(item.id)?.current_tenant_name ?? null,
      building: item.building ? { buildingCode: item.building.buildingCode, buildingName: item.building.buildingName } : null,
      floor: item.floor ? { floorCode: item.floor.floorCode, floorName: item.floor.floorName } : null
    }));
  }

  private async listParkTenants(scope: TenantParkScope): Promise<ReferenceDataFormOptionsResponse["parkTenants"]> {
    const items = await this.parkTenantsRepository.find({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        isDeleted: false
      },
      order: {
        companyName: "ASC"
      },
      take: REFERENCE_LIMIT
    });

    return items.map((item) => ({
      id: item.id,
      companyName: item.companyName,
      parkTenantCode: item.parkTenantCode,
      contactName: item.contactName,
      contactMobile: item.contactMobile
    }));
  }

  private async listUsers(scope: TenantParkScope): Promise<ReferenceDataFormOptionsResponse["users"]> {
    const items = await this.usersRepository.find({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        isDeleted: false,
        status: "enabled"
      },
      order: {
        displayName: "ASC",
        username: "ASC"
      },
      take: REFERENCE_LIMIT
    });

    return items.map((item) => ({
      id: item.id,
      username: item.username,
      displayName: item.displayName || item.username,
      realName: item.displayName || item.username,
      mobile: item.mobile ?? null,
      status: item.status
    }));
  }

  private async queryCurrentTenantMap(scope: TenantParkScope, unitIds: string[]) {
    if (unitIds.length === 0) {
      return new Map<string, { current_tenant_id: string | null; current_tenant_name: string | null }>();
    }

    const rows = await this.unitsRepository.manager.query(
      `SELECT
         cu.unit_id,
         pt.id AS current_tenant_id,
         pt.company_name AS current_tenant_name
       FROM rel_leasing_contract_unit cu
       INNER JOIN biz_leasing_contract c
         ON c.id = cu.contract_id
         AND c.is_deleted = false
         AND c.tenant_id = $1
         AND c.park_id = $2
         AND c.status = '75'
       INNER JOIN biz_park_tenant pt
         ON pt.id = c.park_tenant_id
         AND pt.is_deleted = false
       WHERE cu.tenant_id = $1
         AND cu.park_id = $2
         AND cu.is_deleted = false
         AND cu.status = 1
         AND cu.unit_id = ANY($3::uuid[])
       ORDER BY cu.unit_id, cu.start_date DESC`,
      [scope.tenantId, scope.parkId, unitIds]
    ) as Array<{
      unit_id: string;
      current_tenant_id: string | null;
      current_tenant_name: string | null;
    }>;

    const map = new Map<string, { current_tenant_id: string | null; current_tenant_name: string | null }>();
    for (const row of rows) {
      if (!map.has(row.unit_id)) {
        map.set(row.unit_id, {
          current_tenant_id: row.current_tenant_id,
          current_tenant_name: row.current_tenant_name
        });
      }
    }
    return map;
  }
}
