import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { MODULES_KEY } from "../decorators/modules.decorator";
import type { JwtPrincipal } from "../types/jwt-principal";
import { SaaSModulesService } from "../../modules/saas-modules/saas-modules.service";

@Injectable()
export class ModuleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly modulesService: SaaSModulesService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (isPublic) {
      return true;
    }

    const requiredModules = this.reflector.getAllAndOverride<string[]>(MODULES_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (!requiredModules || requiredModules.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: JwtPrincipal }>();
    const user = request.user;
    if (!user) {
      return false;
    }

    const enabledModules = await this.modulesService.listEnabledModulesForTenant(user.tenantId, user.parkId);
    const enabledModuleCodes = new Set(enabledModules.map((module) => module.module_code));
    const allowed = requiredModules.every((moduleCode) => enabledModuleCodes.has(moduleCode));
    if (!allowed) {
      throw new ForbiddenException("Tenant module is not authorized");
    }
    return true;
  }
}
