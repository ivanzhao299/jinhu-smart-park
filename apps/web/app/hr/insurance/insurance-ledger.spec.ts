import assert from "node:assert/strict";
import test from "node:test";
import { createInsuranceLedger,clampInsurancePage,INSURANCE_PAGE_SIZE,type InsuranceLedgerQuery } from "./insurance-ledger";

const query:InsuranceLedgerQuery={contextKey:"tenant/park/user/permissions",canRead:true,selfOnly:false,keyword:"",year:"",month:"",reviewOnly:false};
function deferred<T>() { let resolve!:(value:T)=>void,reject!:(error:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject}; }
const page=(number:number,total=64)=>({page:number,page_size:30,total,items:Array.from({length:Math.min(30,Math.max(0,total-(number-1)*30))},(_,index)=>({id:`row-${(number-1)*30+index}`}))});
function fixture(){
 const lists:Array<{query:InsuranceLedgerQuery;page:number;size:number;response:ReturnType<typeof deferred<ReturnType<typeof page>>>}>=[];
 const details:Array<{id:string;response:ReturnType<typeof deferred<{id:string}>>}>=[];
 const ledger=createInsuranceLedger<{id:string}>({list:(q,p,size)=>{const response=deferred<ReturnType<typeof page>>();lists.push({query:q,page:p,size,response});return response.promise;},detail:id=>{const response=deferred<{id:string}>();details.push({id,response});return response.promise;},error:(_error,fallback)=>fallback});
 ledger.configure(query);return {ledger,lists,details};
}
test("server pages replace rather than accumulate rows, clamp bounds and reset filter selection",async()=>{
 const {ledger,lists,details}=fixture();
 let pending=ledger.load();lists[0]!.response.resolve(page(1));await pending;
 pending=ledger.load(2);assert.equal(ledger.getSnapshot().rows.length,0);lists[1]!.response.resolve(page(2));await pending;
 assert.equal(ledger.getSnapshot().rows.length,30);assert.equal(ledger.getSnapshot().rows[0]!.id,"row-30");
 const detail=ledger.pick(ledger.getSnapshot().rows[0]!);details[0]!.response.resolve({id:"row-30"});await detail;
 ledger.configure({...query,year:"2025",month:"4",keyword:"employee",reviewOnly:true});
 assert.equal(ledger.getSnapshot().page,1);assert.equal(ledger.getSnapshot().selected,null);assert.deepEqual(ledger.getSnapshot().rows,[]);
 pending=ledger.load();assert.equal(lists[2]!.query.year,"2025");assert.equal(lists[2]!.page,1);lists[2]!.response.resolve(page(1,1));await pending;
 assert(lists.every(call=>call.size===INSURANCE_PAGE_SIZE));assert.equal(clampInsurancePage(99,64),3);assert.equal(clampInsurancePage(-1,0),1);
});
test("shrinking server total refetches a valid page",async()=>{
 const {ledger,lists}=fixture();let pending=ledger.load();lists[0]!.response.resolve(page(1));await pending;
 pending=ledger.load(3);lists[1]!.response.resolve(page(3,31));await Promise.resolve();
 assert.equal(lists[2]!.page,2);lists[2]!.response.resolve(page(2,31));await pending;
 assert.equal(ledger.getSnapshot().page,2);assert.equal(ledger.getSnapshot().rows.length,1);assert.equal(ledger.getSnapshot().loading,false);
});
for(const outcome of ["resolve","reject"] as const)test(`stale list ${outcome} and finally cannot mutate newer loading/results`,async()=>{
 const {ledger,lists}=fixture();const old=ledger.load();ledger.invalidate();ledger.configure({...query,keyword:"new"});const latest=ledger.load();
 if(outcome==="resolve")lists[0]!.response.resolve(page(1));else lists[0]!.response.reject(new Error("old"));await old;
 assert.equal(ledger.getSnapshot().loading,true);assert.equal(ledger.getSnapshot().message,"");assert.deepEqual(ledger.getSnapshot().rows,[]);
 lists[1]!.response.resolve(page(1,2));await latest;assert.equal(ledger.getSnapshot().total,2);
});
for(const outcome of ["resolve","reject"] as const)test(`stale detail ${outcome} cannot overwrite newer detail`,async()=>{
 const {ledger,lists,details}=fixture();const load=ledger.load();lists[0]!.response.resolve(page(1));await load;
 const old=ledger.pick({id:"row-0"}),latest=ledger.pick({id:"row-1"});
 if(outcome==="resolve")details[0]!.response.resolve({id:"row-0"});else details[0]!.response.reject(new Error("old"));await old;
 assert.equal(ledger.getSnapshot().detailLoading,true);assert.equal(ledger.getSnapshot().message,"");assert.equal(ledger.getSnapshot().selected,null);
 details[1]!.response.resolve({id:"row-1"});await latest;assert.equal(ledger.getSnapshot().selected?.id,"row-1");
});
test("filter/context/permission invalidation prevents old details and old list reappearing",async()=>{
 for(const change of [{keyword:"new"},{contextKey:"other-park"},{contextKey:"other-user"},{contextKey:"other-permissions",canRead:false}]){
  const {ledger,lists,details}=fixture();const load=ledger.load();lists[0]!.response.resolve(page(1));await load;
  const detail=ledger.pick({id:"row-0"});ledger.configure({...query,...change});details[0]!.response.resolve({id:"row-0"});await detail;
  assert.equal(ledger.getSnapshot().selected,null);assert.deepEqual(ledger.getSnapshot().rows,[]);assert.equal(ledger.getSnapshot().detailLoading,false);
  if(change.canRead===false){await ledger.load();assert.equal(lists.length,1);}
 }
});
test("paging immediately invalidates detail; invalid oversized page rejected",async()=>{
 const {ledger,lists,details}=fixture();const load=ledger.load();lists[0]!.response.resolve(page(1));await load;
 const detail=ledger.pick({id:"row-0"});const next=ledger.load(2);details[0]!.response.reject(new Error("old"));await detail;
 assert.equal(ledger.getSnapshot().message,"");assert.equal(ledger.getSnapshot().loading,true);
 lists[1]!.response.resolve({...page(2),items:Array.from({length:31},(_,i)=>({id:String(i)}))});await next;
 assert.equal(ledger.getSnapshot().rows.length,0);assert.equal(ledger.getSnapshot().message,"加载社保台账失败");
});
