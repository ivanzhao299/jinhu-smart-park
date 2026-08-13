import { execFileSync } from "node:child_process";

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
  const normalizedHostname = url.hostname.replace(/^\[|\]$/g, "");
  if (!loopbackHosts.has(normalizedHostname)) {
    fail("API_BASE_URL must target a loopback API, never a shared UAT or production service.");
  }
  if (process.env.NODE_ENV === "production" && process.env.APP_ENV !== "ci") {
    fail("NODE_ENV=production is allowed only when APP_ENV=ci and the database is disposable.");
  }
  requirePropertyApiE2eDockerBinding(url);
  return url;
}

export function requirePropertyApiE2eDockerBinding(url) {
  const container = process.env.PROPERTY_API_E2E_API_CONTAINER ?? "";
  if (!container) fail("PROPERTY_API_E2E_API_CONTAINER must identify the disposable API container.");
  const postgresContainer = process.env.PROPERTY_API_E2E_POSTGRES_CONTAINER ?? "";
  if (!postgresContainer) fail("PROPERTY_API_E2E_POSTGRES_CONTAINER must identify the disposable PostgreSQL container.");
  let inspection;
  let postgresInspection;
  try {
    inspection = JSON.parse(execFileSync("docker", ["inspect", container], { encoding: "utf8" }))[0];
  } catch {
    fail("the disposable API container could not be inspected through the local Docker control plane.");
  }
  try {
    postgresInspection = JSON.parse(execFileSync("docker", ["inspect", postgresContainer], { encoding: "utf8" }))[0];
  } catch {
    fail("the disposable PostgreSQL container could not be inspected through the local Docker control plane.");
  }
  if (!inspection?.State?.Running) fail("the disposable API container is not running.");
  if (!postgresInspection?.State?.Running) fail("the disposable PostgreSQL container is not running.");
  const containerEnvironment = new Map(
    (inspection.Config?.Env ?? []).map((entry) => {
      const separator = entry.indexOf("=");
      return [entry.slice(0, separator), entry.slice(separator + 1)];
    })
  );
  if (containerEnvironment.get("POSTGRES_DB") !== process.env.POSTGRES_DB) {
    fail("POSTGRES_DB does not match the database configured in the target API container.");
  }
  const postgresEnvironment = new Map(
    (postgresInspection.Config?.Env ?? []).map((entry) => {
      const separator = entry.indexOf("=");
      return [entry.slice(0, separator), entry.slice(separator + 1)];
    })
  );
  if (postgresEnvironment.get("POSTGRES_DB") !== process.env.POSTGRES_DB) {
    fail("POSTGRES_DB does not match the inspected disposable PostgreSQL container.");
  }
  const postgresHost = containerEnvironment.get("POSTGRES_HOST");
  if (!postgresHost || loopbackHosts.has(postgresHost) || postgresHost === "0.0.0.0") {
    fail("the target API container must connect to the disposable PostgreSQL service by container-network hostname.");
  }
  const apiNetworks = inspection.NetworkSettings?.Networks ?? {};
  const postgresNetworks = postgresInspection.NetworkSettings?.Networks ?? {};
  const sharedNetworkNames = Object.keys(apiNetworks).filter((networkName) => postgresNetworks[networkName]);
  const postgresAliases = new Set(
    sharedNetworkNames.flatMap((networkName) => postgresNetworks[networkName]?.Aliases ?? [])
  );
  if (!postgresAliases.has(postgresHost)) {
    fail("the target API container POSTGRES_HOST is not an alias of the inspected disposable PostgreSQL container on a shared Docker network.");
  }
  const requestedPort = url.port || (url.protocol === "https:" ? "443" : "80");
  const bindings = inspection.NetworkSettings?.Ports?.["3001/tcp"] ?? [];
  const matchingBinding = bindings.some((binding) => {
    const host = String(binding.HostIp ?? "").replace(/^\[|\]$/g, "");
    return binding.HostPort === requestedPort && (loopbackHosts.has(host) || host === "0.0.0.0");
  });
  if (!matchingBinding) fail("API_BASE_URL is not published by the inspected disposable API container.");
}
