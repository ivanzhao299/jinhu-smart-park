"use client";
import { ApartmentApplicantDetails } from "./ApartmentApplicantFields";
import Link from "next/link";
import { useCallback,useEffect,useState } from "react";
import { Building2,ClipboardCheck,FileArchive,LogOut,RefreshCw,Users } from "lucide-react";
import { PermissionGuard } from "../../components/auth/PermissionGuard";
import { getAccessToken } from "../../lib/authz";
import { apartmentsApi,type ApartmentRecord,type ApartmentSummary } from "../../lib/apartments-api";
import styles from "./ApartmentWorkbench.module.css";
import { ApartmentCreatePanel } from "./ApartmentCreatePanel";
import { ApartmentRoomEditAction } from "./ApartmentRoomEditAction";
import { ApartmentHandoverAction } from "./ApartmentHandoverAction";
import { ApartmentApprovalAction } from "./ApartmentApprovalAction";
import { ApartmentAllocationAction } from "./ApartmentAllocationAction";
import { ApartmentToastStack,useApartmentToasts } from "./ApartmentToast";
import { APARTMENT_SECTIONS,ApartmentSectionNav } from "./ApartmentSectionNav";
const labels:Record<string,string>={rooms:'房源床位',applications:'入住申请',stays:'在住管理',checkouts:'退房办理',documents:'文书档案'};
const statusLabels:Record<string,string>={draft:'草稿',submitted:'待审批',approved:'已批准',rejected:'已驳回',cancelled:'已取消',allocated:'已分配',reserved:'已预留',active:'在住',checkout_pending:'待退房',completed:'已完成',enabled:'已启用',disabled:'已停用',maintenance:'维护中'};
const statusLabel=(value:unknown)=>{const key=String(value??'');return statusLabels[key]??key;};
const emptyHints:Record<string,string>={rooms:'暂无公寓房源。请在上方「纳入公寓管理」中搜索并选择资产房号纳入。',applications:'暂无入住申请。请在上方表单发起并提交申请。',stays:'暂无在住记录。入住申请批准分配并办理入住交接后在此展示。',checkouts:'暂无退房记录。发起退房并完成验收后，历史记录在此保留。',documents:'暂无文书。生成或归档公寓文书后在此展示。'};
const roomTypeLabels:Record<string,string>={talent:'人才公寓',executive:'高管宿舍',employee:'员工宿舍'};
const genderPolicyLabels:Record<string,string>={any:'性别不限',male:'限男',female:'限女'};
const meterSummary=(...readings:unknown[])=>{
 const values=readings.map(reading=>reading===null||reading===undefined||reading===''?null:String(reading));
 if(values.every(value=>!value))return "未抄表（该房号未接入水电表）";
 const [inWater,inElectric,outWater,outElectric]=values;
 const moveIn=`入住 水 ${inWater??"—"} / 电 ${inElectric??"—"}`;
 const moveOut=outWater||outElectric?`，退房 水 ${outWater??"—"} / 电 ${outElectric??"—"}`:"";
 return moveIn+moveOut;
};
export function ApartmentWorkbench({view='dashboard'}:{view?:string}){
 const [summary,setSummary]=useState<ApartmentSummary|null>(null),[rows,setRows]=useState<ApartmentRecord[]>([]),[loading,setLoading]=useState(true),[message,setMessage]=useState('');
 const {toasts,dismissToast,pushToast}=useApartmentToasts();
 const load=useCallback(async()=>{setLoading(true);setMessage('');try{const token=getAccessToken();setSummary(await apartmentsApi.summary(token));if(view==='rooms')setRows(await apartmentsApi.rooms(token));else if(view==='applications')setRows(await apartmentsApi.applications(token));else if(view==='stays')setRows(await apartmentsApi.stays(token));else if(view==='checkouts')setRows(await apartmentsApi.stays(token,'checkout_pending,completed'));else if(view==='documents')setRows(await apartmentsApi.documents(token));}catch(e){setMessage(e instanceof Error?e.message:'加载失败');}finally{setLoading(false)}},[view]);
 useEffect(()=>{void load()},[load]);
 const action=async(path:string,body?:object)=>{try{await apartmentsApi.mutate(path,body,getAccessToken());await load()}catch(e){pushToast(e instanceof Error?e.message:'操作失败')}};
 const icons=[Building2,ClipboardCheck,Users,LogOut,FileArchive];
 const forbidden=<main className="content ds-page"><section className="ds-panel"><h1>无权访问公寓管理</h1><p>当前账号缺少公寓模块或页面权限，请联系系统管理员授权。</p></section></main>;
 return <PermissionGuard module="apartment" permission={view==='dashboard'?'apartment:dashboard':`apartment:${view}`} fallback={forbidden}><main className="content ds-page">
  <section className={`ds-hero ${styles.hero}`}><div className={`ds-hero-copy ${styles.heroCopy}`}><span className="ds-eyebrow">集团人才公寓 · 人力资源管理</span><h1>{view==='dashboard'?'公寓管理':labels[view]}</h1><p>房源、申请、入住、退房和文书归档一条链闭环。</p></div><div className={`ds-action-bar ${styles.heroActions}`}><button className="ds-button ds-button-secondary" onClick={()=>void load()}><RefreshCw size={16}/>刷新</button></div></section>
  <ApartmentSectionNav active={view}/>
  {message?<p className="form-error">{message}</p>:null}
  {summary?<section className="ds-kpi-grid">{[['房间',summary.rooms],['床位',summary.beds],['在住',summary.occupied],['可用',summary.available],['待审批',summary.pending_applications],['待退房',summary.pending_checkouts]].map(([n,v])=><article className="ds-kpi-card" key={n}><span>{n}</span><strong>{v}</strong></article>)}</section>:null}
  <ApartmentCreatePanel view={view} onDone={load} onError={pushToast}/>
  {view==='dashboard'?<section className="ds-command-grid">{APARTMENT_SECTIONS.slice(1).map((section,i)=>{const Icon=icons[i]!;return <Link className="ds-command-card" href={section.href} key={section.href}><Icon size={22}/><strong>{section.label}</strong><span>{section.description}</span></Link>})}</section>:<section className={`ds-panel ${styles.panel}`}><header className={styles.sectionHeader}><div><h2>{labels[view]}记录</h2><p>按当前业务状态办理并保留完整操作记录。</p></div></header><div className={styles.list}>{loading?<div className={styles.empty}>正在加载…</div>:rows.length?rows.map(row=>view==='rooms'?(<article className={`ds-mobile-record ${styles.record} ${styles.recordRooms}`} key={row.id}><strong>{String(row.unit_name??row.unit_code??'记录')}</strong><span>{String(row.unit_code??'')}</span><span className={styles.muted}>{roomTypeLabels[String(row.room_type)]??'—'} · {genderPolicyLabels[String(row.gender_policy)]??'—'} · 床位{Number(row.capacity??1)}</span><span className={styles.muted}>{Array.isArray(row.facilities)&&row.facilities.length?row.facilities.map(String).join('、'):'—'}</span><span className={styles.muted}>{statusLabel(row.management_status)}</span><div className={styles.actions}><ApartmentRoomEditAction room={row} onDone={load} onError={pushToast}/></div></article>):(<article className={`ds-mobile-record ${styles.record}`} key={row.id}><strong>{String(row.applicant_name??row.occupant_name??row.unit_name??row.document_type??'记录')}</strong><span>{String(row.application_code??row.stay_code??row.unit_code??'')}</span><span className={styles.muted}>{statusLabel(row.status??row.management_status)}</span><span className={styles.muted}>{String(row.bed_code??row.requested_start_date??'')}</span><div className={styles.actions}>{view==='applications'&&row.status==='submitted'?<ApartmentApprovalAction application={row} onDone={load} onError={pushToast}/>:null}{view==='applications'&&['draft','submitted','approved'].includes(String(row.status))?<button className="ds-button ds-button-secondary" onClick={()=>void action(`/apartments/applications/${row.id}/cancel`)}>取消</button>:null}{view==='applications'&&row.status==='approved'?<ApartmentAllocationAction application={row} onDone={load} onError={pushToast}/>:null}{view==='stays'&&row.status==='reserved'?<ApartmentHandoverAction stayId={row.id} type="check-in" onDone={load} onError={pushToast}/>:null}{view==='stays'&&row.status==='active'?<button className="ds-button ds-button-primary" onClick={()=>void action(`/apartments/stays/${row.id}/request-checkout`)}>发起退房</button>:null}{view==='checkouts'&&row.status==='checkout_pending'?<ApartmentHandoverAction stayId={row.id} type="check-out" onDone={load} onError={pushToast}/>:null}</div>{view==='applications'?<div className={styles.auditDetails}><ApartmentApplicantDetails row={row}/><span>申请：{String(row.organization_name??'未填单位')} / {String(row.department_name??'未填部门')}</span><span>应急联系：{String(row.emergency_contact_name??'历史记录未登记')} {String(row.emergency_contact_mobile??'')}</span><span>实际入住：{String(row.household_size??1)} 人</span>{row.approval_decision?<><span>审批：{String(row.approval_decided_by_name??'未知')} / {String(row.approval_decided_at??'')}</span><span>意见：{String(row.approval_opinion??'')}</span><span>费用：押金 {String(row.deposit_amount??0)} 元 / 月费 {String(row.monthly_fee??0)} 元</span></>:null}</div>:null}{view==='stays'||view==='checkouts'?<div className={styles.auditDetails}><span>房间床位：{String(row.unit_name??row.unit_code)} / {String(row.bed_code)}</span><span>入住交接：{String(row.move_in_confirmed_at??'待办理')}</span><span>表计读数：{meterSummary(row.move_in_water_meter_reading,row.move_in_electricity_meter_reading,row.move_out_water_meter_reading,row.move_out_electricity_meter_reading)}</span>{row.move_out_confirmed_at?<span>退房验收：{String(row.move_out_confirmed_at)}</span>:null}</div>:null}</article>)):<div className={styles.empty}>{emptyHints[view]??"暂无记录。"}</div>}</div></section>}
 <ApartmentToastStack toasts={toasts} onDismiss={dismissToast}/>
 </main></PermissionGuard>;
}
