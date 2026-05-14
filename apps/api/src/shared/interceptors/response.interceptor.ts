import type { CallHandler, ExecutionContext, NestInterceptor } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { ApiResponse } from "@jinhu/shared";
import { ClsService } from "nestjs-cls";
import { map, type Observable } from "rxjs";
import { SKIP_RESPONSE_WRAP_KEY } from "../decorators/skip-response-wrap.decorator";

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T> | T> {
  constructor(
    private readonly cls: ClsService,
    private readonly reflector: Reflector
  ) {}

  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T> | T> {
    const skipWrap = this.reflector.getAllAndOverride<boolean>(SKIP_RESPONSE_WRAP_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (skipWrap) {
      return next.handle();
    }

    return next.handle().pipe(
      map((data) => ({
        code: 0,
        message: "success",
        data,
        request_id: this.cls.getId() ?? "",
        server_time: Date.now()
      }))
    );
  }
}
