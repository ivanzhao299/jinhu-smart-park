import type { ConfigService } from "@nestjs/config";

export const PROPERTY_WORKBENCH_V2_CONFIG_KEY = "PROPERTY_WORKBENCH_V2";

export function isPropertyWorkbenchV2Enabled(
  configService: Pick<ConfigService, "get">
): boolean {
  const value = configService.get<unknown>(PROPERTY_WORKBENCH_V2_CONFIG_KEY);
  return typeof value === "string" && value.trim().toLowerCase() === "true";
}
