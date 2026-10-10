"use client";

import { useEffect, useRef, useState } from "react";
import { HR_PERMISSIONS, type FormalPayrollCorrectionPreparation, type FormalPayrollInputListItem, type FormalPayrollRunOptions, type FormalPayrollRunSelection } from "@jinhu/shared";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { hasPermission } from "../../../lib/permissions";
import { createIdempotencyKey } from "../../../lib/api-client";
import { hrApi, type HrPayrollPeriod } from "../../../lib/hr-api";
import { hrLoadErrorMessage } from "../hr-errors";
import styles from "./payroll-modern.module.css";

type InsuranceChoice = NonNullable<FormalPayrollRunSelection["insuranceSources"]>[number];
type Props = {onCreated?:()=>void; correction?:FormalPayrollCorrectionPreparation|null};
export function PayrollRunCreation(props:Props) {
  const user = useAuthUser(); return <CreationWorkspace key={`${JSON.stringify(user)}:${props.correction?.windowId ?? "ordinary"}`} {...props}/>;
}
function CreationWorkspace({onCreated,correction}:Props) {
  const user = useAuthUser(), canCreate = [HR_PERMISSIONS.HR_PAYROLL_READ, HR_PERMISSIONS.HR_PAYROLL_MANAGE, HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ].every(permission => hasPermission(user,permission));
  const [periods,setPeriods]=useState<HrPayrollPeriod[]>([]),[periodId,setPeriodId]=useState(correction?.periodId ?? ""),[inputs,setInputs]=useState<FormalPayrollInputListItem[]>([]),[inputTotal,setInputTotal]=useState(0),[inputPage,setInputPage]=useState(1),[selected,setSelected]=useState<FormalPayrollInputListItem|null>(null);
  const [options,setOptions]=useState<FormalPayrollRunOptions|null>(null),[sourcePage,setSourcePage]=useState(1),[attendanceId,setAttendanceId]=useState(""),[mode,setMode]=useState<"base"|"correction">("base"),[originalId,setOriginalId]=useState(""),[reason,setReason]=useState("");
  const [insurance,setInsurance]=useState<InsuranceChoice[]|null>(null),[acceptInsurance,setAcceptInsurance]=useState(false),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[committed,setCommitted]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState(""),[refresh,setRefresh]=useState(0);
  const alive=useRef(true),lock=useRef(false),sourcesAbort=useRef<AbortController|null>(null),retry=useRef<{signature:string;key:string}|null>(null);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;sourcesAbort.current?.abort();};},[]);
  useEffect(()=>{if(!canCreate||correction)return;const abort=new AbortController();void hrApi.payrollPeriods(getAccessToken(),abort.signal).then(rows=>{if(!abort.signal.aborted)setPeriods(rows.filter(row=>row.status==="open"));}).catch(cause=>{if(!abort.signal.aborted)setError(hrLoadErrorMessage(cause,"加载工资期间失败"));});return()=>abort.abort();},[canCreate,correction]);
  const reset = () => {sourcesAbort.current?.abort();setSelected(null);setOptions(null);setSourcePage(1);setInsurance(null);setAcceptInsurance(false);setAttendanceId("");setOriginalId("");setReason("");setMode("base");setCommitted(false);setNotice("");setError("");retry.current=null;};
  useEffect(()=>{
    if(!canCreate||!periodId)return;
    const abort=new AbortController();setLoading(true);setInputs([]);setError("");
    void hrApi.payrollInputs({periodId,page:inputPage,pageSize:20,...(correction?{correctionWindowId:correction.windowId}:{})},getAccessToken(),abort.signal).then(result=>{if(!abort.signal.aborted){setInputs(result.items);setInputTotal(result.total);}}).catch(cause=>{if(!abort.signal.aborted)setError(hrLoadErrorMessage(cause,"加载已确认工资输入失败"));}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});return()=>abort.abort();
  },[canCreate,periodId,inputPage,refresh,correction]);
  useEffect(()=>{
    if(!canCreate||!selected)return;
    const abort=new AbortController();setLoading(true);setOptions(null);setError("");
    const requestedAttendanceBatchId=attendanceId||undefined;
    void hrApi.formalPayrollRunOptions({inputId:selected.id,expectedInputVersion:selected.version,...(requestedAttendanceBatchId?{attendanceInputBatchId:requestedAttendanceBatchId}:{}),page:sourcePage,pageSize:20},getAccessToken(),abort.signal).then(result=>{if(!abort.signal.aborted){if(result.selectedAttendanceBatchId!==undefined&&result.selectedAttendanceBatchId!==(requestedAttendanceBatchId??null))throw new Error("所选考勤批次已变化，请刷新后重新核对。");setOptions(result);if(!result.canCreateBase)setMode("correction");if(correction)setOriginalId(correction.originalRunId);}}).catch(cause=>{if(!abort.signal.aborted)setError(hrLoadErrorMessage(cause,"加载正式核算来源失败"));}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});return()=>abort.abort();
  },[canCreate,selected,sourcePage,attendanceId,refresh,correction]);
  const loadInsurance = async () => {
    if(!options||!selected||lock.current||committed||!options.requires.insurance)return;
    lock.current=true;setBusy(true);setInsurance(null);setAcceptInsurance(false);setError("");const abort=new AbortController();sourcesAbort.current?.abort();sourcesAbort.current=abort;
    try{
      if(!Number.isSafeInteger(options.total)||options.total<1||options.total>2000)throw new Error("员工数量不可用，请刷新后核对。");
      const rows:FormalPayrollRunOptions["items"]=[];
      for(let page=1;page<=Math.ceil(options.total/100);page++){
        const result=await hrApi.formalPayrollRunOptions({inputId:selected.id,expectedInputVersion:selected.version,...(attendanceId?{attendanceInputBatchId:attendanceId}:{}),page,pageSize:100},getAccessToken(),abort.signal);
        if(abort.signal.aborted||!alive.current)return;
        if(result.inputId!==options.inputId||result.inputVersion!==options.inputVersion||result.periodId!==options.periodId||result.total!==options.total||(result.selectedAttendanceBatchId!==undefined&&result.selectedAttendanceBatchId!==options.selectedAttendanceBatchId)||result.page!==page||result.page_size!==100||!result.requires.insurance||result.items.length!==Math.min(100,options.total-(page-1)*100))throw new Error("工资输入或完整名单已变化，请刷新后重新读取来源。");
        rows.push(...result.items);
      }
      if(new Set(rows.map(row=>row.employeeId)).size!==options.total)throw new Error("保险员工名单不完整，请刷新核对。");
      const missing=rows.filter(row=>!row.insuranceSource);
      if(missing.length)throw new Error(`${missing.length} 位员工缺少当期确认保险，请在保险工作区补齐后刷新。`);
      setInsurance(rows.map(row=>row.insuranceSource!));setNotice(`已读取全部 ${rows.length} 位员工的当期确认保险，请确认采用这些版本。`);
    }catch(cause){if(alive.current&&!abort.signal.aborted)setError(hrLoadErrorMessage(cause,"读取完整保险来源失败"));}
    finally{lock.current=false;if(alive.current)setBusy(false);}
  };
  const create = async () => {
    if(lock.current||committed||loading||!options||!selected)return;
    if(mode==="base"&&!options.canCreateBase){setError("员工已有当期核算，请选择更正批次。");return;}
    if(mode==="correction"&&(!originalId||!reason.trim()||!options.correctionRuns.some(row=>row.id===originalId))){setError("请选择可更正的原批次并填写更正原因。");return;}
    if(options.requires.attendance&&!options.attendanceBatches.some(row=>row.id===attendanceId&&row.missingEmployeeCount===0)){setError("请选择覆盖全部员工的当期封账考勤。");return;}
    if(options.requires.insurance&&(!acceptInsurance||!insurance||insurance.length!==options.employeeCount)){setError("请读取完整名单并确认采用当期保险版本。");return;}
    const body:FormalPayrollRunSelection={inputId:selected.id,expectedInputVersion:selected.version,...(options.requires.attendance?{attendanceInputBatchId:attendanceId}:{}),...(options.requires.insurance?{insuranceSources:insurance!}:{}),...(mode==="correction"?{correctionOfRunId:originalId,correctionReason:reason.trim()}:{})},signature=JSON.stringify(body);
    if(retry.current?.signature!==signature)retry.current={signature,key:createIdempotencyKey("hr-payroll-formal-create")};
    lock.current=true;setBusy(true);setError("");setNotice("");
    try{
      const result=await hrApi.createFormalPayrollRun(body,getAccessToken(),retry.current.key);
      if(!alive.current)return;
      setCommitted(true);retry.current=null;setNotice(`第 ${result.runNo} 批已生成，共 ${result.employeeCount} 位员工；应发 ${result.grossAmount}，扣款 ${result.deductionAmount}，税额 ${result.personalTax}，实发 ${result.netAmount}。请在核算结果中查看分项并复核。`);onCreated?.();
    }catch(cause){if(alive.current)setError(hrLoadErrorMessage(cause,"正式工资生成失败"));}
    finally{lock.current=false;if(alive.current)setBusy(false);}
  };
  if(!canCreate)return null;
  return <section className={`ds-panel ${styles.workspace}`} aria-labelledby="payroll-creation-heading"><h2 id="payroll-creation-heading">正式工资生成与更正</h2><p>选用已确认员工输入和当期来源，整批计算后查看工资分项。更正保留原批次；此操作不执行发薪。</p>
    <label className="form-field"><span>核算期间</span><select value={periodId} disabled={busy||Boolean(correction)} onChange={event=>{if(!lock.current){reset();setPeriodId(event.target.value);setInputPage(1);setInputs([]);setInputTotal(0);}}}><option value="">请选择期间</option>{correction?<option value={correction.periodId}>{correction.month} · 更正原第 {correction.originalRunNo} 批</option>:null}{periods.map(row=><option key={row.id} value={row.id}>{row.periodMonth.slice(0,7)}</option>)}</select></label>
    {error?<p className="form-error" role="alert">{error}</p>:null}{notice?<p role="status">{notice}</p>:null}{loading?<p>正在读取输入和核算来源…</p>:null}
    <div className={`ds-mobile-record-list ${styles.records}`}>{inputs.map(row=><article className="ds-mobile-record" key={row.id}><strong>{row.displayName} · 第 {row.revisionNo} 版 · {row.employeeCount} 位员工</strong><button className="secondary-button" disabled={busy||committed||row.status!=="confirmed"} onClick={()=>{if(!lock.current){reset();setSelected(row);}}}>{row.status==="confirmed"?"选择此确认输入":"草稿待确认"}</button></article>)}</div>
    <div className={styles.actions}><button className="secondary-button" disabled={busy||committed||inputPage<=1} onClick={()=>{reset();setInputPage(value=>value-1);}}>确认输入上一页</button><span>第 {inputPage} / {Math.max(1,Math.ceil(inputTotal/20))} 页 · 共 {inputTotal} 版</span><button className="secondary-button" disabled={busy||committed||inputPage*20>=inputTotal} onClick={()=>{reset();setInputPage(value=>value+1);}}>确认输入下一页</button><button className="secondary-button" disabled={busy||committed||!periodId} onClick={()=>{setInsurance(null);setAcceptInsurance(false);setRefresh(value=>value+1);}}>刷新核算来源</button></div>
    {options?<><h3>{options.month} · {options.employeeCount} 位员工</h3>{options.requires.compensation?<p>薪酬按批准规则读取当期有效区间，生成时核对并冻结来源。</p>:null}<label className="form-field"><span>核算方式</span><select value={mode} disabled={busy||committed} onChange={event=>{if(!lock.current){setMode(event.target.value as "base"|"correction");setOriginalId("");setReason("");}}}><option value="base" disabled={!options.canCreateBase}>正常核算</option><option value="correction">更正已确认批次</option></select></label>{!options.canCreateBase?<p>{options.overlappingEmployeeCount} 位员工已有当期核算，须选择可更正的原批次。</p>:null}
      {mode==="correction"?<div className={styles.fields}><label className="form-field"><span>更正原批次</span><select required value={originalId} disabled={busy||committed||Boolean(correction)} onChange={event=>setOriginalId(event.target.value)}><option value="">请选择原批次</option>{options.correctionRuns.map(row=><option value={row.id} key={row.id}>第 {row.runNo} 批 · {row.employeeCount} 位员工</option>)}</select></label><label className="form-field"><span>更正原因</span><textarea required maxLength={500} value={reason} disabled={busy||committed} onChange={event=>setReason(event.target.value)}/></label>{!options.correctionRuns.length?<p>没有员工名单完全一致的可更正批次，请核对输入名单及已有更正状态。</p>:null}</div>:null}
      {options.requires.attendance?<><label className="form-field"><span>当期封账考勤</span><select required value={attendanceId} disabled={busy||committed} onChange={event=>{setAttendanceId(event.target.value);setInsurance(null);setAcceptInsurance(false);}}><option value="">请选择考勤批次</option>{options.attendanceBatches.map(row=><option key={row.id} value={row.id}>{options.month} · 第 {row.batchNo} 批{row.batchType==="correction"?" · 更正":""}{row.missingEmployeeCount?` · 缺 ${row.missingEmployeeCount} 位员工`:" · 覆盖完整"}</option>)}</select></label>{attendanceId&&options.selectedAttendanceBatchId===attendanceId?<p>{options.attendanceBatches.find(row=>row.id===attendanceId)?.missingEmployeeCount===0?"当前批次覆盖完整，生成时仍将重新核对。":"当前批次尚未覆盖全部员工，仅供核对，不能生成正式工资。"}</p>:<p>请选择考勤批次后查看逐人覆盖情况。</p>}</> :null}
      {(options.requires.attendance||options.requires.insurance)?<><h3>当期来源名单</h3><div className={`ds-mobile-record-list ${styles.records}`}>{options.items.map(row=><article className="ds-mobile-record" key={row.employeeId}><strong>{row.fullName} · {row.employeeCode}</strong>{options.requires.attendance?<span>{row.attendanceCovered===true?"考勤已覆盖":row.attendanceCovered===false?"考勤缺失":"考勤未检查"}</span>:null}{options.requires.insurance?<span>{row.insuranceSource?`确认保险第 ${row.insuranceSource.expectedVersion} 版`:"缺少当期确认保险"}</span>:null}</article>)}</div><div className={styles.actions}><button className="secondary-button" disabled={busy||committed||sourcePage<=1} onClick={()=>setSourcePage(value=>value-1)}>来源名单上一页</button><span>第 {options.page} / {Math.max(1,Math.ceil(options.total/20))} 页</span><button className="secondary-button" disabled={busy||committed||sourcePage*20>=options.total} onClick={()=>setSourcePage(value=>value+1)}>来源名单下一页</button>{options.requires.insurance?<button className="secondary-button" disabled={busy||committed||loading} onClick={()=>void loadInsurance()}>读取完整当期保险来源</button>:null}</div>{options.requires.insurance?<label><input type="checkbox" checked={acceptInsurance} disabled={busy||committed||!insurance} onChange={event=>setAcceptInsurance(event.target.checked)}/>{`使用全部 ${insurance?.length??options.employeeCount} 人的当期确认保险版本`}</label>:null}</>:null}
      <button className="primary-button" disabled={busy||committed||loading} onClick={()=>void create()}>{mode==="correction"?"生成更正批次":"生成正式工资批次"}</button>{committed?<button className="secondary-button" onClick={()=>{reset();setRefresh(value=>value+1);}}>准备下一次核算</button>:null}
    </>:null}
  </section>;
}
