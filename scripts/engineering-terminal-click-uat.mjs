#!/usr/bin/env node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const defaultCredentialsFile = resolve(repoRoot, "database/import-reports/go-live-all-users.local.csv");
const defaultReportFile = resolve(repoRoot, "database/import-reports/engineering-terminal-click-uat-report.local.json");

const tenantId = "10000001";
const parkId = "20000001";
const apiBase = readArg("--api-base") ?? "http://127.0.0.1:4330/api/v1";
const webBase = readArg("--web-base") ?? "http://127.0.0.1:4320";
const credentialsFile = resolve(repoRoot, readArg("--credentials") ?? defaultCredentialsFile);
const reportFile = resolve(repoRoot, readArg("--report-file") ?? defaultReportFile);
const screenshotsDir = resolve(readArg("--screenshots-dir") ?? `${tmpdir()}/jinhu-engineering-terminal-click-uat`);
const chromePath = readArg("--chrome-path") ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const usernameFilter = new Set(parseListArg("--usernames"));

const requiredUsers = [
  "admin",
  "chen_guohui",
  "li_rongjie",
  "liu_hantao",
  "shao_minghong",
  "song_qianchang",
  "zheng_ziyong"
].filter((username) => usernameFilter.size === 0 || usernameFilter.has(username));

const failures = [];
const warnings = [];
const results = [];

async function main() {
  if (!existsSync(credentialsFile)) {
    fail(`missing credentials file: ${credentialsFile}`);
  }
  if (!existsSync(chromePath)) {
    fail(`missing Chrome executable: ${chromePath}`);
  }

  mkdirSync(dirname(reportFile), { recursive: true });
  mkdirSync(screenshotsDir, { recursive: true });

  if (failures.length === 0) {
    const credentials = readCredentials(credentialsFile);
    const chrome = await launchChrome();
    try {
      for (const username of requiredUsers) {
        const password = credentials.get(username);
        if (!password) {
          fail(`missing password for ${username}`);
          continue;
        }
        console.log(`[engineering-terminal-click-uat] checking ${username}`);
        const result = await checkUser(chrome, username, password);
        results.push(result);
      }
    } finally {
      await chrome.close();
    }
  }

  const report = {
    checked_at: new Date().toISOString(),
    status: failures.length === 0 ? "PASS" : "FAIL",
    scope: "engineering_terminal_primary_action_click_through",
    api_base: apiBase,
    web_base: webBase,
    credentials_file: credentialsFile,
    report_file: reportFile,
    screenshots_dir: screenshotsDir,
    users_checked: results.length,
    actions_checked: results.reduce((sum, result) => sum + result.actions_checked, 0),
    results,
    warnings,
    failures
  };

  writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  console.log(JSON.stringify(report, null, 2));
  if (failures.length > 0) process.exitCode = 1;
}

async function checkUser(chrome, username, password) {
  const result = {
    username,
    login: "FAIL",
    access: "FAIL",
    role_badge: "",
    headline: "",
    screenshot: "",
    actions_checked: 0,
    actions: [],
    warnings: []
  };

  const login = await requestJson(`${apiBase}/auth/login`, {
    method: "POST",
    body: { tenantId, parkId, username, password }
  });
  if (login.status !== 200 || !login.body?.data?.accessToken) {
    fail(`${username}: login failed (${login.status})`);
    return result;
  }
  result.login = "PASS";

  const token = login.body.data.accessToken;
  const me = await requestJson(`${apiBase}/users/me`, { token });
  if (me.status !== 200 || !me.body?.data) {
    fail(`${username}: users/me failed (${me.status})`);
    return result;
  }

  let terminal = await chrome.openAuthedTerminal({ token, userContext: me.body.data, username });
  if (terminal.failure === "redirected_to_login" || terminal.failure === "blank_or_too_little_content") {
    await sleep(800);
    terminal = await chrome.openAuthedTerminal({ token, userContext: me.body.data, username });
  }
  result.access = terminal.failure ? "FAIL" : "PASS";
  result.role_badge = terminal.page.roleBadge;
  result.headline = terminal.page.headline;
  result.screenshot = terminal.screenshotPath;

  if (terminal.failure) {
    fail(`${username}: terminal failed: ${terminal.failure}`);
    return result;
  }
  if (terminal.page.actions.length === 0) {
    fail(`${username}: no primary actions rendered`);
    return result;
  }

  for (const action of terminal.page.actions) {
    const actionResult = await chrome.clickTerminalAction({
      token,
      userContext: me.body.data,
      username,
      action
    });
    result.actions_checked += 1;
    result.actions.push(actionResult);
    if (actionResult.status !== "PASS") {
      fail(`${username}: action ${action.label} failed: ${actionResult.reason}`);
    }
    if (actionResult.warning) {
      result.warnings.push(`${action.label}: ${actionResult.warning}`);
      warnings.push(`${username} ${action.label}: ${actionResult.warning}`);
    }
  }

  console.log(`[engineering-terminal-click-uat] ${username} done: ${result.actions_checked} actions`);
  return result;
}

async function launchChrome() {
  const port = 47000 + Math.floor(Math.random() * 1000);
  const userDataDir = mkdtempSync(resolve(tmpdir(), "jinhu-terminal-click-uat-"));
  const child = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    "about:blank"
  ], { stdio: "ignore" });

  const version = await waitForJson(`http://127.0.0.1:${port}/json/version`, 15000);
  const browser = new CdpClient(version.webSocketDebuggerUrl);
  await browser.open();

  return {
    async openAuthedTerminal(input) {
      return openAuthedTerminal(browser, input);
    },
    async clickTerminalAction(input) {
      return clickTerminalAction(browser, input);
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

async function openAuthedTerminal(browser, { token, userContext, username }) {
  const target = await browser.send("Target.createTarget", { url: `${webBase}/login` });
  const attached = await browser.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  const sessionId = attached.sessionId;
  const runtimeErrors = [];

  const off = browser.onEvent((message) => {
    if (message.sessionId !== sessionId) return;
    if (message.method === "Runtime.exceptionThrown") {
      runtimeErrors.push(message.params?.exceptionDetails?.text ?? "runtime exception");
    }
  });

  try {
    await preparePage(browser, sessionId);
    await seedSession(browser, sessionId, token, userContext);
    await navigate(browser, sessionId, `${webBase}/engineering/terminal`);
    await sleep(700);

    const page = await evaluateValue(browser, sessionId, `(() => {
      const text = document.body?.innerText ?? "";
      const actions = Array.from(document.querySelectorAll('[data-testid^="engineering-terminal-action-"]')).map((el) => ({
        testId: el.getAttribute("data-testid"),
        label: (el.textContent ?? "").trim(),
        tagName: el.tagName.toLowerCase(),
        href: el instanceof HTMLAnchorElement ? el.href : "",
        pathname: el instanceof HTMLAnchorElement ? new URL(el.href).pathname : ""
      }));
      return {
        href: location.href,
        pathname: location.pathname,
        roleBadge: (document.querySelector('[data-testid="engineering-terminal-role-badge"]')?.textContent ?? "").trim(),
        headline: (document.querySelector('[data-testid="engineering-terminal-headline"]')?.textContent ?? document.querySelector("h1")?.textContent ?? "").trim(),
        textLength: text.trim().length,
        hasLogin: location.pathname === "/login" || /请输入用户名|请输入密码/.test(text),
        hasForbidden: location.pathname === "/403" || /403|无权访问|权限不足/.test(text),
        hasNextError: /Application error|Unhandled Runtime Error|ChunkLoadError|Hydration failed/i.test(text),
        actions
      };
    })()`);

    const screenshotPath = resolve(screenshotsDir, `${username}.png`);
    await captureScreenshot(browser, sessionId, screenshotPath);

    return {
      failure: getRenderFailure(page, runtimeErrors),
      page,
      screenshotPath
    };
  } finally {
    off();
    await browser.send("Target.closeTarget", { targetId: target.targetId }).catch(() => undefined);
  }
}

async function clickTerminalAction(browser, { token, userContext, username, action }) {
  const target = await browser.send("Target.createTarget", { url: `${webBase}/login` });
  const attached = await browser.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  const sessionId = attached.sessionId;
  const runtimeErrors = [];

  const off = browser.onEvent((message) => {
    if (message.sessionId !== sessionId) return;
    if (message.method === "Runtime.exceptionThrown") {
      runtimeErrors.push(message.params?.exceptionDetails?.text ?? "runtime exception");
    }
  });

  try {
    await preparePage(browser, sessionId);
    await seedSession(browser, sessionId, token, userContext);
    await navigate(browser, sessionId, `${webBase}/engineering/terminal`);
    await sleep(500);

    const clickResult = await evaluateValue(browser, sessionId, `(() => {
      const element = document.querySelector(${JSON.stringify(`[data-testid="${action.testId}"]`)});
      if (!element) return { clicked: false, reason: "action_not_found" };
      element.click();
      return {
        clicked: true,
        tagName: element.tagName.toLowerCase(),
        label: (element.textContent ?? "").trim(),
        expectedPathname: element instanceof HTMLAnchorElement ? new URL(element.href).pathname : ""
      };
    })()`);

    if (!clickResult.clicked) {
      return { ...action, status: "FAIL", reason: clickResult.reason ?? "action_not_found" };
    }

    if (clickResult.tagName === "button") {
      await sleep(400);
      const drawer = await evaluateValue(browser, sessionId, `(() => {
        const drawer = document.querySelector('[data-testid="engineering-terminal-quick-daily-report-drawer"]');
        return {
          drawerVisible: Boolean(drawer),
          drawerTitle: (drawer?.textContent ?? "").trim().slice(0, 80)
        };
      })()`);
      return {
        ...action,
        status: drawer.drawerVisible ? "PASS" : "FAIL",
        result: "drawer",
        reason: drawer.drawerVisible ? "" : "quick_daily_report_drawer_not_opened",
        drawer_title: drawer.drawerTitle
      };
    }

    await waitForPathChange(browser, sessionId, "/engineering/terminal", 4000);
    await waitForReady(browser, sessionId);
    await sleep(500);

    const page = await evaluateValue(browser, sessionId, `(() => {
      const text = document.body?.innerText ?? "";
      return {
        href: location.href,
        pathname: location.pathname,
        textLength: text.trim().length,
        hasLogin: location.pathname === "/login" || /请输入用户名|请输入密码/.test(text),
        hasForbidden: location.pathname === "/403" || /403|无权访问|权限不足/.test(text),
        hasNextError: /Application error|Unhandled Runtime Error|ChunkLoadError|Hydration failed/i.test(text),
        headline: (document.querySelector("h1, h2, main")?.textContent ?? "").trim().slice(0, 120)
      };
    })()`);
    const renderFailure = getRenderFailure(page, runtimeErrors);
    const pathMismatch = action.pathname && page.pathname !== action.pathname ? `expected ${action.pathname}, got ${page.pathname}` : "";
    const reason = renderFailure || pathMismatch;
    return {
      ...action,
      status: reason ? "FAIL" : "PASS",
      result: "navigation",
      reached_pathname: page.pathname,
      reason,
      warning: page.textLength < 80 ? "destination content is short" : ""
    };
  } finally {
    off();
    await browser.send("Target.closeTarget", { targetId: target.targetId }).catch(() => undefined);
  }
}

async function preparePage(browser, sessionId) {
  await browser.send("Page.enable", {}, sessionId);
  await browser.send("Runtime.enable", {}, sessionId);
  await browser.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    mobile: true,
    deviceScaleFactor: 3
  }, sessionId);
  await waitForReady(browser, sessionId);
}

async function seedSession(browser, sessionId, token, userContext) {
  await browser.send("Runtime.evaluate", {
    expression: `
      localStorage.setItem("jinhu_access_token", ${JSON.stringify(token)});
      sessionStorage.setItem("jinhu_access_token", ${JSON.stringify(token)});
      localStorage.setItem("jinhu_auth_user", ${JSON.stringify(JSON.stringify(userContext))});
      sessionStorage.setItem("jinhu_auth_user", ${JSON.stringify(JSON.stringify(userContext))});
    `,
    awaitPromise: true
  }, sessionId);
}

async function navigate(browser, sessionId, url) {
  const loadPromise = waitForEvent(browser, sessionId, "Page.loadEventFired", 12000);
  await browser.send("Page.navigate", { url }, sessionId);
  await loadPromise;
  await waitForReady(browser, sessionId);
}

async function evaluateValue(browser, sessionId, expression) {
  const evaluation = await browser.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true
  }, sessionId);
  return evaluation.result?.value ?? {};
}

async function waitForPathChange(browser, sessionId, fromPath, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const result = await evaluateValue(browser, sessionId, `({ pathname: location.pathname })`);
    if (result.pathname !== fromPath) return result.pathname;
    await sleep(150);
  }
  return fromPath;
}

async function captureScreenshot(browser, sessionId, file) {
  const result = await browser.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false
  }, sessionId);
  writeFileSync(file, Buffer.from(result.data, "base64"));
}

function getRenderFailure(value, runtimeErrors) {
  if (runtimeErrors.length > 0) return `runtime exception: ${runtimeErrors.slice(0, 2).join(" | ")}`;
  if (value.hasLogin) return "redirected_to_login";
  if (value.hasForbidden) return "forbidden_or_permission_error";
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
      }, 15000);
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

function fail(message) {
  failures.push(message);
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

await main();
