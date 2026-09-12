import { chromium } from '/tmp/property-dialog-audit-browser/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const out=new URL('./',import.meta.url).pathname;
const unitId='11111111-1111-4111-8111-111111111111';
const user={id:'audit-user',username:'audit',real_name:'隔离审查',tenant_id:'audit-tenant',park_id:'audit-park',roles:[],permissions:['*'],is_super:true,data_scope:'tenant',enabled_modules:['asset','homestay','housing_rental','housing_cost','property','leasing','system','rbac','file','workflow'].map(module_code=>({module_code,enabled:true})),accessible_parks:[{id:'audit-park',park_id:'audit-park',park_name:'隔离园区',enabled:true}],menus:[]};
const operation={unitId,unitCode:'AUDIT-101',unitName:'隔离审查房源',buildingId:'audit-building',buildingCode:'AUDIT',buildingName:'隔离楼栋',configuredMode:'short_stay',operationStatus:'enabled',assetUnitId:null,assetUnitCode:null,assetUnitName:null,suspendReason:null,remark:null,effectiveTime:null,liveOwningAggregateCounts:{},sharedOccupancy:{activeCount:0,incompatibleCount:0},version:1,canRequestTransition:true,blockers:[],updateTime:null};
const booking={booking:{id:unitId,bookingCode:'MOCK-STAY-101',status:'confirmed',arrivalDate:'2026-09-01',departureDate:'2026-09-11',unitId,unitCode:'AUDIT-101',unitName:'隔离房源',guestCount:1},guests:[],credentials:[{id:'credential-1',status:'issued',credentialLabel:'房卡 A'}],nights:[],actions:[],ledger:[],finance_visible:false};

import assert from 'node:assert/strict';
const occupancy={id:unitId,unitId,sourceDomain:'operations',sourceType:'manual',sourceLabel:'专项人工锁房',startAt:'2026-09-10T00:00:00Z',endAt:'2026-09-11T00:00:00Z',status:'active',version:1};
const purchase={purchase:{id:unitId,purchaseCode:'采购'+('LONG-ID-'.repeat(35)),vendorName:'隔离供应商',purchaseDate:'2026-09-10',costCategory:'consumable',totalAmount:'200',approvalStatus:'approved',paymentStatus:'unpaid'},items:Array.from({length:15},(_,i)=>({id:'item-'+i,itemName:'采购明细'+i,quantity:1,unit:'个',amount:'10'}))};
const checkout={id:unitId,checkoutCode:'退租代表',contractId:unitId,contract:{id:unitId,contractCode:'合同代表'},status:'40',settlementStatus:'10',approveRecords:[],plannedCheckoutDate:'2026-09-10',checkoutType:'normal',releaseUnitStatus:'10'};
const browser=await chromium.launch({headless:true,executablePath:'/home/jinhuit/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',args:['--no-sandbox']});
const results=[];
try { for(const width of [1440,390]) {
 const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();
 const r={width,writes:[],pageErrors:[],cases:[]};results.push(r);let responseMode=400;let releaseResponse;let holdResponse=false;
 page.on('pageerror',e=>r.pageErrors.push(e.message));
 await context.addInitScript(u=>{localStorage.setItem('jinhu_access_token','audit-fixture-token');localStorage.setItem('jinhu_auth_user',JSON.stringify(u));},user);
 await page.route('**/api/**',async route=>{const req=route.request(),path=new URL(req.url()).pathname.replace('/api/v1','');let data={items:[],total:0,page:1,page_size:20};
 if(req.method()!=='GET'){r.writes.push({path,body:req.postDataJSON(),key:req.headers()['x-idempotency-key'],responseMode});if(holdResponse)await new Promise(x=>{releaseResponse=x;});if(responseMode==='network')return route.abort('failed');return route.fulfill({status:responseMode,json:responseMode===200?{code:0,data:{request:{requestId:'mock-only',decisionStatus:'pending',executionStatus:'not_started'}}}:{code:responseMode,message:'MOCK '+responseMode+' 代表失败',data:null}});}
 if(path==='/users/me')data=user;
 else if(path===`/property/units/${unitId}/operation`)data=operation;
 else if(path===`/homestay/stays/${unitId}`)data=booking;
 else if(path===`/property/occupancies/${unitId}`)data=occupancy;
 else if(path===`/housing/purchases/${unitId}`)data=purchase;
 else if(path==='/leasing/checkouts')data={items:[checkout],total:1,page:1,page_size:20};
 else if(path.endsWith('/refunds'))data=[];
 return route.fulfill({json:{code:0,data}});
 });
 const d=page.locator('dialog[open]');
 for(const scenario of [
 {name:'mode',url:`/assets/property-operations/${unitId}`,open:'提交切换审批',confirm:'提交审批',prepare:async()=>page.locator('[name=target_mode]').selectOption('long_rent')},
 {name:'lost',url:`/homestay/stays/${unitId}`,open:'登记遗失',confirm:'确认登记遗失'},
 {name:'occupancy',url:`/assets/property-occupancies/${unitId}`,open:'释放人工锁房',confirm:'确认释放'},
 {name:'purchase',url:`/housing/purchases/${unitId}`,open:'提交付款审批',confirm:'提交付款审批'}]){
 await page.goto('http://127.0.0.1:3417'+scenario.url);if(scenario.prepare)await scenario.prepare();await page.getByRole('button',{name:scenario.open,exact:true}).click({timeout:60000});await d.waitFor();
 const c={name:scenario.name,errors:[]};r.cases.push(c);
 for(const status of [400,403,409,'network']){
 holdResponse=true;responseMode=status;await d.locator('textarea').fill('失败后保留有效输入');const before=r.writes.length;
 await d.getByRole('button',{name:scenario.confirm,exact:true}).click();await d.getByRole('button',{name:'正在提交…'}).waitFor();await d.evaluate(e=>{e.dataset.cancelEvents='';e.addEventListener('cancel',event=>{e.dataset.cancelEvents+=String(event.cancelable)+',';});});c.beforeEscape=await page.evaluate(()=>({active:document.activeElement?.tagName,dialogs:[...document.querySelectorAll('dialog')].map(e=>({open:e.open,text:e.innerText.slice(-200)}))}));await page.keyboard.press('Escape');assert.equal(await d.count(),1);assert.equal(await d.getByRole('button',{name:'取消',exact:true}).isDisabled(),true);releaseResponse();holdResponse=false;
 await d.getByRole('alert').waitFor();await d.getByRole('button',{name:scenario.confirm,exact:true}).waitFor();assert.equal(r.writes.length,before+1);assert.equal(await d.locator('textarea').inputValue(),'失败后保留有效输入');c.errors.push({status,alert:await d.getByRole('alert').innerText()});
 }
 await page.screenshot({path:out+`${scenario.name}-extended-${width}.png`,fullPage:true});
 if(scenario.name==='purchase'){
 await page.setViewportSize({width,height:400});c.short=await d.evaluate(e=>({client:e.clientHeight,scroll:e.scrollHeight,width:e.clientWidth,scrollWidth:e.scrollWidth}));assert(c.short.scroll>c.short.client);await d.getByRole('button',{name:'取消',exact:true}).scrollIntoViewIfNeeded();c.footerReachable=await d.getByRole('button',{name:'取消',exact:true}).isVisible();
 await page.setViewportSize({width:Math.floor(width/2),height:450});c.reflow200=await d.evaluate(e=>({client:e.clientWidth,scroll:e.scrollWidth,rect:e.getBoundingClientRect().toJSON()}));assert(c.reflow200.scroll<=c.reflow200.client+1);await d.getByRole('button',{name:'取消',exact:true}).scrollIntoViewIfNeeded();c.reflowFooter=await d.getByRole('button',{name:'取消',exact:true}).boundingBox();assert(c.reflowFooter.y>=0&&c.reflowFooter.y+c.reflowFooter.height<=450);await page.screenshot({path:out+`purchase-reflow-${width}.png`,fullPage:true});await page.setViewportSize({width,height:900});
 }
 responseMode=200;await d.getByRole('button',{name:scenario.confirm,exact:true}).click();await d.waitFor({state:'hidden'});c.successClosed=true;c.closedHidden=await page.locator('dialog').evaluateAll(es=>es.every(e=>!e.open&&getComputedStyle(e).display==='none'));assert(c.closedHidden);
 }
 await page.goto('http://127.0.0.1:3417/leasing/checkouts');await page.getByRole('button',{name:'查看',exact:true}).first().click({timeout:60000});await page.getByRole('button',{name:'确认结算',exact:true}).click();await d.waitFor();await page.keyboard.press('Escape');r.nested={childClosed:await d.count()===0,parentStillVisible:await page.getByRole('button',{name:'确认结算',exact:true}).count()>0};await page.screenshot({path:out+`nested-after-escape-${width}.png`,fullPage:true});
 await context.close();fs.writeFileSync(out+'extended-results.json',JSON.stringify(results,null,2));
 }}catch(e){fs.writeFileSync(out+'extended-results.json',JSON.stringify({results,failure:e.message},null,2));throw e;}finally{await browser.close();}
