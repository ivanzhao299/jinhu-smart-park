"use client";
import { useEffect, useRef, useState } from "react";
import { getAccessToken } from "../../../lib/authz";
import { hrApi, type HrCompensationEmployeeOption, type HrCompensationEmployeeOptions } from "../../../lib/hr-api";
import local from "./compensation-ledger.module.css";

export function CompensationEmployeePicker({ onSelect }: { onSelect: (employee: HrCompensationEmployeeOption) => void }) {
 const [search,setSearch] = useState(""), [query,setQuery] = useState({page:1,keyword:"",revision:0});
 const [result,setResult] = useState<HrCompensationEmployeeOptions|null>(null), [error,setError] = useState("");
 const generation=useRef(0);
 useEffect(() => {
  const controller = new AbortController(),request=++generation.current; setResult(null); setError("");
  void hrApi.compensationEmployeeOptions(getAccessToken(),query.page,query.keyword,undefined,controller.signal).then(value => {
   if (controller.signal.aborted || request!==generation.current) return;
   if (!value || value.page !== query.page || value.page_size !== 20 || !Number.isSafeInteger(value.total) || value.total < 0 || !Array.isArray(value.items) || value.items.length > 20 || !value.items.every(row => row && [row.id,row.employeeName,row.employeeCode,row.employmentStatus].every(field => typeof field === "string" && !!field))) throw new Error("员工候选响应无法核对。");
   if (query.page > Math.max(1,Math.ceil(value.total/20))) { setQuery(current => ({...current,page:1})); return; }
   setResult(value);
  }).catch(reason => { if (!controller.signal.aborted && request===generation.current) setError(reason instanceof Error ? reason.message : "读取员工候选失败。"); });
  return () => controller.abort();
 }, [query]);
 return <section className={local.panel} aria-label="定薪员工选择"><h3>选择员工</h3><p>按姓名或员工编号搜索全部正式员工记录；历史任职状态不直接决定工资核算资格。</p>
  <form className={local.search} onSubmit={event => { event.preventDefault(); setQuery(current => ({...current,page:1,keyword:search.trim(),revision:current.revision+1})); }}><label className="form-field"><span>查找定薪员工</span><input value={search} maxLength={100} onChange={event => setSearch(event.target.value)}/></label><button className="ds-button">查询员工</button></form>
  {error ? <p role="alert">{error}</p> : !result ? <p role="status">正在读取员工候选…</p> : null}
  {result ? <><div className={local.records}>{result.items.map(row => <article className="ds-mobile-record" key={row.id}><strong>{row.employeeName} · {row.employeeCode}</strong><button type="button" className="ds-button" onClick={() => onSelect(row)}>为此员工定薪</button></article>)}</div>{!result.items.length ? <p>暂无匹配员工。</p> : null}<div className={local.pagination}><button type="button" className="ds-button" disabled={query.page===1} onClick={() => setQuery(current => ({...current,page:current.page-1}))}>员工上一页</button><span>第 {query.page} 页 · 共 {result.total} 人</span><button type="button" className="ds-button" disabled={query.page*20>=result.total} onClick={() => setQuery(current => ({...current,page:current.page+1}))}>员工下一页</button></div></> : null}
  {error ? <button type="button" className="ds-button" onClick={() => setQuery(current => ({...current,revision:current.revision+1}))}>重试读取员工候选</button> : null}
 </section>;
}
