"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { hasPermission } from "../../../lib/permissions";
import { hrApi, type HrPayrollBook, type HrPayrollFormula, type HrPayrollFormulaDetail } from "../../../lib/hr-api";
import { hrLoadErrorMessage } from "../hr-errors";
import workbench from "../hr-workbench.module.css";
import styles from "./payroll-formula-review.module.css";
const labels = { parsed: "已解析待复核", manual_review: "待人工复核", approved_for_simulation: "已批准用于模拟", rejected: "已拒绝" };
type Status = "" | keyof typeof labels;
export function PayrollFormulaReview() { const user=useAuthUser(); return <FormulaWorkspace key={JSON.stringify(user)} />; }
function FormulaWorkspace() {
 const user=useAuthUser(), canRead=hasPermission(user,HR_PERMISSIONS.HR_PAYROLL_RULE_READ), canReview=hasPermission(user,HR_PERMISSIONS.HR_PAYROLL_FORMULA_REVIEW);
 const [status,setStatus]=useState<Status>(""),[book,setBook]=useState<HrPayrollBook|null>(null),[bookPage,setBookPage]=useState(1),[books,setBooks]=useState<HrPayrollBook[]>([]),[bookTotal,setBookTotal]=useState(0),[page,setPage]=useState(1),[rows,setRows]=useState<HrPayrollFormula[]>([]),[total,setTotal]=useState(0),[selected,setSelected]=useState<HrPayrollFormulaDetail|null>(null),[reason,setReason]=useState(""),[loading,setLoading]=useState(false),[detailLoading,setDetailLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[detailError,setDetailError]=useState(""),[notice,setNotice]=useState(""),[committed,setCommitted]=useState(false);
 const alive=useRef(true),request=useRef<AbortController|null>(null),detailRequest=useRef<AbortController|null>(null),writeLock=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;request.current?.abort();detailRequest.current?.abort();};},[]);
 const clearDetail=useCallback(()=>{detailRequest.current?.abort();setSelected(null);setReason("");setDetailError("");setDetailLoading(false);setCommitted(false);setNotice("");},[]);
 const load=useCallback(async()=>{
  if(!canRead)return;
  const c=new AbortController();request.current?.abort();request.current=c;setLoading(true);setError("");
  try {const [f,b]=await Promise.all([hrApi.payrollHistoryFormulas(getAccessToken(),page,20,{...(book?{bookId:book.id}:{}),...(status?{parseStatus:status}:{})},c.signal),hrApi.payrollHistoryBooks(getAccessToken(),bookPage,20,c.signal)]);if(alive.current&&!c.signal.aborted&&request.current===c){setRows(f.items);setTotal(f.total);setBooks(b.items);setBookTotal(b.total);}}
  catch(e){if(alive.current&&!c.signal.aborted&&request.current===c){setError(hrLoadErrorMessage(e,"加载工资公式失败"));throw e;}}
  finally {if(alive.current&&request.current===c)setLoading(false);}
 },[book,bookPage,canRead,page,status]);
 useEffect(()=>{clearDetail();void load().catch(()=>undefined);return()=>request.current?.abort();},[clearDetail,load]);
 const open=async(id:string)=>{
  if(writeLock.current)return;
  clearDetail();const c=new AbortController();detailRequest.current=c;setDetailLoading(true);
  try {const data=await hrApi.payrollHistoryFormula(id,getAccessToken(),c.signal);if(alive.current&&!c.signal.aborted&&detailRequest.current===c)setSelected(data);}
  catch(e){if(alive.current&&!c.signal.aborted&&detailRequest.current===c)setDetailError(hrLoadErrorMessage(e,"加载公式详情失败"));}
  finally {if(alive.current&&detailRequest.current===c)setDetailLoading(false);}
 };
 const review=async(decision:"approve_for_simulation"|"reject")=>{
  if(!canReview||!selected||writeLock.current||committed||!reason.trim()||selected.approvalEligibility==="terminal"||decision==="approve_for_simulation"&&selected.approvalEligibility!=="syntax_ready")return;
  writeLock.current=true;setBusy(true);setDetailError("");setNotice("");
  try {await hrApi.reviewPayrollFormula(selected.id,{decision,reason:reason.trim()},getAccessToken());if(!alive.current)return;setCommitted(true);setNotice(decision==="approve_for_simulation"?"已批准用于模拟核对；实际工资仍需期间和金额验收。":"公式已拒绝，原版本保留。");try {await load();}catch {if(alive.current)setDetailError("复核已提交，列表刷新失败；请刷新查看，勿重复提交。");}}
  catch(e){if(alive.current)setDetailError(hrLoadErrorMessage(e,"公式复核失败"));}
  finally {writeLock.current=false;if(alive.current)setBusy(false);}
 };
 if(!canRead)return null;
 return <section className={`ds-panel ${styles.workspace}`} aria-labelledby="payroll-formula-heading">
  <div className={styles.actions}><h2 id="payroll-formula-heading">工资公式复核</h2><button className="ds-button" type="button" disabled={busy||loading} onClick={()=>void load().catch(()=>undefined)}>刷新公式</button></div>
  <p>核对公式、条件和项目依赖后作出明确决定。批准仅允许参与模拟核对，不发布工资条或发薪。</p>
  <div className={workbench.formGrid}><label className="form-field"><span>公式账套</span><select value={book?.id??""} disabled={busy||loading} onChange={e=>{if(writeLock.current)return;clearDetail();setBook(e.target.value?books.find(b=>b.id===e.target.value)??null:null);setPage(1);}}><option value="">全部账套</option>{book&&!books.some(b=>b.id===book.id)?<option value={book.id}>{book.bookName||`账套 ${book.legacyScheme}`}</option>:null}{books.map(b=><option key={b.id} value={b.id}>{b.bookName||`账套 ${b.legacyScheme}`}</option>)}</select></label><label className="form-field"><span>公式状态</span><select value={status} disabled={busy||loading} onChange={e=>{if(writeLock.current)return;clearDetail();setStatus(e.target.value as Status);setPage(1);}}><option value="">全部状态</option>{Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label></div>
  <div className={styles.actions}><button className="ds-button" disabled={busy||loading||bookPage<=1} onClick={()=>{if(!writeLock.current)setBookPage(p=>p-1);}} type="button">账套上一页</button><span>账套第{bookPage}/{Math.max(1,Math.ceil(bookTotal/20))}页</span><button className="ds-button" disabled={busy||loading||bookPage*20>=bookTotal} onClick={()=>{if(!writeLock.current)setBookPage(p=>p+1);}} type="button">账套下一页</button></div>
  {error?<p role="alert" className="form-error">{error}</p>:null}{loading?<p>正在加载公式…</p>:!error?<><div className={`ds-mobile-record-list ${styles.records}`}>{rows.map(f=><article className="ds-mobile-record" key={f.id}><strong>{f.itemName??"未映射项目"}</strong><span>{f.bookName||`账套 ${f.legacyScheme}`} · {labels[f.parseStatus]} · 计算顺序{f.calculationOrder}</span><button className="ds-button" type="button" disabled={busy} onClick={()=>void open(f.id)}>查看公式</button></article>)}{total===0?<p>当前筛选下暂无公式。</p>:null}</div><div className={styles.actions}><button className="ds-button" type="button" disabled={busy||page<=1} onClick={()=>{if(!writeLock.current)setPage(p=>p-1);}}>公式上一页</button><span>第{page}/{Math.max(1,Math.ceil(total/20))}页 · 共{total}条</span><button className="ds-button" type="button" disabled={busy||page*20>=total} onClick={()=>{if(!writeLock.current)setPage(p=>p+1);}}>公式下一页</button></div></>:null}
  {detailLoading?<p>正在加载公式详情…</p>:null}{detailError?<p className="form-error" role="alert">{detailError}</p>:null}{notice?<p role="status">{notice}</p>:null}
  {selected?<section className={styles.detail} aria-label="工资公式详情"><div className={styles.actions}><h3>{selected.bookName} · {selected.itemName??"未映射项目"} · V{selected.versionNo}</h3><button className="ds-button" type="button" disabled={busy} onClick={clearDetail}>关闭公式</button></div><p>{labels[selected.parseStatus]} · 计算顺序{selected.calculationOrder}</p><h4>公式正文</h4><pre className={styles.expression}>{selected.rawExpression}</pre><h4>独立条件</h4><pre className={styles.expression}>{selected.rawCondition??"无独立条件"}</pre><p>项目依赖：{selected.syntax.dependencies.length?selected.syntax.dependencies.map(code=>code.replace(/^payroll:/,"工资项目·").replace(/^hr:/,"人事输入·")).join("、"):"无引用依赖"}</p>{selected.syntax.reason?<p>解析提示：{selected.syntax.status==="rejected"?"表达式超出支持的算式范围，需要核对或另行转换。":selected.rawCondition?.trim()?"独立旧条件需转换为明确的受限算式后再复核。":"含人事输入，需按当前业务规则人工确认。"}</p>:null}{selected.reviewReason?<p>既有复核理由：{selected.reviewReason}</p>:null}{selected.reviewedAt?<p>复核时间：{selected.reviewedAt}</p>:null}
   {canReview&&selected.approvalEligibility!=="terminal"?<><label className="form-field"><span>公式复核理由</span><textarea value={reason} maxLength={1000} required disabled={busy||committed} onChange={e=>setReason(e.target.value)}/></label>{selected.approvalEligibility==="blocked"?<p>此公式或独立条件尚不支持安全模拟，可拒绝或保留待处理。</p>:<p>语法已解析，项目依赖与版本冲突仍以后端完整校验为准。</p>}<div className={styles.actions}><button className="ds-button" type="button" disabled={busy||committed||!reason.trim()} onClick={()=>void review("reject")}>拒绝公式</button><button className="ds-button ds-button-primary" type="button" disabled={busy||committed||!reason.trim()||selected.approvalEligibility!=="syntax_ready"} onClick={()=>void review("approve_for_simulation")}>批准用于模拟核对</button></div></>:null}
  </section>:null}
 </section>;
}
