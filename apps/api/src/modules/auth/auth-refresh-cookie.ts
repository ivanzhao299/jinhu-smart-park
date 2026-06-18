import type { ConfigService } from "@nestjs/config";
import type { Request, Response, CookieOptions } from "express";
import type { LoginResult } from "./auth.service";

export type RefreshCookieSameSite = "lax" | "strict" | "none";

export interface RefreshCookieConfig {
  name: string;
  path: string;
  httpOnly: true;
  secure: boolean;
  sameSite: RefreshCookieSameSite;
  maxAgeMs: number;
  domain?: string;
  bodyCompat: boolean;
}

const DEFAULT_REFRESH_COOKIE_NAME = "sp_refresh_token";
const DEFAULT_REFRESH_EXPIRES_DAYS = 30;

export function getRefreshCookieConfig(configService: Pick<ConfigService, "get">): RefreshCookieConfig {
  const sameSite = readSameSite(configService.get<string>("AUTH_REFRESH_COOKIE_SAMESITE", "lax"));
  const configuredSecure = readBooleanConfig(
    configService.get<string>("AUTH_REFRESH_COOKIE_SECURE", ""),
    process.env.NODE_ENV === "production"
  );
  const secure = sameSite === "none" ? true : configuredSecure;
  const domain = normalizeOptional(configService.get<string>("AUTH_REFRESH_COOKIE_DOMAIN", ""));
  const expiresDays = readPositiveNumber(
    configService.get<string>("AUTH_REFRESH_EXPIRES_DAYS", String(DEFAULT_REFRESH_EXPIRES_DAYS)),
    DEFAULT_REFRESH_EXPIRES_DAYS
  );

  return {
    name: normalizeCookieName(configService.get<string>("AUTH_REFRESH_COOKIE_NAME", DEFAULT_REFRESH_COOKIE_NAME)),
    path: normalizeCookiePath(configService),
    httpOnly: true,
    secure,
    sameSite,
    maxAgeMs: expiresDays * 24 * 60 * 60 * 1000,
    ...(domain ? { domain } : {}),
    bodyCompat: readBooleanConfig(configService.get<string>("AUTH_REFRESH_TOKEN_BODY_COMPAT", ""), true)
  };
}

export function readRefreshTokenCookie(request: Pick<Request, "headers">, config: RefreshCookieConfig): string | null {
  const cookieHeader = request.headers.cookie;
  const header = Array.isArray(cookieHeader) ? cookieHeader.join("; ") : cookieHeader;
  if (!header) {
    return null;
  }

  for (const segment of header.split(";")) {
    const separatorIndex = segment.indexOf("=");
    if (separatorIndex < 0) {
      continue;
    }
    const rawName = segment.slice(0, separatorIndex).trim();
    const rawValue = segment.slice(separatorIndex + 1).trim();
    if (safeDecode(rawName) === config.name) {
      return safeDecode(rawValue);
    }
  }
  return null;
}

export function setRefreshTokenCookie(response: Response, refreshToken: string, config: RefreshCookieConfig): void {
  response.cookie(config.name, refreshToken, getSetCookieOptions(config));
}

export function clearRefreshTokenCookie(response: Response, config: RefreshCookieConfig): void {
  response.clearCookie(config.name, getClearCookieOptions(config));
}

export function applyRefreshTokenCookie(result: LoginResult, response: Response, config: RefreshCookieConfig): LoginResult {
  if (!result.refreshToken) {
    return result;
  }
  setRefreshTokenCookie(response, result.refreshToken, config);
  if (config.bodyCompat) {
    return result;
  }
  const bodyWithoutRefreshToken = { ...result };
  delete bodyWithoutRefreshToken.refreshToken;
  return bodyWithoutRefreshToken;
}

function getSetCookieOptions(config: RefreshCookieConfig): CookieOptions {
  return {
    httpOnly: true,
    secure: config.secure,
    sameSite: config.sameSite,
    path: config.path,
    maxAge: config.maxAgeMs,
    ...(config.domain ? { domain: config.domain } : {})
  };
}

function getClearCookieOptions(config: RefreshCookieConfig): CookieOptions {
  return {
    httpOnly: true,
    secure: config.secure,
    sameSite: config.sameSite,
    path: config.path,
    ...(config.domain ? { domain: config.domain } : {})
  };
}

function normalizeCookieName(value: string | undefined): string {
  const normalized = value?.trim();
  return normalized || DEFAULT_REFRESH_COOKIE_NAME;
}

function normalizeCookiePath(configService: Pick<ConfigService, "get">): string {
  const configuredPath = normalizeOptional(configService.get<string>("AUTH_REFRESH_COOKIE_PATH", ""));
  if (configuredPath) {
    return configuredPath.startsWith("/") ? configuredPath : `/${configuredPath}`;
  }
  const apiPrefix = (configService.get<string>("API_PREFIX", "api/v1") ?? "api/v1").replace(/^\/+|\/+$/g, "");
  return `/${apiPrefix}/auth`;
}

function readSameSite(value: string | undefined): RefreshCookieSameSite {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "strict" || normalized === "none") {
    return normalized;
  }
  return "lax";
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

function readPositiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeOptional(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
