#!/usr/bin/env node
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
const redactedApiBase = redactUrl(apiBase);
const redactedWebBase = redactUrl(webBase);
const apiPathPrefix = new URL(apiBase).pathname.replace(/\/$/u, "");
const trackedWebApiPrefix = `${webBase.replace(/\/$/u, "")}${apiPathPrefix}/`;
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
const viewportMatrix = process.argv.includes("--viewport-matrix");
const requiredRouteCount = Number(readArg("--require-route-count") ?? 0);
const requiredCaseCount = Number(readArg("--require-case-count") ?? 0);
const caseFileArg = readArg("--case-file");
const caseFile = caseFileArg ? resolve(repoRoot, caseFileArg) : null;
const evidenceDirArg = readArg("--evidence-dir");
const evidenceDir = evidenceDirArg ? resolve(repoRoot, evidenceDirArg) : null;
const runId = readArg("--run-id") ?? process.env.TEST_RUN_ID ?? null;
const rewriteTarget = readArg("--rewrite-target") ?? process.env.NEXT_PUBLIC_API_TARGET ?? null;
const redactedRewriteTarget = rewriteTarget ? redactUrl(rewriteTarget, webBase) : null;
const singlePathPrefix = readArg("--path-prefix");
if (singlePathPrefix) pathPrefixes.push(singlePathPrefix);

const failures = [];
const warnings = [];
const results = [];
const screenshotManifest = [];
let routeCases = [];

async function main() {
  try {
    await run();
  } catch (error) {
    fail(`browser UAT harness failed: ${redactDiagnostic(error instanceof Error ? error.message : String(error))}`);
  }
  const report = buildReport(Boolean(singleUsername && singlePassword));
  writeEvidence(report);
  console.log(JSON.stringify(report, null, 2));
  if (failures.length > 0) process.exitCode = 1;
}

async function run() {
  if (Boolean(singleUsername) !== Boolean(singlePassword)) {
    fail("BROWSER_UAT_USERNAME and BROWSER_UAT_PASSWORD must be supplied together");
  }
  const usesSingleUser = Boolean(singleUsername && singlePassword);
  if (!usesSingleUser && !existsSync(envFile)) fail(`missing production env file: ${envFile}`);
  if (!usesSingleUser && !existsSync(credentialsFile)) fail(`missing credentials file: ${credentialsFile}; run pnpm go-live:uat-all -- --reset-passwords first`);
  if (!browserUrl && !existsSync(chromePath)) fail(`missing Chrome executable: ${chromePath}`);
  if (caseFile && !existsSync(caseFile)) fail(`missing browser UAT case file: ${caseFile}`);
  if (evidenceDir) {
    mkdirSync(evidenceDir, { recursive: true, mode: 0o700 });
    chmodSync(evidenceDir, 0o700);
  }

  if (caseFile && failures.length === 0) {
    try {
      routeCases = readRouteCases(caseFile);
      directPaths.push(...routeCases.map((entry) => entry.path));
      const uniqueRouteCount = new Set(routeCases.map((entry) => entry.path)).size;
      if (requiredRouteCount > 0 && uniqueRouteCount !== requiredRouteCount) fail(`browser UAT requires ${requiredRouteCount} unique routes, received ${uniqueRouteCount}`);
      if (requiredCaseCount > 0 && routeCases.length !== requiredCaseCount) fail(`browser UAT requires ${requiredCaseCount} cases, received ${routeCases.length}`);
      if ((requiredRouteCount > 0 || requiredCaseCount > 0) && (maxPagesPerUser > 0 || pathPrefixes.length > 0)) fail("required route/case counts cannot be combined with page truncation or path-prefix filtering");
    } catch (error) {
      fail(`invalid browser UAT case file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (failures.length === 0) {
    const credentials = usesSingleUser
      ? new Map([[singleUsername, singlePassword]])
      : readCredentials(credentialsFile);
    const users = (usesSingleUser
      ? [{ username: singleUsername, displayName: singleUsername, role: "single-user UAT" }]
      : loadAllEnabledUsers())
      .filter((user) => usernameFilter.size === 0 || usernameFilter.has(user.username));
    if (users.length === 0) fail("browser UAT selected no users");
    if (failures.length > 0) {
      return;
    }
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

}

function buildReport(usesSingleUser) {
  const pagesChecked = results.reduce((sum, result) => sum + result.pages_checked, 0);
  return {
    checked_at: new Date().toISOString(),
    go_live_date: "2026-07-06",
    status: failures.length === 0 ? "PASS" : "FAIL",
    scope: usesSingleUser ? "single_user_browser_page_uat" : "all_enabled_users_browser_page_uat",
    api_base: redactedApiBase,
    web_base: redactedWebBase,
    credentials_file: singleUsername && singlePassword ? null : "[LOCAL_CREDENTIALS_FILE]",
    report_file: "[LOCAL_REPORT_FILE]",
    users_checked: results.length,
    pages_checked: pagesChecked,
    results,
    screenshot_manifest: screenshotManifest,
    artifact_manifest: evidenceDir ? "evidence-manifest.json" : null,
    viewport_matrix: viewportMatrix,
    case_file: caseFile ? "[LOCAL_CASE_FILE]" : null,
    run_id: runId,
    rewrite_target: redactedRewriteTarget,
    warnings,
    failures
    ,hcd_evidence_grade: resolveHcdEvidenceGrade(pagesChecked)
  };
}

async function checkUser(user, password, chrome) {
  const userRef = `user-${sha256(String(user.username)).slice(0, 12)}`;
  const result = {
    user_ref: userRef,
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
    ,session_isolation: "NOT_RUN"
  };

  let session;
  try {
    session = await chrome.createSession();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    result.failed_pages.push(`SESSION_CREATE: browser_harness_error (${reason})`);
    fail(`browser UAT ${userRef} could not create an isolated browser session: ${reason}`);
    return result;
  }
  let me;
  try {
    const login = await session.login({ username: user.username, password });
    result.login_evidence = login;
    if (login.status !== "PASS") {
      fail(`browser UAT UI login failed for ${userRef}: ${login.reason}`);
      return result;
    }
    result.login = "PASS";
    me = await session.currentUser();
    if (!me?.data) {
      result.failed_pages.push("/users/me (browser_session_failed)");
      fail(`browser UAT browser-session /users/me failed for ${userRef}`);
      return result;
    }

  const apiPages = Array.from(new Set(flattenMenuHrefs(me.data.menus ?? me.data.menu_tree ?? [])))
    .map(normalizeMenuHref)
    .filter(Boolean);
  result.api_menu_pages_total = apiPages.length;

  let renderedPages;
  if (directPaths.length > 0) {
    renderedPages = Array.from(new Set(directPaths.map(normalizeMenuHref).filter(Boolean)));
  } else {
    let renderedMenu;
    try {
      renderedMenu = await session.listMenuPaths({
        viewport: { width: 1440, height: 960, mobile: false, deviceScaleFactor: 1 }
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      result.failed_pages.push(`MENU_DISCOVERY: browser_harness_error (${reason})`);
      fail(`browser UAT ${userRef} could not discover rendered menu pages: browser_harness_error (${reason})`);
      return result;
    }
    if (renderedMenu.status === "FAIL") {
      result.failed_pages.push(`MENU_DISCOVERY: ${renderedMenu.reason}`);
      fail(`browser UAT ${userRef} could not discover rendered menu pages: ${renderedMenu.reason}`);
      return result;
    }
    if (renderedMenu.warnings.length > 0) {
      warnings.push(`${userRef} menu discovery: ${renderedMenu.warnings.slice(0, 2).join(" | ")}`);
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
    fail(`browser UAT ${userRef} has no rendered menu pages after optional path filtering`);
    return result;
  }

  for (const pagePath of pagesToCheck) {
    const pageCases = routeCases.filter((entry) => entry.path === pagePath);
    const viewports = resolveViewports(pagePath, pageCases);
    const reportedPath = redactRoutePath(pagePath);
    for (const viewport of viewports) {
      console.log(`[browser-uat] ${user.username} -> ${reportedPath} (${viewport.width}px)`);
      result.pages_checked += 1;

      let pageResult;
      try {
        pageResult = await session.visit({
          path: pagePath,
          username: userRef,
          viewport,
          assertions: pageCases
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        result.failed_pages.push(`${reportedPath}@${viewport.width}: browser_harness_error (${reason})`);
        fail(`browser UAT ${userRef} failed ${reportedPath}@${viewport.width}: browser_harness_error (${reason})`);
        continue;
      }

      if (pageResult.status === "FAIL") {
        result.failed_pages.push(`${reportedPath}@${viewport.width}: ${pageResult.reason}`);
        fail(`browser UAT ${userRef} failed ${reportedPath}@${viewport.width}: ${pageResult.reason}`);
      } else if (pageResult.warnings.length > 0) {
        result.warning_pages.push({ path: reportedPath, viewport: viewport.width, warnings: pageResult.warnings.slice(0, 5) });
        warnings.push(`${userRef} ${reportedPath}@${viewport.width}: ${pageResult.warnings.slice(0, 2).join(" | ")}`);
      }
      result.page_evidence.push({ case_ids: pageCases.map((entry) => entry.id), path: reportedPath, viewport, ...pageResult });
    }
  }

  if (result.failed_pages.length === 0) {
    result.page_render_check = "PASS";
  }
  console.log(`[browser-uat] ${user.username} done: ${result.page_render_check} (${result.pages_checked}/${result.menu_pages_total})`);
  return result;
  } finally {
    if (result.login === "PASS" && result.session_isolation === "NOT_RUN") {
      try {
        const logoutEvidence = await session.logout();
        result.logout_evidence = logoutEvidence;
        await session.close();
        session = null;
        const anonymousSession = await chrome.createSession();
        try {
          result.isolation_evidence = await anonymousSession.auditAnonymous();
          result.session_isolation = logoutEvidence.status === "PASS" && result.isolation_evidence.status === "PASS" ? "PASS" : "FAIL";
        } finally {
          await anonymousSession.close();
        }
      } catch (error) {
        result.session_isolation = "FAIL";
        result.isolation_error = redactDiagnostic(error instanceof Error ? error.message : String(error));
      }
      if (result.session_isolation !== "PASS") fail(`browser UAT session isolation failed for ${userRef}`);
    }
    if (session) await session.close();
  }
}

async function launchChrome() {
  if (browserUrl) {
    const version = await waitForJson(`${browserUrl}/json/version`, 15000);
    const browser = new CdpClient(version.webSocketDebuggerUrl);
    await browser.open();
    return {
      async createSession() {
        return createBrowserSession(browser);
      },
      async close() {
        try {
          if (closeExternalBrowser) await browser.send("Browser.close");
        } finally {
          await browser.close();
        }
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
    async createSession() {
      return createBrowserSession(browser);
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

async function createBrowserSession(browser) {
  const context = await browser.send("Target.createBrowserContext", { disposeOnDetach: true });
  const browserContextId = context.browserContextId;
  return {
    login: (input) => loginThroughUi(browser, browserContextId, input),
    currentUser: () => browserSessionRequest(browser, browserContextId, `${apiPathPrefix}/users/me`),
    logout: () => logoutThroughUi(browser, browserContextId),
    auditAnonymous: () => auditAnonymousContext(browser, browserContextId),
    listMenuPaths: (input) => collectRenderedMenuPaths(browser, { ...input, browserContextId }),
    visit: (input) => visitPage(browser, { ...input, browserContextId }),
    close: () => browser.send("Target.disposeBrowserContext", { browserContextId }).catch(() => undefined)
  };
}

async function logoutThroughUi(browser, browserContextId) {
  const target = await browser.send("Target.createTarget", { url: `${webBase}/dashboard`, browserContextId });
  const attached = await browser.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  const sessionId = attached.sessionId;
  const logoutResponses = [];
  const requests = new Map();
  const off = browser.onEvent((message) => {
    if (message.sessionId !== sessionId) return;
    if (message.method === "Network.requestWillBeSent") requests.set(message.params.requestId, message.params?.request);
    if (message.method === "Network.responseReceived") {
      const request = requests.get(message.params?.requestId);
      const requestPath = request?.url ? new URL(request.url).pathname : "";
      if (requestPath === `${apiPathPrefix}/auth/logout-cookie` || requestPath === `${apiPathPrefix}/auth/logout`) {
        logoutResponses.push({ path: requestPath, status: message.params?.response?.status ?? null });
      }
    }
  });
  try {
    await browser.send("Runtime.enable", {}, sessionId);
    await browser.send("Network.enable", {}, sessionId);
    await waitForReady(browser, sessionId);
    await waitForExpression(browser, sessionId, `Boolean(document.querySelector("button.user-logout-button"))`, 10000);
    const clicked = await browser.send("Runtime.evaluate", {
      expression: `(() => { const button = document.querySelector("button.user-logout-button"); if (!button) return false; button.click(); return true; })()`,
      returnByValue: true
    }, sessionId);
    if (!clicked.result?.value) return { status: "FAIL", reason: "logout_button_not_found" };
    await waitForExpression(browser, sessionId, `location.pathname === "/login" && !localStorage.getItem("jinhu_access_token") && !sessionStorage.getItem("jinhu_access_token")`, 15000);
    const evidence = await browser.send("Runtime.evaluate", {
      expression: `({ pathname: location.pathname, hasStorageSession: Boolean(localStorage.getItem("jinhu_access_token") || sessionStorage.getItem("jinhu_access_token")), cookieNames: document.cookie.split(";").map(value => value.split("=")[0].trim()).filter(Boolean) })`,
      returnByValue: true
    }, sessionId);
    const value = evidence.result?.value ?? {};
    const serverLogoutSucceeded = logoutResponses.some((entry) => Number(entry.status) >= 200 && Number(entry.status) < 300);
    return { status: value.pathname === "/login" && !value.hasStorageSession && serverLogoutSucceeded ? "PASS" : "FAIL", serverLogoutSucceeded, logoutResponses, ...value };
  } finally {
    off();
    await browser.send("Target.closeTarget", { targetId: target.targetId }).catch(() => undefined);
  }
}

async function auditAnonymousContext(browser, browserContextId) {
  const target = await browser.send("Target.createTarget", { url: `${webBase}/login`, browserContextId });
  const attached = await browser.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  try {
    await browser.send("Page.enable", {}, attached.sessionId);
    await browser.send("Runtime.enable", {}, attached.sessionId);
    await waitForReady(browser, attached.sessionId);
    await waitForExpression(
      browser,
      attached.sessionId,
      `location.origin === ${JSON.stringify(new URL(webBase).origin)}`,
      10000
    );
    const response = await browser.send("Runtime.evaluate", {
      expression: `fetch(${JSON.stringify(`${apiPathPrefix}/users/me`)}, { credentials: "same-origin" }).then(response => ({ meStatus: response.status, hasStorageSession: Boolean(localStorage.getItem("jinhu_access_token") || sessionStorage.getItem("jinhu_access_token")), cookieNames: document.cookie.split(";").map(value => value.split("=")[0].trim()).filter(Boolean) }))`,
      returnByValue: true,
      awaitPromise: true
    }, attached.sessionId);
    const value = response.result?.value ?? {};
    const cookies = await browser.send("Storage.getCookies", { browserContextId }).catch(() => ({ cookies: [] }));
    const cookieNames = (cookies.cookies ?? []).map((cookie) => String(cookie.name));
    const hasAuthCookie = cookieNames.some((name) => /(?:access|auth|refresh|session|token)/iu.test(name));
    return {
      status: value.meStatus === 401 && !value.hasStorageSession && !hasAuthCookie ? "PASS" : "FAIL",
      meStatus: value.meStatus,
      hasStorageSession: value.hasStorageSession,
      cookieCount: cookieNames.length,
      hasAuthCookie
    };
  } finally {
    await browser.send("Target.closeTarget", { targetId: target.targetId }).catch(() => undefined);
  }
}

async function loginThroughUi(browser, browserContextId, { username, password }) {
  const target = await browser.send("Target.createTarget", { url: `${webBase}/login`, browserContextId });
  const attached = await browser.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  const sessionId = attached.sessionId;
  const network = [];
  const requests = new Map();
  let loginPostObserved = false;
  const off = browser.onEvent((message) => {
    if (message.sessionId !== sessionId) return;
    if (message.method === "Network.requestWillBeSent") {
      const request = message.params?.request;
      if (request?.url && /^https?:/u.test(request.url)) {
        const requestPath = new URL(request.url).pathname;
        requests.set(message.params.requestId, {
          method: request.method,
          url: redactUrl(request.url),
          path: requestPath
        });
        if (request.method === "POST" && requestPath === `${apiPathPrefix}/auth/login`) loginPostObserved = true;
      }
    }
    if (message.method === "Network.responseReceived") {
      const request = requests.get(message.params?.requestId);
      if (request) network.push({ ...request, status: message.params?.response?.status ?? null });
    }
    if (message.method === "Network.loadingFailed") {
      const request = requests.get(message.params?.requestId);
      if (request) network.push({ ...request, status: "transport_failed", error: message.params?.errorText ?? "unknown" });
    }
  });
  try {
    await browser.send("Page.enable", {}, sessionId);
    await browser.send("Runtime.enable", {}, sessionId);
    await browser.send("Network.enable", {}, sessionId);
    await waitForReady(browser, sessionId);
    await waitForExpression(browser, sessionId, `Boolean(document.querySelector('form.signin-form[data-browser-uat-ready="true"] input[autocomplete="username"]') && document.querySelector('form.signin-form[data-browser-uat-ready="true"] input[autocomplete="current-password"]') && !document.querySelector('form.signin-form[data-browser-uat-ready="true"] button[type="submit"]')?.disabled)`, 10000);
    const hydrated = await browser.send("Runtime.evaluate", {
      expression: `new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(Boolean(document.querySelector('form.signin-form[data-browser-uat-ready="true"] button[type="submit"]:not(:disabled)'))))))`,
      awaitPromise: true,
      returnByValue: true
    }, sessionId);
    if (!hydrated.result?.value) return { status: "FAIL", reason: "login_form_not_hydrated", method: "ui_form", network };
    const usernameTyped = await typeWithKeyboard(browser, sessionId, 'input[autocomplete="username"]', username);
    const passwordTyped = await typeWithKeyboard(browser, sessionId, 'input[autocomplete="current-password"]', password);
    if (!usernameTyped || !passwordTyped) return { status: "FAIL", reason: "login_keyboard_input_failed", method: "ui_form", network };
    const submitFocused = await browser.send("Runtime.evaluate", {
      expression: `(() => { const button = document.querySelector('form.signin-form[data-browser-uat-ready="true"] button[type="submit"]'); button?.focus(); return document.activeElement === button; })()`,
      returnByValue: true
    }, sessionId);
    if (!submitFocused.result?.value) return { status: "FAIL", reason: "login_submit_focus_failed", method: "ui_form", network };
    await browser.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", text: "\r", unmodifiedText: "\r", windowsVirtualKeyCode: 13 }, sessionId);
    await browser.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, sessionId);
    const loginPostDeadline = Date.now() + 5000;
    while (!loginPostObserved && Date.now() < loginPostDeadline) await sleep(100);
    if (!loginPostObserved) return { status: "FAIL", reason: "login_post_not_observed", method: "ui_form", network };
    await waitForExpression(browser, sessionId, `location.pathname !== "/login" && Boolean(localStorage.getItem("jinhu_access_token") || sessionStorage.getItem("jinhu_access_token"))`, 15000);
    const evidence = await browser.send("Runtime.evaluate", {
      expression: `({ pathname: location.pathname, hasSession: Boolean(localStorage.getItem("jinhu_access_token") || sessionStorage.getItem("jinhu_access_token")), formStillVisible: Boolean(document.querySelector(".signin-page")) })`,
      returnByValue: true
    }, sessionId);
    const value = evidence.result?.value ?? {};
    const loginResponse = network.find((entry) => entry.method === "POST" && entry.path === `${apiPathPrefix}/auth/login`);
    const loginSucceeded = Number(loginResponse?.status) >= 200 && Number(loginResponse?.status) < 300;
    return {
      status: value.hasSession && !value.formStillVisible && loginSucceeded ? "PASS" : "FAIL",
      reason: !loginSucceeded ? "login_post_not_successful" : value.hasSession ? "" : "no_authenticated_session",
      method: "ui_form",
      pathname: value.pathname,
      network
    };
  } finally {
    off();
    await browser.send("Target.closeTarget", { targetId: target.targetId }).catch(() => undefined);
  }
}

async function typeWithKeyboard(browser, sessionId, selector, value) {
  const focused = await browser.send("Runtime.evaluate", {
    expression: `(() => { const element = document.querySelector(${JSON.stringify(selector)}); element?.focus(); return document.activeElement === element; })()`,
    returnByValue: true
  }, sessionId);
  if (!focused.result?.value) return false;
  await browser.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Control", code: "ControlLeft", windowsVirtualKeyCode: 17, modifiers: 2 }, sessionId);
  await browser.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2 }, sessionId);
  await browser.send("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2 }, sessionId);
  await browser.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Control", code: "ControlLeft", windowsVirtualKeyCode: 17 }, sessionId);
  await browser.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 }, sessionId);
  await browser.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 }, sessionId);
  for (const character of value) {
    await browser.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: character }, sessionId);
    await browser.send("Input.dispatchKeyEvent", { type: "char", text: character, unmodifiedText: character }, sessionId);
    await browser.send("Input.dispatchKeyEvent", { type: "keyUp", key: character }, sessionId);
  }
  const typed = await browser.send("Runtime.evaluate", {
    expression: `document.querySelector(${JSON.stringify(selector)})?.value === ${JSON.stringify(value)}`,
    returnByValue: true
  }, sessionId);
  return typed.result?.value === true;
}

async function focusLabelledControl(browser, sessionId, labelText, selector) {
  const focused = await browser.send("Runtime.evaluate", {
    expression: `(() => {
      const label = Array.from(document.querySelectorAll("label")).find((item) => {
        const rect = item.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && (item.textContent ?? "").trim().startsWith(${JSON.stringify(labelText)});
      });
      const labelledControl = label?.control ?? (label?.htmlFor ? document.getElementById(label.htmlFor) : null);
      const control = labelledControl?.matches(${JSON.stringify(selector)}) ? labelledControl : label?.querySelector(${JSON.stringify(selector)});
      control?.focus();
      return document.activeElement === control;
    })()`,
    returnByValue: true
  }, sessionId);
  return focused.result?.value === true;
}

async function typeLabelledControl(browser, sessionId, labelText, value) {
  if (!await focusLabelledControl(browser, sessionId, labelText, "input, textarea")) return false;
  if (await typeWithKeyboard(browser, sessionId, ":focus", value)) return true;
  const dateValue = await browser.send("Runtime.evaluate", {
    expression: `(() => {
      const control = document.activeElement;
      if (!(control instanceof HTMLInputElement) || control.type !== "date") return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(control, ${JSON.stringify(value)});
      control.dispatchEvent(new Event("input", { bubbles: true }));
      control.dispatchEvent(new Event("change", { bubbles: true }));
      return control.value === ${JSON.stringify(value)};
    })()`,
    returnByValue: true
  }, sessionId);
  return dateValue.result?.value === true;
}

async function selectWithKeyboard(browser, sessionId, labelText, optionText, optionValue) {
  const target = await browser.send("Runtime.evaluate", {
    expression: `(() => {
      const label = Array.from(document.querySelectorAll("label")).find((item) => {
        const rect = item.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && (item.textContent ?? "").trim().startsWith(${JSON.stringify(labelText)});
      });
      const select = label?.querySelector("select");
      if (!select) return null;
      const options = Array.from(select.options);
      const index = options.findIndex((option) => ${optionText ? `option.textContent?.includes(${JSON.stringify(optionText)})` : `option.value === ${JSON.stringify(optionValue)}`});
      select.focus();
      return { focused: document.activeElement === select, index };
    })()`,
    returnByValue: true
  }, sessionId);
  const value = target.result?.value;
  if (!value?.focused || value.index < 0) return false;
  await pressKey(browser, sessionId, "Home", "Home", 36);
  for (let index = 0; index < value.index; index += 1) await pressKey(browser, sessionId, "ArrowDown", "ArrowDown", 40);
  await pressKey(browser, sessionId, "Enter", "Enter", 13);
  await sleep(150);
  const selected = await browser.send("Runtime.evaluate", {
    expression: `document.activeElement?.selectedIndex === ${value.index}`,
    returnByValue: true
  }, sessionId);
  return selected.result?.value === true;
}

async function activateByText(browser, sessionId, selector, text) {
  const target = await browser.send("Runtime.evaluate", {
    expression: `(() => {
      const element = Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find((item) => {
        const rect = item.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && (item.textContent ?? "").includes(${JSON.stringify(text)});
      });
      if (element?.tagName === "SUMMARY") {
        element.scrollIntoView({ block: "center", inline: "center" });
        element.click();
        if (element.parentElement?.tagName === "DETAILS" && !element.parentElement.open) element.parentElement.open = true;
        return { activated: true };
      }
      element?.scrollIntoView({ block: "center", inline: "center" });
      element?.focus();
      const rect = element?.getBoundingClientRect();
      return rect && rect.width > 0 && rect.height > 0
        ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
        : null;
    })()`,
    returnByValue: true
  }, sessionId);
  const point = target.result?.value;
  if (!point) return false;
  if (point.activated) return true;
  await browser.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 }, sessionId);
  await browser.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 }, sessionId);
  return true;
}

async function chooseRemotePicker(browser, sessionId, labelText, query, optionText) {
  if (!await focusLabelledControl(browser, sessionId, labelText, "input[role='combobox']")) return false;
  if (!await typeWithKeyboard(browser, sessionId, ":focus", query)) return false;
  const optionReady = `Array.from(document.querySelectorAll('[role="option"]:not([disabled])')).some((option) => (option.textContent ?? "").includes(${JSON.stringify(optionText)}))`;
  if (!await waitForExpression(browser, sessionId, optionReady, 10000)) return false;
  return activateByText(browser, sessionId, "[role='option']:not([disabled])", optionText);
}

async function pressKey(browser, sessionId, key, code, windowsVirtualKeyCode) {
  await browser.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code, windowsVirtualKeyCode }, sessionId);
  await browser.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode }, sessionId);
}

async function browserSessionRequest(browser, browserContextId, path) {
  const target = await browser.send("Target.createTarget", { url: `${webBase}/dashboard`, browserContextId });
  const attached = await browser.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  try {
    await browser.send("Page.enable", {}, attached.sessionId);
    await browser.send("Runtime.enable", {}, attached.sessionId);
    await waitForReady(browser, attached.sessionId);
    await waitForExpression(
      browser,
      attached.sessionId,
      `location.origin === ${JSON.stringify(new URL(webBase).origin)}`,
      10000
    );
    const response = await browser.send("Runtime.evaluate", {
      expression: `(() => {
        const token = localStorage.getItem("jinhu_access_token") || sessionStorage.getItem("jinhu_access_token");
        return fetch(${JSON.stringify(path)}, {
          credentials: "same-origin",
          headers: token ? { authorization: "Bearer " + token } : {}
        }).then(async response => ({ status: response.status, body: await response.json() }));
      })()`,
      returnByValue: true,
      awaitPromise: true
    }, attached.sessionId);
    return response.result?.value?.status === 200 ? response.result.value.body : null;
  } finally {
    await browser.send("Target.closeTarget", { targetId: target.targetId }).catch(() => undefined);
  }
}

async function collectRenderedMenuPaths(browser, { browserContextId, viewport }) {
  const target = await browser.send("Target.createTarget", { url: `${webBase}/dashboard`, browserContextId });
  const attached = await browser.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  const sessionId = attached.sessionId;
  const runtimeErrors = [];
  const pageWarnings = [];

  const off = browser.onEvent((message) => {
    if (message.sessionId !== sessionId) return;
    if (message.method === "Runtime.exceptionThrown") {
      runtimeErrors.push(redactDiagnostic(message.params?.exceptionDetails?.text ?? "runtime exception"));
    }
    if (message.method === "Runtime.consoleAPICalled" && message.params?.type === "error") {
      const text = (message.params.args ?? [])
        .map((arg) => String(arg.value ?? arg.description ?? ""))
        .filter(Boolean)
        .join(" ");
      if (text) pageWarnings.push(`console.error: ${redactDiagnostic(text)}`);
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
          hasForbidden: location.pathname === "/403" || /403|无权访问|权限不足|无法查看此详情|没有查看该内容的权限|不在当前范围内/.test(text),
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

async function visitPage(browser, { path, username, browserContextId, viewport, assertions }) {
  const target = await browser.send("Target.createTarget", { url: `${webBase}${path}`, browserContextId });
  const attached = await browser.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  const sessionId = attached.sessionId;
  const runtimeErrors = [];
  const pageWarnings = [];
  const network = [];
  const pendingRequests = new Map();
  const successfulRequestStarts = new Map();
  const failedRequestIdentities = new WeakMap();
  const responseOverrideChecks = [];
  const pendingResponseOverrides = new Set();
  const responseOverrides = assertions?.flatMap((entry) => (entry.response_overrides ?? []).map((override) => ({
    caseId: entry.id,
    ...override
  }))) ?? [];
  let networkSequence = 0;
  const allowForbidden = expectForbidden || assertions?.some((entry) => entry.expect_forbidden === true);

  const off = browser.onEvent((message) => {
    if (message.sessionId !== sessionId) return;
    if (message.method === "Runtime.exceptionThrown") {
      runtimeErrors.push(redactDiagnostic(message.params?.exceptionDetails?.text ?? "runtime exception"));
    }
    if (message.method === "Runtime.consoleAPICalled" && message.params?.type === "error") {
      const text = (message.params.args ?? [])
        .map((arg) => String(arg.value ?? arg.description ?? ""))
        .filter(Boolean)
        .join(" ");
      if (text) pageWarnings.push(`console.error: ${redactDiagnostic(text)}`);
    }
    if (message.method === "Network.responseReceived") {
      const response = message.params?.response;
      if (response?.url && /^https?:/u.test(response.url)) {
        const request = pendingRequests.get(message.params?.requestId);
        if (response.status >= 200 && response.status < 400 && request) {
          successfulRequestStarts.set(request.identity, Math.max(
            successfulRequestStarts.get(request.identity) ?? 0,
            request.startSequence
          ));
        }
        network.push({
          resource_type: message.params?.type ?? "Other",
          method: request?.method ?? "GET",
          url: redactUrl(response.url),
          path: new URL(response.url).pathname,
          status: response.status,
          remote_ip: response.remoteIPAddress ?? null,
          rewrite_target: response.url.startsWith(trackedWebApiPrefix) ? redactedRewriteTarget : null
        });
      }
    }
    if (message.method === "Network.requestWillBeSent") {
      const request = message.params?.request;
      const url = request?.url;
      if (url && /^https?:/u.test(url)) {
        pendingRequests.set(message.params.requestId, {
          identity: `${request.method ?? "GET"} ${url}`,
          method: request.method ?? "GET",
          url,
          startSequence: ++networkSequence
        });
      }
    }
    if (message.method === "Network.loadingFinished") pendingRequests.delete(message.params?.requestId);
    if (message.method === "Network.loadingFailed") {
      const request = pendingRequests.get(message.params?.requestId);
      if (request) {
        const failure = {
          resource_type: message.params?.type ?? "Other",
          path: new URL(request.url).pathname,
          status: "transport_failed",
          error: message.params?.errorText ?? "unknown"
        };
        network.push(failure);
        failedRequestIdentities.set(failure, request);
      }
      pendingRequests.delete(message.params?.requestId);
    }
    if (message.method === "Fetch.requestPaused") {
      const operation = applyResponseOverride(browser, sessionId, message.params, responseOverrides)
        .then((check) => responseOverrideChecks.push(check))
        .catch(async (error) => {
          responseOverrideChecks.push({
            id: "runner", kind: "response_override", expected: "response override", pass: false,
            reason: redactDiagnostic(error instanceof Error ? error.message : String(error))
          });
          await browser.send("Fetch.continueResponse", { requestId: message.params.requestId }, sessionId).catch(() => undefined);
        })
        .finally(() => pendingResponseOverrides.delete(operation));
      pendingResponseOverrides.add(operation);
    }
  });

  try {
    await browser.send("Page.enable", {}, sessionId);
    await browser.send("Runtime.enable", {}, sessionId);
    await browser.send("Network.enable", {}, sessionId);
    if (responseOverrides.length > 0) {
      await browser.send("Fetch.enable", {
        patterns: responseOverrides.map((override) => ({ urlPattern: `*${override.path}*`, requestStage: "Response" }))
      }, sessionId);
    }
    await browser.send("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      mobile: viewport.mobile,
      deviceScaleFactor: viewport.deviceScaleFactor
    }, sessionId);
    await waitForReady(browser, sessionId);

    const loadPromise = waitForEvent(browser, sessionId, "Page.loadEventFired", 12000);
    await browser.send("Page.navigate", { url: `${webBase}${path}` }, sessionId);
    await loadPromise;
    await waitForReady(browser, sessionId);
    if (allowForbidden) await sleep(2000);
    const settleDeadline = Date.now() + 5000;
    let settledAt = null;
    while (Date.now() < settleDeadline) {
      if (pendingRequests.size === 0) {
        settledAt ??= Date.now();
        if (Date.now() - settledAt >= 300) break;
      } else {
        settledAt = null;
      }
      await sleep(100);
    }
    if (pendingResponseOverrides.size > 0) await Promise.allSettled(pendingResponseOverrides);
    const pendingApiRequest = Array.from(pendingRequests.values()).find((request) =>
      new URL(request.url).pathname.startsWith(`${apiPathPrefix}/`)
      && !successfulRequestStarts.has(request.identity)
    );
    if (pendingApiRequest) {
      network.push({
        resource_type: "Pending",
        path: new URL(pendingApiRequest.url).pathname,
        status: "settle_timeout"
      });
    }
    const actionEvidence = await executeCaseActions(browser, sessionId, assertions, network);
    const evaluation = await browser.send("Runtime.evaluate", {
      expression: `(() => {
        const text = document.body?.innerText ?? "";
        return {
          href: location.origin + location.pathname,
          pathname: location.pathname,
          title: document.title,
          textLength: text.trim().length,
          hasLogin: Boolean(document.querySelector(".signin-page")) || location.pathname === "/login",
          hasForbidden: location.pathname === "/403" || /403|无权访问|权限不足|无法查看此详情|没有查看该内容的权限|不在当前范围内/.test(text),
          hasNextError: /Application error|Unhandled Runtime Error|ChunkLoadError|Hydration failed/i.test(text),
          headline: (document.querySelector("h1, h2, main")?.textContent ?? "").trim().slice(0, 120),
          viewportWidth: window.innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          deviceCapabilities: {
            userAgent: navigator.userAgent,
            maxTouchPoints: navigator.maxTouchPoints,
            coarsePointer: matchMedia("(pointer: coarse)").matches,
            finePointer: matchMedia("(pointer: fine)").matches,
            hover: matchMedia("(hover: hover)").matches,
            devicePixelRatio: window.devicePixelRatio
          }
        };
      })()`,
      returnByValue: true,
      awaitPromise: true
    }, sessionId);

    const value = evaluation.result?.value ?? {};
    const assertionEvidence = await evaluateCaseAssertions(browser, sessionId, assertions);
    if (evidenceDir) {
      const safeUsername = String(username).replaceAll(/[^A-Za-z0-9_.-]/g, "_");
      const pathname = new URL(path, "http://browser-uat.local").pathname;
      const safePath = pathname.replace(/^\/+/, "").replaceAll(/[^A-Za-z0-9_.-]/g, "-") || "root";
      const routeDigest = sha256(path).slice(0, 16);
      const filename = `${safeUsername}-${String(viewport.width)}-${safePath}-${routeDigest}.png`;
      const screenshot = await browser.send("Page.captureScreenshot", { format: "png", fromSurface: true }, sessionId);
      const screenshotBuffer = Buffer.from(screenshot.data, "base64");
      const screenshotFile = resolve(evidenceDir, filename);
      writeFileSync(screenshotFile, screenshotBuffer, { mode: 0o600 });
      chmodSync(screenshotFile, 0o600);
      screenshotManifest.push({ path: redactRoutePath(path), viewport, filename, bytes: screenshotBuffer.byteLength, sha256: sha256(screenshotBuffer), captured_at: new Date().toISOString() });
    }
    const renderFailure = getRenderFailure(value, runtimeErrors, { allowForbidden });
    const expectedResponses = assertions?.flatMap((entry) => entry.actions ?? [])
      .filter((action) => action.type === "wait_response" && action.status)
      .map((action) => ({ path: action.path, method: action.method, status: Number(action.status) })) ?? [];
    const failedNetwork = network.find((entry) =>
      (entry.path.startsWith(`${apiPathPrefix}/`) || entry.resource_type === "Document")
      && (entry.status === "transport_failed" || entry.status === "settle_timeout" || Number(entry.status) >= 400)
      && !(allowForbidden && Number(entry.status) === 403)
      && !expectedResponses.some((expected) => expected.path === entry.path
        && (!expected.method || expected.method === entry.method)
        && expected.status === Number(entry.status))
      && !(entry.status === "transport_failed" && entry.error === "net::ERR_ABORTED"
        && successfulRequestStarts.get(failedRequestIdentities.get(entry)?.identity)
          > failedRequestIdentities.get(entry)?.startSequence)
    );
    const hardFailure = renderFailure
      || (allowForbidden && !value.hasForbidden ? "expected_forbidden_not_rendered" : "")
      || (viewport.mobile && Math.abs(Number(value.viewportWidth) - viewport.width) > 1
        ? `mobile_viewport_mismatch:${value.viewportWidth}!=${viewport.width}`
        : "")
      || (viewport.mobile && value.horizontalOverflow ? `horizontal_overflow:${value.documentWidth}>${value.viewportWidth}` : "")
      || actionEvidence.failure
      || (responseOverrides.length > 0 && responseOverrideChecks.some((check) => !check.pass) ? "response_override_failed" : "")
      || assertionEvidence.failure
      || (failedNetwork ? `api_response_failed:${failedNetwork.status}:${failedNetwork.path}` : "");
    return {
      status: hardFailure ? "FAIL" : "PASS",
      reason: hardFailure,
      warnings: pageWarnings,
      page: value,
      actions: actionEvidence,
      response_overrides: {
        status: responseOverrides.length === 0 ? "NOT_CONFIGURED" : responseOverrideChecks.every((check) => check.pass) ? "PASS" : "FAIL",
        checks: responseOverrideChecks
      },
      assertions: assertionEvidence,
      network
    };
  } finally {
    off();
    await browser.send("Target.closeTarget", { targetId: target.targetId }).catch(() => undefined);
  }
}

async function executeCaseActions(browser, sessionId, assertions, network) {
  const actions = assertions?.flatMap((entry) => (entry.actions ?? []).map((action) => ({ caseId: entry.id, ...action }))) ?? [];
  if (!actions.length) return { status: "NOT_CONFIGURED", failure: "", checks: [] };
  const checks = [];
  for (const action of actions) {
    let pass = false;
    if (action.type === "input") {
      pass = await typeLabelledControl(browser, sessionId, action.label, action.value);
    } else if (action.type === "select") {
      pass = await selectWithKeyboard(browser, sessionId, action.label, action.option_text, action.value);
    } else if (action.type === "picker") {
      pass = await chooseRemotePicker(browser, sessionId, action.label, action.query, action.option_text);
    } else if (action.type === "activate") {
      pass = await activateByText(browser, sessionId, action.selector, action.text);
    } else if (action.type === "wait_text") {
      pass = await waitForExpression(browser, sessionId, `(document.body?.innerText ?? "").includes(${JSON.stringify(action.text)})`, action.timeout_ms ?? 10000);
    } else if (action.type === "wait_response") {
      const deadline = Date.now() + (action.timeout_ms ?? 10000);
      while (Date.now() < deadline && !pass) {
        pass = network.some((entry) => entry.path === action.path
          && (!action.method || entry.method === action.method)
          && (!action.status || Number(entry.status) === Number(action.status)));
        if (!pass) await sleep(100);
      }
    } else if (action.type === "reload") {
      const loaded = waitForEvent(browser, sessionId, "Page.loadEventFired", action.timeout_ms ?? 12000);
      await browser.send("Page.reload", {}, sessionId);
      await loaded;
      await waitForReady(browser, sessionId);
      pass = true;
    }
    checks.push({
      id: action.caseId,
      kind: `action_${action.type}`,
      expected: action.label ?? action.text ?? action.path ?? "reload",
      pass
    });
    if (!pass) return { status: "FAIL", failure: `case_action_failed:${action.type}`, checks };
  }
  return { status: "PASS", failure: "", checks };
}

async function evaluateCaseAssertions(browser, sessionId, assertions) {
  if (!assertions?.length) return { status: "NOT_CONFIGURED", failure: "", checks: [] };
  const configs = assertions.map((entry) => ({
    id: entry.id,
    selectors: entry.selectors ?? [],
    text: entry.text ?? [],
    absent_text: entry.absent_text ?? [],
    picker_selectors: entry.picker_selectors ?? [],
    unknown_fallback_text: entry.unknown_fallback_text ?? []
    ,detail_selectors: entry.detail_selectors ?? []
    ,detail_text: entry.detail_text ?? []
  }));
  const evaluated = await browser.send("Runtime.evaluate", {
    expression: `(() => {
      const configs = ${JSON.stringify(configs)};
      const bodyText = document.body?.innerText ?? "";
      const checks = [];
      for (const config of configs) {
        for (const selector of config.selectors) checks.push({ id: config.id, kind: "selector", expected: selector, pass: Boolean(document.querySelector(selector)) });
        for (const expected of config.text) checks.push({ id: config.id, kind: "text", expected, pass: bodyText.includes(expected) });
        for (const forbidden of config.absent_text) checks.push({ id: config.id, kind: "absent_text", expected: forbidden, pass: !bodyText.includes(forbidden) });
        for (const selector of config.picker_selectors) {
          const picker = document.querySelector(selector);
          const echoed = picker && String(picker.value ?? picker.textContent ?? picker.getAttribute("aria-label") ?? "").trim();
          checks.push({ id: config.id, kind: "picker_echo", expected: selector, pass: Boolean(echoed) });
        }
        for (const expected of config.unknown_fallback_text) checks.push({ id: config.id, kind: "unknown_fallback", expected, pass: bodyText.includes(expected) });
        for (const selector of config.detail_selectors) checks.push({ id: config.id, kind: "detail_selector", expected: selector, pass: Boolean(document.querySelector(selector)) });
        for (const expected of config.detail_text) checks.push({ id: config.id, kind: "detail_text", expected, pass: bodyText.includes(expected) });
      }
      return checks;
    })()`,
    returnByValue: true
  }, sessionId);
  const checks = evaluated.result?.value ?? [];
  const failed = checks.find((check) => !check.pass);
  return { status: failed ? "FAIL" : "PASS", failure: failed ? `case_assertion_failed:${failed.kind}` : "", checks };
}

function redactUrl(value, base) {
  const url = new URL(value, base);
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function redactDiagnostic(value) {
  return String(value)
    .replace(/Bearer\s+[^\s"']+/giu, "Bearer [REDACTED]")
    .replace(/(authorization|cookie|set-cookie|token|password)\s*[:=]\s*[^\s,;]+/giu, "$1=[REDACTED]")
    .replace(/https?:\/\/[^\s"'<>]+/giu, (url) => redactUrl(url));
}

function getRenderFailure(value, runtimeErrors, options = {}) {
  if (runtimeErrors.length > 0) return `runtime exception: ${runtimeErrors.slice(0, 2).join(" | ")}`;
  if (value.hasLogin) return "redirected_to_login";
  if (value.hasForbidden && !options.allowForbidden) return "forbidden_or_permission_error";
  if (value.hasNextError) return "next_runtime_error";
  if (!(options.allowForbidden && value.hasForbidden) && Number(value.textLength ?? 0) < 30) return "blank_or_too_little_content";
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
    if (result.result?.value === true) return true;
    await sleep(250);
  }
  return false;
}

async function applyResponseOverride(browser, sessionId, paused, overrides) {
  const pathname = new URL(paused.request.url).pathname;
  const override = overrides.find((candidate) => candidate.path === pathname);
  if (!override || !paused.responseStatusCode) {
    await browser.send("Fetch.continueResponse", { requestId: paused.requestId }, sessionId);
    return { id: override?.caseId ?? "runner", kind: "response_override", expected: pathname, pass: true, skipped: true };
  }
  const response = await browser.send("Fetch.getResponseBody", { requestId: paused.requestId }, sessionId);
  let body = response.base64Encoded ? Buffer.from(response.body, "base64").toString("utf8") : response.body;
  let replacements = 0;
  for (const [from, to] of Object.entries(override.replacements)) {
    const occurrences = body.split(from).length - 1;
    if (occurrences > 0) {
      body = body.split(from).join(to);
      replacements += occurrences;
    }
  }
  await browser.send("Fetch.fulfillRequest", {
    requestId: paused.requestId,
    responseCode: paused.responseStatusCode,
    responsePhrase: paused.responseStatusText,
    responseHeaders: (paused.responseHeaders ?? []).filter((header) =>
      !["content-length", "content-encoding", "transfer-encoding"].includes(header.name.toLowerCase())
    ),
    body: Buffer.from(body).toString("base64")
  }, sessionId);
  return { id: override.caseId, kind: "response_override", expected: override.path, pass: replacements > 0, replacements };
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
  const [rawPathname] = href.split("?");
  if (rawPathname.split("/").includes("..")) return null;
  const parsed = new URL(href, "http://browser-uat.local");
  if (!parsed.pathname || parsed.pathname.includes(":") || parsed.pathname.split("/").includes("..")) return null;
  return `${parsed.pathname}${parsed.search}`;
}

function redactRoutePath(path) {
  const parsed = new URL(path, "http://browser-uat.local");
  return parsed.search ? `${parsed.pathname}?query_sha256=${sha256(parsed.search).slice(0, 16)}` : parsed.pathname;
}

function isMobileTerminalPath(path) {
  const pathname = new URL(path, "http://browser-uat.local").pathname;
  return mobilePathPrefixes.some((prefix) => pathname.startsWith(prefix))
    || pathname === "/operations/terminal"
    || pathname === "/engineering/terminal"
    || pathname === "/preview/operations-terminal";
}

function resolveViewports(path, pageCases) {
  const desktop = { width: 1440, height: 960, mobile: false, deviceScaleFactor: 1 };
  const phone = { width: 390, height: 844, mobile: true, deviceScaleFactor: 3 };
  if (viewportMatrix || pageCases.some((entry) => entry.viewport === "both")) return [desktop, phone];
  if (pageCases.some((entry) => entry.viewport === "mobile") || isMobileTerminalPath(path)) return [phone];
  return [desktop];
}

function readRouteCases(file) {
  const parsed = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(parsed?.cases) || parsed.cases.length === 0) throw new Error("browser UAT case file must contain a non-empty cases array");
  const cases = parsed.cases.map((entry, index) => {
    const normalizedPath = normalizeMenuHref(entry?.path);
    if (!entry?.id || !normalizedPath || normalizedPath.includes("[") || normalizedPath.includes("]") || normalizedPath.split("/").includes("..")) throw new Error(`invalid browser UAT case at index ${index}`);
    for (const field of ["selectors", "text", "absent_text", "picker_selectors", "unknown_fallback_text", "detail_selectors", "detail_text"]) {
      if (entry[field] !== undefined && (!Array.isArray(entry[field]) || entry[field].some((value) => typeof value !== "string"))) {
        throw new Error(`browser UAT case ${entry.id} has invalid ${field}`);
      }
    }
    if (entry.response_overrides !== undefined && (!Array.isArray(entry.response_overrides) || entry.response_overrides.some((override) =>
      !override || typeof override !== "object" || typeof override.path !== "string" || !override.path.startsWith(`${apiPathPrefix}/`)
      || !override.replacements || typeof override.replacements !== "object" || Array.isArray(override.replacements)
      || Object.entries(override.replacements).length === 0
      || Object.entries(override.replacements).some(([from, to]) => !from || typeof to !== "string")
    ))) throw new Error(`browser UAT case ${entry.id} has invalid response_overrides`);
    if (entry.actions !== undefined && (!Array.isArray(entry.actions) || entry.actions.some((action) => {
      if (!action || typeof action !== "object" || !["input", "select", "picker", "activate", "wait_text", "wait_response", "reload"].includes(action.type)) return true;
      if (action.timeout_ms !== undefined && (!Number.isInteger(action.timeout_ms) || action.timeout_ms < 1 || action.timeout_ms > 60000)) return true;
      if (["input", "select", "picker"].includes(action.type) && typeof action.label !== "string") return true;
      if (action.type === "input" && typeof action.value !== "string") return true;
      if (action.type === "select" && typeof action.option_text !== "string" && typeof action.value !== "string") return true;
      if (action.type === "picker" && (typeof action.query !== "string" || typeof action.option_text !== "string")) return true;
      if (action.type === "activate" && (typeof action.selector !== "string" || typeof action.text !== "string")) return true;
      if (action.type === "wait_text" && typeof action.text !== "string") return true;
      if (action.type === "wait_response" && (typeof action.path !== "string" || !action.path.startsWith("/") || (action.method !== undefined && !/^[A-Z]+$/.test(action.method)) || (action.status !== undefined && (!Number.isInteger(action.status) || action.status < 100 || action.status > 599)))) return true;
      return false;
    }))) throw new Error(`browser UAT case ${entry.id} has invalid actions`);
    const assertionCount = ["selectors", "text", "absent_text", "picker_selectors", "unknown_fallback_text", "detail_selectors", "detail_text"]
      .reduce((total, field) => total + (entry[field]?.length ?? 0), 0);
    if (entry.expect_forbidden !== true && assertionCount === 0) throw new Error(`browser UAT case ${entry.id} has no assertions`);
    return { ...entry, path: normalizedPath };
  });
  const ids = cases.map((entry) => entry.id);
  if (new Set(ids).size !== ids.length) throw new Error("browser UAT case ids must be unique");
  return cases;
}

function writeLocalReport(file, report) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  chmodSync(file, 0o600);
}

function writeEvidence(report) {
  writeLocalReport(reportFile, report);
  if (!evidenceDir) return;
  const evidenceReport = resolve(evidenceDir, "browser-uat-report.json");
  writeLocalReport(evidenceReport, report);
  const files = screenshotManifest.map(({ filename, bytes, sha256: digest }) => ({ filename, bytes, sha256: digest }));
  const reportBuffer = readFileSync(evidenceReport);
  files.push({ filename: "browser-uat-report.json", bytes: reportBuffer.byteLength, sha256: sha256(reportBuffer) });
  writeLocalReport(resolve(evidenceDir, "evidence-manifest.json"), {
    schema_version: 1,
    run_id: runId,
    generated_at: new Date().toISOString(),
    files
  });
}

function resolveHcdEvidenceGrade(pagesChecked) {
  if (!caseFile) return "UNVERIFIED";
  if (pagesChecked === 0) return "BLOCKED";
  if (failures.length > 0) return "BLOCKED";
  const evidence = results.flatMap((result) => result.page_evidence);
  const configuredCases = new Set(routeCases.map((entry) => entry.id));
  const evidencedCases = new Set(evidence.flatMap((entry) => entry.case_ids ?? []));
  const allAssertionsPassed = evidence.every((entry) => entry.assertions?.status === "PASS");
  const isolationPassed = results.every((result) => result.session_isolation === "PASS");
  const dualViewportPassed = new Set(routeCases.map((entry) => entry.path)).size > 0
    && Array.from(new Set(routeCases.map((entry) => entry.path))).every((path) => {
      const widths = new Set(evidence.filter((entry) => entry.path === redactRoutePath(path)).map((entry) => entry.viewport?.width));
      return widths.has(1440) && widths.has(390);
    });
  if (configuredCases.size === evidencedCases.size && allAssertionsPassed && isolationPassed && dualViewportPassed) return "PASS";
  return "SURFACE_ONLY";
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
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
