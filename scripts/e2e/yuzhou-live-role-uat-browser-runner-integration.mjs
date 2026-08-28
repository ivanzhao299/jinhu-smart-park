import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { runYuzhouLiveRoleUatBrowserMatrix } from "../hr-cutover/yuzhou-live-role-uat-browser-runner.mjs";

const root = resolve(import.meta.dirname, "../..");
const taskCard = JSON.parse(readFileSync(resolve(root, "scripts/hr-cutover/contracts/yuzhou-live-role-uat-task-card-v1.json"), "utf8"));
const browserMatrix = JSON.parse(readFileSync(resolve(root, "scripts/hr-cutover/contracts/yuzhou-live-role-uat-browser-matrix-v1.json"), "utf8"));

const actorNames = { hr_reviewer: "browser-hr", manager: "browser-manager", employee: "browser-employee" };
const hash = value => createHash("sha256").update(value).digest("hex");
const binding = { rehearsal: "A", runId: "yzfull-browser-integration-rA", triple: { codeSha: "1".repeat(40), sourceSnapshotHash: "2".repeat(64), mappingContractHash: "3".repeat(64) }, actorSubjectHashes: Object.fromEntries(Object.keys(actorNames).map(actor => [actor, hash(`actor:${actor}`)])) };
const visibleByActorRoute = Object.fromEntries(Object.keys(actorNames).map(actor => [actor, {}]));
const forbiddenByActorRoute = Object.fromEntries(Object.keys(actorNames).map(actor => [actor, {}]));
for (const check of browserMatrix.checks) {
  const route = visibleByActorRoute[check.actor][check.route] ?? [];
  visibleByActorRoute[check.actor][check.route] = [...new Set([...route, ...check.visibleTexts])];
  if (check.expectedPath !== check.route) visibleByActorRoute[check.actor][check.expectedPath] = [...check.visibleTexts];
  forbiddenByActorRoute[check.actor][check.route] = [...new Set([...(forbiddenByActorRoute[check.actor][check.route] ?? []), ...check.forbiddenTexts])];
}

const loginPage = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><input autocomplete="username"><input autocomplete="current-password" type="password"><button type="submit">登录</button><script>
setTimeout(()=>{const button=document.querySelector('button');button.__reactProps$fixture={};button.addEventListener('click',()=>{const value=document.querySelector('input[autocomplete=username]').value;const actors=${JSON.stringify(actorNames)};const actor=Object.entries(actors).find(([,username])=>username===value)?.[0];if(!actor)return;localStorage.setItem('jinhu_access_token','fixture-token');localStorage.setItem('fixture-actor',actor);location.href='/dashboard';});},150);
</script></body></html>`;
const routePage = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0;width:100%;max-width:100%;overflow-x:hidden}</style></head><body><script>
const rows=${JSON.stringify(visibleByActorRoute)},hiddenRows=${JSON.stringify(forbiddenByActorRoute)};const actor=localStorage.getItem('fixture-actor');if(actor==='employee'&&location.pathname==='/hr/recruitment')location.replace('/403');else setTimeout(()=>{const main=document.createElement('main');main.setAttribute('data-uat-surface',location.pathname);for(const [index,label]of(rows[actor]?.[location.pathname]??['fixture dashboard']).entries()){const node=document.createElement(index===0?'h1':'button');node.type='button';node.textContent=label;node.setAttribute('data-uat-visible','true');main.append(node);}const hidden=document.createElement('section');hidden.style.opacity='0';hidden.setAttribute('aria-hidden','true');hidden.textContent=(hiddenRows[actor]?.[location.pathname]??[]).join(' ');main.append(hidden);document.body.append(main);},300);
</script></body></html>`;

test("real headless Chrome waits for hydration and executes all 56 item-role-viewport browser cells", { timeout: 60000 }, async () => {
  const labRoot = mkdtempSync(resolve(tmpdir(), "jinhu_hr_migration_lab_full_browser_fixture_"));
  const evidenceRoot = resolve(labRoot, "evidence"), profileRoot = resolve(labRoot, "chrome-profile");
  mkdirSync(evidenceRoot, { mode: 0o700 }); chmodSync(evidenceRoot, 0o700);
  const server = createServer((request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(request.url === "/login" ? loginPage : routePage);
  });
  await new Promise((resolvePromise, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolvePromise); });
  try {
    const port = server.address().port;
    assert.ok(port >= 1024);
    const result = await runYuzhouLiveRoleUatBrowserMatrix({
      taskCard, browserMatrix, webBase: `http://127.0.0.1:${port}`,
      credentials: Object.fromEntries(Object.entries(actorNames).map(([actor, username]) => [actor, { username, password: "fixture-password" }])), binding,
      evidenceRoot, profileRoot, sensitiveNeedles: ["sensitive-fixture-marker"]
    });
    assert.equal(result.status, "PASS");
    assert.equal(result.humanAttestation, "HOLD");
    assert.equal(result.productionImport, "HOLD");
    assert.equal(result.observedCells, 56);
    assert.equal(result.observations.filter(row => row.viewportId === "phone_390").length, 28);
    assert.ok(result.observations.every(row => row.networkFailureCount === 0));
    assert.ok(result.observations.every(row => row.runId === binding.runId && row.cellEvidenceSha256 && row.domAssertionSha256));
    assert.equal(result.sessionCleanupProofs.length, 6);
    assert.equal(new Set(result.sessionCleanupProofs.map(row => `${row.actor}:${row.viewportId}`)).size, 6);
    assert.ok(result.sessionCleanupProofs.every(row => row.status === "PASS" && row.localStorageEntries === 0 && row.sessionStorageEntries === 0 && row.cookieEntries === 0 && row.sensitiveDomMatches === 0 && row.proofSha256));
    assert.ok(result.screenshots.length > 0);
  } finally {
    await new Promise(resolvePromise => server.close(resolvePromise));
    rmSync(labRoot, { recursive: true, force: true });
  }
});
