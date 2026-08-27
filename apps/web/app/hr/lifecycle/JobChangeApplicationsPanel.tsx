"use client";
import {HR_PERMISSIONS} from "@jinhu/shared";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {useAuthUser} from "../../../lib/auth-context";
import {getAccessToken} from "../../../lib/authz";
import {hrApi,type HrJobChangeApplication,type HrJobChangeOptions} from "../../../lib/hr-api";
import {hasAnyPermission,hasPermission} from "../../../lib/permissions";
import {hrLoadErrorMessage} from "../hr-errors";
import styles from "../hr-workbench.module.css";

const labels:Record<string,string>={draft:"草稿",submitted:"待审批",returned:"已退回",approved:"已批准",cancelled:"已取消",applied:"已生效"};
const today=()=>new Date().toISOString().slice(0,10);

export function JobChangeApplicationsPanel(){
 const user=useAuthUser(),canRead=hasAnyPermission(user,[HR_PERMISSIONS.HR_JOB_CHANGE_READ,HR_PERMISSIONS.HR_JOB_CHANGE_TEAM_READ,HR_PERMISSIONS.HR_JOB_CHANGE_SELF_READ]),canManage=hasPermission(user,HR_PERMISSIONS.HR_JOB_CHANGE_MANAGE),canReview=hasPermission(user,HR_PERMISSIONS.HR_JOB_CHANGE_REVIEW),canApply=hasPermission(user,HR_PERMISSIONS.HR_JOB_CHANGE_APPLY);
 const [rows,setRows]=useState<HrJobChangeApplication[]>([]),[options,setOptions]=useState<HrJobChangeOptions>({employees:[],orgs:[],positions:[]}),[editing,setEditing]=useState<HrJobChangeApplication|null>(null),[employeeId,setEmployeeId]=useState(""),[afterOrgId,setAfterOrgId]=useState(""),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),abortRef=useRef<AbortController|null>(null);
 const load=useCallback(async()=>{if(!canRead){setLoading(false);return;}const c=new AbortController();abortRef.current?.abort();abortRef.current=c;setLoading(true);setError("");try{const [list,refs]=await Promise.all([hrApi.jobChangeApplications(getAccessToken(),1,50,undefined,c.signal),canManage?hrApi.jobChangeOptions(getAccessToken(),c.signal):Promise.resolve({employees:[],orgs:[],positions:[]})]);if(!c.signal.aborted){setRows(list.items);setOptions(refs);}}catch(e){if((e as Error).name!=="AbortError")setError(hrLoadErrorMessage(e,"加载岗位变更申请失败"));}finally{if(!c.signal.aborted)setLoading(false);}},[canManage,canRead]);
 useEffect(()=>{void load();return()=>abortRef.current?.abort();},[load]);
 const positions=useMemo(()=>options.positions.filter(x=>x.orgId===afterOrgId),[afterOrgId,options.positions]);
 if(!canRead)return null;
 const edit=(row:HrJobChangeApplication)=>{setEditing(row);setEmployeeId(row.employeeId);setAfterOrgId(row.afterOrgId);};
 const reset=()=>{setEditing(null);setEmployeeId("");setAfterOrgId("");};
 const save=async(form:FormData)=>{if(busy)return;const body={applicationName:String(form.get("applicationName")),employeeId:String(form.get("employeeId")),applicationDate:String(form.get("applicationDate")),effectiveDate:String(form.get("effectiveDate")),changeType:String(form.get("changeType")),afterOrgId:String(form.get("afterOrgId")),afterPositionId:String(form.get("afterPositionId"))||undefined,reason:String(form.get("reason"))};setBusy(true);setError("");try{if(editing)await hrApi.updateJobChangeApplication(editing.id,body,getAccessToken());else await hrApi.createJobChangeApplication(body,getAccessToken());reset();await load();}catch(e){setError(hrLoadErrorMessage(e,editing?"修改岗位变更申请失败":"创建岗位变更申请失败"));}finally{setBusy(false);}};
 const action=async(row:HrJobChangeApplication,kind:"submit"|"resubmit"|"cancel"|"approve"|"return"|"apply")=>{if(busy)return;setBusy(true);setError("");try{if(kind==="approve"||kind==="return")await hrApi.reviewJobChangeApplication(row.id,kind,kind==="return"?"请补充或修正岗位变更信息":"",getAccessToken());else if(kind==="apply")await hrApi.applyJobChangeApplication(row.id,getAccessToken());else await hrApi.jobChangeApplicationAction(row.id,kind,getAccessToken());await load();}catch(e){setError(hrLoadErrorMessage(e,"办理岗位变更申请失败"));}finally{setBusy(false);}};
 return <section className="ds-panel">
  <div className={styles.sectionHeading}><div><span className="ds-eyebrow">玉舟岗位变更</span><h2>岗位变更申请</h2></div><span>{loading?"加载中":`${rows.length} 条`}</span></div>
  {error?<p className="form-error" role="alert">{error}</p>:null}
  {canManage?<form key={editing?.id??"new"} className={styles.formGrid} action={save}>
   <label className="form-field"><span>申请名称</span><input name="applicationName" maxLength={128} defaultValue={editing?.applicationName} required/></label>
   <label className="form-field"><span>员工</span><select name="employeeId" value={employeeId} onChange={e=>setEmployeeId(e.target.value)} required><option value="">请选择</option>{options.employees.map(x=><option key={x.id} value={x.id}>{x.employeeName} · {x.employeeCode}</option>)}</select></label>
   <label className="form-field"><span>变更类型</span><select name="changeType" defaultValue={editing?.changeType??"transfer"}><option value="transfer">岗位调动</option><option value="promotion">晋升</option><option value="demotion">降职</option><option value="rotation">轮岗</option><option value="organization_change">部门调整</option></select></label>
   <label className="form-field"><span>申请日期</span><input name="applicationDate" type="date" defaultValue={editing?.applicationDate??today()} required/></label>
   <label className="form-field"><span>生效日期</span><input name="effectiveDate" type="date" defaultValue={editing?.effectiveDate??today()} required/></label>
   <label className="form-field"><span>调整后部门</span><select name="afterOrgId" value={afterOrgId} onChange={e=>setAfterOrgId(e.target.value)} required><option value="">请选择</option>{options.orgs.map(x=><option key={x.id} value={x.id}>{x.orgName}</option>)}</select></label>
   <label className="form-field"><span>调整后岗位</span><select name="afterPositionId" defaultValue={editing?.afterPositionId??""}><option value="">暂不指定</option>{positions.map(x=><option key={x.id} value={x.id}>{x.positionName} · {x.positionCode}</option>)}</select></label>
   <label className={`form-field ${styles.fullWidth}`}><span>变更原因</span><textarea name="reason" maxLength={2000} defaultValue={editing?.reason} required/></label>
   <div className={styles.actionRow}><button className="ds-button ds-button-primary" disabled={busy||!employeeId||!afterOrgId}>{editing?"保存修改":"保存申请草稿"}</button>{editing?<button type="button" className="ds-button" disabled={busy} onClick={reset}>放弃修改</button>:null}</div>
  </form>:null}
  <div className="ds-mobile-record-list">{rows.length?rows.map(row=><article className="ds-mobile-record" key={row.id}>
   <strong>{row.employeeName} · {labels[row.status]??row.status}</strong><span>{row.applicationNo} · {row.applicationDate} 申请 · {row.effectiveDate} 生效</span><span>{row.beforeOrgName??"未设部门"} / {row.beforePositionName??"未设岗位"} → {row.afterOrgName??"未设部门"} / {row.afterPositionName??"未设岗位"}</span><span>{row.reason}</span>
   <div className={styles.actionRow}>{canManage&&["draft","returned"].includes(row.status)?<button className="ds-button" disabled={busy} onClick={()=>edit(row)}>修改</button>:null}{canManage&&row.status==="draft"?<button className="ds-button ds-button-primary" disabled={busy} onClick={()=>void action(row,"submit")}>提交审批</button>:null}{canManage&&row.status==="returned"?<button className="ds-button ds-button-primary" disabled={busy} onClick={()=>void action(row,"resubmit")}>重新提交</button>:null}{canManage&&["draft","submitted","returned"].includes(row.status)?<button className="ds-button" disabled={busy} onClick={()=>void action(row,"cancel")}>取消申请</button>:null}{canReview&&row.status==="submitted"?<><button className="ds-button ds-button-primary" disabled={busy} onClick={()=>void action(row,"approve")}>批准</button><button className="ds-button" disabled={busy} onClick={()=>void action(row,"return")}>退回</button></>:null}{canApply&&row.status==="approved"?<button className="ds-button ds-button-primary" disabled={busy||row.effectiveDate>today()} title={row.effectiveDate>today()?"到生效日期后方可办理":""} onClick={()=>void action(row,"apply")}>生效变更</button>:null}</div>
  </article>):loading?<p>正在加载岗位变更申请…</p>:<p>暂无岗位变更申请。</p>}</div>
 </section>;
}
