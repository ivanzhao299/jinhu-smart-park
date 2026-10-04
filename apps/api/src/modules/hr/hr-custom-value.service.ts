import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { HR_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { DataSource } from "typeorm";
import { PartySensitiveDataService } from "../../shared/security/party-sensitive-data.service";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";

export type HrCustomValueType = "text" | "numeric" | "date" | "boolean";

export type HrCustomValueReadRow = {
  definitionId: string; code: string; label: string; valueType: HrCustomValueType;
  group: string | null; sortOrder: number | string; value: string | null; sourceValid: boolean;
  maintenanceVersion: number | null; maintainedType: HrCustomValueType | null;
  maintainedStatus: "valid" | "null" | null; valueEncrypted: string | null;
};

export function projectHrCustomValue(row: HrCustomValueReadRow, decrypt: (ciphertext: string) => string | null) {
  let value = row.value, sourceValid = row.sourceValid;
  if (row.maintenanceVersion !== null) {
    if (!row.valueEncrypted || row.maintainedType !== row.valueType) throw new Error("Custom field maintenance projection is inconsistent");
    const decoded = decrypt(row.valueEncrypted);
    if (decoded === null) throw new Error("Custom field maintenance cannot be decrypted");
    const payload = JSON.parse(decoded) as { value?: unknown };
    value = validateHrCustomValue(row.valueType, payload.value);
    if ((value === null ? "null" : "valid") !== row.maintainedStatus) throw new Error("Custom field maintenance status is inconsistent");
    sourceValid = true;
  }
  return {
    definitionId: row.definitionId, code: row.code, label: row.label, valueType: row.valueType,
    group: row.group, sortOrder: Number(row.sortOrder), value, sourceValid,
    version: row.maintenanceVersion ?? 0
  };
}

export function validateHrCustomValue(type: HrCustomValueType, value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new BadRequestException("Custom field value must be a string or explicit null");
  if (type === "text") {
    if (value.length > 4000) throw new BadRequestException("Custom text value is too long");
    return value;
  }
  if (type === "numeric" && /^-?\d{1,20}(?:\.\d{1,8})?$/.test(value)) return value;
  if (type === "boolean" && (value === "true" || value === "false")) return value;
  if (type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (value >= "0001-01-01" && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value) return value;
  }
  throw new BadRequestException("Custom field value does not match its declared type");
}

@Injectable()
export class HrCustomValueService {
  constructor(private readonly dataSource: DataSource, private readonly sensitive: PartySensitiveDataService) {}

  async update(scope: TenantParkScope, actor: JwtPrincipal, employeeId: string, definitionId: string,
    dto: { expectedVersion: number; value: unknown }) {
    if (!actor.isSuper && !actor.permissions.includes("*") && !actor.permissions.includes(HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_MANAGE)) {
      throw new ForbiddenException("Employee profile management permission required");
    }
    if (!Number.isInteger(dto.expectedVersion) || dto.expectedVersion < 0 || dto.expectedVersion > 2147483646) {
      throw new BadRequestException("Custom field expectedVersion is invalid");
    }
    return this.dataSource.transaction(async manager => {
      // The scoped employee anchor serializes first creation as well as later CAS updates.
      const employee = await manager.query("SELECT id FROM hr_employee WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND NOT is_deleted FOR UPDATE", [scope.tenantId, scope.parkId, employeeId]);
      if (!employee.length) throw new NotFoundException("Employee not found");
      const definitions = await manager.query("SELECT value_type FROM hr_custom_field_definition WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND NOT is_deleted AND status='enabled' FOR SHARE", [scope.tenantId, scope.parkId, definitionId]) as Array<{ value_type: HrCustomValueType }>;
      if (!definitions.length) throw new NotFoundException("Custom field definition not found");
      const valueType = definitions[0]!.value_type;
      const value = validateHrCustomValue(valueType, dto.value);
      const rows = await manager.query("SELECT id,version,value_encrypted FROM hr_employee_custom_value_maintenance WHERE tenant_id=$1 AND park_id=$2 AND employee_id=$3 AND definition_id=$4 FOR UPDATE", [scope.tenantId, scope.parkId, employeeId, definitionId]) as Array<{ id: string; version: number; value_encrypted: string }>;
      const previous = rows[0];
      if ((previous?.version ?? 0) !== dto.expectedVersion) throw new ConflictException("Custom field changed; reload before saving");
      const version = dto.expectedVersion + 1;
      const encrypted = this.sensitive.encrypt(JSON.stringify({ value }));
      const valueStatus = value === null ? "null" : "valid";
      const saved = previous
        ? await manager.query("WITH updated AS (UPDATE hr_employee_custom_value_maintenance SET value_type=$1,value_status=$2,value_encrypted=$3,version=$4,update_by=$5,update_time=now() WHERE tenant_id=$6 AND park_id=$7 AND id=$8 AND version=$9 RETURNING id) SELECT id FROM updated", [valueType, valueStatus, encrypted, version, actor.sub, scope.tenantId, scope.parkId, previous.id, dto.expectedVersion])
        : await manager.query("INSERT INTO hr_employee_custom_value_maintenance(tenant_id,park_id,employee_id,definition_id,value_type,value_status,value_encrypted,version,create_by,update_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING id", [scope.tenantId, scope.parkId, employeeId, definitionId, valueType, valueStatus, encrypted, version, actor.sub]);
      if (!saved.length) throw new ConflictException("Custom field changed; reload before saving");
      await manager.query("INSERT INTO hr_employee_custom_value_change(tenant_id,park_id,maintenance_id,version,before_encrypted,after_encrypted,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7)", [scope.tenantId, scope.parkId, saved[0].id, version, previous?.value_encrypted ?? null, encrypted, actor.sub]);
      return { definitionId, version, valueStatus };
    });
  }
}
