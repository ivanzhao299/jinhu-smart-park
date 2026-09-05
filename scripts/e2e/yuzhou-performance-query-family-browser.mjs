import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";

const root = resolve(import.meta.dirname, "../..");
const webRoot = resolve(root, "apps/web");
const fixturePath = resolve(
  root,
  "scripts/e2e/fixtures/yuzhou-performance-query-family-browser-v1.json",
);
const playwrightPath =
  process.env.PLAYWRIGHT_MODULE_PATH
  ?? "/Users/mac/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js";
const chromePath =
  process.env.CHROME_EXECUTABLE_PATH
  ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const nextBin = resolve(webRoot, "node_modules/next/dist/bin/next");
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
const evidenceRoot = process.env.YUZHOU_QUERY_BROWSER_EVIDENCE_DIR
  ? resolve(process.env.YUZHOU_QUERY_BROWSER_EVIDENCE_DIR)
  : mkdtempSync(resolve(tmpdir(), "jinhu-hr-query-browser-evidence-"));
const profileRoot = mkdtempSync(resolve(tmpdir(), "jinhu-hr-query-browser-profile-"));

const panelIds = {
  assessmentValue: "legacy-assessment-value-heading",
  assessmentValueOfPerson: "legacy-assessment-value-person-heading",
  webAssQuery: "legacy-web-ass-query-heading",
};

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function apiResponse(data, message = "ok") {
  return {
    code: 0,
    message,
    data,
    request_id: "synthetic-browser-request",
    server_time: 0,
  };
}

function isolatedProcessEnv(extra = {}) {
  return {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    TMPDIR: process.env.TMPDIR ?? tmpdir(),
    LANG: process.env.LANG ?? "en_US.UTF-8",
    NODE_ENV: "production",
    ...extra,
  };
}

function paginated(items = [], page = 1, total = items.length) {
  return { items, page, page_size: 20, total };
}

function withoutPerformanceRead(user) {
  return {
    ...user,
    username: "synthetic-query-hidden",
    real_name: "合成无查询权限用户",
    roles: [],
    permissions: user.permissions.filter(permission =>
      ![
        "hr:performance:read",
        "hr:performance:team_read",
        "hr:performance:self_read",
      ].includes(permission),
    ),
  };
}

function assertIsolatedEnvironment() {
  const privateEnvCandidates = [
    resolve(root, ".env"),
    resolve(root, ".env.local"),
    resolve(root, ".env.production"),
    resolve(root, ".env.production.local"),
    resolve(webRoot, ".env"),
    resolve(webRoot, ".env.local"),
    resolve(webRoot, ".env.production"),
    resolve(webRoot, ".env.production.local"),
  ];
  assert.deepEqual(
    privateEnvCandidates.filter(existsSync),
    [],
    "refusing to start Next while a private auto-loaded env file exists",
  );
  assert.equal(existsSync(playwrightPath), true, "Playwright runtime is missing");
  assert.equal(existsSync(chromePath), true, "Chrome executable is missing");
  assert.equal(existsSync(nextBin), true, "Next start entry is missing");
  assert.equal(fixture.technicalEvidenceOnly, true);
  assert.equal(fixture.schemaVersion, 1);
}

async function reservePort() {
  const server = createServer();
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise((resolvePromise, reject) =>
    server.close(error => error ? reject(error) : resolvePromise()),
  );
  return port;
}

function startWeb(port) {
  const output = [];
  const child = spawn(
    process.execPath,
    [nextBin, "start", "-H", "127.0.0.1", "-p", String(port)],
    {
      cwd: webRoot,
      env: isolatedProcessEnv({
        HOSTNAME: "127.0.0.1",
        PORT: String(port),
        NEXT_TELEMETRY_DISABLED: "1",
      }),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout.on("data", chunk => output.push(String(chunk)));
  child.stderr.on("data", chunk => output.push(String(chunk)));
  return { child, output };
}

async function waitForWeb(baseUrl, child, output) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    assert.equal(child.exitCode, null, `Next exited before readiness: ${output.join("").slice(-1200)}`);
    try {
      const response = await fetch(`${baseUrl}/hr/performance`, { redirect: "manual" });
      if (response.status >= 200 && response.status < 500) return;
    } catch {
      // The loopback listener may not be ready yet.
    }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 150));
  }
  assert.fail(`Next readiness timeout: ${output.join("").slice(-1200)}`);
}

async function stopWeb(child) {
  const stopped = () => child.exitCode !== null || child.signalCode !== null;
  const waitForExit = timeout => {
    if (stopped()) return Promise.resolve(true);
    return new Promise(resolvePromise => {
      const timer = setTimeout(() => {
        child.off("exit", onExit);
        resolvePromise(false);
      }, timeout);
      const onExit = () => {
        clearTimeout(timer);
        resolvePromise(true);
      };
      child.once("exit", onExit);
    });
  };
  if (stopped()) return;
  child.kill("SIGTERM");
  if (!await waitForExit(5_000)) {
    child.kill("SIGKILL");
    assert.equal(await waitForExit(5_000), true, "Next process did not stop after SIGKILL");
  }
}

function panel(page, id) {
  return page.locator(`section[aria-labelledby="${id}"]`);
}

async function assertNoOverflow(page, ids) {
  const measurements = await page.evaluate(panelIdsToMeasure => {
    const documentElement = document.documentElement;
    const panels = panelIdsToMeasure.map(id => {
      const element = document.querySelector(`section[aria-labelledby="${id}"]`);
      if (!(element instanceof HTMLElement)) throw new Error(`panel missing: ${id}`);
      const fieldGrid = element.querySelector("dl");
      const cards = element.querySelector("div[aria-busy]");
      return {
        id,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        cardGridColumns: cards ? getComputedStyle(cards).gridTemplateColumns : "",
        gridColumns: fieldGrid ? getComputedStyle(fieldGrid).gridTemplateColumns : "",
      };
    });
    return {
      documentClientWidth: documentElement.clientWidth,
      documentScrollWidth: documentElement.scrollWidth,
      panels,
    };
  }, ids);
  assert.ok(
    measurements.documentScrollWidth <= measurements.documentClientWidth,
    `document horizontal overflow: ${JSON.stringify(measurements)}`,
  );
  for (const item of measurements.panels) {
    assert.ok(item.scrollWidth <= item.clientWidth, `panel horizontal overflow: ${item.id}`);
  }
  return measurements;
}

async function screenshotPanels(page, viewportId) {
  const originalViewport = page.viewportSize();
  if (originalViewport?.width === 390 && originalViewport.height < 2400) {
    await page.setViewportSize({ width: 390, height: 2400 });
  }
  await page.addStyleTag({
    content: [
      ".app-header { display: none !important; }",
      "button[aria-label='反馈问题'] { display: none !important; }",
    ].join("\n"),
  });
  const screenshots = [];
  try {
    for (const [family, id] of Object.entries(panelIds)) {
      const path = resolve(evidenceRoot, `${viewportId}-${family}.png`);
      await panel(page, id).screenshot({ path, animations: "disabled" });
      screenshots.push({
        viewport: viewportId,
        family,
        path,
        sha256: sha256File(path),
      });
    }
  } finally {
    if (originalViewport) await page.setViewportSize(originalViewport);
  }
  return screenshots;
}

async function submitAssessmentValue(page) {
  const target = panel(page, panelIds.assessmentValue);
  await target.getByLabel("考核期间").fill(fixture.queries.assessmentValue.assSession);
  await target.getByLabel("部门编码前缀").fill(fixture.queries.assessmentValue.departmentPrefix);
  await target.getByRole("button", { name: "查询历史评分" }).click();
  await assertVisible(target.getByText("合成员工甲", { exact: true }).first());
  await assertVisible(target.getByText("第 1 / 2 页", { exact: true }));
  await target.getByRole("button", { name: "下一页" }).click();
  await assertVisible(target.getByText("合成员工乙", { exact: true }).first());
  await assertVisible(target.getByText("第 2 / 2 页", { exact: true }));
  const finalValue = target
    .locator("dl > div")
    .filter({ hasText: "最后评定分（不含主管附加分）" })
    .getByRole("definition");
  await assertVisible(finalValue);
  assert.equal((await finalValue.textContent())?.trim(), "—");
}

async function submitAssessmentValueOfPerson(page, expectRetry) {
  const target = panel(page, panelIds.assessmentValueOfPerson);
  await target.getByLabel("旧人员编码").fill(
    fixture.queries.assessmentValueOfPerson.sourcePersonCode,
  );
  await target.getByRole("button", { name: "查询个人历史" }).click();
  if (expectRetry) {
    await assertVisible(target.getByText("加载玉舟个人历史绩效评分失败", { exact: true }));
    await target.getByRole("button", { name: "重新加载" }).click();
  }
  await assertVisible(target.getByText(fixture.queries.assessmentValue.assSession, { exact: true }).first());
}

async function submitWebAssQuery(page, expectEmpty) {
  const target = panel(page, panelIds.webAssQuery);
  const query = fixture.queries.webAssQuery;
  await target.getByLabel("考核期间").fill(query.assSession);
  await target.getByLabel("人员编码 LIKE 条件（可空）").fill(
    expectEmpty ? query.personLikeEmpty : query.personLikeResult,
  );
  await target.getByLabel("部门编码前缀").fill(query.rightScopePrefix);
  await target.getByLabel("总评定分下限").fill(query.itemValueMin);
  await target.getByLabel("总评定分上限").fill(query.itemValueMax);
  await target.getByRole("button", { name: "查询历史汇总" }).click();
  if (expectEmpty) {
    await assertVisible(target.getByText("当前权限和查询条件内没有历史绩效汇总。", { exact: true }));
    await target.getByLabel("人员编码 LIKE 条件（可空）").fill(query.personLikeResult);
    await target.getByRole("button", { name: "查询历史汇总" }).click();
  }
  await assertVisible(target.getByText("合成员工甲", { exact: true }).first());
}

async function assertVisible(locator) {
  await locator.waitFor({ state: "visible", timeout: 15_000 });
}

async function waitForPanelHydration(page) {
  await page.waitForFunction(id => {
    const target = document.querySelector(
      `section[aria-labelledby="${id}"] input`,
    );
    return target
      ? Object.keys(target).some(key =>
          key.startsWith("__reactProps$") || key.startsWith("__reactFiber$"),
        )
      : false;
  }, panelIds.assessmentValue, { timeout: 15_000 });
}

async function waitForReactHydration(page) {
  await page.waitForFunction(() => {
    const main = document.querySelector("main");
    return main
      ? Array.from(main.querySelectorAll("*")).some(element =>
          Object.keys(element).some(key =>
            key.startsWith("__reactProps$") || key.startsWith("__reactFiber$"),
          ),
        )
      : false;
  }, null, { timeout: 15_000 });
}

function assertQueryContracts(capturedQueries) {
  const assessment = capturedQueries.filter(item => item.family === "assessmentValue");
  assert.equal(assessment.length >= 2, true);
  assert.deepEqual(assessment[0].parameters, {
    ass_session: fixture.queries.assessmentValue.assSession,
    department_prefix: fixture.queries.assessmentValue.departmentPrefix,
    page: "1",
    page_size: "20",
  });
  assert.equal(assessment.some(item => item.parameters.page === "2"), true);

  const person = capturedQueries.filter(item => item.family === "assessmentValueOfPerson");
  assert.equal(person.length >= 2, true);
  assert.deepEqual(person[0].parameters, {
    source_person_code: fixture.queries.assessmentValueOfPerson.sourcePersonCode,
    page: "1",
    page_size: "20",
  });

  const web = capturedQueries.filter(item => item.family === "webAssQuery");
  assert.equal(web.length >= 2, true);
  assert.deepEqual(web.at(-1).parameters, {
    ass_session: fixture.queries.webAssQuery.assSession,
    right_scope_prefix: fixture.queries.webAssQuery.rightScopePrefix,
    item_value_min: fixture.queries.webAssQuery.itemValueMin,
    item_value_max: fixture.queries.webAssQuery.itemValueMax,
    page: "1",
    page_size: "20",
    person_like: fixture.queries.webAssQuery.personLikeResult,
  });
}

async function main() {
  assertIsolatedEnvironment();
  mkdirSync(evidenceRoot, { recursive: true, mode: 0o700 });
  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const { child: webProcess, output } = startWeb(port);
  const summary = {
    schemaVersion: 1,
    status: "FAIL",
    evidenceKind: "synthetic_technical_browser",
    technicalEvidenceOnly: true,
    legacySourceEquivalence: "NOT_CLAIMED",
    businessUat: "NOT_CLAIMED",
    compatibilityCredit: 0,
    productionImport: "HOLD",
    semanticLimits: [
      "historical_department_source_parity_not_claimed",
      "historical_person_name_source_parity_not_claimed",
    ],
    server: { pid: webProcess.pid, port, origin: baseUrl, stopped: false },
    isolation: {
      privateAutoLoadedEnvFiles: 0,
      temporaryChromeProfile: true,
      profilePurged: false,
      apiMode: "playwright_fulfilled_synthetic",
      externalNetwork: "blocked",
      screenshotChromeTreatment:
        "shell_header_hidden_after_interaction_assertions_for_unobscured_panel_capture",
    },
    scenarios: [],
    screenshots: [],
  };
  let browserContext;
  let scenariosComplete = false;
  try {
    await waitForWeb(baseUrl, webProcess, output);
    const playwright = await import(playwrightPath);
    const chromium = playwright.chromium ?? playwright.default?.chromium;
    assert.ok(chromium, "Playwright Chromium binding is missing");
    let activeUser = fixture.session.authorizedUser;
    let scenario = "desktop";
    let personRequests = 0;
    let webRequests = 0;
    const capturedQueries = [];
    const externalRequests = [];
    const runtimeErrors = [];
    browserContext = await chromium.launchPersistentContext(profileRoot, {
      executablePath: chromePath,
      headless: true,
      env: isolatedProcessEnv(),
      serviceWorkers: "block",
      viewport: { width: 1440, height: 1000 },
      args: ["--disable-background-networking", "--no-default-browser-check"],
    });
    await browserContext.addInitScript(({ token, user }) => {
      localStorage.setItem("jinhu_access_token", token);
      localStorage.setItem("jinhu_auth_user", JSON.stringify(user));
      localStorage.setItem("jinhu_sidebar_collapsed", "1");
      localStorage.setItem("jinhu_theme", "enterprise-light");
    }, { token: fixture.session.token, user: fixture.session.authorizedUser });
    await browserContext.route("**/*", async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (!["http:", "https:"].includes(url.protocol)) return route.continue();
      if (url.origin !== baseUrl) {
        externalRequests.push("blocked");
        return route.abort("blockedbyclient");
      }
      if (!url.pathname.startsWith("/api/v1/")) return route.continue();
      const protectedRequest = url.pathname !== "/api/v1/tenants/public/branding";
      if (protectedRequest) {
        assert.equal(request.headers().authorization, `Bearer ${fixture.session.token}`);
      }
      const fulfill = (data, status = 200, message = "ok") => route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(apiResponse(data, message)),
      });
      if (url.pathname === "/api/v1/users/me") return fulfill(activeUser);
      if (url.pathname === "/api/v1/tenants/public/branding") {
        return fulfill({
          systemName: "合成 HR 技术验证",
          shortName: "合成园区",
          logoAlt: "合成园区",
          logoFileId: null,
          logoUrl: null,
          configured: true,
        });
      }
      if ([
        "/api/v1/hr/performance-v2/cycles",
        "/api/v1/hr/performance-v2/reviews",
      ].includes(url.pathname)) return fulfill([]);
      const parameters = Object.fromEntries(url.searchParams.entries());
      if (url.pathname.endsWith("/assessment-value")) {
        capturedQueries.push({ family: "assessmentValue", parameters });
        const page = Number(url.searchParams.get("page"));
        const item = page === 2
          ? fixture.rows.assessmentValuePageTwo
          : fixture.rows.assessmentValue;
        return fulfill(paginated([item], page, 21));
      }
      if (url.pathname.endsWith("/assessment-value-of-person")) {
        capturedQueries.push({ family: "assessmentValueOfPerson", parameters });
        personRequests += 1;
        if (scenario === "desktop" && personRequests === 1) {
          return fulfill(null, 503, "synthetic unavailable");
        }
        return fulfill(paginated([fixture.rows.assessmentValueOfPerson]));
      }
      if (url.pathname.endsWith("/web-ass-query")) {
        capturedQueries.push({ family: "webAssQuery", parameters });
        webRequests += 1;
        if (scenario === "desktop" && webRequests === 1) return fulfill(paginated([]));
        return fulfill(paginated([fixture.rows.webAssQuery]));
      }
      if (url.pathname.includes("/performance-legacy/")) return fulfill(paginated([]));
      return fulfill([]);
    });

    const page = browserContext.pages()[0] ?? await browserContext.newPage();
    page.on("pageerror", error => runtimeErrors.push(error.message));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${baseUrl}/hr/performance`, { waitUntil: "domcontentloaded" });
    await assertVisible(page.getByRole("heading", { name: "绩效工作台" }));
    await waitForPanelHydration(page);
    for (const id of Object.values(panelIds)) await assertVisible(panel(page, id));
    await assertVisible(panel(page, panelIds.assessmentValue).getByText("尚未查询。部门条件按安全的文字前缀匹配。"));
    await assertVisible(panel(page, panelIds.assessmentValueOfPerson).getByText("尚未查询。人员编码只作精确匹配，不能作为授权边界。"));
    await assertVisible(panel(page, panelIds.webAssQuery).getByText("尚未查询。所有条件只能收窄服务端确定的园区、团队或本人范围。"));
    await submitAssessmentValue(page);
    await submitAssessmentValueOfPerson(page, true);
    await submitWebAssQuery(page, true);
    const desktopLayout = await assertNoOverflow(page, Object.values(panelIds));
    assert.equal(await page.locator("table").count(), 0);
    for (const measurement of desktopLayout.panels) {
      assert.equal(measurement.cardGridColumns.trim().split(/\s+/u).length, 2);
    }
    summary.screenshots.push(...await screenshotPanels(page, "desktop-1440"));
    summary.scenarios.push({
      id: "desktop_data_empty_error_retry_pagination",
      status: "PASS",
      viewport: { width: 1440, height: 1000 },
      document: {
        clientWidth: desktopLayout.documentClientWidth,
        scrollWidth: desktopLayout.documentScrollWidth,
      },
    });

    scenario = "mobile";
    personRequests = 0;
    webRequests = 0;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseUrl}/hr/performance`, { waitUntil: "domcontentloaded" });
    await assertVisible(page.getByRole("heading", { name: "绩效工作台" }));
    await waitForPanelHydration(page);
    await submitAssessmentValue(page);
    await submitAssessmentValueOfPerson(page, false);
    await submitWebAssQuery(page, false);
    await assertVisible(page.locator(".app-header"));
    await assertVisible(
      panel(page, panelIds.assessmentValue).getByRole("button", { name: "上一页" }),
    );
    const mobileLayout = await assertNoOverflow(page, Object.values(panelIds));
    assert.equal(await page.locator("table").count(), 0);
    for (const measurement of mobileLayout.panels) {
      assert.equal(measurement.cardGridColumns.trim().split(/\s+/u).length, 1);
      assert.equal(measurement.gridColumns.trim().split(/\s+/u).length, 1);
    }
    summary.screenshots.push(...await screenshotPanels(page, "phone-390"));
    summary.scenarios.push({
      id: "phone_cards_and_single_column_fields",
      status: "PASS",
      viewport: { width: 390, height: 844 },
      document: {
        clientWidth: mobileLayout.documentClientWidth,
        scrollWidth: mobileLayout.documentScrollWidth,
      },
      stickyHeaderVisibleDuringInteraction: true,
      paginationReachedWithStickyHeader: true,
    });

    scenario = "permission-hidden";
    const queryCountsBeforePermission = Object.fromEntries(
      Object.keys(panelIds).map(family => [
        family,
        capturedQueries.filter(item => item.family === family).length,
      ]),
    );
    activeUser = withoutPerformanceRead(fixture.session.authorizedUser);
    await page.evaluate(({ token, user }) => {
      localStorage.setItem("jinhu_access_token", token);
      localStorage.setItem("jinhu_auth_user", JSON.stringify(user));
    }, { token: fixture.session.token, user: activeUser });
    await page.goto(`${baseUrl}/hr/performance`, { waitUntil: "domcontentloaded" });
    await assertVisible(page.getByRole("heading", { name: "绩效工作台" }));
    await waitForReactHydration(page);
    await page.waitForFunction(headings => headings.every(heading =>
      !Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6"))
        .some(element => element.textContent?.trim() === heading),
    ), ["部门历史绩效评分", "个人历史绩效评分", "绩效区间查询"], { timeout: 15_000 });
    for (const heading of ["部门历史绩效评分", "个人历史绩效评分", "绩效区间查询"]) {
      assert.equal(await page.getByRole("heading", { name: heading, exact: true }).count(), 0);
    }
    assert.deepEqual(
      Object.fromEntries(
        Object.keys(panelIds).map(family => [
          family,
          capturedQueries.filter(item => item.family === family).length,
        ]),
      ),
      queryCountsBeforePermission,
    );
    summary.scenarios.push({
      id: "permission_hidden_without_result_read_scope",
      status: "PASS",
      viewport: { width: 390, height: 844 },
    });

    assertQueryContracts(capturedQueries);
    assert.deepEqual(runtimeErrors, []);
    assert.deepEqual(externalRequests, []);
    summary.scenarios.push({
      id: "query_parameters_and_network_isolation",
      status: "PASS",
      queryFamilies: 3,
      externalRequestAttempts: externalRequests.length,
      runtimeErrors: runtimeErrors.length,
    });
    scenariosComplete = true;
  } finally {
    let cleanupError;
    try {
      if (browserContext) await browserContext.close();
    } catch (error) {
      cleanupError = error;
    } finally {
      try {
        rmSync(profileRoot, { recursive: true, force: true });
      } catch (error) {
        cleanupError ??= error;
      } finally {
        summary.isolation.profilePurged = !existsSync(profileRoot);
        try {
          await stopWeb(webProcess);
        } catch (error) {
          cleanupError ??= error;
        } finally {
          summary.server.stopped = webProcess.exitCode !== null || webProcess.signalCode !== null;
          summary.status = scenariosComplete
            && cleanupError === undefined
            && summary.isolation.profilePurged
            && summary.server.stopped
            ? "PASS"
            : "FAIL";
          const summaryPath = resolve(evidenceRoot, "synthetic-browser-summary.json");
          mkdirSync(dirname(summaryPath), { recursive: true, mode: 0o700 });
          writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600 });
          process.stdout.write(`${JSON.stringify({ ...summary, summaryPath }, null, 2)}\n`);
        }
      }
    }
    if (cleanupError !== undefined) throw cleanupError;
  }
}

await main();
