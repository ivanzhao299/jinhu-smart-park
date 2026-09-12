import { chromium } from '/tmp/property-dialog-audit-browser/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const out=new URL('./',import.meta.url).pathname;
const unitId='11111111-1111-4111-8111-111111111111';
const user={id:'audit-user',username:'audit',real_name:'隔离审查',tenant_id:'audit-tenant',park_id:'audit-park',roles:[],permissions:['*'],is_super:true,data_scope:'tenant',enabled_modules:['asset','homestay','housing_rental','housing_cost','property','leasing','system','rbac','file','workflow'].map(module_code=>({module_code,enabled:true})),accessible_parks:[{id:'audit-park',park_id:'audit-park',park_name:'隔离园区',enabled:true}],menus:[]};
const operation={unitId,unitCode:'AUDIT-101',unitName:'隔离审查房源',buildingId:'audit-building',buildingCode:'AUDIT',buildingName:'隔离楼栋',configuredMode:'short_stay',operationStatus:'enabled',assetUnitId:null,assetUnitCode:null,assetUnitName:null,suspendReason:null,remark:null,effectiveTime:null,liveOwningAggregateCounts:{},sharedOccupancy:{activeCount:0,incompatibleCount:0},version:1,canRequestTransition:true,blockers:[],updateTime:null};
const booking={booking:{id:unitId,bookingCode:'MOCK-STAY-101',status:'confirmed',arrivalDate:'2026-09-01',departureDate:'2026-09-11',unitId,unitCode:'AUDIT-101',unitName:'隔离房源',guestCount:1},guests:[],credentials:[{id:'credential-1',status:'issued',credentialLabel:'房卡 A'}],nights:[],actions:[],ledger:[],finance_visible:false};

const lease={lease:{id:unitId,leaseCode:'MOCK-LEASE-101',status:'draft',unitId,startDate:'2026-09-01',endDate:'2027-08-31',monthlyRent:'1000',depositAmount:'1000',eligibility:{eligible:true,reasonCodes:[]}},tenant:{displayName:'隔离租客'},occupants:[],handovers:[]};
const browser=await chromium.launch({headless:true,executablePath:'/home/jinhuit/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',args:['--no-sandbox']});const all=[];
try { for(const width of [1440,390]){
 const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),r={width,errors:[],writes:[],unknown:[]};all.push(r);
 page.on('pageerror',e=>r.errors.push(e.message));
 await context.addInitScript(u=>{localStorage.setItem('jinhu_access_token','audit-fixture-token');localStorage.setItem('jinhu_auth_user',JSON.stringify(u));},user);
 await page.route('**/api/**',async route=>{const req=route.request(),path=new URL(req.url()).pathname.replace('/api/v1','');let data={items:[],total:0,page:1,pageSize:20};
 if(req.method()!=='GET'){r.writes.push({path,body:req.postDataJSON()});await new Promise(resolve=>setTimeout(resolve,500));return route.fulfill({status:400,json:{code:400,message:'隔离 MOCK：操作被拒绝',data:null}});}
 if(path==='/users/me')data=user;else if(path===`/property/units/${unitId}/operation`)data=operation;else if(path===`/housing/leases/${unitId}`)data=lease;else r.unknown.push(path);
 return route.fulfill({json:{code:0,data}});});
 await page.goto(`http://127.0.0.1:3417/assets/property-operations/${unitId}`);await page.locator('select[name="target_mode"]').selectOption('long_rent',{timeout:60000});await page.getByRole('button',{name:'提交切换审批',exact:true}).click();const d=page.locator('dialog[open]');await d.waitFor();await d.locator('textarea').fill('测试输入');
 await d.getByRole('button',{name:'提交审批',exact:true}).focus();await page.keyboard.press('Tab');r.tabFromLast=await page.evaluate(()=>document.activeElement?.textContent);await d.locator('textarea').focus();await page.keyboard.press('Shift+Tab');r.shiftTabFromFirst=await page.evaluate(()=>document.activeElement?.textContent);
 r.closedDialog=await page.locator('dialog').evaluate(e=>({margin:getComputedStyle(e).margin,padding:getComputedStyle(e).padding,position:getComputedStyle(e).position,inset:getComputedStyle(e).inset,backdrop:getComputedStyle(e,'::backdrop').backgroundColor}));
 const oldY=await page.evaluate(()=>window.scrollY);await page.mouse.move(width-5,850);await page.mouse.wheel(0,500);await page.waitForTimeout(150);r.backgroundScroll={before:oldY,after:await page.evaluate(()=>window.scrollY)};
 await d.locator('textarea').fill('测'.repeat(501));r.reason501Length=(await d.locator('textarea').inputValue()).length;r.reason501Validity=await d.locator('textarea').evaluate(e=>e.checkValidity());
 await page.keyboard.press('Escape');r.documentWidth=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:window.innerWidth}));
 await page.goto(`http://127.0.0.1:3417/housing/leases/${unitId}`);await page.getByRole('button',{name:'作废租约',exact:true}).waitFor({timeout:60000});await page.getByRole('button',{name:'作废租约',exact:true}).click();await d.waitFor();r.housingOpen=await d.innerText();await d.locator('textarea').fill('租约审查原因');await d.getByRole('button',{name:'作废租约',exact:true}).click();r.housingBusy=await d.innerText();await d.getByRole('alert').waitFor();r.housingError=await d.getByRole('alert').innerText();r.housingReasonRetained=await d.locator('textarea').inputValue();await page.screenshot({path:out+`housing-error-${width}.png`,fullPage:true});
 await page.keyboard.press('Escape');r.housingClosed=await d.count()===0;await context.close();fs.writeFileSync(out+'browser-focused-results.json',JSON.stringify(all,null,2));
 }}catch(e){fs.writeFileSync(out+'browser-focused-results.json',JSON.stringify(all,null,2));throw e;}finally{await browser.close();}
