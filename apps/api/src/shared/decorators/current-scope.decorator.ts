import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { TenantParkScope } from "@jinhu/shared";
import type { Request } from "express";
import type { JwtPrincipal } from "../types/jwt-principal";

export const CurrentScope = createParamDecorator((_data: unknown, ctx: ExecutionContext): TenantParkScope => {
  const request = ctx.switchToHttp().getRequest<Request & { user: JwtPrincipal }>();
  return {
    tenantId: request.user.tenantId,
    parkId: request.user.parkId
  };
});
