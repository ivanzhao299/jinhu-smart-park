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
const SHA40 = /^[0-9a-f]{40}$/u;
const SHA64 = /^[0-9a-f]{64}$/u;
const SCOPE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u;
const LOOPBACK = /^http:\/\/(?:127\.0\.0\.1|localhost):[0-9]{4,5}$/u;
const CHROME_DEFAULT = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BOUND_ACTORS = ["hr_reviewer", "manager", "employee"];
const LOGIN_FORM_READY = `(() => {
  if (document.readyState !== 'complete') return false;
  const username = document.querySelector('input[autocomplete=username]');
  const password = document.querySelector('input[autocomplete=current-password]');
  const submit = document.querySelector('button[type=submit]');
  if (!username || !password || !submit) return false;
  return Object.keys(submit).some(key => key.startsWith('__reactProps$'));
})()`;

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

export function missingVisibleTexts(pageText, visibleTexts) {
  return visibleTexts.filter(value => !pageText.includes(value));
}

export function observeSameOriginApiNetworkEvent(message, webBase, requests, failures) {
  if (message.method === "Network.requestWillBeSent" && ["Fetch", "XHR"].includes(message.params?.type) && message.params.request?.url?.startsWith(`${webBase}/api/`)) requests.set(message.params.requestId, message.params.request.url);
  if (message.method === "Network.responseReceived" && requests.has(message.params?.requestId) && message.params.response?.status >= 400) {
    failures.push(`http:${message.params.response.status}`);
    requests.delete(message.params.requestId);
  }
  if (message.method === "Network.loadingFailed" && requests.has(message.params?.requestId)) {
    if (message.params?.canceled !== true) failures.push("loading_failed");
    requests.delete(message.params.requestId);
  }
  if (message.method === "Network.loadingFinished" && requests.has(message.params?.requestId)) requests.delete(message.params.requestId);
}

async function pollVisibleTexts(cdp, sessionId, check, viewport, attempts = 200) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const state = await evaluate(cdp, sessionId, `(() => { const text=document.body?.innerText??''; return { ready:document.readyState==='complete', path:location.pathname, text }; })()`);
    const missing = missingVisibleTexts(state.text, check.visibleTexts);
    if (state.ready && missing.length === 0) return;
    if (attempt === attempts - 1) {
      fail("YUZHOU_UAT_BROWSER_VISIBLE_TEXT_MISSING", `${check.legacyId}:${check.roleType}:${viewport.id}:path=${state.path}:missingCount=${missing.length}`);
    }
    await sleep(100);
  }
}

function writePrivateBinary(path, bytes) {
  writeFileSync(path, bytes, { mode: 0o600, flag: "wx" });
  chmodSync(path, 0o600);
}

export function validateYuzhouBrowserObservation(observation, check, viewport, browserAssertions) {
  if (observation?.legacyId !== check.legacyId || observation?.roleType !== check.roleType || observation?.actor !== check.actor || observation?.route !== check.route) fail("YUZHOU_UAT_BROWSER_OBSERVATION_BINDING_INVALID", `${check.legacyId}:${check.roleType}:${viewport.id}`);
  if (observation.renderedPath !== (check.expectedPath ?? check.route)) fail("YUZHOU_UAT_BROWSER_OBSERVATION_PATH_INVALID", `${check.legacyId}:${check.roleType}:${viewport.id}`);
  if (observation.viewportId !== viewport.id || observation.width !== viewport.width || observation.height !== viewport.height || observation.mobile !== viewport.mobile) fail("YUZHOU_UAT_BROWSER_OBSERVATION_VIEWPORT_INVALID", `${check.legacyId}:${check.roleType}:${viewport.id}`);
  if (observation.status !== "PASS" || !Number.isInteger(observation.clientWidth) || !Number.isInteger(observation.scrollWidth) || observation.clientWidth > viewport.width || observation.scrollWidth > observation.clientWidth || observation.networkFailureCount !== 0 || !Number.isInteger(observation.pendingRequestCount) || observation.pendingRequestCount < 0) fail("YUZHOU_UAT_BROWSER_OBSERVATION_LAYOUT_FAILED", `${check.legacyId}:${check.roleType}:${viewport.id}`);
  if (JSON.stringify(observation.assertions) !== JSON.stringify(browserAssertions)
    || !/^yz(?:full|core)-[a-zA-Z0-9._-]+-r[AB]$/u.test(observation.runId ?? "")
    || !["A", "B"].includes(observation.rehearsal)
    || !observation.runId.endsWith(`-r${observation.rehearsal}`)
    || !SHA40.test(observation.triple?.codeSha ?? "")
    || !SHA64.test(observation.triple?.sourceSnapshotHash ?? "")
    || !SHA64.test(observation.triple?.mappingContractHash ?? "")
    || !SHA64.test(observation.actorSubjectHash ?? "")
    || !SHA64.test(observation.screenshotSha256 ?? "")
    || !SHA64.test(observation.domAssertionSha256 ?? "")
    || !SHA64.test(observation.cellEvidenceSha256 ?? "")) fail("YUZHOU_UAT_BROWSER_OBSERVATION_EVIDENCE_INVALID", `${check.legacyId}:${check.roleType}:${viewport.id}`);
  const cell = {
    runId: observation.runId, rehearsal: observation.rehearsal, triple: observation.triple,
    legacyId: observation.legacyId, roleType: observation.roleType, actor: observation.actor,
    actorSubjectHash: observation.actorSubjectHash, route: observation.route, renderedPath: observation.renderedPath,
    viewportId: observation.viewportId, width: observation.width, height: observation.height, mobile: observation.mobile,
    screenshotSha256: observation.screenshotSha256, domAssertionSha256: observation.domAssertionSha256, networkFailureCount: observation.networkFailureCount, pendingRequestCount: observation.pendingRequestCount
  };
  if (observation.cellEvidenceSha256 !== sha256(JSON.stringify(cell))) fail("YUZHOU_UAT_BROWSER_OBSERVATION_CELL_HASH_INVALID", `${check.legacyId}:${check.roleType}:${viewport.id}`);
  return observation;
}

export function technicalUatActorSubjectHash(identity) {
  if (!/^[0-9a-f-]{36}$/iu.test(identity?.id ?? "") || typeof identity?.username !== "string" || identity.username.length === 0
    || !SCOPE_ID.test(identity?.tenantId ?? "") || !SCOPE_ID.test(identity?.parkId ?? "")
    || typeof identity?.roleCode !== "string" || identity.roleCode.length === 0) fail("TECHNICAL_UAT_BROWSER_ACTORS_INVALID", "verified /users/me identity required");
  return sha256(JSON.stringify({ id: identity.id, username: identity.username, tenantId: identity.tenantId, parkId: identity.parkId, roleCode: identity.roleCode }));
}

export function buildTechnicalUatBrowserBinding(config, actorIdentities) {
  if (JSON.stringify(Object.keys(actorIdentities ?? {}).sort()) !== JSON.stringify([...BOUND_ACTORS].sort())) fail("TECHNICAL_UAT_BROWSER_ACTORS_INVALID", "exact browser identities required");
  const actorSubjectHashes=Object.fromEntries(BOUND_ACTORS.map(actor=>[actor,technicalUatActorSubjectHash(actorIdentities[actor])]));
  if (new Set(Object.values(actorSubjectHashes)).size !== BOUND_ACTORS.length) fail("TECHNICAL_UAT_BROWSER_ACTORS_INVALID", "three distinct verified subjects required");
  return {
    rehearsal: config.rehearsal,
    runId: config.runId,
    triple: { ...config.triple },
    actorSubjectHashes
  };
}

export function assertTechnicalUatBrowserResultBinding(result, binding) {
  if (result?.status !== "PASS" || result.humanAttestation !== "HOLD" || result.productionImport !== "HOLD") {
    fail("TECHNICAL_UAT_BROWSER_RESULT_UNSAFE", "technical PASS requires detached human and production HOLD");
  }
  if (result.runId !== binding.runId || result.rehearsal !== binding.rehearsal
    || JSON.stringify(result.triple) !== JSON.stringify(binding.triple)) {
    fail("TECHNICAL_UAT_BROWSER_RESULT_BINDING_INVALID", "runId/rehearsal/C-S-M mismatch");
  }
  if (!Array.isArray(result.observations) || result.observations.length === 0
    || result.observations.some(observation => observation.runId !== binding.runId
      || observation.rehearsal !== binding.rehearsal
      || JSON.stringify(observation.triple) !== JSON.stringify(binding.triple)
      || !BOUND_ACTORS.includes(observation.actor)
      || observation.actorSubjectHash !== binding.actorSubjectHashes[observation.actor])) {
    fail("TECHNICAL_UAT_BROWSER_RESULT_CELL_UNBOUND", "every browser cell must retain its immutable actor binding");
  }
  if (!Array.isArray(result.sessionCleanupProofs) || result.sessionCleanupProofs.length !== BOUND_ACTORS.length * 2
    || new Set(result.sessionCleanupProofs.map(proof => `${proof.actor}:${proof.viewportId}`)).size !== result.sessionCleanupProofs.length
    || result.sessionCleanupProofs.some(proof => proof.runId !== binding.runId || proof.rehearsal !== binding.rehearsal
      || JSON.stringify(proof.triple) !== JSON.stringify(binding.triple) || !BOUND_ACTORS.includes(proof.actor)
      || proof.actorSubjectHash !== binding.actorSubjectHashes[proof.actor] || proof.status !== "PASS"
      || proof.localStorageEntries !== 0 || proof.sessionStorageEntries !== 0 || proof.cookieEntries !== 0 || proof.sensitiveDomMatches !== 0
      || proof.proofSha256 !== sha256(JSON.stringify({ runId: proof.runId, rehearsal: proof.rehearsal, triple: proof.triple, actor: proof.actor, actorSubjectHash: proof.actorSubjectHash, viewportId: proof.viewportId, localStorageEntries: proof.localStorageEntries, sessionStorageEntries: proof.sessionStorageEntries, cookieEntries: proof.cookieEntries, sensitiveDomMatches: proof.sensitiveDomMatches, status: proof.status })))) {
    fail("TECHNICAL_UAT_BROWSER_SESSION_PROOF_INVALID", "six actor/viewport cleanup proofs required");
  }
  if (result.sessionCleanupProofsSha256 !== sha256(JSON.stringify(result.sessionCleanupProofs))) fail("TECHNICAL_UAT_BROWSER_SESSION_PROOF_INVALID", "cleanup proof aggregate hash");
  return result;
}

function validateBinding(binding) {
  if (!binding || !["A", "B"].includes(binding.rehearsal)
    || !/^yz(?:full|core)-[a-zA-Z0-9._-]+-r[AB]$/u.test(binding.runId ?? "")
    || !binding.runId.endsWith(`-r${binding.rehearsal}`)
    || !SHA40.test(binding.triple?.codeSha ?? "")
    || !SHA64.test(binding.triple?.sourceSnapshotHash ?? "")
    || !SHA64.test(binding.triple?.mappingContractHash ?? "")) fail("YUZHOU_UAT_BROWSER_BINDING_REQUIRED", "runId/rehearsal/C/S/M");
  const actors = BOUND_ACTORS;
  if (JSON.stringify(Object.keys(binding.actorSubjectHashes ?? {}).sort()) !== JSON.stringify([...actors].sort())
    || actors.some(actor => !SHA64.test(binding.actorSubjectHashes[actor]))
    || new Set(Object.values(binding.actorSubjectHashes)).size !== actors.length) fail("YUZHOU_UAT_BROWSER_ACTOR_BINDING_INVALID", "isolated actor hashes required");
}

export async function runYuzhouLiveRoleUatBrowserMatrix(options) {
  const { taskCard, browserMatrix, webBase, credentials, evidenceRoot, profileRoot, binding, sensitiveNeedles = [], onProcess = () => {}, onEvidenceFile = () => {} } = options;
  validateYuzhouLiveRoleUatTaskCard(taskCard);
  validateYuzhouLiveRoleUatBrowserMatrix(browserMatrix, taskCard);
  validateBinding(binding);
  if (!LOOPBACK.test(webBase)) fail("YUZHOU_UAT_BROWSER_ORIGIN_UNSAFE", webBase);
  if (!isYuzhouLiveRoleUatLabPath(evidenceRoot) || !isYuzhouLiveRoleUatLabPath(profileRoot)) fail("YUZHOU_UAT_BROWSER_PATH_UNSAFE", "lab namespace required");
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
    "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
    "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0", `--user-data-dir=${profileRoot}`, "about:blank"
  ], { stdio: "ignore" });
  onProcess(chrome.pid);
  let cdp;
  try {
    const portFile = resolve(profileRoot, "DevToolsActivePort");
    await waitForFile(portFile, chrome);
    const [port, browserPath] = readFileSync(portFile, "utf8").trim().split("\n");
    cdp = await CdpClient.connect(`ws://127.0.0.1:${port}${browserPath}`);
    const observations = [], sessionCleanupProofs = [], screenshotCache = new Map(), screenshotsByHash = new Map();
    const captureSanitizedScreenshot = async (sessionId, screenshotKey) => {
      await evaluate(cdp, sessionId, `(() => { const needles=${JSON.stringify(sensitiveNeedles)};const redact=value=>{let next=value??'';for(const needle of needles)next=next.split(needle).join('[REDACTED]');return next;};for(const input of document.querySelectorAll('input,textarea')){input.value='';input.setAttribute('value','');}for(const editable of document.querySelectorAll('[contenteditable]'))editable.textContent='';for(const media of document.querySelectorAll('img,video,canvas'))media.style.visibility='hidden';for(const element of document.querySelectorAll('*')){element.style.backgroundImage='none';for(const attribute of [...element.getAttributeNames()].filter(name=>['placeholder','title','aria-label','alt','href','src','action','formaction'].includes(name)||name.startsWith('data-')))element.setAttribute(attribute,redact(element.getAttribute(attribute)));}const walker=document.createTreeWalker(document.body??document.documentElement,NodeFilter.SHOW_TEXT);let node;while((node=walker.nextNode()))node.nodeValue=redact(node.nodeValue);return true;})()`);
      const shot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true }, sessionId);
      const bytes = Buffer.from(shot.data, "base64"), digest = sha256(bytes);
      let screenshot = screenshotsByHash.get(digest);
      if (!screenshot) {
        const filename = `browser-${sha256(screenshotKey).slice(0, 16)}.png`, path = resolve(evidenceRoot, filename);
        writePrivateBinary(path, bytes);
        onEvidenceFile(path);
        screenshot = { relativePath: filename, sha256: digest };
        screenshotsByHash.set(digest, screenshot);
      }
      screenshotCache.set(screenshotKey, screenshot);
      return screenshot;
    };
    for (const viewport of taskCard.viewports) {
      for (const actor of requiredActors) {
        const actorChecks = browserMatrix.checks.filter(check => check.actor === actor);
        const { browserContextId } = await cdp.send("Target.createBrowserContext", { disposeOnDetach: true });
        const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank", browserContextId });
        await cdp.send("Target.activateTarget", { targetId });
        const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
        const runtimeErrors = [], networkFailures = [], sameOriginRequests = new Map();
        const off = cdp.on(message => {
          if (message.sessionId !== sessionId) return;
          if (message.method === "Runtime.exceptionThrown" || (message.method === "Log.entryAdded" && message.params?.entry?.level === "error")) runtimeErrors.push(message.method);
          observeSameOriginApiNetworkEvent(message,webBase,sameOriginRequests,networkFailures);
        });
        try {
          await Promise.all([
            cdp.send("Page.enable", {}, sessionId), cdp.send("Runtime.enable", {}, sessionId),
            cdp.send("Log.enable", {}, sessionId), cdp.send("Network.enable", {}, sessionId)
          ]);
          await cdp.send("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.mobile }, sessionId);
          await cdp.send("Page.navigate", { url: `${webBase}/login` }, sessionId);
          // A warm Next.js document can expose the server-rendered form before React has
          // attached the delegated submit handler. Waiting for the React-owned props on
          // the submit control prevents a no-op click in later isolated browser contexts.
          await poll(cdp, sessionId, LOGIN_FORM_READY, "YUZHOU_UAT_BROWSER_LOGIN_FORM_MISSING", `${actor}:${viewport.id}`);
          const login = credentials[actor];
          await evaluate(cdp, sessionId, `(() => { const set=(element,value)=>{const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(element,value);element.dispatchEvent(new Event('input',{bubbles:true}));};set(document.querySelector('input[autocomplete=username]'),${JSON.stringify(login.username)});set(document.querySelector('input[autocomplete=current-password]'),${JSON.stringify(login.password)});document.querySelector('button[type=submit]').click();return true;})()`);
          await poll(cdp, sessionId, "location.pathname !== '/login' && !!localStorage.getItem('jinhu_access_token')", "YUZHOU_UAT_BROWSER_LOGIN_FAILED", `${actor}:${viewport.id}`);
          for (const check of actorChecks) {
            try {
            runtimeErrors.length = 0;
            networkFailures.length = 0;
            sameOriginRequests.clear();
            await cdp.send("Page.navigate", { url: `${webBase}${check.route}` }, sessionId);
            await pollVisibleTexts(cdp, sessionId, check, viewport);
            // A static heading can render before a client-side same-origin API request starts.
            // Isolate the route request set and allow its initial async data fetch to settle before PASS.
            await sleep(200);
            for(let attempt=0;attempt<250&&sameOriginRequests.size>0;attempt+=1)await sleep(20);
            const pendingRequestCount=sameOriginRequests.size;
            const result = await evaluate(cdp, sessionId, `(() => { const visible=node=>{let e=node.nodeType===Node.TEXT_NODE?node.parentElement:node;if(!e)return false;const leaf=e;for(;e;e=e.parentElement){const s=getComputedStyle(e);if(e.hidden||e.inert||e.getAttribute('aria-hidden')==='true'||s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0)return false;}return leaf.getClientRects().length>0;};const textNodes=[];const walker=document.createTreeWalker(document.body??document.documentElement,NodeFilter.SHOW_TEXT,{acceptNode:node=>visible(node)&&node.nodeValue?.trim()?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT});let node;while((node=walker.nextNode()))textNodes.push(node.nodeValue);const visibleText=textNodes.join('');const visibleTexts=${JSON.stringify(check.visibleTexts)}.map(value=>({value,matched:visibleText.includes(value)}));const forbiddenTexts=${JSON.stringify(check.forbiddenTexts)}.map(value=>({value,matched:visibleText.includes(value)}));const clientWidth=document.documentElement.clientWidth;const scrollWidth=Math.max(document.documentElement.scrollWidth,document.body?.scrollWidth??0);return {path:location.pathname,visibleText,clientWidth,scrollWidth,alerts:[...document.querySelectorAll('[role=alert]')].filter(visible).map(node=>node.textContent??'').filter(Boolean),visibleTexts,forbiddenTexts};})()`);
            if (result.path !== (check.expectedPath ?? check.route) || runtimeErrors.length || networkFailures.length || result.alerts.length) {
              const runtimeKinds = [...new Set(runtimeErrors)].sort().join("."), networkKinds = [...new Set(networkFailures)].sort().join(".");
              fail("YUZHOU_UAT_BROWSER_RUNTIME_SURFACE", `${check.legacyId}:${check.roleType}:${viewport.id}:path=${result.path}:runtimeErrors=${runtimeErrors.length}:runtimeKinds=${runtimeKinds}:networkFailures=${networkFailures.length}:networkKinds=${networkKinds}:alerts=${result.alerts.length}`);
            }
            if (check.forbiddenTexts.some(text => result.visibleText.includes(text))) fail("YUZHOU_UAT_BROWSER_FORBIDDEN_ACTION_VISIBLE", `${check.legacyId}:${check.roleType}:${viewport.id}`);
            if (result.visibleTexts.some(row => !row.matched) || result.forbiddenTexts.some(row => row.matched)) fail("YUZHOU_UAT_BROWSER_DOM_ASSERTION_FAILED", `${check.legacyId}:${check.roleType}:${viewport.id}`);
            if (check.masked && sensitiveNeedles.some(text => result.visibleText.includes(text))) fail("YUZHOU_UAT_BROWSER_SENSITIVE_VALUE_VISIBLE", `${check.legacyId}:${check.roleType}:${viewport.id}`);
            const screenshotKey = `${check.actor}:${check.route}:${viewport.id}`;
            let screenshot = screenshotCache.get(screenshotKey);
            if (!screenshot) screenshot = await captureSanitizedScreenshot(sessionId, screenshotKey);
            const domAssertionSha256 = sha256(JSON.stringify({ path: result.path, visibleTexts: result.visibleTexts, forbiddenTexts: result.forbiddenTexts, alerts: result.alerts.length, clientWidth: result.clientWidth, scrollWidth: result.scrollWidth, networkFailureCount: networkFailures.length, pendingRequestCount }));
            const cell = {
              runId: binding.runId, rehearsal: binding.rehearsal, triple: { ...binding.triple },
              legacyId: check.legacyId, roleType: check.roleType, actor: check.actor, route: check.route,
              actorSubjectHash: binding.actorSubjectHashes[check.actor],
              viewportId: viewport.id, status: "PASS", width: viewport.width, height: viewport.height, renderedPath: result.path,
              mobile: viewport.mobile, clientWidth: result.clientWidth, scrollWidth: result.scrollWidth,
              assertions: [...taskCard.browserAssertions], screenshotSha256: screenshot.sha256, domAssertionSha256, networkFailureCount: networkFailures.length, pendingRequestCount
            };
            const hashInput = { runId: cell.runId, rehearsal: cell.rehearsal, triple: cell.triple, legacyId: cell.legacyId, roleType: cell.roleType, actor: cell.actor, actorSubjectHash: cell.actorSubjectHash, route: cell.route, renderedPath: cell.renderedPath, viewportId: cell.viewportId, width: cell.width, height: cell.height, mobile: cell.mobile, screenshotSha256: cell.screenshotSha256, domAssertionSha256: cell.domAssertionSha256, networkFailureCount: cell.networkFailureCount, pendingRequestCount: cell.pendingRequestCount };
            cell.cellEvidenceSha256 = sha256(JSON.stringify(hashInput));
            observations.push(validateYuzhouBrowserObservation(cell, check, viewport, taskCard.browserAssertions));
            } catch (error) {
              await captureSanitizedScreenshot(sessionId, `failure:${binding.runId}:${check.actor}:${check.legacyId}:${viewport.id}`).catch(() => {});
              throw error;
            }
          }
          await evaluate(cdp, sessionId, "localStorage.clear(); sessionStorage.clear(); true");
          await cdp.send("Network.clearBrowserCookies", {}, sessionId);
          await cdp.send("Page.navigate", { url: `${webBase}/login` }, sessionId);
          const cleanupNeedles = JSON.stringify(sensitiveNeedles);
          await poll(cdp, sessionId, `(() => { const t=document.body?.innerText??''; return location.pathname==='/login' && localStorage.length===0 && sessionStorage.length===0 && !${cleanupNeedles}.some(value=>t.includes(value)); })()`, "YUZHOU_UAT_BROWSER_SESSION_CLEANUP_FAILED", `${actor}:${viewport.id}`);
          const cleanupState = await evaluate(cdp, sessionId, `(() => { const t=document.body?.innerText??'';const needles=${cleanupNeedles};return {localStorageEntries:localStorage.length,sessionStorageEntries:sessionStorage.length,sensitiveDomMatches:needles.filter(value=>t.includes(value)).length};})()`);
          const cookieState=await cdp.send("Storage.getCookies",{browserContextId});
          const cleanupProof={runId:binding.runId,rehearsal:binding.rehearsal,triple:{...binding.triple},actor,actorSubjectHash:binding.actorSubjectHashes[actor],viewportId:viewport.id,localStorageEntries:cleanupState.localStorageEntries,sessionStorageEntries:cleanupState.sessionStorageEntries,cookieEntries:cookieState.cookies?.length??0,sensitiveDomMatches:cleanupState.sensitiveDomMatches,status:"PASS"};
          cleanupProof.proofSha256=sha256(JSON.stringify(cleanupProof));sessionCleanupProofs.push(cleanupProof);
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
      runId: binding.runId, rehearsal: binding.rehearsal, triple: { ...binding.triple },
      observedCells: observations.length, observations, screenshots: [...screenshotsByHash.values()], sessionCleanupProofs, sessionCleanupProofsSha256: sha256(JSON.stringify(sessionCleanupProofs)), p0P1Count: 0, sensitiveScan: "PASS",
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

export function isYuzhouLiveRoleUatLabPath(path) {
  return /jinhu_hr_migration_lab_(?:full|core)_[a-z0-9_]+/u.test(resolve(path));
}
