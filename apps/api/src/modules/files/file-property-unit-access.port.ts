import type { TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";

export const FILE_PROPERTY_UNIT_ACCESS_PORT = Symbol("FILE_PROPERTY_UNIT_ACCESS_PORT");

export type FileAccessCompositionMode = "integrated" | "hr_leaf";

export interface FilePropertyUnitAccessPort {
  readonly compositionMode: FileAccessCompositionMode;
  assertAccess(scope: TenantParkScope, actor: JwtPrincipal, unitId: string): Promise<unknown>;
  allowedUnitIds(scope: TenantParkScope, actor: JwtPrincipal): Promise<string[] | null>;
}
