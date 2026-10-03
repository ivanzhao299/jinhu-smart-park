import { Controller, Get, Query } from "@nestjs/common";
import { CANTEEN_PERMISSIONS } from "@jinhu/shared";
import type { TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { CanteenLogService } from "./canteen-log.service";

@Controller("canteen")
export class CanteenLogController {
  constructor(private readonly svc: CanteenLogService) {}

  // M4 操作审计全局日志查询。
  // 权限复用 SETTLEMENT_VIEW（与审计页当前前端门控一致，避免 403；
  // 语义上更贴切的 canteen:order:audit 已存在，如需拆分可后续切换）。
  @Get("status-logs")
  @RequirePermissions(CANTEEN_PERMISSIONS.SETTLEMENT_VIEW)
  list(
    @CurrentScope() scope: TenantParkScope,
    @Query("entity_type") entity_type?: string,
    @Query("entity_id") entity_id?: string,
    @Query("action") action?: string,
    @Query("operator_name") operator_name?: string,
    @Query("start_date") start_date?: string,
    @Query("end_date") end_date?: string,
    @Query("page") page = 1,
    @Query("page_size") page_size = 20
  ) {
    return this.svc.list(scope, {
      entity_type,
      entity_id,
      action,
      operator_name,
      start_date,
      end_date,
      page: Number(page) || 1,
      page_size: Number(page_size) || 20
    });
  }
}
