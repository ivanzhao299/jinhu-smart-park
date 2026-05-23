import type { CanActivate, ExecutionContext} from "@nestjs/common";
import { ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { ANY_PERMISSIONS_KEY, PERMISSIONS_KEY } from "../decorators/permissions.decorator";
import type { JwtPrincipal } from "../types/jwt-principal";

const ALL_PERMISSION = "*";

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (isPublic) {
      return true;
    }

    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    const anyPermissions = this.reflector.getAllAndOverride<string[]>(ANY_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if ((!requiredPermissions || requiredPermissions.length === 0) && (!anyPermissions || anyPermissions.length === 0)) {
      throw new ForbiddenException("Permission point is required for this endpoint");
    }

    const request = context.switchToHttp().getRequest<Request & { user?: JwtPrincipal }>();
    const user = request.user;
    if (!user) {
      return false;
    }

    if (user.isSuper || user.permissions.includes(ALL_PERMISSION)) {
      return true;
    }

    const granted = new Set(user.permissions);
    const hasRequired = !requiredPermissions || requiredPermissions.length === 0 || requiredPermissions.every((permission) => granted.has(permission));
    const hasAny = !anyPermissions || anyPermissions.length === 0 || anyPermissions.some((permission) => granted.has(permission));
    return hasRequired && hasAny;
  }
}
