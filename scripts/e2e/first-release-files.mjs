import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3001/api/v1";
const adminUsername = process.env.ADMIN_USERNAME ?? "admin";
const adminPassword = process.env.ADMIN_PASSWORD ?? "Jinhu@123456";
const testRunId = process.env.TEST_RUN_ID ?? new Date().toISOString().replace(/[-:.]/g, "");
const fileMimeType = "image/png";
const fileName = `first-release-file-regression-${testRunId}.png`;
const fileText = `JinHu first-release file regression ${testRunId}`;
const fileBuffer = Buffer.from(fileText, "utf8");

function info(message) {
  console.log(`[INFO] ${message}`);
}

function pass(message) {
  console.log(`[PASS] ${message}`);
}

function fail(message) {
  console.error(`[FAIL] ${message}`);
  process.exitCode = 1;
}

function summarizeBody(body) {
  if (body === null || body === undefined) {
    return "<empty>";
  }
  if (typeof body === "string") {
    return body.slice(0, 240);
  }
  try {
    return JSON.stringify(body).slice(0, 240);
  } catch {
    return String(body).slice(0, 240);
  }
}

async function request(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, options);
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => "");
  return { response, body };
}

async function requestBinary(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, options);
  const arrayBuffer = await response.arrayBuffer().catch(() => new ArrayBuffer(0));
  const body = Buffer.from(arrayBuffer);
  return { response, body };
}

function assertStatus(label, actual, expectedList, body) {
  const allowed = Array.isArray(expectedList) ? expectedList : [expectedList];
  if (!allowed.includes(actual)) {
    fail(`${label} expected ${allowed.join(" / ")}, got ${actual}; body=${summarizeBody(body)}`);
    return false;
  }
  pass(`${label} HTTP ${actual}`);
  return true;
}

function extractToken(body) {
  const token = body?.data?.accessToken ?? body?.accessToken;
  return typeof token === "string" && token.length > 0 ? token : null;
}

function extractFileId(body) {
  const candidate = body?.data?.id ?? body?.id ?? body?.data?.fileId ?? body?.fileId;
  return typeof candidate === "string" && candidate.length > 0 ? candidate : null;
}

async function login() {
  return request("/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-request-id": `first-release-files-${randomUUID()}`
    },
    body: JSON.stringify({
      tenantId: process.env.DEFAULT_TENANT_ID ?? "10000001",
      parkId: process.env.DEFAULT_PARK_ID ?? "20000001",
      username: adminUsername,
      password: adminPassword
    })
  });
}

async function uploadFile(token) {
  const formData = new FormData();
  formData.append("biz_type", "first_release_regression");
  formData.append("remark", `First release file regression ${testRunId}`);
  formData.append("file", new Blob([fileBuffer], { type: fileMimeType }), fileName);

  const result = await request("/files", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "x-idempotency-key": `first-release-files-upload-${testRunId}`,
      "x-request-id": `first-release-files-upload-${randomUUID()}`
    },
    body: formData
  });

  if (!assertStatus("POST /files upload", result.response.status, [200, 201], result.body)) {
    return null;
  }

  const fileId = extractFileId(result.body);
  if (!fileId) {
    fail(`POST /files upload did not return file id; body=${summarizeBody(result.body)}`);
    return null;
  }

  pass(`POST /files upload returned file id ${fileId}`);
  return fileId;
}

async function downloadFile(token, fileId) {
  const result = await requestBinary(`/files/${fileId}/download`, {
    headers: {
      authorization: `Bearer ${token}`,
      "x-request-id": `first-release-files-download-${randomUUID()}`
    }
  });

  if (!assertStatus(`GET /files/${fileId}/download`, result.response.status, 200, "<binary>")) {
    return null;
  }

  const downloaded = result.body;
  if (downloaded.length !== fileBuffer.length || downloaded.compare(fileBuffer) !== 0) {
    fail(`GET /files/${fileId}/download content mismatch; expected=${fileBuffer.length} bytes, got=${downloaded.length} bytes`);
    return null;
  }

  const contentDisposition = result.response.headers.get("content-disposition") ?? "";
  if (contentDisposition && !contentDisposition.includes(encodeURIComponent(fileName))) {
    fail(`GET /files/${fileId}/download content-disposition mismatch; header=${contentDisposition}`);
    return null;
  }

  pass(`GET /files/${fileId}/download returned expected content (${downloaded.length} bytes)`);
  return true;
}

async function deleteFile(token, fileId) {
  const result = await request(`/files/${fileId}`, {
    method: "DELETE",
    headers: {
      authorization: `Bearer ${token}`,
      "x-idempotency-key": `first-release-files-delete-${testRunId}`,
      "x-request-id": `first-release-files-delete-${randomUUID()}`
    }
  });

  if (!assertStatus(`DELETE /files/${fileId}`, result.response.status, [200, 204], result.body)) {
    return false;
  }

  pass(`DELETE /files/${fileId} completed`);
  return true;
}

async function assertDeletedNotDownloadable(token, fileId) {
  const result = await request(`/files/${fileId}/download`, {
    headers: {
      authorization: `Bearer ${token}`,
      "x-request-id": `first-release-files-download-after-delete-${randomUUID()}`
    }
  });

  if ([404, 403, 410].includes(result.response.status)) {
    pass(`GET /files/${fileId}/download after delete rejected as expected (HTTP ${result.response.status})`);
    return true;
  }

  fail(`GET /files/${fileId}/download after delete unexpectedly succeeded (HTTP ${result.response.status}); body=${summarizeBody(result.body)}`);
  return false;
}

async function run() {
  info(`API base: ${apiBaseUrl}`);
  info(`Test run id: ${testRunId}`);
  info(`Script root: ${rootDir}`);
  info(`Test file name: ${fileName}`);

  const loginResult = await login();
  if (!assertStatus("POST /auth/login", loginResult.response.status, 200, loginResult.body)) return;
  const token = extractToken(loginResult.body);
  if (!token) {
    fail("POST /auth/login did not return accessToken");
    return;
  }
  pass("POST /auth/login returned token");

  const fileId = await uploadFile(token);
  if (!fileId) return;

  const downloaded = await downloadFile(token, fileId);
  if (!downloaded) return;

  const deleted = await deleteFile(token, fileId);
  if (!deleted) {
    fail(`DELETE /files/${fileId} failed; manual cleanup may be needed for file id ${fileId}`);
    return;
  }

  await assertDeletedNotDownloadable(token, fileId);
  console.log("[PASS] first release file regression completed");
}

run().catch((error) => {
  fail(`Unexpected error: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
});
