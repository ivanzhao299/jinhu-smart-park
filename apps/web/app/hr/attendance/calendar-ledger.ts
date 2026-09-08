export const CALENDAR_PAGE_SIZE=20;
export const calendarPageCount=(total:number)=>Math.max(1,Math.ceil(total/CALENDAR_PAGE_SIZE));
export interface CalendarQuery {contextKey:string;canRead:boolean;year:string;month:string}
export function calendarSymbolText(day:{legacySymbol:string|null;symbolStatus:string;normalizedKind:string|null}){
 const statuses:Record<string,string>={mapped:"已映射",blank:"空白",needs_review:"待复核"};
 const raw=day.legacySymbol===null?"NULL（未记录）":day.legacySymbol===""?'""（空字符串）':JSON.stringify(day.legacySymbol);
 const interpretation=day.normalizedKind===null?"未提供":day.normalizedKind===""?'""（空字符串）':day.normalizedKind;
 return `原符号：${raw} · ${statuses[day.symbolStatus]??day.symbolStatus} · 标准解释：${interpretation}`;
}
export function createCalendarLedger<T extends {id:string}>(fetch:(query:CalendarQuery,page:number,size:number)=>Promise<{items:T[];total:number;page:number;page_size:number}>,error:(error:unknown,fallback:string)=>string){
 let generation=0,query:CalendarQuery={contextKey:"",canRead:false,year:"",month:""};
 let state={rows:[] as T[],total:0,page:1,loading:false,message:"",year:"",month:""};
 const listeners=new Set<()=>void>();
 const publish=(next:Partial<typeof state>)=>{state={...state,...next};listeners.forEach(fn=>fn())};
 function configure(next:CalendarQuery){generation++;query={...next};publish({rows:[],total:0,page:1,loading:false,message:"",year:next.year,month:next.month})}
 async function load(requested=state.page):Promise<void>{
  if(!query.canRead)return;
  if((query.year&&!/^(19\d{2}|20\d{2}|21\d{2}|2200)$/.test(query.year))||(query.month&&!/^(?:[1-9]|1[0-2])$/.test(query.month))){publish({rows:[],total:0,message:"请输入 1900–2200 年及 1–12 月。"});return}
  const page=Math.max(1,Math.min(calendarPageCount(state.total),Number.isSafeInteger(requested)?requested:1)),request=++generation,requestQuery=query,current=()=>request===generation&&query===requestQuery;
  publish({rows:[],page,loading:true,message:""});
  try{const result=await fetch(requestQuery,page,CALENDAR_PAGE_SIZE);if(!current())return;
   if(!Number.isSafeInteger(result.total)||result.total<0||result.page!==page||result.page_size!==CALENDAR_PAGE_SIZE||!Array.isArray(result.items)||result.items.length>CALENDAR_PAGE_SIZE||new Set(result.items.map(row=>row.id)).size!==result.items.length)throw new Error("月历分页响应无效");
   if(page>calendarPageCount(result.total)){publish({total:result.total});await load(calendarPageCount(result.total));return}
   publish({rows:result.items,total:result.total});
  }catch(reason){if(current())publish({rows:[],total:0,message:error(reason,"加载历史考勤月历失败")})}
  finally{if(current())publish({loading:false})}
 }
 return {getSnapshot:()=>state,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn)}},configure,load,cancel(){generation++}};
}
