import assert from "node:assert/strict";
import test from "node:test";
import { createContractLedger,clampContractPage,runContractContextAction,type ContractLedgerQuery } from "./contract-ledger";

const query:ContractLedgerQuery={contextKey:"tenant/park/user/permissions",canRead:true,canManage:true,selfOnly:false,keyword:"",status:""};
function deferred<T>() { let resolve!:(value:T)=>void,reject!:(error:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject}; }
const page=(number:number,total=113)=>({page:number,page_size:50,total,items:Array.from({length:Math.min(50,Math.max(0,total-(number-1)*50))},(_,index)=>({id:`row-${(number-1)*50+index}`}))});
function fixture(){
 const lists:Array<{query:ContractLedgerQuery;page:number;size:number;response:ReturnType<typeof deferred<ReturnType<typeof page>>>}>=[];
 const active:Array<ReturnType<typeof deferred<number>>>=[],details:Array<{id:string;response:ReturnType<typeof deferred<{id:string}>>}>=[];
 const ledger=createContractLedger<{id:string},{id:string}>({list:(q,p,size)=>{const response=deferred<ReturnType<typeof page>>();lists.push({query:q,page:p,size,response});return response.promise;},activeTotal:()=>{const response=deferred<number>();active.push(response);return response.promise;},detail:id=>{const response=deferred<{id:string}>();details.push({id,response});return response.promise;},error:(_error,fallback)=>fallback});
 ledger.configure(query);return {ledger,lists,active,details};
}
async function loaded(){const result=fixture(),pending=result.ledger.load();result.lists[0]!.response.resolve(page(1));result.active[0]!.resolve(57);await pending;return result;}
const tick=()=>new Promise<void>(resolve=>setImmediate(resolve));
for(const outcome of ["resolve","reject"] as const)test(`reminder mutation ${outcome} after identity switch does not refresh or publish`,async()=>{
 const work=deferred<number>();let context="old";const calls:string[]=[];
 const pending=runContractContextAction({isCurrent:()=>context==="old",work:()=>work.promise,refresh:async()=>{calls.push("refresh");},success:()=>{calls.push("success");},error:()=>{calls.push("error");},settled:()=>{calls.push("settled");}});
 context="new";if(outcome==="resolve")work.resolve(1);else work.reject(new Error("old"));await pending;
 assert.deepEqual(calls,[]);
});
test("reminder context switch during refresh suppresses final feedback; current action completes",async()=>{
 for(const switchContext of [false,true]){
  let current=true;const refresh=deferred<void>(),calls:string[]=[];
  const pending=runContractContextAction({isCurrent:()=>current,work:async()=>1,refresh:()=>refresh.promise,success:()=>{calls.push("success");},error:()=>{calls.push("error");},settled:()=>{calls.push("settled");}});
  await tick();if(switchContext)current=false;refresh.resolve();await pending;
  assert.deepEqual(calls,switchContext?[]:["success","settled"]);
 }
});
test("bounded 50 row pages and independent active total publish atomically; filters reset page and selection",async()=>{
 const {ledger,lists,active,details}=fixture();let pending=ledger.load();lists[0]!.response.resolve(page(1));await tick();
 assert.equal(ledger.getSnapshot().loading,true);assert.equal(ledger.getSnapshot().rows.length,0);
 active[0]!.resolve(57);await pending;assert.equal(ledger.getSnapshot().activeTotal,57);
 pending=ledger.load(2);lists[1]!.response.resolve(page(2));active[1]!.resolve(57);await pending;
 assert.equal(ledger.getSnapshot().rows.length,50);assert.equal(ledger.getSnapshot().rows[0]!.id,"row-50");
 const detail=ledger.pick({id:"row-50"});details[0]!.response.resolve({id:"row-50"});await detail;
 ledger.configure({...query,status:"expired",keyword:"filter"});assert.equal(ledger.getSnapshot().page,1);assert.equal(ledger.getSnapshot().selected,null);assert.equal(ledger.getSnapshot().activeTotal,0);
 pending=ledger.load();assert.equal(lists[2]!.query.status,"expired");lists[2]!.response.resolve(page(1,56));active[2]!.resolve(57);await pending;
 assert.equal(ledger.getSnapshot().total,56);assert.equal(ledger.getSnapshot().activeTotal,57);assert(lists.every(call=>call.size===50));
 assert.equal(clampContractPage(999,113),3);assert.equal(clampContractPage(-1,0),1);
});
test("shrinking totals clamp and refetch server page",async()=>{
 const {ledger,lists,active}=await loaded();const pending=ledger.load(3);lists[1]!.response.resolve(page(3,51));active[1]!.resolve(40);await tick();
 assert.equal(lists[2]!.page,2);lists[2]!.response.resolve(page(2,51));active[2]!.resolve(40);await pending;
 assert.equal(ledger.getSnapshot().page,2);assert.equal(ledger.getSnapshot().rows.length,1);assert.equal(ledger.getSnapshot().loading,false);
});
for(const outcome of ["resolve","reject"] as const)test(`stale list/active ${outcome} cannot alter newer loading, counts or error`,async()=>{
 const {ledger,lists,active}=fixture(),old=ledger.load();ledger.configure({...query,contextKey:"other-permissions",keyword:"new"});const latest=ledger.load();
 lists[0]!.response.resolve(page(1));if(outcome==="resolve")active[0]!.resolve(999);else active[0]!.reject(new Error("old"));await old;
 assert.equal(ledger.getSnapshot().loading,true);assert.equal(ledger.getSnapshot().message,"");assert.equal(ledger.getSnapshot().activeTotal,0);
 lists[1]!.response.resolve(page(1,2));active[1]!.resolve(1);await latest;assert.equal(ledger.getSnapshot().activeTotal,1);
});
for(const outcome of ["resolve","reject"] as const)test(`stale detail ${outcome} does not replace newer selection/error/finally`,async()=>{
 const {ledger,details}=await loaded(),old=ledger.pick({id:"row-0"}),latest=ledger.pick({id:"row-1"});
 if(outcome==="resolve")details[0]!.response.resolve({id:"row-0"});else details[0]!.response.reject(new Error("old"));await old;
 assert.equal(ledger.getSnapshot().detailLoading,true);assert.equal(ledger.getSnapshot().message,"");assert.equal(ledger.getSnapshot().selected,null);
 details[1]!.response.resolve({id:"row-1"});await latest;assert.equal(ledger.getSnapshot().selected?.id,"row-1");
});
test("denied read does not issue list or detail; context/filter changes invalidate detail",async()=>{
 for(const changed of [{contextKey:"another-park"},{keyword:"new"},{contextKey:"denied",canRead:false,canManage:false}]){
  const {ledger,details,lists}=await loaded();const detail=ledger.pick({id:"row-0"});ledger.configure({...query,...changed});details[0]!.response.reject(new Error("old"));await detail;
  assert.equal(ledger.getSnapshot().selected,null);assert.equal(ledger.getSnapshot().message,"");assert.equal(ledger.getSnapshot().page,1);
  if(changed.canRead===false){await ledger.load();await ledger.pick({id:"row-0"});assert.equal(lists.length,1);assert.equal(details.length,1);}
 }
});
test("mutation refresh preserves selected edited row and refreshes page/active counts",async()=>{
 const {ledger,lists,active,details}=await loaded();const write=deferred<void>();let success=0;
 const pending=ledger.mutate(()=>write.promise,{selectedId:"row-0",refreshList:true,success:"saved",failure:"failed",onSuccess:()=>{success++;}});
 assert.equal(ledger.getSnapshot().saving,true);write.resolve();await tick();assert.equal(success,1);
 lists[1]!.response.resolve(page(1));active[1]!.resolve(58);await tick();details[0]!.response.resolve({id:"row-0"});await pending;
 assert.equal(ledger.getSnapshot().selected?.id,"row-0");assert.equal(ledger.getSnapshot().activeTotal,58);assert.equal(ledger.getSnapshot().message,"saved");assert.equal(ledger.getSnapshot().saving,false);
});
for(const outcome of ["resolve","reject"] as const)test(`cross-context mutation ${outcome} never launches stale followup or changes new state`,async()=>{
 const {ledger,lists,details}=await loaded();const write=deferred<void>();let success=0;
 const pending=ledger.mutate(()=>write.promise,{selectedId:"row-0",refreshList:true,success:"saved",failure:"failed",onSuccess:()=>{success++;}});
 ledger.configure({...query,contextKey:"other-user"});if(outcome==="resolve")write.resolve();else write.reject(new Error("old"));await pending;
 assert.equal(lists.length,1);assert.equal(details.length,0);assert.equal(success,0);assert.equal(ledger.getSnapshot().message,"");assert.equal(ledger.getSnapshot().saving,false);
});
test("new selection during mutation detail followup wins; failed active total blocks partial list",async()=>{
 const {ledger,details}=await loaded();const pending=ledger.mutate(async()=>undefined,{selectedId:"row-0",refreshList:false,success:"saved",failure:"failed"});await tick();
 const pick=ledger.pick({id:"row-1"});details[0]!.response.reject(new Error("old"));await pending;assert.equal(ledger.getSnapshot().detailLoading,true);
 details[1]!.response.resolve({id:"row-1"});await pick;assert.equal(ledger.getSnapshot().selected?.id,"row-1");assert.equal(ledger.getSnapshot().message,"");
 const other=fixture(),load=other.ledger.load();other.lists[0]!.response.resolve(page(1));other.active[0]!.reject(new Error("failed"));await load;
 assert.equal(other.ledger.getSnapshot().rows.length,0);assert.equal(other.ledger.getSnapshot().message,"加载劳动合同失败");
});
