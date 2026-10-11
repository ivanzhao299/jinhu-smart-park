import { ConflictException, Injectable, Logger, UnauthorizedException, type CallHandler, type ExecutionContext, type NestInterceptor } from "@nestjs/common";
import type { Request, Response } from "express";
import { defer, firstValueFrom, type Observable } from "rxjs";
import { getIdempotencyService } from "../../shared/services/idempotency.service";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { SaveHrCandidateProfileDto } from "./dto/hr-candidate-profile.dto";
import { HrCandidateProfileService } from "./hr-candidate-profile.service";

// Route-local encrypted receipt handling; generic idempotency behavior remains unchanged.
@Injectable()
export class HrCandidateProfileIdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(HrCandidateProfileIdempotencyInterceptor.name);
  constructor(private readonly profiles: HrCandidateProfileService) {}
  intercept(context: ExecutionContext, next: CallHandler<unknown>): Observable<unknown> {
    return defer(async () => {
      const request = context.switchToHttp().getRequest<Request & { user?: JwtPrincipal; idempotencyReplay?: boolean }>();
      const response = context.switchToHttp().getResponse<Response>();
      const actor = request.user;
      if (!actor) throw new UnauthorizedException("Authenticated user is required for idempotent writes");
      this.profiles.authorizeWrite(actor, request.body as SaveHrCandidateProfileDto);
      const rawKey = request.headers["x-idempotency-key"], key = typeof rawKey === "string" ? rawKey.trim() : "";
      if (!key) throw new ConflictException("X-Idempotency-Key is required for idempotent writes");
      const service = getIdempotencyService();
      const input = { tenantId: actor.tenantId, parkId: actor.parkId, userId: actor.sub, idempotencyKey: key, requestMethod: request.method, requestPath: request.path };
      const decision = await service.tryBegin({ ...input, requestFingerprint: service.buildFingerprint({ ...input, query: request.query, body: request.body }) });
      if (decision.outcome === "cached") {
        const result = await this.profiles.replayReceipt(actor, actor, String(request.params.id), request.body as SaveHrCandidateProfileDto, decision.cachedResponse?.responseBody);
        request.idempotencyReplay = true;
        response.status(decision.cachedResponse!.responseStatus);
        return result;
      }
      if (decision.outcome === "processing") throw new ConflictException("The same idempotency key is still processing");
      if (decision.outcome === "conflict") throw new ConflictException("Idempotency key does not match the current request");
      let result: unknown;
      try { result = await firstValueFrom(next.handle()); }
      catch (error) {
        const status = error && typeof error === "object" && "getStatus" in error && typeof error.getStatus === "function" ? error.getStatus() as number : 500;
        try { await service.markFailed(decision.request.id, `HTTP_${status}`); } catch { this.logger.warn("Failed to persist candidate profile idempotent failure"); }
        throw error;
      }
      try { await service.markSucceeded(decision.request.id, response.statusCode || 200, this.profiles.sealReceipt(result as Record<string, unknown>)); }
      catch { this.logger.warn("Failed to persist candidate profile idempotent success"); }
      return result;
    });
  }
}
