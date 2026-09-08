import test from "node:test";
import assert from "node:assert/strict";
import {calendarSymbolText,createCalendarLedger} from "./calendar-ledger";
const query={contextKey:"tenant:park:user:permissions",canRead:true,year:"",month:""};
const result=(page:number,total=43)=>({page,page_size:20,total,items:Array.from({length:Math.min(20,Math.max(0,total-(page-1)*20))},(_,i)=>({id:String((page-1)*20+i)}))});
function deferred<T>(){let resolve!:(value:T)=>void,reject!:(error:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}}
const safe=()=>"读取失败";
test("43 calendars remain bounded to 20/20/3 and refresh replaces the current page",async()=>{
 const calls:unknown[]=[];const store=createCalendarLedger(async(q,page,size)=>{calls.push([q.year,q.month,page,size]);return result(page)},safe);store.configure(query);
 await store.load();assert.equal(store.getSnapshot().rows.length,20);await store.load(2);assert.equal(store.getSnapshot().rows[0]?.id,"20");await store.load(3);assert.equal(store.getSnapshot().rows.length,3);await store.load();assert.equal(store.getSnapshot().rows.length,3);
 assert.deepEqual(calls,[["","",1,20],["","",2,20],["","",3,20],["","",3,20]]);
});
test("filter resets immediately and shrinking totals clamp and refetch",async()=>{
 let total=43;const pages:number[]=[];const store=createCalendarLedger(async(_q,page)=>{pages.push(page);return result(page,total)},safe);store.configure(query);await store.load();await store.load(3);total=3;await store.load();assert.equal(store.getSnapshot().page,1);assert.deepEqual(pages,[1,3,3,1]);
 store.configure({...query,year:"2025",month:"2"});assert.equal(store.getSnapshot().page,1);assert.deepEqual(store.getSnapshot().rows,[]);await store.load();assert.equal(store.getSnapshot().total,3);
});
test("stale filter response and 403 cannot overwrite current rows, error or loading",async()=>{
 const old=deferred<ReturnType<typeof result>>();const store=createCalendarLedger(async(q,page)=>q.year==="2024"?old.promise:result(page),safe);store.configure({...query,year:"2024"});const pending=store.load();store.configure({...query,year:"2025"});await store.load();old.reject(new Error("403 old scope"));await pending;
 assert.equal(store.getSnapshot().total,43);assert.equal(store.getSnapshot().message,"");assert.equal(store.getSnapshot().loading,false);
});
test("identity or denied context clears rows and cancels old completion without new requests",async()=>{
 const old=deferred<ReturnType<typeof result>>();let calls=0;const store=createCalendarLedger(async()=>{calls++;return old.promise},safe);store.configure(query);const pending=store.load();store.configure({...query,contextKey:"other",canRead:false});await store.load();old.resolve(result(1));await pending;assert.equal(calls,1);assert.deepEqual(store.getSnapshot().rows,[]);assert.equal(store.getSnapshot().total,0);
});
test("invalid year/month never issues API requests and malformed pages fail closed",async()=>{
 let calls=0;const store=createCalendarLedger(async()=>{calls++;return {...result(1),page_size:100}},safe);
 for(const value of [{year:"202",month:""},{year:"2201",month:""},{year:"2025",month:"13"}]){store.configure({...query,...value});await store.load();assert.ok(store.getSnapshot().message)}assert.equal(calls,0);
 store.configure(query);await store.load();assert.deepEqual(store.getSnapshot().rows,[]);assert.equal(store.getSnapshot().message,"读取失败");
});
test("symbol text preserves null, empty, whitespace and actual server interpretation without guessing",()=>{
 assert.match(calendarSymbolText({legacySymbol:null,symbolStatus:"blank",normalizedKind:null}),/NULL（未记录）.*空白.*未提供/);
 assert.match(calendarSymbolText({legacySymbol:"",symbolStatus:"blank",normalizedKind:null}),/""（空字符串）/);
 assert.match(calendarSymbolText({legacySymbol:" ",symbolStatus:"needs_review",normalizedKind:null}),/" ".*待复核.*未提供/);
 assert.match(calendarSymbolText({legacySymbol:"X",symbolStatus:"mapped",normalizedKind:"source_kind"}),/"X".*已映射.*source_kind/);
 assert.match(calendarSymbolText({legacySymbol:"?",symbolStatus:"needs_review",normalizedKind:""}),/标准解释：""（空字符串）/);
});
