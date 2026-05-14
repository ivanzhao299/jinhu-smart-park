import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import type { JwtPrincipal } from "../types/jwt-principal";

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): JwtPrincipal => {
  const request = ctx.switchToHttp().getRequest<Request & { user: JwtPrincipal }>();
  return request.user;
});
