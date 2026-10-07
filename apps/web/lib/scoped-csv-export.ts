export interface ExportPage<T> { items:T[]; total:number; page:number; page_size:number; }

/** Complete live pagination with detectable-drift checks; not an atomic snapshot. */
export async function collectScopedExport<T extends {id:string}>(
  fetchPage:(page:number,size:number)=>Promise<ExportPage<T>>,
  current:()=>boolean,
  options:{pageSize:number;limit:number;label:string},
):Promise<T[]|null>{
  const {pageSize,limit,label}=options;
  const rows:T[]=[],ids=new Set<string>();let total:number|undefined,first:ExportPage<T>|undefined;
  for(let page=1;;page++){
    if(!current())return null;
    const result=await fetchPage(page,pageSize);if(!current())return null;
    if(!Number.isSafeInteger(result.total)||result.total<0||result.page!==page||result.page_size!==pageSize||!Array.isArray(result.items))throw new Error(`${label}分页响应无效，请重新导出。`);
    if(result.total>limit)throw new Error(`匹配${label}超过 ${limit} 条，请缩小筛选范围后导出。`);
    if(total===undefined){total=result.total;first=result;}
    if(result.total!==total||result.items.length!==Math.min(pageSize,Math.max(0,total-(page-1)*pageSize)))throw new Error(`${label}在导出期间发生变化，请重新导出。`);
    for(const row of result.items){if(typeof row?.id!=="string"||!row.id||ids.has(row.id))throw new Error(`${label}分页包含重复或无效记录，请重新导出。`);ids.add(row.id);rows.push(row);}
    if(rows.length===total)break;
  }
  if(!current())return null;
  const final=await fetchPage(1,pageSize);if(!current())return null;
  if(final.total!==total||final.page!==1||final.page_size!==pageSize||JSON.stringify(final.items)!==JSON.stringify(first!.items))throw new Error(`${label}在导出期间发生变化，请重新导出。`);
  return rows;
}

export function csvCell(value:unknown):string{
  const text=value==null?"":String(value);
  let first=0;while(first<text.length&&(text.charCodeAt(first)<32||/\s/u.test(text[first]!)))first++;
  const safe=/^[=+@-]/u.test(text.slice(first))?`'${text}`:text;
  return `"${safe.replaceAll('"','""')}"`;
}
export function csvDocument(records:readonly (readonly unknown[])[]):string{
  return "\uFEFF"+records.map(record=>record.map(csvCell).join(",")).join("\r\n");
}
export function downloadCsv(csv:string,fileName:string):void{
  const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
  try{const anchor=document.createElement("a");anchor.href=url;anchor.download=fileName;anchor.click();}
  finally{URL.revokeObjectURL(url);}
}
