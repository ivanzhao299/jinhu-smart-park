import { BadRequestException } from "@nestjs/common";
import type { DataScopeConfig, DataScopeDimension } from "./entities/data-scope-rule.entity";

export function normalizeDataScopeType(scope: string): string {
  return ({ "10": "self", "20": "org", "30": "org_and_children", "40": "park", "50": "tenant", "60": "custom" })[scope] ?? scope;
}

export function idsForDataScopeDimension(dimension: DataScopeDimension, config: DataScopeConfig): string[] {
  const byDimension: Record<DataScopeDimension, string[] | undefined> = {
    tenant: config.tenantIds ?? config.ids,
    park: config.parkIds ?? config.ids,
    org: config.orgIds ?? config.ids,
    building: config.buildingIds ?? config.ids,
    floor: config.floorIds ?? config.ids,
    unit: config.unitIds ?? config.ids,
    device: config.deviceIds ?? config.ids,
    tenant_company: config.tenantCompanyIds ?? config.ids,
    customer_owner: config.userIds ?? config.ids,
    contract_owner: config.userIds ?? config.ids,
    workorder_handler: config.userIds ?? config.ids
  };
  return byDimension[dimension] ?? [];
}

export function normalizeScopeConfig(config: DataScopeConfig | undefined): DataScopeConfig {
  if (config !== undefined && (config === null || typeof config !== "object" || Array.isArray(config))) {
    throw new BadRequestException("scope_config must use structured string array fields only");
  }
  const source = config ?? {};
  const normalized: DataScopeConfig = {};
  const keys = [
    "ids",
    "tenantIds",
    "parkIds",
    "orgIds",
    "buildingIds",
    "floorIds",
    "unitIds",
    "deviceIds",
    "tenantCompanyIds",
    "userIds"
  ] as const satisfies ReadonlyArray<keyof DataScopeConfig>;
  const supportedKeys = new Set<string>(keys);
  const unsupportedKeys = Object.keys(source).filter((key) => !supportedKeys.has(key));
  if (unsupportedKeys.length > 0) {
    throw new BadRequestException(`scope_config contains unsupported fields: ${unsupportedKeys.join(", ")}`);
  }
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined) {
      if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
        throw new BadRequestException("scope_config must use structured string array fields only");
      }
      normalized[key] = [...new Set(value.map((item) => item.trim()).filter(Boolean))];
    }
  }
  return normalized;
}

export function canonicalizeUuidDataScopeIds(ids: string[], message: string): string[] {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (ids.some((id) => !uuidPattern.test(id))) {
    throw new BadRequestException(message);
  }
  return ids.map((id) => id.toLowerCase());
}
