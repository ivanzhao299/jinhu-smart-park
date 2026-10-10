"use client";
import { useEffect, useRef, useState } from "react";
import { ApiError, createIdempotencyKey } from "../../../lib/api-client";
import { getAccessToken } from "../../../lib/authz";
import { hrApi, type HrApprovedCompensationReceipt, type HrApprovedCompensationRequest, type HrCompensationAssignment, type HrCompensationAssignmentBody, type HrCompensationAssignmentReceipt, type HrCompensationEmployeeOption, type HrCompensationPlan } from "../../../lib/hr-api";
import { compensationMoney, validCompensationAssignment, validCompensationDate, validCompensationReceipt } from "./compensation-contract";
import styles from "../hr-workbench.module.css";
import local from "./compensation-ledger.module.css";

type Receipt = HrCompensationAssignmentReceipt | HrApprovedCompensationReceipt;
type Props = { employee: HrCompensationEmployeeOption; source?: HrApprovedCompensationRequest; plans: HrCompensationPlan[]; onCancel: () => void; onSaved: (receipt: Receipt) => void; onUncertainChange?: (value:boolean) => void };
type Attempt = { body: HrCompensationAssignmentBody; source?: HrApprovedCompensationRequest; predecessor: HrCompensationAssignment|null; token:string; key:string };
export function CompensationAssignmentEditor({ employee,source,plans,onCancel,onSaved,onUncertainChange }: Props) {
 const [page,setPage] = useState(1), [revision,setRevision] = useState(0), [history,setHistory] = useState<{items:HrCompensationAssignment[];total:number}|null>(null), [readError,setReadError] = useState("");
 const [replacement,setReplacement] = useState<HrCompensationAssignment|null>(null), [busy,setBusy] = useState(false), [retry,setRetry] = useState<Attempt|null>(null), [error,setError] = useState(""), [conflict,setConflict] = useState(false);
 const lock = useRef(false), unresolved = useRef<Attempt|null>(null), alive = useRef(true), generation = useRef(0);
 const frozen = busy || !!retry;
 useEffect(() => { alive.current = true; return () => {alive.current = false;}; }, []);
 useEffect(() => { onUncertainChange?.(frozen); return () => onUncertainChange?.(false); }, [frozen,onUncertainChange]);
 useEffect(() => {
  const controller = new AbortController(), request = ++generation.current; setHistory(null); setReadError("");
  void hrApi.compensationAssignments(getAccessToken(),page,20,"",controller.signal,employee.id).then(result => {
   if (controller.signal.aborted || request !== generation.current) return;
   if (!result || result.page !== page || result.page_size !== 20 || !Number.isSafeInteger(result.total) || result.total < 0 || !Array.isArray(result.items) || result.items.length > 20 || !result.items.every(row => validCompensationAssignment(row) && row.employeeId === employee.id)) throw new Error("当前员工定薪记录无法核对。");
   if (page > Math.max(1,Math.ceil(result.total/20))) { setPage(1); return; }
   setHistory(result);
  }).catch(reason => { if (!controller.signal.aborted && request === generation.current) setReadError(reason instanceof Error ? reason.message : "读取当前定薪失败。"); });
  return () => controller.abort();
 }, [employee.id,page,revision]);
 const execute = async (attempt: Attempt) => {
  if (!alive.current || lock.current || unresolved.current && unresolved.current !== attempt) return;
  lock.current = true; unresolved.current = attempt; setBusy(true); setError("");
  try {
   const result: Receipt = attempt.source ? await hrApi.fulfillCompensationApproval(attempt.source.id,{...attempt.body,expectedApprovalVersion:attempt.source.version},attempt.token,attempt.key) : await hrApi.assignCompensation(attempt.body,attempt.token,attempt.key);
   if (!alive.current) return;
   if (!validCompensationReceipt(result,attempt.body,attempt.predecessor) || attempt.source && (!isApprovedReceipt(result) || result.sourceApprovalId !== attempt.source.id || result.sourceApprovalVersion !== attempt.source.version)) throw new Error("定薪回执无法核对，请按原请求重试。");
   unresolved.current = null; setRetry(null); onSaved(result);
  } catch (reason) {
   if (!alive.current) return;
   setError(reason instanceof Error ? reason.message : "保存定薪失败。");
   const processing = reason instanceof ApiError && reason.status === 409 && reason.message === "The same idempotency key is still processing";
   if (!(reason instanceof ApiError) || processing || ![400,403,404,409,422].includes(reason.status)) setRetry(attempt);
   else { unresolved.current = null; setRetry(null); if (reason.status === 409) setConflict(true); }
  } finally { if (alive.current) {lock.current = false; setBusy(false);} }
 };
 const submit = (event:React.FormEvent<HTMLFormElement>) => {
  event.preventDefault(); if (frozen || lock.current || unresolved.current || conflict || !history || readError) return;
  const form = new FormData(event.currentTarget);
  const body:HrCompensationAssignmentBody = {employeeId:employee.id,planId:String(form.get("planId")),effectiveFrom:String(form.get("effectiveFrom")),baseSalary:String(form.get("baseSalary")),allowanceAmount:String(form.get("allowanceAmount") || "0"),variableTarget:String(form.get("variableTarget") || "0")};
  const end = String(form.get("effectiveTo") || ""); if (end) body.effectiveTo=end;
  const plan = plans.find(row => row.id === body.planId && row.status === "active" && row.currency === "CNY");
  if (!plan || !validCompensationDate(body.effectiveFrom) || end && (!validCompensationDate(end) || end < body.effectiveFrom) || ![body.baseSalary,body.allowanceAmount,body.variableTarget].every(value => compensationMoney(value) !== null) || body.effectiveFrom < plan.effectiveFrom || plan.effectiveTo && (!end || end > plan.effectiveTo)) {setError("请核对金额和生效期，定薪期间必须完整落在所选方案的有效期内。");return;}
  if (replacement) {body.replaceAssignmentId=replacement.id;body.expectedReplacementVersion=replacement.version;}
  void execute({body,source,predecessor:replacement,token:getAccessToken(),key:createIdempotencyKey("hr-compensation-assignment")});
 };
 const reload = () => {if (frozen || lock.current || unresolved.current) return;setReplacement(null);setConflict(false);setRevision(value=>value+1);};
 return <section className={local.panel} aria-label="正式定薪办理表单"><h3>{employee.employeeName} · {employee.employeeCode}</h3>{source ? <p>申请 {source.requestNo}：{source.description || source.title}。请由 HR 明确填写实际金额和生效期。</p> : null}
  <section aria-label="员工已有定薪"><h4>核对已有生效期</h4>{readError ? <p role="alert">{readError}</p> : !history ? <p role="status">正在读取员工已有定薪…</p> : null}
   {history ? <><div className={local.records}>{history.items.map(row => <article className="ds-mobile-record" key={row.id}><strong>{row.planName} · 版本 {row.version}</strong><span>{row.effectiveFrom} 至 {row.effectiveTo || "长期"}</span><span>基本工资 {row.baseSalary} 元 · 津贴 {row.allowanceAmount} 元 · 目标浮动 {row.variableTarget} 元</span>{row.status === "active" ? <button type="button" className="ds-button" disabled={frozen || conflict} aria-pressed={replacement?.id===row.id} onClick={() => setReplacement(row)}>选择结束此记录</button> : <span>当前停用</span>}</article>)}</div>{!history.items.length ? <p>此员工尚无定薪记录。</p> : null}<div className={local.pagination}><button type="button" className="ds-button" disabled={frozen || page===1} onClick={() => setPage(value=>value-1)}>已有定薪上一页</button><span>第 {page} 页 · 共 {history.total} 条</span><button type="button" className="ds-button" disabled={frozen || page*20>=history.total} onClick={() => setPage(value=>value+1)}>已有定薪下一页</button></div></> : null}
   <button type="button" className="ds-button" disabled={frozen} onClick={reload}>重新读取已有定薪</button>
  </section>
  <form onSubmit={submit}><fieldset className={local.editorFields} disabled={frozen}><legend>设置新的正式薪酬</legend><div className={styles.formGrid}>
   <label className="form-field"><span>薪酬方案</span><select name="planId" required defaultValue=""><option value="" disabled>请选择有效方案</option>{plans.filter(plan=>plan.status==="active" && plan.currency==="CNY").map(plan=><option key={plan.id} value={plan.id}>{plan.planName}（{plan.planCode}）</option>)}</select></label>
   <label className="form-field"><span>生效日期</span><input name="effectiveFrom" type="date" min="1900-01-01" max="2100-12-31" required/></label><label className="form-field"><span>截止日期（长期可留空）</span><input name="effectiveTo" type="date" min="1900-01-01" max="2100-12-31"/></label>
   {([ ["baseSalary","基本工资"],["allowanceAmount","津贴"],["variableTarget","目标浮动薪资"] ] as const).map(([name,label])=><label className="form-field" key={name}><span>{label}</span><input name={name} type="number" min="0" max="9999999999999999.99" step="0.01" defaultValue={name==="baseSalary" ? "" : "0"} required onFocus={event=>event.currentTarget.select()}/></label>)}
  </div>{replacement ? <p>将结束原记录：{replacement.planName}，版本 {replacement.version}，{replacement.effectiveFrom} 起；截止日设置为新定薪生效日前一天。<button type="button" className="ds-button" onClick={()=>setReplacement(null)}>取消结束原记录</button></p> : <p>未选择结束原记录；新生效期不得与任何已有启用记录重叠。</p>}
  <div className={styles.formActions}><button className="ds-button ds-button-primary" disabled={!history || !!readError || conflict || !plans.some(plan=>plan.status==="active" && plan.currency==="CNY")}>{source ? "保存定薪并完成办理" : "确认定薪"}</button><button type="button" className="ds-button" onClick={onCancel}>取消定薪办理</button></div></fieldset></form>
  {conflict ? <p role="alert">申请或定薪记录已经变化，草稿已保留。请重新读取并选择原记录；申请变化时须取消后刷新办理队列。</p> : null}{error ? <p role="alert">{error}</p> : null}{retry ? <button type="button" className="ds-button" disabled={busy} onClick={()=>void execute(retry)}>按原请求重试定薪</button> : null}
 </section>;
}

function isApprovedReceipt(value: Receipt): value is HrApprovedCompensationReceipt {
 return "sourceApprovalId" in value && typeof value.sourceApprovalId === "string" && Number.isSafeInteger(value.sourceApprovalVersion) && value.sourceApprovalVersion >= 1 && typeof value.fulfilledAt === "string" && !!value.fulfilledAt;
}
