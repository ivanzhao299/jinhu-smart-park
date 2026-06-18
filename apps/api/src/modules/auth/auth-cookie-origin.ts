import { ForbiddenException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { Request } from "express";

export interface CookieOriginConfig {
  enabled: boolean;
  allowedOrigins: string[];
  allowMissing: boolean;
}

export function getCookieOriginConfig(configService: Pick<ConfigService, "get">): CookieOriginConfig {
  const configuredOrigins = configService.get<string>("AUTH_ALLOWED_ORIGINS", "");
  const fallbackOrigin = configService.get<string>("WEB_ORIGIN", "http://localhost:3000");
  const origins = parseAllowedOrigins(configuredOrigins || fallbackOrigin || "");

  return {
    enabled: readBooleanConfig(configService.get<string>("AUTH_COOKIE_ORIGIN_CHECK_ENABLED", ""), true),
    allowedOrigins: origins,
    allowMissing: readBooleanConfig(configService.get<string>("AUTH_COOKIE_ORIGIN_ALLOW_MISSING", ""), false)
  };
}

export function assertRefreshCookieOriginAllowed(
  request: Pick<Request, "headers" | "method">,
  hasRefreshCookie: boolean,
  config: CookieOriginConfig
): void {
  if (!config.enabled || request.method?.toUpperCase() === "OPTIONS") {
    return;
  }

  const originHeader = readHeader(request, "origin");
  if (isPresent(originHeader)) {
    const origin = normalizeRequestOrigin(originHeader);
    if (!origin) {
      throw new ForbiddenException("Invalid request origin");
    }
    assertAllowedOrigin(origin, config);
    return;
  }

  const refererHeader = readHeader(request, "referer");
  if (isPresent(refererHeader)) {
    const refererOrigin = normalizeRefererOrigin(refererHeader);
    if (!refererOrigin) {
      throw new ForbiddenException("Invalid request origin");
    }
    assertAllowedOrigin(refererOrigin, config);
    return;
  }

  if (hasRefreshCookie && config.allowMissing) {
    return;
  }

  if (hasRefreshCookie) {
    throw new ForbiddenException("Invalid request origin");
  }
}

function assertAllowedOrigin(origin: string, config: CookieOriginConfig): void {
  if (!config.allowedOrigins.includes(origin)) {
    throw new ForbiddenException("Invalid request origin");
  }
}

function parseAllowedOrigins(value: string): string[] {
  return value
    .split(",")
    .map((origin) => normalizeConfiguredOrigin(origin))
    .filter((origin): origin is string => Boolean(origin));
}

function normalizeConfiguredOrigin(value: string): string | undefined {
  const normalized = value.trim().replace(/\/+$/g, "");
  return normalizeRequestOrigin(normalized);
}

function normalizeOrigin(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

function normalizeRequestOrigin(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const url = new URL(value);
    if (url.pathname !== "/" || url.search || url.hash) {
      return undefined;
    }
    return url.origin;
  } catch {
    return undefined;
  }
}

function normalizeRefererOrigin(value: string | undefined): string | undefined {
  return normalizeOrigin(value);
}

function readHeader(request: Pick<Request, "headers">, name: string): string | undefined {
  const value = request.headers[name] ?? request.headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function isPresent(value: string | undefined): value is string {
  return Boolean(value?.trim());
}

function readBooleanConfig(value: string | undefined, fallback: boolean): boolean {
  const normalized = value?.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized ?? "")) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized ?? "")) {
    return false;
  }
  return fallback;
}
