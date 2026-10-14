"use client";
import { useCallback,useEffect,useRef,useState,type FormEvent } from "react";
import { apartmentsApi,type ApartmentRecord } from "../../lib/apartments-api";
import { getAccessToken } from "../../lib/authz";
import styles from "./ApartmentWorkbench.module.css";
import { ApartmentApplicantFields, applicantDetails } from "./ApartmentApplicantFields";
import { SearchSelect,type SearchSelectOption } from "./SearchSelect";

const nextDate=(value:string)=>{if(!value)return undefined;const [year,month,day]=value.split("-").map(Number);return new Date(Date.UTC(year!,month!-1,day!+1)).toISOString().slice(0,10)};
const reasonLabels:Record<string,string>={already_apartment_managed:"已纳入公寓",unit_disabled:"房号已停用",asset_parent_mapping_incomplete:"资产父级映射不完整",operating_config_disabled:"物业运营已停用",operating_mode_conflict:"已配置其他经营模式",occupied_by_other_domain:"已被其他业务占用"};

export function ApartmentCreatePanel({view,onDone,onError}:{view:string;onDone:()=>Promise<void>;onError:(v:string)=>void}){
 const [unitOptions,setUnitOptions]=useState<SearchSelectOption[]>([]),[selectedUnitId,setSelectedUnitId]=useState(''),[eligibleOnly,setEligibleOnly]=useState(true),[optionsLoading,setOptionsLoading]=useState(false),[busy,setBusy]=useState(false),[reason,setReason]=useState(''),[startDate,setStartDate]=useState('');
 const optionsRequest=useRef(0);
 const onErrorRef=useRef(onError);onErrorRef.current=onError;
 const loadUnitOptions=useCallback((keyword:string)=>{
  const generation=++optionsRequest.current;
  setOptionsLoading(true);
  const query=new URLSearchParams({page:'1',page_size:'100',eligible_only:String(eligibleOnly)});
  if(keyword.trim())query.set('keyword',keyword.trim());
  void apartmentsApi.unitCandidates(query,getAccessToken()).then(result=>{
   if(generation!==optionsRequest.current)return;
   setUnitOptions(result.items.map((item:ApartmentRecord)=>{
    const reasons=Array.isArray(item.ineligible_reasons)?item.ineligible_reasons.map(String):[];
    return {
     value:item.id,
     label:`${String(item.building_name??'')} ${String(item.floor_name??'')} ${String(item.unit_name??item.unit_code)}`,
     detail:`${item.asset_mapping_status==='mapped_complete'?'资产已关联':item.asset_mapping_status==='unmapped_external'?'外部/代管房':'资产映射待补'}${reasons.length?` · ${reasons.map(code=>reasonLabels[code]??code).join('、')}`:''}`,
     disabled:item.eligible!==true
    };
   }));
  }).catch((error:Error)=>{if(generation===optionsRequest.current)onErrorRef.current(error.message)}).finally(()=>{if(generation===optionsRequest.current)setOptionsLoading(false)});
 },[eligibleOnly]);
 const searchHandlerRef=useRef<(keyword:string)=>void>(()=>undefined);
 searchHandlerRef.current=loadUnitOptions;
 const handleUnitSearch=useCallback((keyword:string)=>searchHandlerRef.current(keyword),[]);
 useEffect(()=>{if(view==='applications')void apartmentsApi.settings(getAccessToken()).then(x=>setReason(x.default_application_reason)).catch(()=>undefined)},[view]);
 const submit=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();if(busy)return;setBusy(true);const form=e.currentTarget;const f=new FormData(form);try{
  if(view==='rooms')await apartmentsApi.mutate('/apartments/rooms',{unit_id:selectedUnitId,room_type:f.get('room_type'),gender_policy:f.get('gender_policy'),capacity:Number(f.get('capacity')),facilities:String(f.get('facilities')||'').split('、').map(x=>x.trim()).filter(Boolean)},getAccessToken());
  if(view==='applications'){
   const app=await apartmentsApi.mutate<ApartmentRecord>('/apartments/applications',{...applicantDetails(f),applicant_name:f.get('applicant_name'),applicant_type:f.get('applicant_type'),organization_name:f.get('organization_name')||undefined,department_name:f.get('department_name')||undefined,job_title:f.get('job_title')||undefined,mobile_masked:f.get('mobile_masked')||undefined,emergency_contact_name:f.get('emergency_contact_name'),emergency_contact_mobile:f.get('emergency_contact_mobile'),household_size:Number(f.get('household_size')),accompanying_names:f.get('accompanying_names')||undefined,vehicle_plate:f.get('vehicle_plate')||undefined,accommodation_notes:f.get('accommodation_notes')||undefined,policy_accepted:f.get('policy_accepted')==='on',requested_room_type:f.get('requested_room_type'),requested_start_date:f.get('requested_start_date'),requested_end_date:f.get('requested_end_date')||undefined,reason:f.get('reason')},getAccessToken());
   await apartmentsApi.mutate(`/apartments/applications/${app.id}/submit`,undefined,getAccessToken());
  }
  form.reset();setStartDate('');setSelectedUnitId('');await onDone();
 }catch(err){onError(err instanceof Error?err.message:'保存失败')}finally{setBusy(false)}};
 if(view!=='rooms'&&view!=='applications')return null;
 return <section className={`ds-panel ${styles.panel}`}>
  <header className={styles.sectionHeader}><div><h2>{view==='rooms'?'纳入公寓管理':'发起入住申请'}</h2><p>{view==='rooms'?'搜索并选择资产房号，配置公寓类型与床位；物理资产和空间档案无需重复创建。':'完整登记申请人、住宿需求、应急联系和安全承诺，提交后进入审批。'}</p></div></header>
  <form className={styles.form} onSubmit={submit}>{view==='rooms'?<>
   <label className={`form-field ${styles.wide}`}><span>统一运营房号</span><SearchSelect value={selectedUnitId} options={unitOptions} loading={optionsLoading} placeholder="请选择房号" searchPlaceholder="输入房号、楼栋或楼层搜索" emptyText="没有匹配的房号" onSearchChange={handleUnitSearch} onSelect={setSelectedUnitId}/><small>支持按房号、楼栋、楼层关键词搜索；灰色选项为当前不可纳入的房号。</small></label>
   <label className={`form-field ${styles.checkboxField}`}><span><input type="checkbox" checked={eligibleOnly} onChange={e=>setEligibleOnly(e.target.checked)}/> 仅显示可纳入房号</span></label>
   <label className="form-field"><span>公寓类型</span><select name="room_type"><option value="talent">人才公寓</option><option value="executive">高管宿舍</option><option value="employee">员工宿舍</option></select></label>
   <label className="form-field"><span>入住性别</span><select name="gender_policy"><option value="any">不限</option><option value="male">男</option><option value="female">女</option></select></label>
   <label className="form-field"><span>床位数</span><input name="capacity" type="number" min="1" max="20" defaultValue="1" onFocus={e=>e.currentTarget.select()} required/></label>
   <label className="form-field"><span>设施（顿号分隔）</span><input name="facilities" placeholder="空调、衣柜、热水器"/></label>
  </>:<>
   <ApartmentApplicantFields/>
   <label className="form-field"><span>入住人姓名</span><input name="applicant_name" maxLength={100} required/></label><label className="form-field"><span>人员类别</span><select name="applicant_type"><option value="internal_employee">集团员工</option><option value="subsidiary_employee">下属企业员工</option><option value="executive">高级管理人员</option><option value="external_talent">引进人才</option></select></label><label className="form-field"><span>手机号（脱敏展示）</span><input name="mobile_masked" maxLength={32} placeholder="138****0000"/></label>
   <label className="form-field"><span>所属单位</span><input name="organization_name" maxLength={200}/></label><label className="form-field"><span>部门</span><input name="department_name" maxLength={200}/></label><label className="form-field"><span>岗位/职务</span><input name="job_title" maxLength={100}/></label>
   <label className="form-field"><span>紧急联系人</span><input name="emergency_contact_name" maxLength={100} required/></label><label className="form-field"><span>紧急联系人手机</span><input name="emergency_contact_mobile" type="tel" inputMode="numeric" pattern="1[0-9]{10}" placeholder="11位手机号" required/></label><label className="form-field"><span>实际入住人数</span><input name="household_size" type="number" min="1" max="10" defaultValue="1" onFocus={e=>e.currentTarget.select()} required/></label>
   <label className="form-field"><span>随住人姓名</span><input name="accompanying_names" maxLength={500} placeholder="多人用顿号分隔"/></label><label className="form-field"><span>车牌号</span><input name="vehicle_plate" maxLength={10} placeholder="苏H12345"/></label><label className="form-field"><span>申请房型</span><select name="requested_room_type"><option value="talent">人才公寓</option><option value="executive">高管宿舍</option><option value="employee">员工宿舍</option></select></label>
   <label className="form-field"><span>计划入住</span><input name="requested_start_date" type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} required/></label><label className="form-field"><span>计划退房</span><input name="requested_end_date" type="date" min={nextDate(startDate)}/></label>
   <label className={`form-field ${styles.wide}`}><span>特殊住宿需求</span><textarea name="accommodation_notes" maxLength={1000} placeholder="无障碍、医疗、作息或其他需要协调的事项"/></label><label className={`form-field ${styles.wide}`}><span>入住理由</span><textarea name="reason" maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)} required/></label>
   <label className={`form-field ${styles.wide} ${styles.checkboxField}`}><span><input name="policy_accepted" type="checkbox" required/> 本人已核对信息，并承诺遵守公寓管理、消防安全、费用结算和退房交接规定。</span></label>
  </>}<div className={styles.formActions}><button className="ds-button ds-button-primary" disabled={busy||optionsLoading||(view==='rooms'&&!selectedUnitId)}>{busy?'正在保存…':view==='rooms'?'纳入公寓管理':'提交入住申请'}</button></div></form>
 </section>;
}
