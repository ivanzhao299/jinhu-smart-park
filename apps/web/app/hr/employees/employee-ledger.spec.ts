import test from "node:test";
import assert from "node:assert/strict";
import { clampEmployeePage,createEmployeeRequestScope,createEmployeeContracts,createManagerCandidates,fetchEmployeePage } from "./employee-ledger";
import { hrApi } from "../../../lib/hr-api";

function deferred<T>() { let resolve!: (value:T)=>void, reject!: (error:unknown)=>void; const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}; }
const response=(page:number,total=113)=>({items:Array.from({length:Math.min(50,Math.max(0,total-(page-1)*50))},(_,i)=>({id:String((page-1)*50+i)})),page,page_size:50,total});

test("actual Web API serializes employee_id without keyword on both scoped contract routes",async()=>{
 const original=globalThis.fetch;const urls:string[]=[];
 globalThis.fetch=async(input)=>{urls.push(String(input));return new Response(JSON.stringify({data:response(3)}),{status:200,headers:{"content-type":"application/json"}})};
 try{for(const selfOnly of [false,true])await hrApi.contracts("test-token",3,50,{employeeId:"00000000-0000-4000-8000-000000000001"},selfOnly);
  for(const path of urls){const url=new URL(path,"http://localhost");assert.equal(url.searchParams.get("employee_id"),"00000000-0000-4000-8000-000000000001");assert.equal(url.searchParams.get("page"),"3");assert.equal(url.searchParams.get("page_size"),"50");assert.equal(url.searchParams.has("keyword"),false)}assert.ok(urls[1]?.includes("/contracts/me?"));
 }finally{globalThis.fetch=original}
});

test("employee contract panel uses exact identity across more than 100 history rows",async()=>{
 const calls:unknown[]=[];const store=createEmployeeContracts("exact-employee",async(id,page,size)=>{calls.push([id,page,size]);return response(page)});
 await store.load();assert.equal(store.getSnapshot().items.length,50);await store.load(2);assert.equal(store.getSnapshot().items[0]?.id,"50");await store.load(3);assert.equal(store.getSnapshot().items.length,13);
 assert.deepEqual(calls,[["exact-employee",1,50],["exact-employee",2,50],["exact-employee",3,50]]);
});
test("employee contract panel rejects stale page errors and cleared employee contexts",async()=>{
 const old=deferred<ReturnType<typeof response>>();const store=createEmployeeContracts("employee",async(_id,page)=>page===1?old.promise:response(page));
 const pending=store.load();await store.load(2);old.reject(new Error("403 private"));await pending;assert.equal(store.getSnapshot().page,2);assert.equal(store.getSnapshot().error,"");
 const late=deferred<ReturnType<typeof response>>();const previous=createEmployeeContracts("previous",()=>late.promise);const work=previous.load();previous.cancel();late.resolve(response(1));await work;assert.deepEqual(previous.getSnapshot().items,[]);
 const denied=createEmployeeContracts("denied",async()=>{throw new Error("403 personal info")});await denied.load();assert.equal(denied.getSnapshot().total,0);assert.deepEqual(denied.getSnapshot().items,[]);assert.ok(!denied.getSnapshot().error.includes("personal info"));
});

test("directory requests fixed 50 rows and replaces pages with disjoint IDs",async()=>{
 const calls:number[][]=[];const fetch=async(page:number,size:number)=>{calls.push([page,size]);return response(page)};
 const first=await fetchEmployeePage(fetch,1,()=>true),second=await fetchEmployeePage(fetch,2,()=>true),last=await fetchEmployeePage(fetch,3,()=>true);
 assert.deepEqual(calls,[[1,50],[2,50],[3,50]]);assert.equal(first?.items.length,50);assert.equal(second?.items.length,50);assert.equal(last?.items.length,13);
 assert.equal(new Set([...first!.items,...second!.items].map(row=>row.id)).size,100);
 assert.equal(clampEmployeePage(99,113),3);assert.equal(clampEmployeePage(-2,113),1);assert.equal(clampEmployeePage(3,0),1);
});
test("shrinking server count clamps and refetches instead of retaining empty late page",async()=>{
 const calls:number[]=[];const result=await fetchEmployeePage(async(page)=>{calls.push(page);return response(page,21)},3,()=>true);
 assert.deepEqual(calls,[3,1]);assert.equal(result?.page,1);assert.equal(result?.items.length,21);
});
test("malformed and oversized responses fail closed",async()=>{
 for(const bad of [{...response(1),page_size:100},{...response(1),total:-1},{...response(1),items:[{id:"x"},{id:"x"}]},{...response(1),items:Array.from({length:51},(_,i)=>({id:String(i)}))}])await assert.rejects(fetchEmployeePage(async()=>bad,1,()=>true),/员工分页响应无效/);
});
test("new list wins over late list and old finally cannot stop newer loading",async()=>{
 const scope=createEmployeeRequestScope(),old=deferred<ReturnType<typeof response>>();const first=scope.list();let loading=true;
 const pending=fetchEmployeePage(()=>old.promise,1,first).finally(()=>{if(first())loading=false});
 const second=scope.list();const current=await fetchEmployeePage(async()=>response(2),2,second);old.resolve(response(1));
 assert.equal(await pending,null);assert.equal(current?.page,2);assert.equal(loading,true);assert.equal(second(),true);
});
test("filter/context reset invalidates list, detail partitions, mutation followups and old errors",async()=>{
 const scope=createEmployeeRequestScope(),list=scope.list(),detail=scope.detail(),mutation=scope.capture();
 const old=deferred<string>();let writes=0,errors=0,settles=0;
 const pending=old.promise.then(()=>{if(mutation())writes++}).catch(()=>{if(mutation())errors++}).finally(()=>{if(mutation())settles++});
 scope.invalidate();old.reject(new Error("403 private old context"));await pending;
 assert.equal(list(),false);assert.equal(detail(),false);assert.deepEqual([writes,errors,settles],[0,0,0]);
 assert.equal(scope.list()(),true);
});
test("selection switch discards every late profile/records/events/contracts partition",async()=>{
 const scope=createEmployeeRequestScope(),first=scope.detail();const partitions=Array.from({length:4},()=>deferred<string>());let published:string[]=[];
 const pending=Promise.all(partitions.map(item=>item.promise)).then(rows=>{if(first())published=rows});
 const second=scope.detail();for(const part of partitions)part.resolve("old");await pending;
 assert.deepEqual(published,[]);assert.equal(second(),true);
});
test("stale detail failure cannot clear new employee or report old 403",async()=>{
 const scope=createEmployeeRequestScope(),first=scope.detail(),old=deferred<string>();let selected="new",message="";
 const pending=old.promise.catch(()=>{if(first()){selected="";message="403"}});scope.detail();old.reject(new Error("403"));await pending;
 assert.equal(selected,"new");assert.equal(message,"");
});
test("mutation success cannot start refresh after navigation while current mutation remains valid",async()=>{
 const scope=createEmployeeRequestScope(),current=scope.capture(),old=deferred<void>();let refreshes=0;
 const pending=old.promise.then(()=>{if(current())refreshes++});scope.invalidate();old.resolve();await pending;assert.equal(refreshes,0);
 const same=scope.capture();await Promise.resolve();if(same())refreshes++;assert.equal(refreshes,1);
});

test("manager lookup crosses directory pages without accumulating candidates or losing selection",async()=>{
 const calls:unknown[]=[];const store=createManagerCandidates("0","90",async(keyword,page,size)=>{calls.push([keyword,page,size]);return {...response(page),items:response(page).items.map(row=>({...row,fullName:`Manager ${row.id}`,employmentStatus:row.id==="2"?"departed":"active"}))}});
 await store.load();assert.equal(store.getSnapshot().items.length,48);assert.equal(store.getSnapshot().selectedId,"90");
 await store.load("",2);store.select("80");assert.equal(store.getSnapshot().selectedId,"80");
 await store.load("",3);assert.equal(store.getSnapshot().items.length,13);assert.equal(store.getSnapshot().selectedId,"80");assert.equal(store.getSnapshot().selectedLabel,"Manager 80");
 assert.deepEqual(calls,[["",1,50],["",2,50],["",3,50]]);
});
test("manager search resets page and ignores stale options and stale errors",async()=>{
 const old=deferred<{items:{id:string;fullName:string;employmentStatus:string}[];page:number;page_size:number;total:number}>();
 const store=createManagerCandidates("employee",null,async(keyword)=>keyword==="old"?old.promise:{items:[{id:"manager",fullName:"Current",employmentStatus:"active"}],page:1,page_size:50,total:1});
 const pending=store.load("old",2);await store.load("new",1);old.reject(new Error("old scope"));await pending;
 assert.equal(store.getSnapshot().page,1);assert.equal(store.getSnapshot().items[0]?.id,"manager");assert.equal(store.getSnapshot().error,"");assert.equal(store.getSnapshot().loading,false);
});
test("failed or cancelled manager reads preserve historical binding and reject unknown selections",async()=>{
 const store=createManagerCandidates("employee","historical",async()=>{throw new Error("denied")});await store.load();store.select("invented");assert.equal(store.getSnapshot().selectedId,"historical");assert.ok(store.getSnapshot().error);
 const pending=deferred<{items:{id:string;fullName:string;employmentStatus:string}[];total:number;page:number;page_size:number}>();
 const other=createManagerCandidates("other",null,()=>pending.promise);const job=other.load();other.cancel();pending.resolve({items:[{id:"late",fullName:"Late",employmentStatus:"active"}],total:1,page:1,page_size:50});await job;assert.deepEqual(other.getSnapshot().items,[]);
});
