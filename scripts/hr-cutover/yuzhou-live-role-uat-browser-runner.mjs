/* global Buffer, WebSocket, setTimeout */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { browserMatrixHash, validateYuzhouLiveRoleUatBrowserMatrix } from "./yuzhou-live-role-uat-browser-matrix-lib.mjs";
import { taskCardHash, validateYuzhouLiveRoleUatTaskCard } from "./yuzhou-live-role-uat-task-card-lib.mjs";

export class YuzhouLiveRoleUatBrowserRunnerError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "YuzhouLiveRoleUatBrowserRunnerError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new YuzhouLiveRoleUatBrowserRunnerError(code, detail); };
const sleep = ms => new Promise(resolvePromise => setTimeout(resolvePromise, ms));
const sha256 = value => createHash("sha256").update(value).digest("hex");
const LOOPBACK = /^http:\/\/(?:127\.0\.0\.1|localhost):[0-9]{4,5}$/u;
const CHROME_DEFAULT = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

class CdpClient {
  #socket;
  #nextId = 1;
  #pending = new Map();
  #listeners = new Set();

  static async connect(url) {
    const client = new CdpClient(url);
    await client.ready();
    return client;
  }

  constructor(url) {
    this.#socket = new WebSocket(url);
    this.#socket.addEventListener("message", event => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const pending = this.#pending.get(message.id);
        if (!pending) return;
        this.#pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result ?? {});
        return;
      }
      for (const listener of this.#listeners) listener(message);
    });
    this.#socket.addEventListener("close", () => {
      for (const pending of this.#pending.values()) pending.reject(new Error("CDP socket closed"));
      this.#pending.clear();
    });
  }

  ready() {
    if (this.#socket.readyState === WebSocket.OPEN) return Promise.resolve();
    return new Promise((resolvePromise, reject) => {
      this.#socket.addEventListener("open", resolvePromise, { once: true });
      this.#socket.addEventListener("error", reject, { once: true });
    });
  }

  on(listener) { this.#listeners.add(listener); return () => this.#listeners.delete(listener); }

  send(method, params = {}, sessionId) {
    const id = this.#nextId++;
    return new Promise((resolvePromise, reject) => {
      this.#pending.set(id, { resolve: resolvePromise, reject });
      this.#socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  close() { this.#socket.close(); }
}

async function waitForFile(path, child) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (existsSync(path)) return;
    if (child.exitCode !== null) fail("YUZHOU_UAT_BROWSER_LAUNCH_FAILED", String(child.exitCode));
    await sleep(50);
  }
  fail("YUZHOU_UAT_BROWSER_LAUNCH_TIMEOUT", basename(path));
}

async function evaluate(cdp, sessionId, expression) {
  const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (result.exceptionDetails) fail("YUZHOU_UAT_BROWSER_EVALUATION_FAILED", "runtime expression");
  return result.result?.value;
}

async function poll(cdp, sessionId, expression, code, detail, attempts = 200) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(cdp, sessionId, expression)) return;
    await sleep(100);
  }
  fail(code, detail);
}

function writePrivateBinary(path, bytes) {
  writeFileSync(path, bytes, { mode: 0o600, flag: "wx" });
  chmodSync(path, 0o600);
}

export function validateYuzhouBrowserObservation(observation, check, viewport, browserAssertions) {
  if (observation?.legacyId !== check.legacyId || observation?.roleType !== check.roleType || observation?.actor !== check.actor || observation?.route !== check.route) fail("YUZHOU_UAT_BROWSER_OBSERVATION_BINDING_INVALID", `${check.legacyId}:${check.roleType}:${viewport.id}`);
  if (observation.viewportId !== viewport.id || observation.width !== viewport.width || observation.height !== viewport.height || observation.mobile !== viewport.mobile) fail("YUZHOU_UAT_BROWSER_OBSERVATION_VIEWPORT_INVALID", `${check.legacyId}:${check.roleType}:${viewport.id}`);
  if (observation.status !== "PASS" || !Number.isInteger(observation.clientWidth) || !Number.isInteger(observation.scrollWidth) || observation.clientWidth > viewport.width || observation.scrollWidth > observation.clientWidth) fail("YUZHOU_UAT_BROWSER_OBSERVATION_LAYOUT_FAILED", `${check.legacyId}:${check.roleType}:${viewport.id}`);
  if (JSON.stringify(observation.assertions) !== JSON.stringify(browserAssertions) || !/^[0-9a-f]{64}$/u.test(observation.screenshotSha256 ?? "")) fail("YUZHOU_UAT_BROWSER_OBSERVATION_EVIDENCE_INVALID", `${check.legacyId}:${check.roleType}:${viewport.id}`);
  return observation;
}

export async function runYuzhouLiveRoleUatBrowserMatrix(options) {
  const { taskCard, browserMatrix, webBase, credentials, evidenceRoot, profileRoot, sensitiveNeedles = [], onProcess = () => {}, onEvidenceFile = () => {} } = options;
  validateYuzhouLiveRoleUatTaskCard(taskCard);
  validateYuzhouLiveRoleUatBrowserMatrix(browserMatrix, taskCard);
  if (!LOOPBACK.test(webBase)) fail("YUZHOU_UAT_BROWSER_ORIGIN_UNSAFE", webBase);
  if (!resolve(evidenceRoot).includes("jinhu_hr_migration_lab_full_") || !resolve(profileRoot).includes("jinhu_hr_migration_lab_full_")) fail("YUZHOU_UAT_BROWSER_PATH_UNSAFE", "lab namespace required");
  const requiredActors = ["hr_reviewer", "manager", "employee"];
  if (JSON.stringify(Object.keys(credentials).sort()) !== JSON.stringify([...requiredActors].sort())) fail("YUZHOU_UAT_BROWSER_CREDENTIALS_INVALID", "exact actors required");
  for (const actor of requiredActors) if (!credentials[actor]?.username || !credentials[actor]?.password) fail("YUZHOU_UAT_BROWSER_CREDENTIALS_INVALID", actor);
  if (sensitiveNeedles.some(value => typeof value !== "string" || value.length < 4)) fail("YUZHOU_UAT_BROWSER_SENSITIVE_NEEDLE_INVALID", "runtime markers");

  const executable = options.chromeExecutable ?? CHROME_DEFAULT;
  if (!existsSync(executable)) fail("YUZHOU_UAT_BROWSER_EXECUTABLE_MISSING", executable);
  mkdirSync(profileRoot, { recursive: true, mode: 0o700 });
  chmodSync(profileRoot, 0o700);
  const chrome = spawn(executable, [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0", `--user-data-dir=${profileRoot}`, "about:blank"
  ], { stdio: "ignore" });
  onProcess(chrome.pid);
  let cdp;
  try {
    const portFile = resolve(profileRoot, "DevToolsActivePort");
    await waitForFile(portFile, chrome);
    const [port, browserPath] = readFileSync(portFile, "utf8").trim().split("\n");
    cdp = await CdpClient.connect(`ws://127.0.0.1:${port}${browserPath}`);
    const observations = [], screenshotCache = new Map(), screenshotsByHash = new Map();
    for (const viewport of taskCard.viewports) {
      for (const actor of requiredActors) {
        const actorChecks = browserMatrix.checks.filter(check => check.actor === actor);
        const { browserContextId } = await cdp.send("Target.createBrowserContext", { disposeOnDetach: true });
        const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank", browserContextId });
        const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
        const runtimeErrors = [];
        const off = cdp.on(message => {
          if (message.sessionId !== sessionId) return;
          if (message.method === "Runtime.exceptionThrown" || (message.method === "Log.entryAdded" && message.params?.entry?.level === "error")) runtimeErrors.push(message.method);
        });
        try {
          await Promise.all([
            cdp.send("Page.enable", {}, sessionId), cdp.send("Runtime.enable", {}, sessionId),
            cdp.send("Log.enable", {}, sessionId), cdp.send("Network.enable", {}, sessionId)
          ]);
          await cdp.send("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.mobile }, sessionId);
          await cdp.send("Page.navigate", { url: `${webBase}/login` }, sessionId);
          await poll(cdp, sessionId, "document.readyState === 'complete' && !!document.querySelector('input[autocomplete=username]')", "YUZHOU_UAT_BROWSER_LOGIN_FORM_MISSING", `${actor}:${viewport.id}`);
          const login = credentials[actor];
          await evaluate(cdp, sessionId, `(() => { const set=(element,value)=>{const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(element,value);element.dispatchEvent(new Event('input',{bubbles:true}));};set(document.querySelector('input[autocomplete=username]'),${JSON.stringify(login.username)});set(document.querySelector('input[autocomplete=current-password]'),${JSON.stringify(login.password)});document.querySelector('button[type=submit]').click();return true;})()`);
          await poll(cdp, sessionId, "location.pathname !== '/login' && !!localStorage.getItem('jinhu_access_token')", "YUZHOU_UAT_BROWSER_LOGIN_FAILED", `${actor}:${viewport.id}`);
          for (const check of actorChecks) {
            runtimeErrors.length = 0;
            await cdp.send("Page.navigate", { url: `${webBase}${check.route}` }, sessionId);
            const visibleJson = JSON.stringify(check.visibleTexts);
            await poll(cdp, sessionId, `(() => { const t=document.body?.innerText??''; return document.readyState==='complete' && ${visibleJson}.every(value=>t.includes(value)); })()`, "YUZHOU_UAT_BROWSER_VISIBLE_TEXT_MISSING", `${check.legacyId}:${check.roleType}:${viewport.id}`);
            const result = await evaluate(cdp, sessionId, `(() => { const text=document.body?.innerText??''; const clientWidth=document.documentElement.clientWidth; const scrollWidth=Math.max(document.documentElement.scrollWidth,document.body?.scrollWidth??0); return { path:location.pathname,text,clientWidth,scrollWidth,alerts:[...document.querySelectorAll('[role=alert]')].map(node=>node.textContent??'').filter(Boolean) }; })()`);
            if (result.path !== check.route || runtimeErrors.length || result.alerts.length) fail("YUZHOU_UAT_BROWSER_RUNTIME_SURFACE", `${check.legacyId}:${check.roleType}:${viewport.id}`);
            if (check.forbiddenTexts.some(text => result.text.includes(text))) fail("YUZHOU_UAT_BROWSER_FORBIDDEN_ACTION_VISIBLE", `${check.legacyId}:${check.roleType}:${viewport.id}`);
            if (check.masked && sensitiveNeedles.some(text => result.text.includes(text))) fail("YUZHOU_UAT_BROWSER_SENSITIVE_VALUE_VISIBLE", `${check.legacyId}:${check.roleType}:${viewport.id}`);
            const screenshotKey = `${check.actor}:${check.route}:${viewport.id}`;
            let screenshot = screenshotCache.get(screenshotKey);
            if (!screenshot) {
              const shot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true }, sessionId);
              const bytes = Buffer.from(shot.data, "base64"), digest = sha256(bytes);
              screenshot = screenshotsByHash.get(digest);
              if (!screenshot) {
                const filename = `browser-${sha256(screenshotKey).slice(0, 16)}.png`, path = resolve(evidenceRoot, filename);
                writePrivateBinary(path, bytes);
                onEvidenceFile(path);
                screenshot = { relativePath: filename, sha256: digest };
                screenshotsByHash.set(digest, screenshot);
              }
              screenshotCache.set(screenshotKey, screenshot);
            }
            observations.push(validateYuzhouBrowserObservation({
              legacyId: check.legacyId, roleType: check.roleType, actor: check.actor, route: check.route,
              viewportId: viewport.id, status: "PASS", width: viewport.width, height: viewport.height,
              mobile: viewport.mobile, clientWidth: result.clientWidth, scrollWidth: result.scrollWidth,
              assertions: [...taskCard.browserAssertions], screenshotSha256: screenshot.sha256
            }, check, viewport, taskCard.browserAssertions));
          }
          await evaluate(cdp, sessionId, "localStorage.clear(); sessionStorage.clear(); true");
          await cdp.send("Network.clearBrowserCookies", {}, sessionId);
          await cdp.send("Page.navigate", { url: `${webBase}/login` }, sessionId);
          const cleanupNeedles = JSON.stringify(sensitiveNeedles);
          await poll(cdp, sessionId, `(() => { const t=document.body?.innerText??''; return location.pathname==='/login' && localStorage.length===0 && sessionStorage.length===0 && !${cleanupNeedles}.some(value=>t.includes(value)); })()`, "YUZHOU_UAT_BROWSER_SESSION_CLEANUP_FAILED", `${actor}:${viewport.id}`);
        } finally {
          off();
          await cdp.send("Target.disposeBrowserContext", { browserContextId }).catch(() => {});
        }
      }
    }
    const expectedCells = browserMatrix.checks.length * taskCard.viewports.length;
    if (observations.length !== expectedCells) fail("YUZHOU_UAT_BROWSER_COVERAGE_INCOMPLETE", `${observations.length}/${expectedCells}`);
    return {
      formatVersion: 1, contractKind: "yuzhou_hr_live_role_uat_browser_observations", status: "PASS",
      taskCardSha256: taskCardHash(taskCard), browserMatrixSha256: browserMatrixHash(browserMatrix),
      observedCells: observations.length, observations, screenshots: [...screenshotsByHash.values()], p0P1Count: 0, sensitiveScan: "PASS",
      humanAttestation: "HOLD", productionImport: "HOLD"
    };
  } finally {
    cdp?.close();
    if (chrome.exitCode === null) chrome.kill("SIGTERM");
    for (let attempt = 0; attempt < 50 && chrome.exitCode === null; attempt += 1) await sleep(50);
    if (chrome.exitCode === null) chrome.kill("SIGKILL");
    onProcess(null);
    rmSync(profileRoot, { recursive: true, force: true });
  }
}
