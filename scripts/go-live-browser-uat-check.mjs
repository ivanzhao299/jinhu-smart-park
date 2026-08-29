#!/usr/bin/env node
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const envFile = resolve(repoRoot, ".env.production");
const composeFile = resolve(repoRoot, "infra/docker/docker-compose.prod.yml");
const defaultCredentialsFile = resolve(repoRoot, "database/import-reports/go-live-all-users.local.csv");
const defaultReportFile = resolve(repoRoot, "database/import-reports/go-live-browser-uat-report.local.json");

const tenantId = "10000001";
const parkId = "20000001";
const apiBase = readArg("--api-base") ?? "http://127.0.0.1:4330/api/v1";
const webBase = readArg("--web-base") ?? "http://127.0.0.1:4330";
const credentialsFile = resolve(repoRoot, readArg("--credentials") ?? defaultCredentialsFile);
const reportFile = resolve(repoRoot, readArg("--report") ?? defaultReportFile);
const maxPagesPerUser = Number(readArg("--max-pages-per-user") ?? 0);
const chromePath = readArg("--chrome-path") ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browserUrl = readArg("--browser-url");
const closeExternalBrowser = process.argv.includes("--close-browser");
const usernameFilter = new Set(parseListArg("--usernames"));
const singleUsername = process.env.BROWSER_UAT_USERNAME;
const singlePassword = process.env.BROWSER_UAT_PASSWORD;
const pathPrefixes = parseListArg("--path-prefixes");
const directPaths = parseListArg("--direct-paths");
const expectForbidden = process.argv.includes("--expect-forbidden");
const mobilePathPrefixes = parseListArg("--mobile-path-prefixes");
const evidenceDirArg = readArg("--evidence-dir");
const evidenceDir = evidenceDirArg ? resolve(repoRoot, evidenceDirArg) : null;
const singlePathPrefix = readArg("--path-prefix");
if (singlePathPrefix) pathPrefixes.push(singlePathPrefix);

const failures = [];
const warnings = [];
const results = [];
const screenshotManifest = [];

async function main() {
  if (Boolean(singleUsername) !== Boolean(singlePassword)) {
    fail("BROWSER_UAT_USERNAME and BROWSER_UAT_PASSWORD must be supplied together");
  }
  const usesSingleUser = Boolean(singleUsername && singlePassword);
  if (!usesSingleUser && !existsSync(envFile)) fail(`missing production env file: ${envFile}`);
  if (!usesSingleUser && !existsSync(credentialsFile)) fail(`missing credentials file: ${credentialsFile}; run pnpm go-live:uat-all -- --reset-passwords first`);
  if (!browserUrl && !existsSync(chromePath)) fail(`missing Chrome executable: ${chromePath}`);
  if (evidenceDir) mkdirSync(evidenceDir, { recursive: true, mode: 0o700 });

  if (failures.length === 0) {
    const credentials = usesSingleUser
      ? new Map([[singleUsername, singlePassword]])
      : readCredentials(credentialsFile);
    const users = (usesSingleUser
      ? [{ username: singleUsername, displayName: singleUsername, role: "single-user UAT" }]
      : loadAllEnabledUsers())
      .filter((user) => usernameFilter.size === 0 || usernameFilter.has(user.username));
    const chrome = await launchChrome();
    try {
      for (const user of users) {
        const password = credentials.get(user.username);
        if (!password) {
          fail(`missing password for ${user.username}`);
          continue;
        }
        console.log(`[browser-uat] checking ${user.username} (${user.displayName})`);
        const result = await checkUser(user, password, chrome);
        results.push(result);
      }
    } finally {
      await chrome.close();
    }
  }

  const pagesChecked = results.reduce((sum, result) => sum + result.pages_checked, 0);
  const report = {
    checked_at: new Date().toISOString(),
    go_live_date: "2026-07-06",
    status: failures.length === 0 ? "PASS" : "FAIL",
    scope: "all_enabled_users_browser_page_uat",
    api_base: apiBase,
    web_base: webBase,
    credentials_file: singleUsername && singlePassword ? null : credentialsFile,
    report_file: reportFile,
    users_checked: results.length,
    pages_checked: pagesChecked,
    results,
    screenshot_manifest: screenshotManifest,
    warnings,
    failures
  };

  writeLocalReport(reportFile, report);
  console.log(JSON.stringify(report, null, 2));
  if (failures.length > 0) process.exitCode = 1;
}

async function checkUser(user, password, chrome) {
  const result = {
    username: user.username,
    display_name: user.displayName,
    role: user.role,
    login: "FAIL",
    menu_source: "rendered_sidebar",
    api_menu_pages_total: 0,
    menu_pages_total: 0,
    rendered_only_pages: [],
    pages_checked: 0,
    page_render_check: "FAIL",
    failed_pages: [],
    warning_pages: [],
    page_evidence: []
  };

  const login = await requestJson(`${apiBase}/auth/login`, {
    method: "POST",
    body: { tenantId, parkId, username: user.username, password }
  });
  if (login.status !== 200 || !login.body?.data?.accessToken) {
    fail(`browser UAT login failed for ${user.username}: ${login.status}`);
    return result;
  }
  result.login = "PASS";

  const token = login.body.data.accessToken;
  const me = await requestJson(`${apiBase}/users/me`, { token });
  if (me.status !== 200 || !me.body?.data) {
    result.failed_pages.push(`/users/me (${me.status})`);
    fail(`browser UAT /users/me failed for ${user.username}: ${me.status}`);
    return result;
  }

  const apiPages = Array.from(new Set(flattenMenuHrefs(me.body.data.menus ?? me.body.data.menu_tree ?? [])))
    .map(normalizeMenuHref)
    .filter(Boolean);
  result.api_menu_pages_total = apiPages.length;

  let renderedPages;
  if (directPaths.length > 0) {
    renderedPages = directPaths.map(normalizeMenuHref).filter(Boolean);
  } else {
    let renderedMenu;
    try {
      renderedMenu = await chrome.listMenuPaths({
        token,
        userContext: me.body.data,
        viewport: { width: 1440, height: 960, mobile: false, deviceScaleFactor: 1 }
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      result.failed_pages.push(`MENU_DISCOVERY: browser_harness_error (${reason})`);
      fail(`browser UAT ${user.username} could not discover rendered menu pages: browser_harness_error (${reason})`);
      return result;
    }
    if (renderedMenu.status === "FAIL") {
      result.failed_pages.push(`MENU_DISCOVERY: ${renderedMenu.reason}`);
      fail(`browser UAT ${user.username} could not discover rendered menu pages: ${renderedMenu.reason}`);
      return result;
    }
    if (renderedMenu.warnings.length > 0) {
      warnings.push(`${user.username} menu discovery: ${renderedMenu.warnings.slice(0, 2).join(" | ")}`);
    }
    renderedPages = Array.from(new Set(renderedMenu.paths)).map(normalizeMenuHref).filter(Boolean);
  }
  const apiPageSet = new Set(apiPages);
  result.rendered_only_pages = renderedPages.filter((pagePath) => !apiPageSet.has(pagePath));

  const pages = renderedPages
    .filter((pagePath) => pathPrefixes.length === 0 || pathPrefixes.some((prefix) => pagePath.startsWith(prefix)));
  const pagesToCheck = maxPagesPerUser > 0 ? pages.slice(0, maxPagesPerUser) : pages;
  result.menu_pages_total = pages.length;

  if (pages.length === 0) {
    result.failed_pages.push("NO_RENDERED_MENU_PAGE");
    fail(`browser UAT ${user.username} has no rendered menu pages after optional path filtering`);
    return result;
  }

  for (const pagePath of pagesToCheck) {
    console.log(`[browser-uat] ${user.username} -> ${pagePath}`);
    result.pages_checked += 1;

    let pageResult;
    try {
        pageResult = await chrome.visit({
          path: pagePath,
          username: user.username,
        token,
        userContext: me.body.data,
        viewport: isMobileTerminalPath(pagePath)
          ? { width: 390, height: 844, mobile: true, deviceScaleFactor: 3 }
          : { width: 1440, height: 960, mobile: false, deviceScaleFactor: 1 }
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      result.failed_pages.push(`${pagePath}: browser_harness_error (${reason})`);
      fail(`browser UAT ${user.username} failed ${pagePath}: browser_harness_error (${reason})`);
      continue;
    }

    if (pageResult.status === "FAIL") {
      result.failed_pages.push(`${pagePath}: ${pageResult.reason}`);
      fail(`browser UAT ${user.username} failed ${pagePath}: ${pageResult.reason}`);
    } else if (pageResult.warnings.length > 0) {
      result.warning_pages.push({ path: pagePath, warnings: pageResult.warnings.slice(0, 5) });
      warnings.push(`${user.username} ${pagePath}: ${pageResult.warnings.slice(0, 2).join(" | ")}`);
    }
    result.page_evidence.push({ path: pagePath, ...pageResult });
  }

  if (result.failed_pages.length === 0) {
    result.page_render_check = "PASS";
  }
  console.log(`[browser-uat] ${user.username} done: ${result.page_render_check} (${result.pages_checked}/${result.menu_pages_total})`);
  return result;
}

async function launchChrome() {
  if (browserUrl) {
    const version = await waitForJson(`${browserUrl}/json/version`, 15000);
    const browser = new CdpClient(version.webSocketDebuggerUrl);
    await browser.open();
    return {
      async listMenuPaths(input) {
        return collectRenderedMenuPaths(browser, input);
      },
      async visit(input) {
        return visitPage(browser, input);
      },
      async close() {
        if (closeExternalBrowser) await browser.send("Browser.close").catch(() => undefined);
        await browser.close();
      }
    };
  }
  const port = 46000 + Math.floor(Math.random() * 1000);
  const userDataDir = mkdtempSync(resolve(tmpdir(), "jinhu-browser-uat-"));
  const chromeUserDataDir = chromePath.toLowerCase().endsWith(".exe")
    ? execFileSync("wslpath", ["-w", userDataDir], { encoding: "utf8" }).trim()
    : userDataDir;
  const child = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    `--remote-debugging-port=${port}`,
    "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${chromeUserDataDir}`,
    "about:blank"
  ], { stdio: "ignore" });

  const version = await waitForJson(`http://127.0.0.1:${port}/json/version`, 15000);
  const browser = new CdpClient(version.webSocketDebuggerUrl);
  await browser.open();

  return {
    async listMenuPaths(input) {
      return collectRenderedMenuPaths(browser, input);
    },
    async visit(input) {
      return visitPage(browser, input);
    },
    async close() {
      await browser.close();
      if (!child.killed) child.kill("SIGTERM");
      await new Promise((resolveClose) => {
        const timer = setTimeout(resolveClose, 1500);
        child.once("exit", () => {
          clearTimeout(timer);
          resolveClose();
        });
      });
      rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  };
}

async function collectRenderedMenuPaths(browser, { token, userContext, viewport }) {
  const target = await browser.send("Target.createTarget", { url: `${webBase}/login` });
  const attached = await browser.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  const sessionId = attached.sessionId;
  const runtimeErrors = [];
  const pageWarnings = [];

  const off = browser.onEvent((message) => {
    if (message.sessionId !== sessionId) return;
    if (message.method === "Runtime.exceptionThrown") {
      runtimeErrors.push(message.params?.exceptionDetails?.text ?? "runtime exception");
    }
    if (message.method === "Runtime.consoleAPICalled" && message.params?.type === "error") {
      const text = (message.params.args ?? [])
        .map((arg) => String(arg.value ?? arg.description ?? ""))
        .filter(Boolean)
        .join(" ");
      if (text) pageWarnings.push(`console.error: ${text}`);
    }
  });

  try {
    await browser.send("Page.enable", {}, sessionId);
    await browser.send("Runtime.enable", {}, sessionId);
    await browser.send("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      mobile: viewport.mobile,
      deviceScaleFactor: viewport.deviceScaleFactor
    }, sessionId);
    await waitForReady(browser, sessionId);

    const seedSessionSource = `
        localStorage.setItem("jinhu_access_token", ${JSON.stringify(token)});
        sessionStorage.setItem("jinhu_access_token", ${JSON.stringify(token)});
        localStorage.setItem("jinhu_auth_user", ${JSON.stringify(JSON.stringify(userContext))});
        sessionStorage.setItem("jinhu_auth_user", ${JSON.stringify(JSON.stringify(userContext))});
      `;
    await browser.send("Page.addScriptToEvaluateOnNewDocument", { source: seedSessionSource }, sessionId);
    await browser.send("Runtime.evaluate", {
      expression: seedSessionSource,
      awaitPromise: true
    }, sessionId);

    const loadPromise = waitForEvent(browser, sessionId, "Page.loadEventFired", 12000);
    await browser.send("Page.navigate", { url: `${webBase}/dashboard` }, sessionId);
    await loadPromise;
    await waitForReady(browser, sessionId);
    await waitForExpression(
      browser,
      sessionId,
      `Boolean(document.querySelector("aside.app-sidebar:not(.dashboard-sidebar-skeleton) nav.sidebar-menu"))`,
      10000
    );

    const evaluation = await browser.send("Runtime.evaluate", {
      expression: `(() => {
        const text = document.body?.innerText ?? "";
        const sidebar = document.querySelector("aside.app-sidebar:not(.dashboard-sidebar-skeleton) nav.sidebar-menu");
        return {
          pathname: location.pathname,
          textLength: text.trim().length,
          hasLogin: Boolean(document.querySelector(".signin-page")) || location.pathname === "/login",
          hasForbidden: location.pathname === "/403" || /403|无权访问|权限不足/.test(text),
          hasNextError: /Application error|Unhandled Runtime Error|ChunkLoadError|Hydration failed/i.test(text),
          hasSidebar: Boolean(sidebar),
          paths: sidebar
            ? Array.from(sidebar.querySelectorAll("a[href]"), (link) => link.getAttribute("href")).filter(Boolean)
            : []
        };
      })()`,
      returnByValue: true,
      awaitPromise: true
    }, sessionId);

    const value = evaluation.result?.value ?? {};
    const hardFailure = getRenderFailure(value, runtimeErrors)
      || (!value.hasSidebar ? "menu_sidebar_not_rendered" : "")
      || (!Array.isArray(value.paths) || value.paths.length === 0 ? "no_rendered_menu_links" : "");
    return {
      status: hardFailure ? "FAIL" : "PASS",
      reason: hardFailure,
      warnings: pageWarnings,
      paths: Array.isArray(value.paths) ? value.paths : []
    };
  } finally {
    off();
    await browser.send("Target.closeTarget", { targetId: target.targetId }).catch(() => undefined);
  }
}

async function visitPage(browser, { path, username, token, userContext, viewport }) {
  const target = await browser.send("Target.createTarget", { url: `${webBase}/login` });
  const attached = await browser.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  const sessionId = attached.sessionId;
  const runtimeErrors = [];
  const pageWarnings = [];
  const network = [];

  const off = browser.onEvent((message) => {
    if (message.sessionId !== sessionId) return;
    if (message.method === "Runtime.exceptionThrown") {
      runtimeErrors.push(message.params?.exceptionDetails?.text ?? "runtime exception");
    }
    if (message.method === "Runtime.consoleAPICalled" && message.params?.type === "error") {
      const text = (message.params.args ?? [])
        .map((arg) => String(arg.value ?? arg.description ?? ""))
        .filter(Boolean)
        .join(" ");
      if (text) pageWarnings.push(`console.error: ${text}`);
    }
    if (message.method === "Network.responseReceived") {
      const response = message.params?.response;
      if (response?.url?.startsWith(`${webBase}/api/v1/`)) {
        network.push({
          resource_type: message.params?.type ?? "Other",
          path: new URL(response.url).pathname,
          status: response.status
        });
      }
    }
  });

  try {
    await browser.send("Page.enable", {}, sessionId);
    await browser.send("Runtime.enable", {}, sessionId);
    await browser.send("Network.enable", {}, sessionId);
    await browser.send("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      mobile: viewport.mobile,
      deviceScaleFactor: viewport.deviceScaleFactor
    }, sessionId);
    await waitForReady(browser, sessionId);

    const seedSessionSource = `
        localStorage.setItem("jinhu_access_token", ${JSON.stringify(token)});
        sessionStorage.setItem("jinhu_access_token", ${JSON.stringify(token)});
        localStorage.setItem("jinhu_auth_user", ${JSON.stringify(JSON.stringify(userContext))});
        sessionStorage.setItem("jinhu_auth_user", ${JSON.stringify(JSON.stringify(userContext))});
      `;
    await browser.send("Page.addScriptToEvaluateOnNewDocument", { source: seedSessionSource }, sessionId);
    await browser.send("Runtime.evaluate", {
      expression: seedSessionSource,
      awaitPromise: true
    }, sessionId);

    const loadPromise = waitForEvent(browser, sessionId, "Page.loadEventFired", 12000);
    await browser.send("Page.navigate", { url: `${webBase}${path}` }, sessionId);
    await loadPromise;
    await waitForReady(browser, sessionId);
    await sleep(expectForbidden ? 2500 : 500);

    const evaluation = await browser.send("Runtime.evaluate", {
      expression: `(() => {
        const text = document.body?.innerText ?? "";
        return {
          href: location.href,
          pathname: location.pathname,
          title: document.title,
          textLength: text.trim().length,
          hasLogin: Boolean(document.querySelector(".signin-page")) || location.pathname === "/login",
          hasForbidden: location.pathname === "/403" || /403|无权访问|权限不足/.test(text),
          hasNextError: /Application error|Unhandled Runtime Error|ChunkLoadError|Hydration failed/i.test(text),
          headline: (document.querySelector("h1, h2, main")?.textContent ?? "").trim().slice(0, 120),
          viewportWidth: window.innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1
        };
      })()`,
      returnByValue: true,
      awaitPromise: true
    }, sessionId);

    const value = evaluation.result?.value ?? {};
    if (evidenceDir) {
      const safeUsername = String(username).replaceAll(/[^A-Za-z0-9_.-]/g, "_");
      const filename = `${safeUsername}-${String(viewport.width)}-${path.replace(/^\/+/, "").replaceAll("/", "-") || "root"}.png`;
      const screenshot = await browser.send("Page.captureScreenshot", { format: "png", fromSurface: true }, sessionId);
      writeFileSync(resolve(evidenceDir, filename), Buffer.from(screenshot.data, "base64"), { mode: 0o600 });
      screenshotManifest.push({ path, viewport, filename, captured_at: new Date().toISOString() });
    }
    const renderFailure = getRenderFailure(value, runtimeErrors, { allowForbidden: expectForbidden });
    const failedNetwork = network.find((entry) => Number(entry.status) >= 400 && !(expectForbidden && Number(entry.status) === 403));
    const hardFailure = renderFailure
      || (expectForbidden && !value.hasForbidden ? "expected_forbidden_not_rendered" : "")
      || (viewport.mobile && value.horizontalOverflow ? `horizontal_overflow:${value.documentWidth}>${value.viewportWidth}` : "")
      || (failedNetwork ? `api_response_failed:${failedNetwork.status}:${failedNetwork.path}` : "");
    return {
      status: hardFailure ? "FAIL" : "PASS",
      reason: hardFailure,
      warnings: pageWarnings,
      page: value,
      network
    };
  } finally {
    off();
    await browser.send("Target.closeTarget", { targetId: target.targetId }).catch(() => undefined);
  }
}

function getRenderFailure(value, runtimeErrors, options = {}) {
  if (runtimeErrors.length > 0) return `runtime exception: ${runtimeErrors.slice(0, 2).join(" | ")}`;
  if (value.hasLogin) return "redirected_to_login";
  if (value.hasForbidden && !options.allowForbidden) return "forbidden_or_permission_error";
  if (value.hasNextError) return "next_runtime_error";
  if (Number(value.textLength ?? 0) < 30) return "blank_or_too_little_content";
  return "";
}

class CdpClient {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = new Set();
  }

  async open() {
    this.ws = new WebSocket(this.url);
    await new Promise((resolveOpen, rejectOpen) => {
      const timer = setTimeout(() => rejectOpen(new Error("CDP websocket open timeout")), 10000);
      this.ws.addEventListener("open", () => {
        clearTimeout(timer);
        resolveOpen();
      }, { once: true });
      this.ws.addEventListener("error", rejectOpen, { once: true });
    });
    this.ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result ?? {});
        return;
      }
      for (const handler of this.handlers) handler(message);
    });
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolveSend, rejectSend) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rejectSend(new Error(`CDP command timeout: ${method}`));
      }, 30000);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolveSend(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          rejectSend(error);
        }
      });
      this.ws.send(JSON.stringify(payload));
    });
  }

  onEvent(handler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async close() {
    this.ws?.close();
  }
}

async function waitForReady(browser, sessionId) {
  for (let index = 0; index < 40; index += 1) {
    const result = await browser.send("Runtime.evaluate", {
      expression: `document.readyState === "complete"`,
      returnByValue: true
    }, sessionId).catch(() => ({ result: { value: false } }));
    if (result.result?.value === true) return;
    await sleep(250);
  }
}

async function waitForExpression(browser, sessionId, expression, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const result = await browser.send("Runtime.evaluate", {
      expression,
      returnByValue: true
    }, sessionId).catch(() => ({ result: { value: false } }));
    if (result.result?.value === true) return;
    await sleep(250);
  }
}

function waitForEvent(browser, sessionId, method, timeoutMs) {
  return new Promise((resolveEvent) => {
    const timer = setTimeout(() => {
      off();
      resolveEvent(null);
    }, timeoutMs);
    const off = browser.onEvent((message) => {
      if (message.sessionId === sessionId && message.method === method) {
        clearTimeout(timer);
        off();
        resolveEvent(message.params ?? null);
      }
    });
  });
}

async function waitForJson(url, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {}
    await sleep(250);
  }
  throw new Error(`timed out waiting for ${url}`);
}

function loadAllEnabledUsers() {
  const rows = psql(`
SELECT
  u.username,
  COALESCE(NULLIF(u.display_name, ''), u.username) AS display_name,
  COALESCE(string_agg(DISTINCT r.name || ':' || r.code, ', ' ORDER BY r.name || ':' || r.code), '') AS roles
FROM sys_user u
LEFT JOIN rel_user_role ur
  ON ur.user_id = u.id
 AND ur.tenant_id = u.tenant_id
 AND ur.park_id = u.park_id
 AND ur.is_deleted = false
LEFT JOIN sys_role r
  ON r.id = ur.role_id
 AND r.tenant_id = u.tenant_id
 AND r.park_id = u.park_id
 AND r.is_deleted = false
WHERE u.tenant_id = ${sqlString(tenantId)}
  AND u.park_id = ${sqlString(parkId)}
  AND u.is_deleted = false
  AND u.is_enabled = true
  AND u.status = 'enabled'
GROUP BY u.username, u.display_name
ORDER BY u.username;
`);
  return rows.map((row) => {
    const [username, displayName, roleSummary] = row.split("|");
    return { username, displayName, role: roleSummary || "未配置角色" };
  });
}

function psql(sql) {
  const command = `
set -a
. ${shellQuote(envFile)}
set +a
docker compose --env-file ${shellQuote(envFile)} -f ${shellQuote(composeFile)} exec -T postgres \\
  psql -X -A -t -F '|' -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"
`;
  const output = execFileSync("sh", ["-lc", command], {
    cwd: repoRoot,
    input: sql,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 10
  });
  return output.split(/\r?\n/).filter((line) => line.length > 0);
}

async function requestJson(url, options = {}) {
  const headers = {
    accept: "application/json",
    ...(options.body ? { "content-type": "application/json" } : {}),
    ...(options.token ? { authorization: `Bearer ${options.token}` } : {})
  };
  try {
    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  } catch (error) {
    return { status: 0, body: { message: error.message } };
  }
}

function readCredentials(file) {
  const content = readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  const [headerLine, ...lines] = content.split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(headerLine);
  const usernameIndex = headers.indexOf("username");
  const passwordIndex = headers.findIndex((header) => ["uat_password", "initial_password", "password"].includes(header));
  if (usernameIndex < 0 || passwordIndex < 0) {
    throw new Error(`credentials file must include username and password column: ${file}`);
  }
  const credentials = new Map();
  for (const line of lines) {
    const cells = parseCsvLine(line);
    const username = cells[usernameIndex];
    const password = cells[passwordIndex];
    if (username && password && password !== "保留原密码") credentials.set(username, password);
  }
  return credentials;
}

function flattenMenuHrefs(nodes) {
  const hrefs = [];
  for (const node of nodes) {
    if (node?.href) hrefs.push(node.href);
    if (Array.isArray(node?.children)) hrefs.push(...flattenMenuHrefs(node.children));
  }
  return hrefs;
}

function normalizeMenuHref(href) {
  if (typeof href !== "string" || !href.startsWith("/")) return null;
  const [path] = href.split("?");
  if (!path || path.includes(":")) return null;
  return path;
}

function isMobileTerminalPath(path) {
  return mobilePathPrefixes.some((prefix) => path.startsWith(prefix))
    || path === "/operations/terminal"
    || path === "/engineering/terminal"
    || path === "/preview/operations-terminal";
}

function writeLocalReport(file, report) {
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function parseListArg(name) {
  const value = readArg(name);
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function fail(message) {
  failures.push(message);
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

await main();
