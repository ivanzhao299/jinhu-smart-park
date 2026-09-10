import { chromium } from '/tmp/property-dialog-audit-browser/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const lab='/tmp/jinhu-housing-uat-20260910-732/';
const env=JSON.parse(fs.readFileSync(lab+'env.json'));
const fixture=JSON.parse(fs.readFileSync(lab+'fixture.json'));
assert.equal(env.POSTGRES_DB,'jinhu_housing_uat_20260910_732');
const out=new URL('./',import.meta.url).pathname;
const report=process.argv.includes('--mode-only') ? JSON.parse(fs.readFileSync(out+'real-release-results.json')) : {evidence:'REAL isolated API/DB; no route interception',database:env.POSTGRES_DB,writes:[],pageErrors:[]};
const browser=await chromium.launch({headless:true,executablePath:'/home/jinhuit/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',args:['--no-sandbox']});
try{
const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();
page.on('pageerror',e=>report.pageErrors.push(e.message));
page.on('response',async response=>{const req=response.request();if(req.method()==='POST'&&new URL(req.url()).pathname.startsWith('/api/v1/')&&!req.url().includes('/auth/'))report.writes.push({path:new URL(req.url()).pathname,status:response.status(),body:req.postDataJSON(),key:req.headers()['x-idempotency-key']});});
await page.goto('http://127.0.0.1:3417/login');
const account=page.getByPlaceholder('请输入账号'),password=page.getByPlaceholder('请输入密码');
await account.waitFor();await page.locator('button[type=submit]:enabled').waitFor();await account.click();await account.pressSequentially(env.ADMIN_USERNAME);await password.click();await password.pressSequentially(env.ADMIN_PASSWORD);
const loginResponse=page.waitForResponse(r=>r.url().includes('/auth/login')&&r.request().method()==='POST');await password.press('Enter');assert.equal((await loginResponse).status(),200);await page.waitForURL(u=>!u.pathname.includes('/login'));report.loginPostObserved=true;
async function read(path){return page.evaluate(async path=>{const token=localStorage.getItem('jinhu_access_token')??sessionStorage.getItem('jinhu_access_token');const r=await fetch('/api/v1'+path,{headers:{authorization:'Bearer '+token}});if(!r.ok)throw Error('read '+r.status);return (await r.json()).data;},path);}
const d=page.locator('dialog[open]');
if(!process.argv.includes('--mode-only')){
await page.goto(`http://127.0.0.1:3417/assets/property-occupancies/${fixture.occupancyId}`);await page.getByRole('button',{name:'释放人工锁房',exact:true}).click({timeout:60000});await d.locator('textarea').fill('原'.repeat(501));await d.getByRole('button',{name:'确认释放',exact:true}).click();await d.getByRole('alert').waitFor();report.releaseFailure={error:await d.getByRole('alert').innerText(),reasonLength:(await d.locator('textarea').inputValue()).length,state:(await read('/property/occupancies/'+fixture.occupancyId)).status};assert.equal(report.releaseFailure.state,'active');await page.screenshot({path:out+'real-release-failure-1440.png',fullPage:true});
await d.locator('textarea').fill('专项真实释放验收');await d.getByRole('button',{name:'确认释放',exact:true}).click();await d.waitFor({state:'hidden'});report.releaseAfter=await read('/property/occupancies/'+fixture.occupancyId);assert.equal(report.releaseAfter.status,'released');await page.screenshot({path:out+'real-release-success-1440.png',fullPage:true});
}
await page.goto('http://127.0.0.1:3417/assets/property-operations');await page.locator(`a[href="/assets/property-operations/${fixture.unitId}"]:visible`).click({timeout:60000});report.operationBefore=await read(`/property/units/${fixture.unitId}/operation`);await page.locator('[name=target_mode]').selectOption('long_rent');await page.getByRole('button',{name:'提交切换审批',exact:true}).click();await d.locator('textarea').fill('专项真实模式切换验收');await page.screenshot({path:out+'real-mode-before-1440.png',fullPage:true});
const submitted=page.waitForResponse(r=>r.url().includes('/mode-transitions')&&r.request().method()==='POST');await d.getByRole('button',{name:'提交审批',exact:true}).click();const response=await submitted;report.submitStatus=response.status();const body=await response.json();assert(response.ok(),JSON.stringify(body));report.submission=body.data;await d.waitFor({state:'hidden'});
report.operationAfter=await read(`/property/units/${fixture.unitId}/operation`);report.requests=await read(`/property/mode-transitions?page=1&pageSize=20&unitId=${fixture.unitId}`);assert.equal(report.operationAfter.configuredMode,report.operationBefore.configuredMode);assert.equal(report.requests.items.length,1);const requestId=report.submission.request.requestId;report.approval=await read('/property/approvals/'+requestId);report.uniqueRequestId=requestId;report.configurationUnchangedBeforeExecution=true;
await page.setViewportSize({width:390,height:900});await page.screenshot({path:out+'real-mode-after-390.png',fullPage:true});report.status='passed';delete report.failure;await context.close();
}catch(e){report.status='failed';report.failure=e.message;throw e;}finally{fs.writeFileSync(out+'real-results.json',JSON.stringify(report,null,2));await browser.close();}
