import { Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { resolveAuthClientIp } from "./auth-client-ip";
import { AuthRateLimitService } from "./auth-rate-limit.service";

const PUBLIC_AUTH_ENDPOINTS: Record<string, string> = {
  "POST /auth/login": "login",
  "POST /auth/token/refresh": "token-refresh",
  "POST /auth/select-context": "select-context",
  "POST /auth/mobile/send-code": "mobile-send-code",
  "POST /auth/mobile/login": "mobile-login",
  "POST /auth/wechat/authorize": "wechat-authorize",
  "POST /auth/wechat/callback": "wechat-callback"
};

@Injectable()
export class AuthPreValidationRateLimitMiddleware implements NestMiddleware {
  constructor(private readonly authRateLimitService: AuthRateLimitService) {}

  use(request: Request, _response: Response, next: NextFunction): void {
    const endpoint = resolvePublicAuthEndpoint(request);
    if (endpoint) {
      this.authRateLimitService.assertStableAllowed({
        endpoint,
        ipAddress: resolveAuthClientIp(request),
        bucket: "pre-validation"
      });
    }
    next();
  }
}

export function resolvePublicAuthEndpoint(request: Pick<Request, "method" | "path" | "url" | "originalUrl">): string | null {
  const method = request.method.toUpperCase();
  for (const path of getCandidatePaths(request)) {
    const endpoint = PUBLIC_AUTH_ENDPOINTS[`${method} ${path}`];
    if (endpoint) {
      return endpoint;
    }
  }
  return null;
}

function getCandidatePaths(request: Pick<Request, "path" | "url" | "originalUrl">): string[] {
  const rawPaths = [request.path, request.url, request.originalUrl].filter((value): value is string => Boolean(value));
  return rawPaths.flatMap((value) => {
    const path = value.split("?")[0] || "/";
    return [path, path.replace(/^\/api\/v\d+(?=\/)/, "")];
  });
}
