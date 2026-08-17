#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { platform, tmpdir } from "node:os";
import { resolve } from "node:path";

const chromePath = process.env.CHROME_PATH
  ?? (process.platform === "win32" ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" : "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe");
const webBase = process.env.WEB_BASE ?? "http://127.0.0.1:3017";
const apiBase = process.env.API_BASE ?? "http://127.0.0.1:3101/api/v1";
const realApi = process.env.REAL_API === "1";
const port = 10000 + Math.floor(Math.random() * 20000);
const userDataDir = mkdtempSync(resolve(tmpdir(), "jinhu-leasing-cdp-"));
const createdLeadIds = [];
let authState = null;
const mockToken = "leasing-user-picker-browser-token";

const mockUser = {
  id: "uat-user-1",
  username: "uat.leasing.admin",
  real_name: "招商 UAT 管理员",
  display_name: "招商 UAT 管理员",
  tenant_id: "10000001",
  park_id: "20000001",
  permissions: ["*"],
  roles: [{ role_code: "SUPER_ADMIN", role_name: "超级管理员" }],
  is_super: true,
  enabled_modules: [{ module_code: "leasing", enabled: true }],
  menus: [
    { menu_name: "招商线索", route_path: "/leasing/leads", module_code: "leasing", permission_code: "leasing_lead:read" },
    { menu_name: "招商公海池", route_path: "/leasing/lead-pool", module_code: "leasing", permission_code: "leasing_lead_pool:read" },
    { menu_name: "招商漏斗", route_path: "/leasing/funnel", module_code: "leasing", permission_code: "leasing_statistics:funnel" }
  ],
  menu_tree: []
};

const mockUsers = [
  { id: "user-zhang", username: "zhangsan", displayName: "张三", realName: "张三", status: "enabled" },
  { id: "user-li", username: "lisi", displayName: "李四", realName: "李四", status: "enabled" }
];

const pages = [
  {
    path: "/leasing/leads",
    title: "招商线索",
    desktopText: ["招商线索", "新增线索", "跟进人"],
    mobileText: ["招商线索", "跟进人"],
    afterLoad: async (page) => {
      await page.clickText("新增线索");
      await page.waitForText("保存线索", 8000);
      await page.assertLabelSelect("跟进人", 1);
      await page.assertLabelSelectOptions("跟进人", 1);
      await page.selectFirstOption("跟进人");
      await page.assertAbsent(["跟进人 ID", "跟进人名称", "用户 ID"]);
      await page.clickText("取消");
      await page.waitUntil("!document.body.innerText.includes('保存线索')", 8000);

      await page.clickText("查看");
      await page.waitForText("基础信息", 8000);
      await page.clickText("看房记录");
      await page.waitForText("新增看房", 8000);
      await page.clickText("新增看房");
      await page.waitForText("接待人", 8000);
      await page.assertLabelSelect("接待人", 1);
      await page.assertLabelSelectOptions("接待人", 1);
      await page.selectFirstOption("接待人");
      await page.assertAbsent(["接待人 ID", "接待人名称", "用户 ID"]);
      await page.navigate(`${webBase}/leasing/leads`);
      await page.waitForText("招商线索", 8000);
    },
    checks: [
      { label: "跟进人", minSelects: 1 },
      { absent: ["跟进人 ID", "跟进人名称", "接待人 ID", "接待人名称", "用户 ID"] }
    ]
  },
  {
    path: "/leasing/lead-pool",
    title: "招商公海池",
    desktopText: ["招商公海池", "分配"],
    mobileText: ["招商公海池"],
    checks: [
      { absent: ["选择或输入用户 ID", "用户 ID"] }
    ],
    afterLoad: async (page) => {
      await page.clickText("分配");
      await page.waitForText("目标跟进人", 8000);
      await page.assertLabelSelectOptions("目标跟进人", 1);
      await page.selectFirstOption("目标跟进人");
    },
    afterChecks: [
      { label: "目标跟进人", minSelects: 1 }
    ]
  },
  {
    path: "/leasing/funnel",
    title: "招商漏斗",
    desktopText: ["招商漏斗", "跟进人"],
    mobileText: ["招商漏斗", "跟进人"],
    checks: [
      { label: "跟进人", minSelects: 1 },
      { labelOptions: "跟进人", minOptions: 1 },
      { absent: ["全部或输入用户 ID", "用户 ID"] }
    ]
  }
];

const results = [];
const cleanupFailures = [];

async function main() {
  const chrome = launchChrome();
  let browser;
  try {
    if (realApi) {
      authState = await prepareRealApiState();
    }
    const version = await waitForJson(`http://127.0.0.1:${port}/json/version`, 15000);
    browser = new CdpClient(version.webSocketDebuggerUrl);
    await browser.open();
    for (const target of pages) {
      results.push(await checkPage(browser, target, { width: 1440, height: 960, mobile: false, deviceScaleFactor: 1 }));
      results.push(await checkPage(browser, target, { width: 390, height: 844, mobile: true, deviceScaleFactor: 3 }));
    }
  } finally {
    await browser?.close().catch(() => undefined);
    if (!chrome.killed) chrome.kill("SIGTERM");
    if (realApi) {
      await cleanupRealApiState().catch((error) => console.warn(`[browser-check] real API cleanup failed: ${error.message}`));
    }
    try {
      rmSync(userDataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    } catch (error) {
      console.warn(`[browser-check] could not remove temporary Chrome profile ${userDataDir}: ${error.message}`);
    }
  }

  const failures = [...results, ...cleanupFailures].filter((item) => item.status !== "PASS");
  console.log(JSON.stringify({ status: failures.length === 0 ? "PASS" : "FAIL", mode: realApi ? "real-api" : "mock", webBase, apiBase, results, cleanupFailures }, null, 2));
  if (failures.length > 0) process.exitCode = 1;
}

function launchChrome() {
  console.log(`[browser-check] launching ${chromePath} on CDP port ${port} (${platform()})`);
  const child = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    "--remote-debugging-address=127.0.0.1",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    "about:blank"
  ], { stdio: ["ignore", "pipe", "pipe"] });
  child.stdout?.on("data", (chunk) => {
    const text = String(chunk);
    if (/DevTools|ERROR|Cannot start|bind\(\)/i.test(text)) process.stderr.write(`[chrome stdout] ${text}`);
  });
  child.stderr?.on("data", (chunk) => {
    const text = String(chunk);
    if (/DevTools|ERROR|Cannot start|bind\(\)/i.test(text)) process.stderr.write(`[chrome stderr] ${text}`);
  });
  child.on("error", (error) => process.stderr.write(`[chrome error] ${error.message}\n`));
  child.on("exit", (code, signal) => process.stderr.write(`[chrome exit] code=${code} signal=${signal}\n`));
  return child;
}

async function checkPage(browser, target, viewport) {
  const page = await browser.newPage("about:blank");
  try {
    await page.enable();
    await page.setViewport(viewport);
    await page.installMocks();
    if (!authState) {
      await page.seedStoredSession({ token: mockToken, user: mockUser });
    }
    await page.navigate(`${webBase}${target.path}`);
    await page.waitForText(target.title, 20000);
    await wait(800);
    if (target.afterLoad) {
      await target.afterLoad(page);
      await wait(400);
    }

    const textChecks = viewport.mobile ? target.mobileText : target.desktopText;
    for (const text of textChecks) {
      const hasText = await page.evaluate((needle) => document.body.innerText.includes(needle), text);
      if (!hasText) throw new Error(`missing text: ${text}`);
    }
    for (const check of [...(target.checks ?? []), ...(target.afterChecks ?? [])]) {
      if (check.label) {
        const count = await page.evaluate((label) => {
          const labels = Array.from(document.querySelectorAll("label"));
          return labels.filter((item) => {
            if (!item.textContent?.trim().includes(label)) return false;
            if (item.querySelector("select")) return true;
            const fieldId = item.getAttribute("for");
            return Boolean(fieldId && document.getElementById(fieldId)?.tagName.toLowerCase() === "select");
          }).length;
        }, check.label);
        if (count < check.minSelects) throw new Error(`label ${check.label} select count ${count} < ${check.minSelects}`);
      }
      if (check.labelOptions) {
        await page.assertLabelSelectOptions(check.labelOptions, check.minOptions);
      }
      if (check.absent) {
        const found = await page.evaluate((needles) => needles.filter((needle) => document.body.innerText.includes(needle)), check.absent);
        if (found.length > 0) throw new Error(`unexpected text: ${found.join(", ")}`);
      }
    }
    const route = await page.evaluate(() => location.pathname);
    if (route !== target.path) throw new Error(`route changed to ${route}`);
    const overflow = await page.evaluate(() => {
      const insideHorizontalScroller = (element) => {
        let parent = element.parentElement;
        while (parent && parent !== document.body && parent !== document.documentElement) {
          const style = window.getComputedStyle(parent);
          if (parent.scrollWidth > parent.clientWidth + 1 && ["auto", "scroll", "overlay"].includes(style.overflowX)) {
            return true;
          }
          parent = parent.parentElement;
        }
        return false;
      };
      const rootOverflow = Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const bodyOverflow = Math.max(0, document.body.scrollWidth - document.body.clientWidth);
      const offenders = Array.from(document.querySelectorAll("body *"))
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.right > window.innerWidth + 1 && !insideHorizontalScroller(element);
        })
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName.toLowerCase(),
            text: (element.textContent || "").trim().slice(0, 80),
            right: Math.ceil(rect.right),
            width: Math.ceil(rect.width)
          };
        })
        .slice(0, 8);
      return { rootOverflow, bodyOverflow, offenders };
    });
    if (overflow.rootOverflow > 1 || overflow.bodyOverflow > 1 || overflow.offenders.length > 0) {
      throw new Error(`horizontal overflow: ${JSON.stringify(overflow)}`);
    }
    return { path: target.path, viewport, status: "PASS", route, overflow };
  } catch (error) {
    const diagnostic = await page.evaluate(async () => {
      const token = localStorage.getItem("jinhu_access_token") || sessionStorage.getItem("jinhu_access_token") || "";
      const userRaw = localStorage.getItem("jinhu_auth_user") || sessionStorage.getItem("jinhu_auth_user") || "";
      try {
        const response = await fetch("/api/v1/reference-data/users?page=1&page_size=5&status=enabled", {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        const body = await response.json().catch(() => null);
        return {
          href: location.href,
          hasToken: Boolean(token),
          hasUser: Boolean(userRaw),
          pickerStatus: response.status,
          pickerCount: Array.isArray(body?.data?.items) ? body.data.items.length : null,
          pickerMessage: body?.message ?? null,
          labels: Array.from(document.querySelectorAll("label"))
            .map((label) => label.textContent?.trim() || "")
            .filter(Boolean)
            .slice(0, 30),
          selects: Array.from(document.querySelectorAll("select"))
            .map((select) => ({
              id: select.id,
              optionCount: Array.from(select.options).filter((option) => option.value).length,
              text: select.closest(".field")?.textContent?.trim().slice(0, 80) ?? select.textContent?.trim().slice(0, 80) ?? ""
            }))
            .slice(0, 20),
          bodyText: document.body.innerText.slice(0, 500)
        };
      } catch (diagnosticError) {
        return {
          href: location.href,
          hasToken: Boolean(token),
          hasUser: Boolean(userRaw),
          diagnosticError: diagnosticError instanceof Error ? diagnosticError.message : String(diagnosticError)
        };
      }
    }).catch(() => null);
    return { path: target.path, viewport, status: "FAIL", reason: error.message, diagnostic };
  } finally {
    await page.close().catch(() => undefined);
  }
}

class CdpClient {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
  }

  async open() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolveOpen, rejectOpen) => {
      const timer = setTimeout(() => rejectOpen(new Error("CDP websocket open timeout")), 10000);
      this.socket.addEventListener("open", () => {
        clearTimeout(timer);
        resolveOpen();
      }, { once: true });
      this.socket.addEventListener("error", rejectOpen, { once: true });
    });
    this.socket.addEventListener("message", (event) => this.handleMessage(event.data));
  }

  handleMessage(raw) {
    const message = JSON.parse(raw);
    if (message.id && this.pending.has(message.id)) {
      const entry = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) entry.reject(new Error(message.error.message));
      else entry.resolve(message.result ?? {});
    }
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    const promise = new Promise((resolveSend, rejectSend) => {
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
    });
    this.socket.send(JSON.stringify(payload));
    return promise;
  }

  async newPage(url) {
    const target = await this.send("Target.createTarget", { url });
    const attached = await this.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
    return new CdpPage(this, target.targetId, attached.sessionId);
  }

  async close() {
    this.socket?.close();
  }
}

class CdpPage {
  constructor(browser, targetId, sessionId) {
    this.browser = browser;
    this.targetId = targetId;
    this.sessionId = sessionId;
  }

  send(method, params = {}) {
    return this.browser.send(method, params, this.sessionId);
  }

  async enable() {
    await this.send("Page.enable");
    await this.send("Runtime.enable");
  }

  async setViewport(viewport) {
    await this.send("Emulation.setDeviceMetricsOverride", viewport);
  }

  async installMocks() {
    if (authState) {
      await this.send("Page.addScriptToEvaluateOnNewDocument", {
        source: `(${installAuthState.toString()})(${JSON.stringify(authState)});`
      });
    } else {
      await this.send("Page.addScriptToEvaluateOnNewDocument", {
        source: `(${mockBrowserRuntime.toString()})(${JSON.stringify(mockUser)}, ${JSON.stringify(mockUsers)});`
      });
    }
  }

  async seedStoredSession(state) {
    await this.navigate(`${webBase}/login`);
    await this.evaluate((nextState) => {
      window.localStorage.setItem("jinhu_access_token", nextState.token);
      window.sessionStorage.setItem("jinhu_access_token", nextState.token);
      window.localStorage.setItem("jinhu_auth_user", JSON.stringify(nextState.user));
      window.sessionStorage.setItem("jinhu_auth_user", JSON.stringify(nextState.user));
    }, state);
  }

  async navigate(url) {
    await this.send("Page.navigate", { url });
    await this.waitUntil("document.readyState === 'complete' || document.readyState === 'interactive'", 20000);
  }

  async evaluate(expression, arg) {
    const result = await this.send("Runtime.evaluate", {
      expression: arg === undefined
        ? `(${expression.toString()})()`
        : `(${expression.toString()})(${JSON.stringify(arg)})`,
      awaitPromise: true,
      returnByValue: true
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? "Runtime.evaluate failed");
    return result.result?.value;
  }

  async waitUntil(expression, timeoutMs) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const ok = await this.send("Runtime.evaluate", { expression, returnByValue: true }).then((r) => Boolean(r.result?.value)).catch(() => false);
      if (ok) return;
      await wait(100);
    }
    throw new Error(`waitUntil timeout: ${expression}`);
  }

  async waitForText(text, timeoutMs) {
    await this.waitUntil(`document.body && document.body.innerText.includes(${JSON.stringify(text)})`, timeoutMs);
  }

  async assertLabelSelect(label, minSelects) {
    const count = await this.evaluate((expectedLabel) => {
      const labels = Array.from(document.querySelectorAll("label"));
      return labels.filter((item) => {
        if (!item.textContent?.trim().includes(expectedLabel)) return false;
        if (item.querySelector("select")) return true;
        const fieldId = item.getAttribute("for");
        return Boolean(fieldId && document.getElementById(fieldId)?.tagName.toLowerCase() === "select");
      }).length;
    }, label);
    if (count < minSelects) throw new Error(`label ${label} select count ${count} < ${minSelects}`);
  }

  async assertAbsent(needles) {
    const found = await this.evaluate((expectedAbsent) => expectedAbsent.filter((needle) => document.body.innerText.includes(needle)), needles);
    if (found.length > 0) throw new Error(`unexpected text: ${found.join(", ")}`);
  }

  async assertLabelSelectOptions(label, minOptions) {
    const countOptions = async () => this.evaluate((expectedLabel) => {
      return Math.max(0, ...findSelectsByLabel(expectedLabel).map((select) => Array.from(select.options).filter((option) => option.value).length));

      function findSelectsByLabel(labelText) {
        const labels = Array.from(document.querySelectorAll("label"));
        const selects = [];
        for (const item of labels) {
          if (!item.textContent?.trim().includes(labelText)) continue;
          const nested = item.querySelector("select");
          if (nested) selects.push(nested);
          const fieldId = item.getAttribute("for");
          const target = fieldId ? document.getElementById(fieldId) : null;
          if (target?.tagName.toLowerCase() === "select") selects.push(target);
        }
        return selects.filter((select) => {
          const rect = select.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
      }
    }, label);
    const started = Date.now();
    let count = await countOptions();
    while (count < minOptions && Date.now() - started < 8000) {
      await wait(100);
      count = await countOptions();
    }
    if (count < minOptions) throw new Error(`label ${label} option count ${count} < ${minOptions}`);
  }

  async selectFirstOption(label) {
    const changed = await this.evaluate((expectedLabel) => {
      const select = findSelectsByLabel(expectedLabel).find((item) => Array.from(item.options).some((option) => option.value));
      if (!select) return false;
      const option = Array.from(select.options).find((item) => item.value);
      if (!option) return false;
      select.value = option.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return true;

      function findSelectsByLabel(labelText) {
        const labels = Array.from(document.querySelectorAll("label"));
        const selects = [];
        for (const item of labels) {
          if (!item.textContent?.trim().includes(labelText)) continue;
          const nested = item.querySelector("select");
          if (nested) selects.push(nested);
          const fieldId = item.getAttribute("for");
          const target = fieldId ? document.getElementById(fieldId) : null;
          if (target?.tagName.toLowerCase() === "select") selects.push(target);
        }
        return selects.filter((select) => {
          const rect = select.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
      }
    }, label);
    if (!changed) throw new Error(`no selectable option for label: ${label}`);
  }

  async clickText(text) {
    const result = await this.evaluate((needle) => {
      const elements = Array.from(document.querySelectorAll("button, a, [role='button']"));
      const target = elements.find((element) => element.textContent?.includes(needle));
      if (!target) {
        return {
          clicked: false,
          path: location.pathname,
          text: document.body.innerText.slice(0, 500),
          actions: elements.map((element) => element.textContent?.trim()).filter(Boolean).slice(0, 40)
        };
      }
      target.click();
      return { clicked: true };
    }, text);
    if (!result.clicked) throw new Error(`click target not found: ${text}; path=${result.path}; actions=${JSON.stringify(result.actions)}; body=${JSON.stringify(result.text)}`);
  }

  async close() {
    await this.browser.send("Target.closeTarget", { targetId: this.targetId });
  }
}

async function prepareRealApiState() {
  const loginScope = {
    tenantId: process.env.REAL_TENANT_ID ?? "10000001",
    parkId: process.env.REAL_PARK_ID ?? "20000001",
    mobile: process.env.REAL_LOGIN_MOBILE ?? "13800000001"
  };
  await apiJson("/auth/mobile/send-code", {
    method: "POST",
    body: loginScope,
    auth: false
  });
  const login = await apiJson("/auth/mobile/login", {
    method: "POST",
    body: { ...loginScope, code: process.env.REAL_LOGIN_CODE ?? "123456" },
    auth: false
  });
  const token = login.accessToken;
  if (!token) throw new Error("real API login did not return an access token");
  authState = { token, user: null };
  const user = await apiJson("/auth/me", { token });
  const userOptions = await apiJson("/reference-data/users?page=1&page_size=100&status=enabled", { token });
  const users = Array.isArray(userOptions.items) ? userOptions.items.filter((item) => item.status === "enabled") : [];
  if (users.length === 0) throw new Error("real API reference users are empty");

  const stamp = Date.now();
  const created = await apiJson("/leasing/leads", {
    method: "POST",
    token,
    idempotencyKey: `leasing-user-picker-create-${stamp}`,
    body: {
      leadCode: `LUP${stamp}`,
      customerName: `浏览器用户选择测试${stamp}`,
      contactName: "测试联系人",
      contactMobile: `139${String(stamp).slice(-8)}`,
      followUserId: users[0].id,
      followUserName: users[0].displayName || users[0].realName || users[0].username,
      remark: "leasing-user-picker-browser-check"
    }
  });
  if (!created.id) throw new Error("real API lead creation did not return id");
  createdLeadIds.push(created.id);
  await apiJson(`/leasing/leads/${created.id}/move-to-pool`, {
    method: "POST",
    token,
    idempotencyKey: `leasing-user-picker-pool-${stamp}`,
    body: { reason: "浏览器用户选择测试入池" }
  });

  return { token, user };
}

async function cleanupRealApiState() {
  if (!authState?.token) return;
  for (const id of createdLeadIds.reverse()) {
    await apiJson(`/leasing/leads/${id}`, {
      method: "DELETE",
      token: authState.token,
      idempotencyKey: `leasing-user-picker-cleanup-${id}`
    }).catch((error) => {
      const failure = { path: `/leasing/leads/${id}`, status: "FAIL", reason: `cleanup failed: ${error.message}` };
      cleanupFailures.push(failure);
      console.warn(`[browser-check] cleanup lead ${id} failed: ${error.message}`);
    });
  }
}

async function apiJson(path, { method = "GET", body, token, idempotencyKey, auth = true } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  if (idempotencyKey) headers["X-Idempotency-Key"] = idempotencyKey;
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.code !== 0) {
    throw new Error(`API ${method} ${path} failed: ${response.status} ${payload?.message ?? "invalid response"}`);
  }
  return payload.data;
}

function installAuthState(state) {
  window.localStorage.setItem("jinhu_access_token", state.token);
  window.sessionStorage.setItem("jinhu_access_token", state.token);
  window.localStorage.setItem("jinhu_auth_user", JSON.stringify(state.user));
  window.sessionStorage.setItem("jinhu_auth_user", JSON.stringify(state.user));
}

function mockBrowserRuntime(user, users) {
  const token = "leasing-user-picker-browser-token";
  const response = (data) => Promise.resolve(new Response(JSON.stringify({ code: 0, message: "ok", data }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  }));
  const page = (items) => ({ items, page: 1, page_size: 20, total: items.length });
  const dict = (code, items) => ({ dictCode: code, items: items.map(([value, label]) => ({ id: `${code}-${value}`, itemValue: value, itemLabel: label, status: "enabled" })) });
  const dicts = {
    leasing_lead_status: [["10", "初始"], ["20", "跟进中"], ["90", "无效"]],
    leasing_lost_reason: [["price", "价格原因"]],
    leasing_lead_lost_reason: [["price", "价格原因"]],
    leasing_lead_source: [["web", "线上咨询"]],
    leasing_intention_level: [["A", "A级"]],
    leasing_follow_type: [["phone", "电话"]],
    leasing_payment_period: [["monthly", "月付"]],
    leasing_quote_status: [["draft", "草稿"]],
    industry_code: [["software", "软件信息"]],
    unit_usage_type: [["office", "办公"]],
    unit_rental_status: [["0", "空置"]],
    park_tenant_type: [["company", "企业"]],
    park_tenant_risk_level: [["low", "低风险"]]
  };
  const leads = [{
    id: "lead-1",
    code: "L-001",
    leadCode: "L-001",
    customerName: "金湖测试客户",
    contactName: "王经理",
    contactMobile: "13800000000",
    contactEmail: null,
    source: "web",
    channelName: "官网",
    industryCode: "software",
    industryDetail: null,
    demandArea: "120",
    demandPrice: "50",
    demandUnitType: "office",
    intentionLevel: "A",
    followUserId: "user-zhang",
    followUserName: "张三",
    parkTenantId: null,
    status: "20",
    lostReason: null,
    lostRemark: null,
    lastFollowTime: new Date().toISOString(),
    nextFollowTime: new Date().toISOString(),
    expectedCloseDate: null,
    isInPool: false,
    poolEnterTime: new Date().toISOString(),
    remark: null,
    createTime: new Date().toISOString(),
    updateTime: new Date().toISOString()
  }];
  window.localStorage.setItem("jinhu_access_token", token);
  window.sessionStorage.setItem("jinhu_access_token", token);
  window.localStorage.setItem("jinhu_auth_user", JSON.stringify(user));
  window.sessionStorage.setItem("jinhu_auth_user", JSON.stringify(user));
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    const path = new URL(url, location.origin).pathname;
    if (path.endsWith("/users/me") || path.endsWith("/auth/me")) return response(user);
    if (path.endsWith("/reference-data/form-options")) {
      return response({ orgs: [], buildings: [], floors: [], units: [], parkTenants: [], users });
    }
    if (path.endsWith("/reference-data/users")) {
      return response({ items: users, page: 1, page_size: 100, total: users.length });
    }
    if (path.endsWith("/dict-items/by-codes")) {
      const parsed = new URL(url, location.origin);
      const codes = (parsed.searchParams.get("codes") || "").split(",").filter(Boolean);
      return response(Object.fromEntries(codes.map((code) => [code, dicts[code]?.items ?? []])));
    }
    if (path.endsWith("/leasing/leads")) return response(page(leads));
    if (path.endsWith("/leasing/lead-pool")) return response(page(leads.map((lead) => ({ ...lead, isInPool: true }))));
    if (path.endsWith("/leasing/statistics/funnel")) {
      return response({
        summary: { total_leads: 1, valid_leads: 1, visited_count: 0, quoted_count: 0, negotiating_count: 0, signed_count: 0, signed_area: 0, lost_count: 0, visit_rate: 0, quote_rate: 0, sign_rate: 0 },
        by_status: [{ status: "20", status_name: "跟进中", count: 1 }],
        by_source: [{ source: "web", source_name: "线上咨询", count: 1 }],
        lost_reasons: [],
        by_follow_user: [{ follow_user_id: "user-zhang", follow_user_name: "张三", count: 1, signed_count: 0 }]
      });
    }
    if (path.includes("/follows") || path.includes("/visits") || path.includes("/quotes")) return response([]);
    if (path.includes("/status-logs")) return response(page([]));
    if (path.endsWith("/park-units")) return response(page([]));
    return originalFetch(input, init);
  };
}

async function waitForJson(url, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {
      // keep polling
    }
    await wait(100);
  }
  throw new Error(`timeout waiting for ${url}`);
}

function wait(ms) {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
