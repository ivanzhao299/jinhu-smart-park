const disposableDatabasePattern = /^jinhu_(?:property_api_e2e_[a-z0-9_]+|release_smoke)$/;
const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1"]);

function fail(message) {
  throw new Error(`Property API E2E gate refused to run: ${message}`);
}

export function requirePropertyApiE2eIsolation({ requireRunId = true } = {}) {
  if (process.env.PROPERTY_API_E2E_ISOLATED !== "yes") {
    fail("set PROPERTY_API_E2E_ISOLATED=yes only for a disposable database.");
  }
  const database = process.env.POSTGRES_DB ?? "";
  if (!disposableDatabasePattern.test(database)) {
    fail("POSTGRES_DB must be a disposable jinhu_property_api_e2e_* or jinhu_release_smoke database.");
  }
  if (requireRunId && !process.env.TEST_RUN_ID) {
    fail("TEST_RUN_ID is required so every write is attributable to this isolated run.");
  }
  const apiBaseUrl = process.env.API_BASE_URL ?? "";
  let url;
  try {
    url = new URL(apiBaseUrl);
  } catch {
    fail("API_BASE_URL must be an absolute URL.");
  }
  if (!loopbackHosts.has(url.hostname)) {
    fail("API_BASE_URL must target a loopback API, never a shared UAT or production service.");
  }
  if (process.env.NODE_ENV === "production" && process.env.APP_ENV !== "ci") {
    fail("NODE_ENV=production is allowed only when APP_ENV=ci and the database is disposable.");
  }
  return url;
}
