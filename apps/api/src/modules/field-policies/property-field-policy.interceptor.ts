import type { CallHandler, ExecutionContext, NestInterceptor } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import type { Request } from "express";
import { mergeMap, type Observable } from "rxjs";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { FieldPolicyService } from "./field-policy.service";

abstract class PropertyFieldPolicyInterceptor implements NestInterceptor {
  protected abstract readonly moduleName: string;

  constructor(private readonly fieldPolicies: FieldPolicyService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request & { user?: JwtPrincipal }>();
    const actor = request.user;
    if (request.method !== "GET" || !actor) return next.handle();
    return next.handle().pipe(mergeMap((projection) => this.fieldPolicies.applyFieldPoliciesToProjection(
      { tenantId: actor.tenantId, parkId: actor.parkId }, actor, this.moduleName, projection
    )));
  }
}

@Injectable()
export class HomestayFieldPolicyInterceptor extends PropertyFieldPolicyInterceptor {
  protected readonly moduleName = "homestay";
}

@Injectable()
export class HousingFieldPolicyInterceptor extends PropertyFieldPolicyInterceptor {
  protected readonly moduleName = "housing_rental";
}
