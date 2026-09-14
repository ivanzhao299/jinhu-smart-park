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
 await page.goto('http://127.0.0.1:3417/leasing/checkouts');await page.getByRole('button',{name:'查看',exact:true}).first().click({timeout:60000});await page.getByRole('button',{name:'确认结算',exact:true}).click();await d.waitFor();await page.keyboard.press('Escape');r.nested={childClosed:await d.count()===0,parentStillVisible:await page.getByRole('button',{name:'确认结算',exact:true}).count()>0};await page.screenshot({path:out+`nested-baseline-${width}.png`,fullPage:true});
 await context.close();fs.writeFileSync(out+'nested-baseline-results.json',JSON.stringify(results,null,2));
 }}catch(e){fs.writeFileSync(out+'nested-baseline-results.json',JSON.stringify({results,failure:e.message},null,2));throw e;}finally{await browser.close();}
