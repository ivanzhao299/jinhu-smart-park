import { ForbiddenException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import { parseTrustProxySetting } from "./auth-client-ip";

export interface CookieOriginConfig {
  enabled: boolean;
  allowedOrigins: string[];
  allowMissing: boolean;
  refreshCookieDomain?: string;
  trustForwardedHost: boolean;
}

export function getCookieOriginConfig(configService: Pick<ConfigService, "get">): CookieOriginConfig {
  const configuredOrigins = configService.get<string>("AUTH_ALLOWED_ORIGINS", "");
  const fallbackOrigin = configService.get<string>("WEB_ORIGIN", "http://localhost:3000");
  const origins = parseAllowedOrigins(configuredOrigins || fallbackOrigin || "");

  return {
    enabled: readBooleanConfig(configService.get<string>("AUTH_COOKIE_ORIGIN_CHECK_ENABLED", ""), true),
    allowedOrigins: origins,
    allowMissing: readBooleanConfig(configService.get<string>("AUTH_COOKIE_ORIGIN_ALLOW_MISSING", ""), false),
    refreshCookieDomain: normalizeCookieDomain(configService.get<string>("AUTH_REFRESH_COOKIE_DOMAIN", "")),
    trustForwardedHost: parseTrustProxySetting(configService.get<string>("APP_TRUST_PROXY", "")) !== undefined
  };
}

export function assertRefreshCookieOriginAllowed(
  request: Pick<Request, "headers" | "method"> & Partial<Pick<Request, "protocol">>,
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
    assertAllowedOrigin(origin, request, config);
    return;
  }

  const refererHeader = readHeader(request, "referer");
  if (isPresent(refererHeader)) {
    const refererOrigin = normalizeRefererOrigin(refererHeader);
    if (!refererOrigin) {
      throw new ForbiddenException("Invalid request origin");
    }
    assertAllowedOrigin(refererOrigin, request, config);
    return;
  }

  if (hasRefreshCookie && config.allowMissing) {
    return;
  }

  if (hasRefreshCookie) {
    throw new ForbiddenException("Invalid request origin");
  }
}

function assertAllowedOrigin(
  origin: string,
  request: Pick<Request, "headers"> & Partial<Pick<Request, "protocol">>,
  config: CookieOriginConfig
): void {
  if (!config.allowedOrigins.includes(origin) && !isAllowedSameRequestOrigin(origin, request, config)) {
    throw new ForbiddenException("Invalid request origin");
  }
}

function isAllowedSameRequestOrigin(
  origin: string,
  request: Pick<Request, "headers"> & Partial<Pick<Request, "protocol">>,
  config: CookieOriginConfig
): boolean {
  if (config.refreshCookieDomain) {
    return false;
  }

  const browserOrigin = parseOrigin(origin);
  if (!browserOrigin) {
    return false;
  }

  return requestHostCandidates(request, config).some((candidate) => {
    if (!isCompatibleRequestProtocol(candidate.protocol, browserOrigin.protocol)) {
      return false;
    }
    return normalizeHost(candidate.host, browserOrigin.protocol) === browserOrigin.host;
  });
}

function requestHostCandidates(
  request: Pick<Request, "headers"> & Partial<Pick<Request, "protocol">>,
  config: CookieOriginConfig
): Array<{ host: string; protocol?: string }> {
  const directHost = readHostHeader(request, "host");
  const directProtocol = normalizeProtocol(request.protocol);
  const forwardedProto = readForwardedHeader(request, "x-forwarded-proto");
  const forwardedHost = readHostHeader(request, "x-forwarded-host");
  const trustForwarded = config.trustForwardedHost || isInternalRequestHost(directHost);
  const candidates: Array<{ host: string; protocol?: string }> = [];

  if (trustForwarded && forwardedHost) {
    candidates.push({ host: forwardedHost, protocol: normalizeProtocol(forwardedProto) ?? directProtocol });
  }
  if (directHost) {
    candidates.push({ host: directHost, protocol: directProtocol });
  }

  return Array.from(
    new Map(candidates.map((candidate) => [`${candidate.protocol ?? ""}//${candidate.host}`, candidate])).values()
  );
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

function parseOrigin(value: string): { protocol: string; host: string } | undefined {
  try {
    const url = new URL(value);
    return { protocol: url.protocol.replace(/:$/u, ""), host: url.host.toLowerCase() };
  } catch {
    return undefined;
  }
}

function readHostHeader(request: Pick<Request, "headers">, name: string): string | undefined {
  return normalizeHost(firstForwardedValue(readHeader(request, name)));
}

function normalizeHost(host: string | undefined, protocol = "http"): string | undefined {
  if (!host?.trim() || /[/?#]/u.test(host)) {
    return undefined;
  }
  try {
    return new URL(`${protocol}://${host.trim()}`).host.toLowerCase();
  } catch {
    return undefined;
  }
}

function isCompatibleRequestProtocol(requestProtocol: string | undefined, browserProtocol: string): boolean {
  if (!requestProtocol) {
    return true;
  }
  if (requestProtocol === browserProtocol) {
    return true;
  }
  return requestProtocol === "http" && browserProtocol === "https";
}

function isInternalRequestHost(host: string | undefined): boolean {
  if (!host) {
    return false;
  }
  const hostname = new URL(`http://${host}`).hostname.toLowerCase().replace(/^\[/u, "").replace(/\]$/u, "");
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".local") ||
    !hostname.includes(".") ||
    /^10\./u.test(hostname) ||
    /^192\.168\./u.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./u.test(hostname)
  );
}

function normalizeProtocol(value: string | undefined): string | undefined {
  const protocol = firstForwardedValue(value)?.toLowerCase();
  if (protocol === "http" || protocol === "https") {
    return protocol;
  }
  return undefined;
}

function readForwardedHeader(request: Pick<Request, "headers">, name: string): string | undefined {
  return firstForwardedValue(readHeader(request, name));
}

function readHeader(request: Pick<Request, "headers">, name: string): string | undefined {
  const value = request.headers[name] ?? request.headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function firstForwardedValue(value: string | undefined): string | undefined {
  return value?.split(",")[0]?.trim();
}

function normalizeCookieDomain(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase().replace(/^\./u, "");
  return normalized || undefined;
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
