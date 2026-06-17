import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "node:crypto";

export interface AuthRateLimitRequest {
  endpoint: string;
  ipAddress: string | null;
  identifier?: string | null;
  limit?: number;
  windowMs?: number;
}

interface RateBucket {
  count: number;
  resetAt: number;
}

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_LIMITS: Record<string, number> = {
  login: 20,
  "token-refresh": 60,
  "select-context": 30,
  "mobile-send-code": 5,
  "mobile-login": 20,
  "wechat-authorize": 20,
  "wechat-callback": 20
};

@Injectable()
export class AuthRateLimitService {
  private readonly buckets = new Map<string, RateBucket>();
  private now: () => number = () => Date.now();

  constructor(private readonly configService: ConfigService) {}

  assertAllowed(request: AuthRateLimitRequest): void {
    const endpoint = this.normalizePart(request.endpoint || "unknown");
    const windowMs = request.windowMs ?? this.getWindowMs(endpoint);
    const limit = request.limit ?? this.getLimit(endpoint);
    const key = this.buildKey(endpoint, request.ipAddress, request.identifier);
    const currentTime = this.now();
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= currentTime) {
      this.buckets.set(key, { count: 1, resetAt: currentTime + windowMs });
      return;
    }

    if (bucket.count >= limit) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: "Too many authentication attempts, please try again later",
          error: "Too Many Requests"
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    bucket.count += 1;
  }

  clear(): void {
    this.buckets.clear();
  }

  setClockForTest(now: () => number): void {
    this.now = now;
  }

  private getLimit(endpoint: string): number {
    const configKey = `AUTH_RATE_LIMIT_${endpoint.toUpperCase().replace(/-/g, "_")}_LIMIT`;
    const configured = Number(this.configService.get<string>(configKey, ""));
    return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_LIMITS[endpoint] ?? 20;
  }

  private getWindowMs(endpoint: string): number {
    const configKey = `AUTH_RATE_LIMIT_${endpoint.toUpperCase().replace(/-/g, "_")}_WINDOW_MS`;
    const configured = Number(this.configService.get<string>(configKey, ""));
    return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_WINDOW_MS;
  }

  private buildKey(endpoint: string, ipAddress: string | null, identifier?: string | null): string {
    // Stage A uses single-process in-memory buckets only. Multi-instance deployments
    // should replace this with Redis/DB backed counters in a later WP3 phase.
    return [
      endpoint,
      this.normalizePart(ipAddress ?? "unknown-ip"),
      this.hashIdentifier(identifier ?? "anonymous")
    ].join(":");
  }

  private normalizePart(value: string): string {
    return value.trim().toLowerCase().slice(0, 256) || "empty";
  }

  private hashIdentifier(value: string): string {
    return createHash("sha256").update(this.normalizePart(value)).digest("hex");
  }
}
