#!/usr/bin/env node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const defaultCredentialsFile = resolve(repoRoot, "database/import-reports/go-live-all-users.local.csv");
const defaultReportFile = resolve(repoRoot, "database/import-reports/engineering-terminal-form-uat-report.local.json");

const tenantId = "10000001";
const parkId = "20000001";
const apiBase = readArg("--api-base") ?? "http://127.0.0.1:4330/api/v1";
const webBase = readArg("--web-base") ?? "http://127.0.0.1:4320";
const credentialsFile = resolve(repoRoot, readArg("--credentials") ?? defaultCredentialsFile);
const reportFile = resolve(repoRoot, readArg("--report-file") ?? defaultReportFile);
const screenshotsDir = resolve(readArg("--screenshots-dir") ?? `${tmpdir()}/jinhu-engineering-terminal-form-uat`);
const chromePath = readArg("--chrome-path") ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const runId = `MOBILE-FORM-UAT-${new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15)}`;
const today = new Date();
const reportDate = toDateString(today);
const plannedEndDate = toDateString(new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000));
const failures = [];
const warnings = [];
const steps = [];

async function main() {
  if (!existsSync(credentialsFile)) fail(`missing credentials file: ${credentialsFile}`);
  if (!existsSync(chromePath)) fail(`missing Chrome executable: ${chromePath}`);
  mkdirSync(dirname(reportFile), { recursive: true });
  mkdirSync(screenshotsDir, { recursive: true });

  let project = null;
  if (failures.length === 0) {
    const credentials = readCredentials(credentialsFile);
    const admin = await loginUser(credentials, "admin");
    const fieldEngineer = await loginUser(credentials, "zheng_ziyong");
    if (admin && fieldEngineer) {
      project = await createUatProject(admin, fieldEngineer);
      if (project?.id) {
        const chrome = await launchChrome();
        try {
          steps.push(await exerciseQuickDailyReport(chrome, fieldEngineer, project));
          const inspectionStep = await exerciseInspectionCreate(chrome, fieldEngineer, project);
          steps.push(inspectionStep);
          const rectification = inspectionStep.inspection_id
            ? await createUatRectification(admin, fieldEngineer, project, inspectionStep.inspection_id)
            : null;
          if (rectification?.id) {
            steps.push(await exerciseRectificationClosedLoop(chrome, fieldEngineer, admin, project, rectification));
          }
          steps.push(await exerciseAcceptanceCreate(chrome, fieldEngineer, project));
        } finally {
          await chrome.close();
        }
      }
    }
  }

  const report = {
    checked_at: new Date().toISOString(),
    status: failures.length === 0 ? "PASS" : "FAIL",
    scope: "engineering_terminal_mobile_closed_loop_uat",
    run_id: runId,
    api_base: apiBase,
    web_base: webBase,
    credentials_file: credentialsFile,
    report_file: reportFile,
    screenshots_dir: screenshotsDir,
    project_id: project?.id ?? null,
    project_code: project?.projectCode ?? project?.project_code ?? null,
    steps,
    warnings,
    failures
  };

  writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  console.log(JSON.stringify(report, null, 2));
  if (failures.length > 0) process.exitCode = 1;
}

async function loginUser(credentials, username) {
  const password = credentials.get(username);
  if (!password) {
    fail(`missing password for ${username}`);
    return null;
  }
  const login = await requestJson(`${apiBase}/auth/login`, {
    method: "POST",
    body: { tenantId, parkId, username, password }
  });
  if (login.status !== 200 || !login.body?.data?.accessToken) {
    fail(`${username}: login failed (${login.status})`);
    return null;
  }
  const token = login.body.data.accessToken;
  const me = await requestJson(`${apiBase}/users/me`, { token });
  if (me.status !== 200 || !me.body?.data) {
    fail(`${username}: users/me failed (${me.status})`);
    return null;
  }
  return { username, password, token, me: me.body.data, id: me.body.data.id };
}

async function createUatProject(admin, manager) {
  const response = await requestJson(`${apiBase}/engineering/projects`, {
    method: "POST",
    token: admin.token,
    idempotencyKey: `engineering-terminal-form-project-${runId}`,
    body: {
      project_name: `${runId} 移动终端表单验证工程`,
      project_type: "FIRE_PROTECTION",
      planned_start_date: reportDate,
      planned_end_date: plannedEndDate,
      project_manager_id: manager.id,
      project_level: "NORMAL",
      project_source: "MOBILE_TERMINAL_FORM_UAT",
      description: `${runId} 用于验证手机端快速日报和新建巡检表单闭环`,
      location_text: "A1 楼 1F 移动终端验证点位",
      budget_amount: 12000,
      risk_level: "MEDIUM",
      remark: "mobile terminal form uat"
    }
  });
  if (!isSuccess(response)) {
    fail(`admin: create UAT engineering project failed (${response.status}) ${response.body?.message ?? ""}`);
    return null;
  }
  return unwrapData(response);
}

async function exerciseQuickDailyReport(chrome, user, project) {
  const page = await chrome.newPage(`${webBase}/login`);
  const screenshot = resolve(screenshotsDir, "quick-daily-report-success.png");
  try {
    await page.prepareMobile();
    await page.login(user.username, user.password);
    await page.navigate(`${webBase}/engineering/terminal`);
    await page.waitForSelector('[data-testid="engineering-terminal-hero-actions"]', 10000);
    const dailyAction = await page.firstAvailableSelector([
      '[data-testid="engineering-terminal-action-quickDailyReport"]',
      '[data-testid="engineering-terminal-action-dailyReports"]'
    ]);
    if (!dailyAction) {
      throw new Error("quick daily report action not available for zheng_ziyong");
    }
    if (dailyAction.includes("dailyReports")) {
      throw new Error("zheng_ziyong can open daily reports but cannot directly create quick daily reports");
    }
    await page.waitUntil(`!document.querySelector(${JSON.stringify(dailyAction)})?.disabled`, 12000, "quick daily report action remained disabled while projects loaded");
    await page.click(dailyAction);
    await page.waitForSelector('[data-testid="engineering-terminal-quick-daily-report-form"]', 5000);
    await page.waitForSelectOption('[data-testid="quick-daily-project"]', project.id, 12000);
    await page.setValue('[data-testid="quick-daily-project"]', project.id);
    await page.setValue('[data-testid="quick-daily-date"]', reportDate);
    await page.setValue('[data-testid="quick-daily-work-content"]', `${runId} 现场完成消防联动移动端快速日报验证`);
    await page.setValue('[data-testid="quick-daily-completed-work"]', "完成移动端快速日报填报、提交和成功提示验证");
    await page.setValue('[data-testid="quick-daily-tomorrow-plan"]', "继续执行移动端巡检与整改闭环验证");
    await page.setValue('[data-testid="quick-daily-worker-count"]', "6");
    await page.setValue('[data-testid="quick-daily-manager-count"]', "1");
    await page.setValue('[data-testid="quick-daily-progress-percent"]', "20");
    await page.setValue('[data-testid="quick-daily-quality-summary"]', "质量检查无异常");
    await page.setValue('[data-testid="quick-daily-safety-summary"]', "安全交底完成，现场无违章");
    await page.setValue('[data-testid="quick-daily-issue-summary"]', "暂无阻断项");
    await page.click('[data-testid="quick-daily-save"]');
    const message = await page.waitForText('[data-testid="engineering-terminal-message"]', /施工日报已保存/, 12000);
    await page.screenshot(screenshot);
    return {
      step: "quick_daily_report_save",
      status: "PASS",
      actor: user.username,
      project_id: project.id,
      message,
      screenshot
    };
  } catch (error) {
    await page.screenshot(screenshot).catch(() => undefined);
    fail(`quick daily report form failed: ${error.message}`);
    return {
      step: "quick_daily_report_save",
      status: "FAIL",
      actor: user.username,
      project_id: project.id,
      reason: error.message,
      screenshot
    };
  } finally {
    await page.close();
  }
}

async function exerciseInspectionCreate(chrome, user, project) {
  const page = await chrome.newPage(`${webBase}/login`);
  const screenshot = resolve(screenshotsDir, "inspection-create-success.png");
  try {
    await page.prepareMobile();
    await page.login(user.username, user.password);
    await page.navigate(`${webBase}/engineering/inspections/new?projectId=${encodeURIComponent(project.id)}`);
    await page.waitForSelector('[data-testid="engineering-inspection-form"]', 10000);
    await page.waitForSelectOption('[data-testid="inspection-project"]', project.id, 12000);
    const projectValue = await page.value('[data-testid="inspection-project"]');
    if (projectValue !== project.id) {
      throw new Error(`inspection project binding mismatch: expected ${project.id}, got ${projectValue}`);
    }
    await page.setValue('[data-testid="inspection-title"]', `${runId} 移动端现场巡检`);
    await page.setValue('[data-testid="inspection-date"]', reportDate);
    await page.setValue('[data-testid="inspection-location-text"]', "A1 楼 1F 移动终端验证点位");
    await page.setValue('[data-testid="inspection-summary"]', "移动端新建巡检页面可打开、可填报、可保存。");
    await page.setValue('[data-testid="inspection-overall-result"]', "现场验证通过，后续进入整改和验收表单级 UAT。");
    await page.setValue('[data-testid="inspection-issue-count"]', "0");
    await page.setValue('[data-testid="inspection-critical-issue-count"]', "0");
    await page.click('[data-testid="inspection-save"]');
    const reachedPathname = await page.waitForPath(/\/engineering\/inspections\/(?!new$)[^/]+$/, 12000);
    const inspectionId = reachedPathname.split("/").filter(Boolean).at(-1) ?? null;
    await page.screenshot(screenshot);
    return {
      step: "inspection_create_save",
      status: "PASS",
      actor: user.username,
      project_id: project.id,
      reached_pathname: reachedPathname,
      inspection_id: inspectionId,
      screenshot
    };
  } catch (error) {
    await page.screenshot(screenshot).catch(() => undefined);
    fail(`inspection create form failed: ${error.message}`);
    return {
      step: "inspection_create_save",
      status: "FAIL",
      actor: user.username,
      project_id: project.id,
      reason: error.message,
      screenshot
    };
  } finally {
    await page.close();
  }
}

async function createUatRectification(admin, responsibleUser, project, inspectionId) {
  const deadline = toDateString(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000));
  const issueResponse = await requestJson(`${apiBase}/engineering/issues`, {
    method: "POST",
    token: admin.token,
    idempotencyKey: `engineering-terminal-form-issue-${runId}`,
    body: {
      project_id: project.id,
      inspection_id: inspectionId,
      issue_title: `${runId} 移动端整改闭环问题`,
      issue_type: "QUALITY",
      severity: "MEDIUM",
      description: "用于验证移动终端整改反馈、复查、通过和关闭状态机。",
      location_text: "A1 楼 1F 移动终端验证点位",
      responsible_user_id: responsibleUser.id,
      deadline,
      source_type: "INSPECTION",
      remark: "mobile terminal closed-loop uat"
    }
  });
  if (!isSuccess(issueResponse)) {
    fail(`admin: create engineering issue failed (${issueResponse.status}) ${issueResponse.body?.message ?? ""}`);
    return null;
  }
  const issue = unwrapData(issueResponse);
  const rectificationResponse = await requestJson(`${apiBase}/engineering/issues/${issue.id}/generate-rectification`, {
    method: "POST",
    token: admin.token,
    idempotencyKey: `engineering-terminal-form-rectification-${runId}`,
    body: {
      rectification_title: `${runId} 移动端整改任务`,
      description: "完成现场整改并通过移动终端提交反馈和复查结论。",
      responsible_user_id: responsibleUser.id,
      deadline,
      remark: "mobile terminal closed-loop uat"
    }
  });
  if (!isSuccess(rectificationResponse)) {
    fail(`admin: generate rectification failed (${rectificationResponse.status}) ${rectificationResponse.body?.message ?? ""}`);
    return null;
  }
  return unwrapData(rectificationResponse);
}

async function exerciseRectificationClosedLoop(chrome, executor, reviewer, project, rectification) {
  const executionPage = await chrome.newPage(`${webBase}/login`);
  let reviewPage = null;
  const feedbackScreenshot = resolve(screenshotsDir, "rectification-feedback-success.png");
  const closedScreenshot = resolve(screenshotsDir, "rectification-closed-success.png");
  try {
    await executionPage.prepareMobile();
    await executionPage.login(executor.username, executor.password);
    await executionPage.navigate(`${webBase}/engineering/terminal`);
    await executionPage.waitForSelector(`[data-testid="engineering-terminal-rectification-${rectification.id}"]`, 12000);

    await executeTerminalRectificationAction(executionPage, rectification.id, "start");
    await executeTerminalRectificationAction(executionPage, rectification.id, "submit", {
      feedback: `${runId} 已完成现场整改，复测结果正常，具备复查条件。`
    });
    await executionPage.screenshot(feedbackScreenshot);

    reviewPage = await chrome.newPage(`${webBase}/login`);
    await reviewPage.prepareMobile();
    await reviewPage.login(reviewer.username, reviewer.password);
    await reviewPage.navigate(`${webBase}/engineering/terminal`);
    await executeTerminalRectificationAction(reviewPage, rectification.id, "start_recheck", {
      recheckComment: `${runId} 开始复查，现场条件满足。`
    });
    await executeTerminalRectificationAction(reviewPage, rectification.id, "pass", {
      recheckComment: `${runId} 复查通过，整改措施有效。`
    });
    await executeTerminalRectificationAction(reviewPage, rectification.id, "close");
    await reviewPage.screenshot(closedScreenshot);
    return {
      step: "rectification_feedback_recheck_close",
      status: "PASS",
      actors: [executor.username, reviewer.username],
      project_id: project.id,
      rectification_id: rectification.id,
      screenshots: [feedbackScreenshot, closedScreenshot]
    };
  } catch (error) {
    await (reviewPage ?? executionPage).screenshot(closedScreenshot).catch(() => undefined);
    fail(`rectification closed loop failed: ${error.message}`);
    return {
      step: "rectification_feedback_recheck_close",
      status: "FAIL",
      actors: [executor.username, reviewer.username],
      project_id: project.id,
      rectification_id: rectification.id,
      reason: error.message,
      screenshot: closedScreenshot
    };
  } finally {
    await executionPage.close();
    await reviewPage?.close();
  }
}

async function executeTerminalRectificationAction(page, rectificationId, action, input = {}) {
  const cardSelector = `[data-testid="engineering-terminal-rectification-${rectificationId}"]`;
  const actionSelector = `${cardSelector} [data-testid="rectification-action-${action}"]`;
  await page.waitForSelector(actionSelector, 12000);
  await page.click(actionSelector);
  await page.waitForSelector('[data-testid="engineering-terminal-rectification-form"]', 5000);
  if (input.feedback !== undefined) {
    await page.setValue('[data-testid="rectification-action-feedback"]', input.feedback);
  }
  if (input.recheckComment !== undefined) {
    await page.setValue('[data-testid="rectification-action-recheck-comment"]', input.recheckComment);
  }
  await page.click('[data-testid="rectification-action-save"]');
  await page.waitForText('[data-testid="engineering-terminal-message"]', /整改任务已更新/, 12000);
}

async function exerciseAcceptanceCreate(chrome, user, project) {
  const page = await chrome.newPage(`${webBase}/login`);
  const screenshot = resolve(screenshotsDir, "acceptance-create-success.png");
  try {
    await page.prepareMobile();
    await page.login(user.username, user.password);
    await page.navigate(`${webBase}/engineering/terminal`);
    await page.waitForSelector('[data-testid="engineering-terminal-quick-acceptance"]', 10000);
    await page.waitUntil('!document.querySelector(\'[data-testid="engineering-terminal-quick-acceptance"]\')?.disabled', 12000, "quick acceptance action remained disabled while projects loaded");
    await page.click('[data-testid="engineering-terminal-quick-acceptance"]');
    await page.waitForSelector('[data-testid="engineering-terminal-acceptance-form"]', 5000);
    await page.waitForSelectOption('[data-testid="quick-acceptance-project"]', project.id, 12000);
    await page.setValue('[data-testid="quick-acceptance-project"]', project.id);
    await page.setValue('[data-testid="quick-acceptance-name"]', `${runId} 消防安装阶段验收`);
    await page.setValue('[data-testid="quick-acceptance-type"]', "STAGE");
    await page.setValue('[data-testid="quick-acceptance-date"]', reportDate);
    await page.setValue('[data-testid="quick-acceptance-risk"]', "MEDIUM");
    await page.setValue('[data-testid="quick-acceptance-scope"]', "A1 楼 1F 消防管线、支架和联动点位");
    await page.setValue('[data-testid="quick-acceptance-criteria"]', "按施工图、合同技术标准和消防验收规范执行");
    await page.click('[data-testid="quick-acceptance-save"]');
    const message = await page.waitForText('[data-testid="engineering-terminal-message"]', /工程验收已发起/, 12000);
    await page.screenshot(screenshot);
    return {
      step: "acceptance_create_save",
      status: "PASS",
      actor: user.username,
      project_id: project.id,
      message,
      screenshot
    };
  } catch (error) {
    await page.screenshot(screenshot).catch(() => undefined);
    fail(`acceptance create form failed: ${error.message}`);
    return {
      step: "acceptance_create_save",
      status: "FAIL",
      actor: user.username,
      project_id: project.id,
      reason: error.message,
      screenshot
    };
  } finally {
    await page.close();
  }
}

async function launchChrome() {
  const port = 48000 + Math.floor(Math.random() * 1000);
  const userDataDir = mkdtempSync(resolve(tmpdir(), "jinhu-terminal-form-uat-"));
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
    async newPage(url) {
      const target = await browser.send("Target.createTarget", { url });
      const attached = await browser.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
      return new CdpPage(browser, target.targetId, attached.sessionId);
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

class CdpPage {
  constructor(browser, targetId, sessionId) {
    this.browser = browser;
    this.targetId = targetId;
    this.sessionId = sessionId;
  }

  async prepareMobile() {
    await this.browser.send("Page.enable", {}, this.sessionId);
    await this.browser.send("Runtime.enable", {}, this.sessionId);
    await this.browser.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      mobile: true,
      deviceScaleFactor: 3
    }, this.sessionId);
    await this.waitForReady();
  }

  async login(username, password) {
    await this.navigate(`${webBase}/login`);
    await this.waitForSelector('input[autocomplete="username"], input#username, input[name="username"]', 10000);
    await this.typeValue('input[autocomplete="username"], input#username, input[name="username"]', username);
    await this.typeValue('input[autocomplete="current-password"], input#password, input[name="password"]', password);
    await this.click('.signin-submit, button[type="submit"]');
    await this.waitUntil('location.pathname !== "/login" && Boolean(localStorage.getItem("jinhu_access_token") || sessionStorage.getItem("jinhu_access_token"))', 12000, "browser login did not complete");
  }

  async seedSession(token, userContext) {
    await this.evaluate(`
      localStorage.setItem("jinhu_access_token", ${JSON.stringify(token)});
      sessionStorage.setItem("jinhu_access_token", ${JSON.stringify(token)});
      localStorage.setItem("jinhu_auth_user", ${JSON.stringify(JSON.stringify(userContext))});
      sessionStorage.setItem("jinhu_auth_user", ${JSON.stringify(JSON.stringify(userContext))});
    `);
  }

  async navigate(url) {
    const loadPromise = waitForEvent(this.browser, this.sessionId, "Page.loadEventFired", 12000);
    await this.browser.send("Page.navigate", { url }, this.sessionId);
    await loadPromise;
    await this.waitForReady();
  }

  async click(selector) {
    const result = await this.evaluateValue(`(() => {
      const element = pickElement(${JSON.stringify(selector)});
      if (!element) return { ok: false, reason: "not_found" };
      element.click();
      return { ok: true };
    })()`);
    if (!result.ok) throw new Error(`click failed for ${selector}: ${result.reason}`);
  }

  async setValue(selector, value) {
    const result = await this.evaluateValue(`(() => {
      const element = pickElement(${JSON.stringify(selector)});
      if (!element) return { ok: false, reason: "not_found" };
      element.focus?.();
      const prototype = element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : element instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
      descriptor?.set?.call(element, ${JSON.stringify(value)});
      if (element.value !== ${JSON.stringify(value)}) element.value = ${JSON.stringify(value)};
      element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: String(${JSON.stringify(value)}) }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true, value: element.value };
    })()`);
    if (!result.ok) throw new Error(`set value failed for ${selector}: ${result.reason}`);
  }

  async typeValue(selector, value) {
    const focused = await this.evaluateValue(`(() => {
      const element = pickElement(${JSON.stringify(selector)});
      if (!element) return { ok: false, reason: "not_found" };
      element.focus?.();
      element.select?.();
      return { ok: true };
    })()`);
    if (!focused.ok) throw new Error(`type value failed for ${selector}: ${focused.reason}`);
    await this.browser.send("Input.insertText", { text: String(value) }, this.sessionId);
    const result = await this.evaluateValue(`(() => {
      const element = pickElement(${JSON.stringify(selector)});
      element?.dispatchEvent(new Event("change", { bubbles: true }));
      return { value: element?.value ?? "" };
    })()`);
    if (result.value !== String(value)) {
      throw new Error(`type value failed for ${selector}: expected length ${String(value).length}, got length ${String(result.value ?? "").length}`);
    }
  }

  async value(selector) {
    const result = await this.evaluateValue(`(() => {
      const element = pickElement(${JSON.stringify(selector)});
      return { value: element?.value ?? "" };
    })()`);
    return result.value ?? "";
  }

  async waitForSelector(selector, timeoutMs) {
    await this.waitUntil(`Boolean(document.querySelector(${JSON.stringify(selector)}))`, timeoutMs, `selector not found: ${selector}`);
  }

  async waitForSelectOption(selector, value, timeoutMs) {
    await this.waitUntil(
      `Array.from(document.querySelector(${JSON.stringify(selector)})?.options ?? []).some((option) => option.value === ${JSON.stringify(value)})`,
      timeoutMs,
      `select option not found for ${selector}: ${value}`
    );
  }

  async firstAvailableSelector(selectors) {
    const result = await this.evaluateValue(`(() => {
      const selectors = ${JSON.stringify(selectors)};
      return { selector: selectors.find((selector) => document.querySelector(selector)) ?? "" };
    })()`);
    return result.selector ?? "";
  }

  async waitForText(selector, pattern, timeoutMs) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const result = await this.evaluateValue(`(() => ({ text: document.querySelector(${JSON.stringify(selector)})?.textContent ?? "" }))()`);
      if (pattern.test(result.text ?? "")) return result.text;
      await sleep(250);
    }
    throw new Error(`text not found for ${selector}: ${pattern}`);
  }

  async waitForPath(pattern, timeoutMs) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const pathname = await this.pathname();
      if (pattern.test(pathname)) return pathname;
      await sleep(250);
    }
    throw new Error(`path did not match ${pattern}: ${await this.pathname()}`);
  }

  async pathname() {
    const result = await this.evaluateValue(`(() => ({ pathname: location.pathname }))()`);
    return result.pathname ?? "";
  }

  async waitUntil(expression, timeoutMs, errorMessage) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const result = await this.evaluateValue(`(() => ({ ok: Boolean(${expression}) }))()`);
      if (result.ok) return;
      await sleep(250);
    }
    throw new Error(errorMessage);
  }

  async screenshot(file) {
    const result = await this.browser.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false
    }, this.sessionId);
    writeFileSync(file, Buffer.from(result.data, "base64"));
  }

  async evaluate(expression) {
    return this.browser.send("Runtime.evaluate", {
      expression,
      awaitPromise: true
    }, this.sessionId);
  }

  async evaluateValue(expression) {
    const evaluation = await this.browser.send("Runtime.evaluate", {
      expression: `${visiblePickerSource()}\n${expression}`,
      returnByValue: true,
      awaitPromise: true
    }, this.sessionId);
    return evaluation.result?.value ?? {};
  }

  async waitForReady() {
    for (let index = 0; index < 40; index += 1) {
      const result = await this.browser.send("Runtime.evaluate", {
        expression: `document.readyState === "complete"`,
        returnByValue: true
      }, this.sessionId).catch(() => ({ result: { value: false } }));
      if (result.result?.value === true) return;
      await sleep(250);
    }
  }

  async close() {
    await this.browser.send("Target.closeTarget", { targetId: this.targetId }).catch(() => undefined);
  }
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

async function requestJson(url, options = {}) {
  const headers = {
    accept: "application/json",
    ...(options.body ? { "content-type": "application/json" } : {}),
    ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    ...(options.idempotencyKey ? { "x-idempotency-key": options.idempotencyKey } : {})
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

function isSuccess(response) {
  return response.status >= 200 && response.status < 300 && response.body?.success !== false;
}

function unwrapData(response) {
  return response.body?.data ?? response.body;
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

function fail(message) {
  failures.push(message);
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function visiblePickerSource() {
  return `
    function pickElement(selector) {
      const elements = Array.from(document.querySelectorAll(selector));
      return elements.find((element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
      }) ?? elements[0] ?? null;
    }
  `;
}

await main();
