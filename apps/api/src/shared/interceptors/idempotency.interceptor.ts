import { ConflictException, Logger, UnauthorizedException, type CallHandler, type ExecutionContext, type NestInterceptor } from "@nestjs/common";
import type { Request, Response } from "express";
import { createHash } from "node:crypto";
import { from, map, mergeMap, of, catchError, concatMap, throwError, type Observable } from "rxjs";
import type { JwtPrincipal } from "../types/jwt-principal";
import { getIdempotencyService } from "../services/idempotency.service";
import {
  type IdempotencyBeginContext,
  type IdempotencyBeginResult
} from "../services/idempotency.service";

export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler<unknown>): Observable<unknown> {
    const idempotencyService = getIdempotencyService();
    const request = context.switchToHttp().getRequest<Request & { user?: JwtPrincipal; idempotencyReplay?: boolean }>();
    const response = context.switchToHttp().getResponse<Response>();
    const key = this.extractKey(request);
    if (!key) {
      throw new ConflictException("X-Idempotency-Key is required for idempotent writes");
    }

    const user = request.user;
    if (!user) {
      throw new UnauthorizedException("Authenticated user is required for idempotent writes");
    }

    const requestBody = this.requestFingerprintBody(request);
    const beginContext: IdempotencyBeginContext = {
      tenantId: user.tenantId,
      parkId: user.parkId,
      userId: user.sub,
      idempotencyKey: key,
      requestMethod: request.method,
      requestPath: request.path,
      requestFingerprint: idempotencyService.buildFingerprint({
        tenantId: user.tenantId,
        parkId: user.parkId,
        userId: user.sub,
        idempotencyKey: key,
        requestMethod: request.method,
        requestPath: request.path,
        query: request.query,
        body: requestBody
      })
    };

    return from(idempotencyService.tryBegin(beginContext)).pipe(
      mergeMap((decision) => this.handleDecision(idempotencyService, decision, beginContext, next, request, response))
    );
  }

  private requestFingerprintBody(request: Request & {
    file?: { buffer?: unknown; fieldname: string; mimetype: string; originalname: string; size: number };
  }): unknown {
    if (!request.file) return request.body;
    const file = request.file;
    if (!Buffer.isBuffer(file.buffer)) {
      throw new ConflictException("Multipart idempotency requires an in-memory file payload");
    }
    return {
      ...(typeof request.body === "object" && request.body !== null ? request.body : {}),
      __multipartFile: {
        fieldname: file.fieldname,
        mimetype: file.mimetype,
        originalname: file.originalname,
        size: file.size,
        sha256: createHash("sha256").update(file.buffer).digest("hex")
      }
    };
  }

  private handleDecision(
    idempotencyService: ReturnType<typeof getIdempotencyService>,
    decision: IdempotencyBeginResult,
    beginContext: IdempotencyBeginContext,
    next: CallHandler<unknown>,
    request: Request & { idempotencyReplay?: boolean },
    response: Response
  ): Observable<unknown> {
    if (decision.outcome === "cached") {
      request.idempotencyReplay = true;
      response.status(decision.cachedResponse!.responseStatus);
      return of(decision.cachedResponse!.responseBody);
    }

    if (decision.outcome === "processing") {
      throw new ConflictException("The same idempotency key is still processing");
    }

    if (decision.outcome === "conflict") {
      throw new ConflictException("Idempotency key does not match the current request");
    }

    return next.handle().pipe(
      concatMap((data) =>
        from(idempotencyService.markSucceeded(decision.request.id, response.statusCode || 200, data)).pipe(
          map(() => data),
          catchError((error: unknown) => {
            this.logger.warn(
              `Failed to persist idempotent success for ${beginContext.requestMethod} ${beginContext.requestPath}: ${this.stringifyError(error)}`
            );
            return of(data);
          })
        )
      ),
      catchError((error: unknown) =>
        from(idempotencyService.markFailed(decision.request.id, this.resolveErrorCode(error))).pipe(
          catchError((persistError: unknown) => {
            this.logger.warn(
              `Failed to persist idempotent failure for ${beginContext.requestMethod} ${beginContext.requestPath}: ${this.stringifyError(persistError)}`
            );
            return of(undefined);
          }),
          mergeMap(() => throwError(() => error))
        )
      )
    );
  }

  private extractKey(request: Request): string | null {
    const key = request.headers["x-idempotency-key"];
    if (typeof key !== "string") {
      return null;
    }
    const trimmed = key.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private resolveErrorCode(error: unknown): string {
    if (error instanceof ConflictException) return "HTTP_409";
    if (error instanceof UnauthorizedException) return "HTTP_401";
    if (typeof error === "object" && error !== null && "getStatus" in error && typeof (error as { getStatus?: () => number }).getStatus === "function") {
      const status = (error as { getStatus: () => number }).getStatus();
      if (status >= 500) return `HTTP_${status}`;
      return `HTTP_${status}`;
    }
    if (error instanceof Error) return error.name || "ERROR";
    return "UNKNOWN_ERROR";
  }

  private stringifyError(error: unknown): string {
    if (error instanceof Error) return error.message;
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
}
