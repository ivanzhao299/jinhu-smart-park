import fs from 'node:fs';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);
const out=new URL('./',import.meta.url);
const user={id:'audit-user',username:'audit',real_name:'隔离审查',tenant_id:'audit-tenant',park_id:'audit-park',roles:[],permissions:['*'],is_super:true,data_scope:'tenant',enabled_modules:['leasing','system','rbac','file','workflow'].map(module_code=>({module_code,enabled:true})),accessible_parks:[{id:'audit-park',park_id:'audit-park',park_name:'隔离园区',enabled:true}],menus:[]};
const base={contractId:'11111111-1111-4111-8111-111111111111',contract:{contractCode:'B-ONLY-CONTRACT'},settlementStatus:'30',approveRecords:[],plannedCheckoutDate:'2026-09-14',checkoutType:'normal',releaseUnitStatus:'rentable',refundAmount:'0.00',reason:'fixture'};
const a={...base,id:'11111111-1111-4111-8111-111111111111',checkoutCode:'B-ONLY-A',status:'40'};
const b={...base,id:'22222222-2222-4222-8222-222222222222',checkoutCode:'B-ONLY-B',status:'10',reason:'B draft'};
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
const results=[];
try {
 for(const width of [1440,390]) for(const scenario of (process.env.CAPTURE_ONLY ? ['B-refresh','create-refresh'] : ['B-refresh','create-refresh','late-B','late-create','late-close-reopen-A','same-A'])) {
  const record={width,scenario,grade:'B: real built page with synthetic API responses',realFinancialWrites:0,writes:[],console:[],errors:[]};results.push(record);
  const context=await browser.newContext({viewport:{width,height:900}});
  await context.addInitScript(u=>{localStorage.setItem('jinhu_access_token','audit-fixture-token');localStorage.setItem('jinhu_auth_user',JSON.stringify(u));},user);
  const page=await context.newPage();page.setDefaultTimeout(10000);
  page.on('console',msg=>{if(['warning','error'].includes(msg.type()))record.console.push({type:msg.type(),text:msg.text()});});page.on('pageerror',e=>record.errors.push(e.message));
  let posted=false,hold=false,heldRoute,latest=false,finished=false;
  const reply=route=>route.fulfill({json:{code:0,data:{items:[{...a,status:latest?'70':posted?'60':'40'},b],total:2,page:1,page_size:20}}});
  await page.route('**/api/**',async route=>{
   const req=route.request(),path=new URL(req.url()).pathname.replace('/api/v1','');
   if(req.method()!=='GET'){
    record.writes.push({path,method:req.method(),body:req.postDataJSON(),mocked:true});
    assert.equal(path,`/leasing/checkouts/${a.id}/confirm-settlement`);posted=true;
    return route.fulfill({status:201,json:{code:0,data:{...a,status:'60'}}});
   }
   if(path==='/leasing/checkouts'){if(hold){heldRoute=route;return;}return reply(route);}
   return route.fulfill({json:{code:0,data:path==='/users/me'?user:path.endsWith('/refunds')?[]:{items:[],total:0,page:1,page_size:20}}});
  });
  const drawer=page.locator('[class*=drawerRoot]');
  const choose=async code=>{
   const record=width===390?page.locator('article:visible').filter({has:page.getByText(code,{exact:true})}):page.locator('tr:visible').filter({has:page.getByText(code,{exact:true})});
   await record.getByRole('button',{name:'查看',exact:true}).click();
  };
  const selectNext=async()=>{
   await drawer.getByRole('button',{name:'取消',exact:true}).click();
   if(scenario.includes('create')) await page.getByRole('button',{name:'发起退租',exact:true}).click();
   else await choose(scenario==='late-close-reopen-A'?'B-ONLY-A':'B-ONLY-B');
   await page.locator('label').filter({has:page.getByText('退租原因',{exact:true})}).locator('textarea').fill('current draft');
  };
  // Refresh is behind the modal drawer backdrop. DOM click exercises the real page
  // handler while retaining selection; it does not pretend to be a reachable pointer action.
  const refresh=()=>page.getByRole('button',{name:'刷新',exact:true}).evaluate(el=>el.click());
  try {
   await page.goto((process.env.WEB_BASE_URL??'http://127.0.0.1:3427')+'/leasing/checkouts');
   await choose('B-ONLY-A');await page.getByRole('button',{name:'确认结算',exact:true}).click();
   await page.locator('dialog[open]').getByRole('button',{name:'确认结算',exact:true}).click();
   await page.waitForFunction(()=>document.querySelectorAll('dialog[open]').length===0);
   await page.getByRole('status').filter({hasText:'退租结算已确认'}).waitFor({state:'attached'});
   if(!scenario.startsWith('late-')&&scenario!=='same-A')await selectNext();
   hold=true;latest=true;await refresh();
   await page.waitForFunction(()=>document.querySelector('body').innerText.includes('加载中'));
   if(scenario.startsWith('late-'))await selectNext();
   assert(heldRoute);hold=false;await reply(heldRoute);finished=true;
   await page.waitForFunction(()=>!document.querySelector('body').innerText.includes('退租申请 · 加载中'));
   const heading=scenario.includes('create')?'发起退租申请':scenario==='same-A'||scenario==='late-close-reopen-A'?'退租单 B-ONLY-A':'退租单 B-ONLY-B';
   assert.equal(await page.getByRole('heading',{name:heading,exact:true}).count(),1);
   if(scenario!=='same-A')assert.equal(await page.locator('label').filter({has:page.getByText('退租原因',{exact:true})}).locator('textarea').inputValue(),'current draft');
   if(scenario.includes('create'))assert(await page.getByLabel('退租单号',{exact:true}).isEnabled());
   else if(heading.endsWith('B-ONLY-B'))assert.equal(await page.getByLabel('退租单号',{exact:true}).inputValue(),'B-ONLY-B');
   if(scenario==='same-A')assert(await page.getByRole('button',{name:'退租生效',exact:true}).isDisabled());
   assert.equal(record.writes.length,1);assert.deepEqual(record.writes[0].body,{deduction_amount:'0',additional_charge_amount:'0'});
   assert.equal(await page.getByRole('status').textContent(),'退租结算已确认');
   record.overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(record.overflow,false);
   record.heading=heading;record.receiptRetained=true;record.draftAndTargetAligned=true;
   assert.deepEqual(record.errors,[]);assert(!record.console.some(x=>x.type==='error'||/Fragment|act.*scope/.test(x.text)));
   await drawer.evaluate(async el=>{await Promise.all(el.getAnimations({subtree:true}).map(a=>a.finished));});
   if(scenario==='B-refresh'||scenario==='create-refresh')await page.screenshot({path:new URL(`${scenario}-${width}.png`,out).pathname,fullPage:true});
   record.passed=true;
  } catch(e) {record.failure=e.message;await page.screenshot({path:new URL(`failure-${scenario}-${width}.png`,out).pathname,fullPage:true});throw e;}
  finally {if(heldRoute&&!finished)await heldRoute.abort().catch(()=>{});await context.close();fs.writeFileSync(new URL(process.env.CAPTURE_ONLY?'browser-capture.json':'browser.json',out),JSON.stringify(results,null,2));}
 }
} finally {await browser.close();}
console.log(results.map(({width,scenario,passed,failure})=>({width,scenario,passed,failure})));
assert(results.every(r=>r.passed));
