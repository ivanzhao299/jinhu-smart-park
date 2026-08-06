import { Injectable } from "@nestjs/common";
import { TRACK_B_CONTRACT_SHA256, type TenantParkScope } from "@jinhu/shared";
import type { EntityManager } from "typeorm";
import { propertyApprovalError } from "./property-approval.error";
import type {
  PropertyRuntimeControlKey,
  PropertyRuntimeControlPort
} from "./property-approval.ports";

const DEFINITIONS = {
  "approval.shadow-compare": {
    kind: "shadow_compare", target: "approval", mode: "shadow"
  },
  "approval.enforce": { kind: "enforce", target: "approval", mode: "enforce" },
  "event-notification.enforce": {
    kind: "enforce", target: "event_notification", mode: "enforce"
  }
} as const;

interface ControlRow {
  controlKey: string;
  controlKind: string;
  target: string;
  adapterVersion: number | null;
  contractHash: string;
  enabled: boolean;
  controlMode: string;
  enabledBy: string | null;
  enabledAt: Date | string | null;
  approvalReference: string | null;
  version: number;
}

@Injectable()
export class DatabasePropertyRuntimeControlAdapter implements PropertyRuntimeControlPort {
  async inspect(manager: EntityManager, scope: TenantParkScope, key: PropertyRuntimeControlKey) {
    const rows = await manager.query(
      `SELECT control_key AS "controlKey",control_kind AS "controlKind",target,
              adapter_version AS "adapterVersion",contract_hash AS "contractHash",
              enabled,control_mode AS "controlMode",enabled_by AS "enabledBy",
              enabled_at AS "enabledAt",approval_reference AS "approvalReference",version
         FROM sys_property_runtime_control
        WHERE tenant_id=$1 AND park_id=$2 AND control_key=$3
        FOR SHARE`,
      [scope.tenantId, scope.parkId, key]
    ) as ControlRow[];
    if (rows.length === 0) return { effective: false, mode: "disabled" as const, version: 0 };
    if (rows.length !== 1) throw propertyApprovalError("property-runtime-unavailable");
    const row = rows[0]!;
    const definition = DEFINITIONS[key];
    if (
      row.controlKey !== key
      || row.controlKind !== definition.kind
      || row.target !== definition.target
      || row.adapterVersion !== null
      || row.contractHash !== TRACK_B_CONTRACT_SHA256
      || row.version < 1
    ) throw propertyApprovalError("property-runtime-unavailable");
    if (!row.enabled) {
      if (
        row.controlMode !== "disabled" || row.enabledBy != null || row.enabledAt != null
      ) throw propertyApprovalError("property-runtime-unavailable");
      return { effective: false, mode: "disabled" as const, version: row.version };
    }
    if (
      row.controlMode !== definition.mode
      || !row.enabledBy || !row.enabledAt || !row.approvalReference
    ) throw propertyApprovalError("property-runtime-unavailable");
    return { effective: true, mode: definition.mode, version: row.version };
  }

  async requireApprovalEnforce(manager: EntityManager, scope: TenantParkScope): Promise<void> {
    if (await this.approvalMode(manager, scope) !== "enforce") {
      throw propertyApprovalError("property-runtime-unavailable");
    }
  }

  async approvalMode(
    manager: EntityManager,
    scope: TenantParkScope
  ): Promise<"disabled" | "shadow" | "enforce"> {
    const enforce = await this.inspect(manager, scope, "approval.enforce");
    if (enforce.effective) return "enforce";
    const shadow = await this.inspect(manager, scope, "approval.shadow-compare");
    return shadow.effective ? "shadow" : "disabled";
  }
}
