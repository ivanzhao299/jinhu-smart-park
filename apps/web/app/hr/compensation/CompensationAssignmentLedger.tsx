"use client";

import { HR_PERMISSIONS as H } from "@jinhu/shared";
import { useEffect, useRef, useState } from "react";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { hasPermission } from "../../../lib/permissions";
import { hrApi, type HrCompensationAssignment } from "../../../lib/hr-api";
import { validCompensationAssignment as validAssignment } from "./compensation-contract";
import styles from "../hr-workbench.module.css";
import local from "./compensation-ledger.module.css";

type Props = { refreshVersion?: number };
type Snapshot = { key: string; items: HrCompensationAssignment[]; total: number };
const statusLabels: Record<string, string> = { active: "启用", inactive: "停用", draft: "草稿", void: "作废", superseded: "已替代" };

export function CompensationAssignmentLedger(props: Props) {
 const user = useAuthUser();
 if (!hasPermission(user,H.HR_COMPENSATION_READ)) return null;
 return <LedgerContent {...props} key={JSON.stringify(user)}/>;
}

function LedgerContent({ refreshVersion = 0 }: Props) {
 const [search,setSearch] = useState(""), [query,setQuery] = useState({page:1,keyword:"",refresh:0});
 const [snapshot,setSnapshot] = useState<Snapshot|null>(null), [error,setError] = useState(""), [loading,setLoading] = useState(false);
 const generation = useRef(0);
 const key = JSON.stringify([query,refreshVersion]);
 const current = snapshot?.key === key ? snapshot : null;
 useEffect(() => {
  const controller = new AbortController(), request = ++generation.current;
  setLoading(true); setError(""); setSnapshot(null);
  void hrApi.compensationAssignments(getAccessToken(),query.page,20,query.keyword,controller.signal).then(result => {
   if (controller.signal.aborted || request !== generation.current) return;
   if (!result || result.page !== query.page || result.page_size !== 20 || !Number.isSafeInteger(result.total) || result.total < 0 || !Array.isArray(result.items) || result.items.length > 20 || !result.items.every(validAssignment)) throw new Error("定薪台账响应无法核对，请重新读取。");
   if (query.page > Math.max(1,Math.ceil(result.total/20))) { setQuery(value => ({...value,page:1})); return; }
   setSnapshot({key,items:result.items,total:result.total});
  }).catch(reason => {
   if (!controller.signal.aborted && request === generation.current) { setSnapshot(null); setError(reason instanceof Error ? reason.message : "读取定薪台账失败。"); }
  }).finally(() => { if (!controller.signal.aborted && request === generation.current) setLoading(false); });
  return () => controller.abort();
 }, [key,query.page,query.keyword]);
 const refresh = () => setQuery(value => ({...value,refresh:value.refresh+1}));
 return <section className={`ds-panel ${local.panel}`} aria-label="员工定薪台账">
  <div className={styles.sectionHeading}><div><span className="ds-eyebrow">正式薪酬记录</span><h2>员工定薪台账</h2></div><button type="button" className="ds-button ds-button-secondary" disabled={loading} onClick={refresh}>刷新定薪台账</button></div>
  <p>查看已保存的定薪与生效期，包括离职员工的留存记录。这里的金额是薪酬设置，工资核算仍需核对考勤、社保及计税规则。</p>
  <form className={local.search} onSubmit={event => {event.preventDefault();setQuery(value => ({...value,page:1,keyword:search.trim(),refresh:value.refresh+1}));}}><label className="form-field"><span>查找员工或薪酬方案</span><input value={search} maxLength={100} onChange={event => setSearch(event.target.value)} placeholder="姓名、员工编号、方案名称或编码"/></label><button className="ds-button ds-button-secondary">查询定薪记录</button></form>
  {loading ? <p role="status">正在读取定薪台账…</p> : null}
  {error ? <div role="alert"><p>{error}</p><button type="button" className="ds-button" onClick={refresh}>重试读取定薪台账</button></div> : null}
  {current ? <><div className={local.records}>{current.items.map(row => <article className="ds-mobile-record" key={row.id}>
   <strong>{row.employeeName} · {row.employeeCode}</strong><span>{row.planName}（{row.planCode}）</span>
   <span>{statusLabels[row.status] ?? row.status} · 记录版本 {row.version}</span><span>生效日期 {row.effectiveFrom} · {row.effectiveTo ? `截止 ${row.effectiveTo}` : "未设置截止日期"}</span>
   <dl className={local.amounts}><div><dt>基本工资</dt><dd>{row.baseSalary} 元</dd></div><div><dt>津贴</dt><dd>{row.allowanceAmount} 元</dd></div><div><dt>目标浮动薪资</dt><dd>{row.variableTarget} 元</dd></div></dl>
  </article>)}</div>{!current.items.length ? <p>暂无匹配的员工定薪记录。</p> : null}
   <div className={local.pagination}><button type="button" className="ds-button" disabled={query.page===1} onClick={() => setQuery(value => ({...value,page:value.page-1}))}>定薪记录上一页</button><span>第 {query.page} / {Math.max(1,Math.ceil(current.total/20))} 页 · 共 {current.total} 条</span><button type="button" className="ds-button" disabled={query.page*20>=current.total} onClick={() => setQuery(value => ({...value,page:value.page+1}))}>定薪记录下一页</button></div>
  </> : null}
 </section>;
}
