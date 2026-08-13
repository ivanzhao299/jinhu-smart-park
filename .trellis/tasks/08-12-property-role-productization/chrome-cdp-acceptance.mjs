import fs from "node:fs/promises";
import path from "node:path";

const [port, evidenceDir] = process.argv.slice(2);
if (!port || !evidenceDir) throw new Error("usage: node chrome-cdp-acceptance.mjs <port> <evidence-dir>");
await fs.mkdir(evidenceDir, { recursive: true });

const target = await fetch(`http://127.0.0.1:${port}/json/new?http://127.0.0.1:3300/login`, { method: "PUT" }).then((r) => r.json());
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0;
const pending = new Map();
ws.onmessage = ({ data }) => {
  const message = JSON.parse(data);
  if (!message.id) return;
  const waiter = pending.get(message.id);
  if (!waiter) return;
  pending.delete(message.id);
  message.error ? waiter.reject(new Error(JSON.stringify(message.error))) : waiter.resolve(message.result);
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const messageId = ++id;
  pending.set(messageId, { resolve, reject });
  ws.send(JSON.stringify({ id: messageId, method, params }));
});
const evaluate = async (expression) => {
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
};
const waitFor = async (expression, timeout = 30000) => {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`timeout: ${expression}`);
};
const snapshot = async (name) => {
  const state = await evaluate(`(() => ({
    url: location.href,
    title: document.title,
    text: document.body?.innerText?.slice(0, 6000) ?? "",
    viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
    layout: { clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body?.scrollWidth ?? 0, horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth }
  }))()`);
  const image = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await fs.writeFile(path.join(evidenceDir, `${name}.png`), image.data, "base64");
  await fs.writeFile(path.join(evidenceDir, `${name}.json`), `${JSON.stringify(state, null, 2)}\n`);
  return state;
};
const navigate = async (url) => {
  await send("Page.navigate", { url });
  await waitFor(`document.readyState === "complete" || document.readyState === "interactive"`);
  await new Promise((resolve) => setTimeout(resolve, 1200));
};

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
await waitFor(`document.querySelector('input') !== null`);
await evaluate(`(async () => {
  const login = await fetch('/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'Jinhu@123456' }) }).then(r => r.json());
  if (login.code !== 0) throw new Error(JSON.stringify(login));
  const token = login.data.accessToken;
  const me = await fetch('/api/v1/users/me', { headers: { Authorization: 'Bearer ' + token } }).then(r => r.json());
  if (me.code !== 0) throw new Error(JSON.stringify(me));
  sessionStorage.setItem('jinhu_access_token', token); localStorage.setItem('jinhu_access_token', token);
  sessionStorage.setItem('jinhu_auth_user', JSON.stringify(me.data)); localStorage.setItem('jinhu_auth_user', JSON.stringify(me.data));
  location.assign('/dashboard');
  return true;
})()`);
await waitFor(`location.pathname !== '/login'`, 30000);
const results = { chrome: await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json()), checks: {} };
results.checks.desktopDashboard = await snapshot("desktop-dashboard");
await navigate("http://127.0.0.1:3300/system/roles");
await waitFor(`document.body.innerText.includes('角色')`);
results.checks.desktopRoles = await snapshot("desktop-roles");
await navigate("http://127.0.0.1:3300/system/users");
await waitFor(`document.body.innerText.includes('用户')`);
results.checks.desktopUsers = await snapshot("desktop-users");

await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844 });
await navigate("http://127.0.0.1:3300/system/roles");
results.checks.mobileRoles = await snapshot("mobile-roles-390");
await navigate("http://127.0.0.1:3300/system/users");
results.checks.mobileUsers = await snapshot("mobile-users-390");

await fs.writeFile(path.join(evidenceDir, "summary.json"), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
ws.close();
