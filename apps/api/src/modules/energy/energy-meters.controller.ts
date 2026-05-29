import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CreateEnergyMeterDto } from "./dto/create-energy-meter.dto";
import { CreateEnergyReadingDto } from "./dto/create-energy-reading.dto";
import { EnergyMeterQueryDto } from "./dto/energy-meter-query.dto";
import { EnergyReadingQueryDto } from "./dto/energy-reading-query.dto";
import { UpdateEnergyMeterDto } from "./dto/update-energy-meter.dto";
import { EnergyMeterService } from "./energy-meter.service";
import { EnergyReadingService } from "./energy-reading.service";

@Controller("energy/meters")
@RequireModule("energy")
export class EnergyMetersController {
  constructor(
    private readonly meterService: EnergyMeterService,
    private readonly readingService: EnergyReadingService
  ) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.ENERGY_METER_READ)
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: EnergyMeterQueryDto) {
    return this.meterService.list(scope, query, user);
  }

  @Post()
  @RequirePermissions(SYSTEM_PERMISSIONS.ENERGY_METER_CREATE)
  @AuditLog({ module: "能源管理", action: "新增表计", resource: "energy.meter", bizType: "energy_meter" })
  create(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateEnergyMeterDto) {
    return this.meterService.create(scope, user, dto);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.ENERGY_METER_READ)
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.meterService.detail(scope, id, user);
  }

  @Patch(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.ENERGY_METER_UPDATE)
  @AuditLog({ module: "能源管理", action: "编辑表计", resource: "energy.meter", bizType: "energy_meter", bizIdParam: "id" })
  update(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string, @Body() dto: UpdateEnergyMeterDto) {
    return this.meterService.update(scope, user, id, dto);
  }

  @Patch(":id/status")
  @RequirePermissions(SYSTEM_PERMISSIONS.ENERGY_METER_UPDATE)
  @AuditLog({ module: "能源管理", action: "更新表计状态", resource: "energy.meter", bizType: "energy_meter", bizIdParam: "id" })
  status(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string, @Body() dto: UpdateEnergyMeterDto) {
    return this.meterService.updateStatus(scope, user, id, dto);
  }

  @Delete(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.ENERGY_METER_DELETE)
  @AuditLog({ module: "能源管理", action: "删除表计", resource: "energy.meter", bizType: "energy_meter", bizIdParam: "id" })
  remove(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.meterService.softDelete(scope, user, id);
  }

  @Get(":id/readings")
  @RequirePermissions(SYSTEM_PERMISSIONS.ENERGY_READING_READ)
  readings(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string, @Query() query: EnergyReadingQueryDto) {
    return this.readingService.list(scope, id, query, user);
  }

  @Post(":id/readings")
  @RequirePermissions(SYSTEM_PERMISSIONS.ENERGY_READING_CREATE)
  @AuditLog({ module: "能源管理", action: "录入读数", resource: "energy.reading", bizType: "energy_reading", bizIdParam: "id" })
  createReading(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string, @Body() dto: CreateEnergyReadingDto) {
    return this.readingService.create(scope, user, id, dto);
  }
}
