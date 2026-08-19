import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { assertRefreshCookieOriginAllowed, getCookieOriginConfig } from "./auth-cookie-origin";

function createConfig(values: Record<string, string> = {}) {
  return {
    get: (key: string, fallback?: string) => values[key] ?? fallback
  };
}

function createRequest(headers: Record<string, string | undefined> = {}, method = "POST", protocol?: string) {
  return {
    method,
    protocol,
    headers
  };
}

test("cookie origin config falls back to WEB_ORIGIN when allowed origins are empty", () => {
  const config = getCookieOriginConfig(
    createConfig({
      WEB_ORIGIN: "https://app.example",
      AUTH_ALLOWED_ORIGINS: ""
    }) as never
  );

  assert.equal(config.enabled, true);
  assert.deepEqual(config.allowedOrigins, ["https://app.example"]);
  assert.equal(config.allowMissing, false);
  assert.equal(config.refreshCookieDomain, undefined);
  assert.equal(config.trustForwardedHost, false);
});

test("cookie origin config parses comma-separated origins and normalizes trailing slashes", () => {
  const config = getCookieOriginConfig(
    createConfig({
      WEB_ORIGIN: "https://fallback.example",
      AUTH_ALLOWED_ORIGINS: " https://app.example/ , http://localhost:3000/ ,, https://admin.example "
    }) as never
  );

  assert.deepEqual(config.allowedOrigins, ["https://app.example", "http://localhost:3000", "https://admin.example"]);
});

test("cookie origin config ignores entries that are not exact origins", () => {
  const config = getCookieOriginConfig(
    createConfig({
      WEB_ORIGIN: "https://fallback.example",
      AUTH_ALLOWED_ORIGINS: "https://app.example/path, https://admin.example"
    }) as never
  );

  assert.deepEqual(config.allowedOrigins, ["https://admin.example"]);
});

test("disabled cookie origin check allows cookie requests", () => {
  const config = getCookieOriginConfig(
    createConfig({
      AUTH_COOKIE_ORIGIN_CHECK_ENABLED: "false",
      WEB_ORIGIN: "https://app.example"
    }) as never
  );

  assert.doesNotThrow(() =>
    assertRefreshCookieOriginAllowed(createRequest({ origin: "https://evil.example" }) as never, true, config)
  );
});

test("valid Origin allows cookie request with exact scheme host and port", () => {
  const config = getCookieOriginConfig(
    createConfig({
      AUTH_ALLOWED_ORIGINS: "https://app.example:8443"
    }) as never
  );

  assert.doesNotThrow(() =>
    assertRefreshCookieOriginAllowed(createRequest({ origin: "https://app.example:8443" }) as never, true, config)
  );
  assert.throws(
    () => assertRefreshCookieOriginAllowed(createRequest({ origin: "https://app.example" }) as never, true, config),
    ForbiddenException
  );
});

test("same request origin allows production switch-context even when configured origin drifted", () => {
  const config = getCookieOriginConfig(createConfig({ WEB_ORIGIN: "https://stale.example" }) as never);

  assert.doesNotThrow(() =>
    assertRefreshCookieOriginAllowed(
      createRequest({
        origin: "https://park.cnjinhu.com",
        host: "internal-api:3000",
        "x-forwarded-host": "park.cnjinhu.com",
        "x-forwarded-proto": "https"
      }) as never,
      true,
      config
    )
  );
});

test("same request origin accepts trusted forwarded host when APP_TRUST_PROXY is set", () => {
  const config = getCookieOriginConfig(
    createConfig({
      WEB_ORIGIN: "https://stale.example",
      APP_TRUST_PROXY: "1"
    }) as never
  );

  assert.doesNotThrow(() =>
    assertRefreshCookieOriginAllowed(
      createRequest({
        origin: "https://park.cnjinhu.com",
        host: "api.internal",
        "x-forwarded-host": "park.cnjinhu.com",
        "x-forwarded-proto": "https"
      }) as never,
      true,
      config
    )
  );
});

test("same request origin honors disabled APP_TRUST_PROXY values", () => {
  const disabledValues = ["false", "0", "no", "off"];

  for (const value of disabledValues) {
    const config = getCookieOriginConfig(
      createConfig({
        WEB_ORIGIN: "https://stale.example",
        APP_TRUST_PROXY: value
      }) as never
    );

    assert.equal(config.trustForwardedHost, false);
    assert.throws(
      () =>
        assertRefreshCookieOriginAllowed(
          createRequest({
            origin: "https://evil.example",
            host: "park.cnjinhu.com",
            "x-forwarded-host": "evil.example",
            "x-forwarded-proto": "https"
          }, "POST", "https") as never,
          true,
          config
        ),
      ForbiddenException
    );
  }
});

test("same request origin accepts referer fallback when Origin is absent", () => {
  const config = getCookieOriginConfig(createConfig({ WEB_ORIGIN: "https://stale.example" }) as never);

  assert.doesNotThrow(() =>
    assertRefreshCookieOriginAllowed(
      createRequest({
        referer: "https://park.cnjinhu.com/assets/floors",
        host: "park.cnjinhu.com",
        "x-forwarded-proto": "https"
      }) as never,
      true,
      config
    )
  );
});

test("same request origin covers https TLS termination when forwarded proto is absent", () => {
  const config = getCookieOriginConfig(createConfig({ WEB_ORIGIN: "https://stale.example" }) as never);

  assert.doesNotThrow(() =>
    assertRefreshCookieOriginAllowed(
      createRequest({
        origin: "https://park.cnjinhu.com",
        host: "park.cnjinhu.com"
      }, "POST", "http") as never,
      true,
      config
    )
  );
});

test("same request origin normalizes default ports with the browser protocol", () => {
  const config = getCookieOriginConfig(createConfig({ WEB_ORIGIN: "https://stale.example" }) as never);

  assert.doesNotThrow(() =>
    assertRefreshCookieOriginAllowed(
      createRequest({
        origin: "https://park.cnjinhu.com",
        host: "park.cnjinhu.com:443"
      }, "POST", "http") as never,
      true,
      config
    )
  );
});

test("same request origin still rejects hostile origins", () => {
  const config = getCookieOriginConfig(createConfig({ WEB_ORIGIN: "https://stale.example" }) as never);

  assert.throws(
    () =>
      assertRefreshCookieOriginAllowed(
        createRequest({
          origin: "https://evil.example",
          host: "park.cnjinhu.com",
          "x-forwarded-proto": "https"
        }) as never,
        true,
        config
      ),
    ForbiddenException
  );
});

test("same request origin ignores spoofed forwarded host on public direct requests", () => {
  const config = getCookieOriginConfig(createConfig({ WEB_ORIGIN: "https://stale.example" }) as never);

  assert.throws(
    () =>
      assertRefreshCookieOriginAllowed(
        createRequest({
          origin: "https://evil.example",
          host: "park.cnjinhu.com",
          "x-forwarded-host": "evil.example",
          "x-forwarded-proto": "https"
        }, "POST", "https") as never,
        true,
        config
      ),
    ForbiddenException
  );
});

test("same request origin is disabled for parent-domain refresh cookies", () => {
  const config = getCookieOriginConfig(
    createConfig({
      WEB_ORIGIN: "https://stale.example",
      AUTH_REFRESH_COOKIE_DOMAIN: ".cnjinhu.com"
    }) as never
  );

  assert.equal(config.refreshCookieDomain, "cnjinhu.com");
  assert.throws(
    () =>
      assertRefreshCookieOriginAllowed(
        createRequest({
          origin: "https://park.cnjinhu.com",
          host: "park.cnjinhu.com"
        }, "POST", "https") as never,
        true,
        config
      ),
    ForbiddenException
  );
});

test("same request origin honors explicit host port", () => {
  const config = getCookieOriginConfig(createConfig({ WEB_ORIGIN: "https://stale.example" }) as never);

  assert.doesNotThrow(() =>
    assertRefreshCookieOriginAllowed(
      createRequest({ origin: "http://localhost:3001", host: "localhost:3001" }, "POST", "http") as never,
      true,
      config
    )
  );
  assert.throws(
    () =>
      assertRefreshCookieOriginAllowed(
        createRequest({ origin: "http://localhost:3002", host: "localhost:3001" }, "POST", "http") as never,
        true,
        config
      ),
    ForbiddenException
  );
});

test("same request origin recognizes bracketed IPv6 loopback as internal", () => {
  const config = getCookieOriginConfig(createConfig({ WEB_ORIGIN: "https://stale.example" }) as never);

  assert.doesNotThrow(() =>
    assertRefreshCookieOriginAllowed(
      createRequest({
        origin: "https://park.cnjinhu.com",
        host: "[::1]:3001",
        "x-forwarded-host": "park.cnjinhu.com",
        "x-forwarded-proto": "https"
      }, "POST", "http") as never,
      true,
      config
    )
  );
});

test("Origin header with path is rejected even when origin part is allowlisted", () => {
  const config = getCookieOriginConfig(createConfig({ WEB_ORIGIN: "https://app.example" }) as never);

  assert.throws(
    () => assertRefreshCookieOriginAllowed(createRequest({ origin: "https://app.example/path" }) as never, true, config),
    ForbiddenException
  );
});

test("valid Referer fallback allows cookie request when Origin is absent", () => {
  const config = getCookieOriginConfig(createConfig({ WEB_ORIGIN: "https://app.example" }) as never);

  assert.doesNotThrow(() =>
    assertRefreshCookieOriginAllowed(
      createRequest({ referer: "https://app.example/dashboard?tab=me" }) as never,
      true,
      config
    )
  );
});

test("invalid Origin or Referer rejects cookie request", () => {
  const config = getCookieOriginConfig(createConfig({ WEB_ORIGIN: "https://app.example" }) as never);

  assert.throws(
    () => assertRefreshCookieOriginAllowed(createRequest({ origin: "https://evil.example" }) as never, true, config),
    ForbiddenException
  );
  assert.throws(
    () => assertRefreshCookieOriginAllowed(createRequest({ referer: "not a url" }) as never, true, config),
    ForbiddenException
  );
});

test("invalid Origin rejects even when missing headers are allowed", () => {
  const config = getCookieOriginConfig(
    createConfig({
      WEB_ORIGIN: "https://app.example",
      AUTH_COOKIE_ORIGIN_ALLOW_MISSING: "true"
    }) as never
  );

  assert.throws(
    () => assertRefreshCookieOriginAllowed(createRequest({ origin: "not a url" }) as never, true, config),
    ForbiddenException
  );
});

test("missing Origin and Referer rejects cookie request by default", () => {
  const config = getCookieOriginConfig(createConfig({ WEB_ORIGIN: "https://app.example" }) as never);

  assert.throws(() => assertRefreshCookieOriginAllowed(createRequest() as never, true, config), ForbiddenException);
});

test("allow missing config permits cookie request without Origin or Referer", () => {
  const config = getCookieOriginConfig(
    createConfig({
      WEB_ORIGIN: "https://app.example",
      AUTH_COOKIE_ORIGIN_ALLOW_MISSING: "true"
    }) as never
  );

  assert.doesNotThrow(() => assertRefreshCookieOriginAllowed(createRequest() as never, true, config));
});

test("request without refresh cookie allows body compatibility path without Origin", () => {
  const config = getCookieOriginConfig(createConfig({ WEB_ORIGIN: "https://app.example" }) as never);

  assert.doesNotThrow(() => assertRefreshCookieOriginAllowed(createRequest() as never, false, config));
});

test("request without refresh cookie rejects invalid Origin", () => {
  const config = getCookieOriginConfig(createConfig({ WEB_ORIGIN: "https://app.example" }) as never);

  assert.throws(
    () => assertRefreshCookieOriginAllowed(createRequest({ origin: "https://evil.example" }) as never, false, config),
    ForbiddenException
  );
});

test("request without refresh cookie rejects invalid Referer", () => {
  const config = getCookieOriginConfig(createConfig({ WEB_ORIGIN: "https://app.example" }) as never);

  assert.throws(
    () =>
      assertRefreshCookieOriginAllowed(
        createRequest({ referer: "https://evil.example/profile" }) as never,
        false,
        config
      ),
    ForbiddenException
  );
});

test("request without refresh cookie allows valid Origin", () => {
  const config = getCookieOriginConfig(createConfig({ WEB_ORIGIN: "https://app.example" }) as never);

  assert.doesNotThrow(() =>
    assertRefreshCookieOriginAllowed(createRequest({ origin: "https://app.example" }) as never, false, config)
  );
});

test("disabled cookie origin check allows no-cookie invalid Origin", () => {
  const config = getCookieOriginConfig(
    createConfig({
      AUTH_COOKIE_ORIGIN_CHECK_ENABLED: "false",
      WEB_ORIGIN: "https://app.example"
    }) as never
  );

  assert.doesNotThrow(() =>
    assertRefreshCookieOriginAllowed(createRequest({ origin: "https://evil.example" }) as never, false, config)
  );
});

test("OPTIONS preflight is not blocked", () => {
  const config = getCookieOriginConfig(createConfig({ WEB_ORIGIN: "https://app.example" }) as never);

  assert.doesNotThrow(() =>
    assertRefreshCookieOriginAllowed(createRequest({ origin: "https://evil.example" }, "OPTIONS") as never, true, config)
  );
});
