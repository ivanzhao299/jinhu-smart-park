import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { Public } from "../../shared/decorators/public.decorator";
import { PaginationQueryDto } from "../../shared/dto/pagination-query.dto";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { UploadedFilePayload } from "../files/files.service";
import { CreateTenantDto } from "./dto/create-tenant.dto";
import { UpdateTenantBrandingDto } from "./dto/update-tenant-branding.dto";
import { UpdateTenantLoginSettingsDto } from "./dto/update-tenant-login-settings.dto";
import { UpdateTenantModulesDto } from "./dto/update-tenant-modules.dto";
import { UpdateTenantDto } from "./dto/update-tenant.dto";
import { TenantsService } from "./tenants.service";

@Controller("tenants")
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Public()
  @Get("public/branding")
  publicBranding(@Headers("x-forwarded-host") forwardedHost?: string, @Headers("host") host?: string) {
    return this.tenantsService.publicBranding(forwardedHost ?? host);
  }

  @Get("current")
  @RequirePermissions(SYSTEM_PERMISSIONS.TENANT_READ)
  current(@CurrentScope() scope: TenantParkScope) {
    return this.tenantsService.current(scope);
  }

  @Get("current/branding")
  @RequirePermissions(SYSTEM_PERMISSIONS.TENANT_READ)
  currentBranding(@CurrentScope() scope: TenantParkScope) {
    return this.tenantsService.currentBranding(scope);
  }

  @Patch("current/branding")
  @RequirePermissions(SYSTEM_PERMISSIONS.TENANT_MANAGE)
  @AuditLog({ module: "系统管理", resource: "system.branding", action: "更新品牌设置", captureBody: true })
  updateBranding(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Body() dto: UpdateTenantBrandingDto
  ) {
    return this.tenantsService.updateBranding(scope, user.sub, dto);
  }

  @Post("current/branding/logo")
  @RequirePermissions(SYSTEM_PERMISSIONS.TENANT_MANAGE)
  @AuditLog({ module: "系统管理", resource: "system.branding", action: "上传品牌 Logo" })
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 20 * 1024 * 1024 } }))
  uploadBrandLogo(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @UploadedFile() file?: UploadedFilePayload
  ) {
    return this.tenantsService.uploadBrandLogo(scope, user.sub, file);
  }

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.TENANT_READ)
  list(@CurrentUser() user: JwtPrincipal, @Query() query: PaginationQueryDto) {
    return this.tenantsService.list(user, query);
  }

  @Post()
  @RequirePermissions(SYSTEM_PERMISSIONS.TENANT_MANAGE)
  @AuditLog({ module: "租户管理", resource: "system.tenant", action: "开通租户", captureBody: true })
  create(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Body() dto: CreateTenantDto
  ) {
    return this.tenantsService.create(scope, user.sub, user, dto);
  }

  @Get(":id/login-settings")
  @RequirePermissions(SYSTEM_PERMISSIONS.TENANT_READ)
  loginSettings(@CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.tenantsService.loginSettings(user, id);
  }

  @Patch(":id/login-settings")
  @RequirePermissions(SYSTEM_PERMISSIONS.TENANT_MANAGE)
  @AuditLog({ module: "租户管理", resource: "system.tenant", action: "登录配置", bizType: "tenant", bizIdParam: "id", captureBody: true })
  updateLoginSettings(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateTenantLoginSettingsDto
  ) {
    return this.tenantsService.updateLoginSettings(scope, user.sub, user, id, dto);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.TENANT_READ)
  detail(@CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.tenantsService.detail(user, id);
  }

  @Patch(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.TENANT_MANAGE)
  @AuditLog({ module: "租户管理", resource: "system.tenant", action: "更新租户", bizType: "tenant", bizIdParam: "id", captureBody: true })
  update(@CurrentUser() user: JwtPrincipal, @Param("id") id: string, @Body() dto: UpdateTenantDto) {
    return this.tenantsService.update(user, user.sub, id, dto);
  }

  @Post(":id/enable")
  @RequirePermissions(SYSTEM_PERMISSIONS.TENANT_MANAGE)
  @AuditLog({ module: "租户管理", resource: "system.tenant", action: "启用租户", bizType: "tenant", bizIdParam: "id" })
  enable(@CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.tenantsService.enable(user, user.sub, id);
  }

  @Post(":id/disable")
  @RequirePermissions(SYSTEM_PERMISSIONS.TENANT_MANAGE)
  @AuditLog({ module: "租户管理", resource: "system.tenant", action: "停用租户", bizType: "tenant", bizIdParam: "id" })
  disable(@CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.tenantsService.disable(user, user.sub, id);
  }

  @Post(":id/modules")
  @RequirePermissions(SYSTEM_PERMISSIONS.TENANT_MANAGE)
  @AuditLog({ module: "租户管理", resource: "system.tenant", action: "租户套餐授权", bizType: "tenant", bizIdParam: "id", captureBody: true })
  assignModules(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateTenantModulesDto
  ) {
    return this.tenantsService.assignModules(scope, user.sub, user, id, dto);
  }
}
