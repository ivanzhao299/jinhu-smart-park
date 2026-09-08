export const EMPLOYEE_PAGE_SIZE = 50;
export function createEmployeeContracts<T extends {id:string}>(employeeId:string,fetch:(employeeId:string,page:number,size:number)=>Promise<{items:T[];total:number;page:number;page_size:number}>) {
  let generation=0;
  let state={items:[] as T[],total:0,page:1,loading:true,error:""};
  const listeners=new Set<()=>void>();
  const publish=(next:Partial<typeof state>)=>{state={...state,...next};listeners.forEach(fn=>fn())};
  async function load(page=state.page){
    const request=++generation,current=()=>request===generation;
    publish({items:[],page,loading:true,error:""});
    try{const result=await fetchEmployeePage((next,size)=>fetch(employeeId,next,size),page,current);if(result&&current())publish({items:result.items,total:result.total,page:result.page})}
    catch{if(current())publish({items:[],total:0,error:"劳动合同读取失败或当前无权访问，请重试。"})}
    finally{if(current())publish({loading:false})}
  }
  return {getSnapshot:()=>state,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn)}},load,cancel(){generation++}};
}
export const employeePageCount = (total: number) => Math.max(1, Math.ceil(total / EMPLOYEE_PAGE_SIZE));
export const clampEmployeePage = (page: number, total: number) => Math.max(1, Math.min(employeePageCount(total), Number.isSafeInteger(page) ? page : 1));

/** One directory interaction owns every list/detail/mutation continuation. */
export function createEmployeeRequestScope() {
  let epoch = 0, list = 0, detail = 0;
  return {
    invalidate() { epoch++; list++; detail++; },
    capture() { const owner = epoch; return () => owner === epoch; },
    list() { const owner = epoch, request = ++list; detail++; return () => owner === epoch && request === list; },
    detail() { const owner = epoch, request = ++detail; return () => owner === epoch && request === detail; },
  };
}

export async function fetchEmployeePage<T extends { id: string }>(fetchPage: (page: number, size: number) => Promise<{items:T[]; total:number; page:number; page_size:number}>, requested: number, current: () => boolean) {
  let page = Math.max(1, Number.isSafeInteger(requested) ? requested : 1);
  for (;;) {
    const result = await fetchPage(page, EMPLOYEE_PAGE_SIZE);
    if (!current()) return null;
    if (!Number.isSafeInteger(result.total) || result.total < 0 || result.page !== page || result.page_size !== EMPLOYEE_PAGE_SIZE || !Array.isArray(result.items) || result.items.length > EMPLOYEE_PAGE_SIZE || new Set(result.items.map(row => row.id)).size !== result.items.length) throw new Error("员工分页响应无效");
    const last = employeePageCount(result.total);
    if (page <= last) return result;
    page = last;
  }
}

/** A candidate page is not the whole catalog; retain exactly one chosen binding. */
export function createManagerCandidates<T extends {id:string;fullName:string;employmentStatus:string}>(employeeId:string, existingId:string|null, fetch:(keyword:string,page:number,size:number)=>Promise<{items:T[];total:number;page:number;page_size:number}>) {
  let generation=0;
  let state={items:[] as T[],keyword:"",page:1,total:0,loading:true,error:"",selectedId:existingId??"",selectedLabel:existingId?"当前直属上级（保留原关联）":""};
  const listeners=new Set<()=>void>();
  const publish=(next:Partial<typeof state>)=>{state={...state,...next};listeners.forEach(fn=>fn())};
  async function load(keyword=state.keyword,page=state.page){
    const request=++generation,current=()=>request===generation;
    publish({keyword,page,items:[],loading:true,error:""});
    try{const result=await fetchEmployeePage((next,size)=>fetch(keyword,next,size),page,current);if(!result||!current())return;
      const items=result.items.filter(row=>row.id!==employeeId&&row.employmentStatus!=="departed");
      const selected=items.find(row=>row.id===state.selectedId);
      publish({items,total:result.total,page:result.page,...(selected?{selectedLabel:selected.fullName}:{})});
    }catch{if(current())publish({error:"上级候选加载失败，请重试；原关联未改变。"})}
    finally{if(current())publish({loading:false})}
  }
  return {getSnapshot:()=>state,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn)}},load,
    select(id:string){if(state.loading||state.error)return;const row=state.items.find(item=>item.id===id);if(!id||row)publish({selectedId:id,selectedLabel:row?.fullName??""})},
    cancel(){generation++},
  };
}
