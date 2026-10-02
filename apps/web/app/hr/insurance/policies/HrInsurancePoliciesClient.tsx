"use client";
import Link from "next/link";
import { HR_INSURANCE_POLICY_PERMISSIONS, HR_PERMISSIONS } from "@jinhu/shared";
import { useEffect, useRef, useState } from "react";
import { PermissionGuard } from "../../../../components/auth/PermissionGuard";
import { PermissionButton } from "../../../../components/auth/PermissionButton";
import { ForbiddenState } from "../../../../components/auth/ForbiddenState";
import { useAuthUser } from "../../../../lib/auth-context";
import { getAccessToken } from "../../../../lib/authz";
import { ApiError, createIdempotencyKey } from "../../../../lib/api-client";
import { hasPermission } from "../../../../lib/permissions";
import { hrApi, type HrInsurancePolicyKind, type HrInsurancePolicyComponent, type HrInsurancePolicyVersion, type HrInsurancePolicyVersionDetail, type HrInsurancePolicyVersionRequest, type HrInsurancePolicyOption } from "../../../../lib/hr-api";
import { insurancePercentFromRate, insuranceRateFromPercent } from "../policy-rate";
import styles from "../../hr-workbench.module.css";
import local from "./policies.module.css";

const labels: Record<HrInsurancePolicyKind,string> = {oldage:"养老保险",remedy:"医疗保险",losework:"失业保险",wound:"工伤保险",bear:"生育保险",fund:"住房公积金"};
const kinds=Object.keys(labels) as HrInsurancePolicyKind[];
const components:Record<HrInsurancePolicyComponent,string>={base:"政策合计",employer:"单位",employee:"个人",supplement:"补充"};
const componentKeys=Object.keys(components) as HrInsurancePolicyComponent[];
type FactorDraft=Record<string,{percent:string;fixed:string|null}>;
const factorKey=(kind:string,component:string)=>`${kind}:${component}`;
function errorMessage(error:unknown){
  if(error instanceof ApiError){
    if(error.status===403)return "当前权限不足，请联系已有授权的 HR 岗位。";
    if(error.status===409)return "请求内容或来源版本发生冲突，请核对后重试。";
    if(error.status===404)return "政策已不可用，请刷新后重新选择。";
    if(error.status===400)return "请核对政策名称、月份范围和完整费率；缺失费率不能按零处理。";
  }
  return "暂时无法完成请求。保存失败时，可保持输入不变重试。";
}
function Workbench(){
  const user=useAuthUser(),canCreate=hasPermission(user,HR_INSURANCE_POLICY_PERMISSIONS.VERSION_CREATE),canCopy=hasPermission(user,HR_PERMISSIONS.HR_EMPLOYEE_READ);
  const [rows,setRows]=useState<HrInsurancePolicyVersion[]>([]),[total,setTotal]=useState(0),[page,setPage]=useState(1),[search,setSearch]=useState(""),[keyword,setKeyword]=useState(""),[reload,setReload]=useState(0),[listLoading,setListLoading]=useState(true);
  const [selected,setSelected]=useState<HrInsurancePolicyVersionDetail|null>(null),[detailLoading,setDetailLoading]=useState(false),[message,setMessage]=useState("");
  const [mode,setMode]=useState(""),[code,setCode]=useState(""),[name,setName]=useState(""),[variant,setVariant]=useState(""),[from,setFrom]=useState(""),[through,setThrough]=useState(""),[reason,setReason]=useState(""),[draft,setDraft]=useState<FactorDraft>({});
  const [sources,setSources]=useState<HrInsurancePolicyOption[]>([]),[sourceTotal,setSourceTotal]=useState(0),[sourcePage,setSourcePage]=useState(1),[sourceKeyword,setSourceKeyword]=useState(""),[sourceSearch,setSourceSearch]=useState(""),[sourceLoading,setSourceLoading]=useState(false),[source,setSource]=useState<HrInsurancePolicyOption|null>(null);
  const [saving,setSaving]=useState(false),[saved,setSaved]=useState<HrInsurancePolicyVersion|null>(null);
  const detailRequest=useRef<AbortController|null>(null),writeRequest=useRef<AbortController|null>(null),busy=useRef(false),sequence=useRef(0);
  const attempt=useRef<{body:HrInsurancePolicyVersionRequest;key:string}|null>(null);
  useEffect(()=>{
    const abort=new AbortController();let alive=true;setRows([]);setTotal(0);setListLoading(true);
    void hrApi.insurancePolicyVersions(getAccessToken(),page,keyword,abort.signal).then(result=>{if(alive){setRows(result.items);setTotal(result.total);}}).catch(error=>{if(alive)setMessage(errorMessage(error));}).finally(()=>{if(alive)setListLoading(false);});
    return()=>{alive=false;abort.abort();};
  },[page,keyword,reload]);
  useEffect(()=>{
    if(mode!=="copy"||!canCopy)return;
    const abort=new AbortController();let alive=true;setSources([]);setSourceTotal(0);setSourceLoading(true);
    void hrApi.insurancePolicies(getAccessToken(),sourcePage,sourceKeyword,abort.signal).then(result=>{if(alive){setSources(result.items);setSourceTotal(result.total);}}).catch(error=>{if(alive)setMessage(errorMessage(error));}).finally(()=>{if(alive)setSourceLoading(false);});
    return()=>{alive=false;abort.abort();};
  },[mode,canCopy,sourcePage,sourceKeyword]);
  useEffect(()=>()=>{sequence.current++;detailRequest.current?.abort();writeRequest.current?.abort();},[]);
  const edit=()=>{attempt.current=null;setSaved(null);setMessage("");};
  const clearDetail=()=>{sequence.current++;detailRequest.current?.abort();setSelected(null);setDetailLoading(false);};
  const showDetail=async(id:string)=>{
    clearDetail();const seq=sequence.current,abort=new AbortController();detailRequest.current=abort;setDetailLoading(true);
    try{const result=await hrApi.insurancePolicyVersion(id,getAccessToken(),abort.signal);if(seq===sequence.current)setSelected(result);}catch(error){if(seq===sequence.current)setMessage(errorMessage(error));}finally{if(seq===sequence.current)setDetailLoading(false);}
  };
  const monthPattern=/^(?:19\d{2}|20\d{2}|2100)-(?:0[1-9]|1[0-2])$/u;
  const factorsReady=kinds.every(kind=>componentKeys.every(component=>{const field=draft[factorKey(kind,component)];return !!field&&insuranceRateFromPercent(field.percent)!==null&&(field.fixed===null||/^-?\d{1,15}(?:\.\d{1,3})?$/u.test(field.fixed));}));
  const ready=canCreate&&!!code&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u.test(code)&&/\p{L}/u.test(name.replace(/\p{Default_Ignorable_Code_Point}/gu,""))&&!!reason.trim()&&monthPattern.test(from)&&monthPattern.test(through)&&from<=through&&["1","2"].includes(variant)&&(mode==="manual"?factorsReady:mode==="copy"&&canCopy&&!!source&&source.availableVariants.includes(Number(variant)));
  const save=async(event:React.FormEvent)=>{
    event.preventDefault();if(!ready||busy.current)return;busy.current=true;setSaving(true);setSaved(null);setMessage("");
    const abort=new AbortController();writeRequest.current=abort;
    if(!attempt.current){
      const body:HrInsurancePolicyVersionRequest={requestId:crypto.randomUUID(),policyCode:code,policyName:name.trim(),variantNo:Number(variant),effectiveFrom:from,effectiveThrough:through,reason:reason.trim()};
      if(mode==="copy"&&source){body.sourcePolicyId=source.id;body.expectedSourceVersion=source.version;}
      else body.items=kinds.map(insuranceKind=>({insuranceKind,factors:Object.fromEntries(componentKeys.map(component=>{const field=draft[factorKey(insuranceKind,component)]!;return [component,{rate:insuranceRateFromPercent(field.percent)!,fixedAmount:field.fixed}];})) as NonNullable<HrInsurancePolicyVersionRequest["items"]>[number]["factors"]}));
      attempt.current={body,key:createIdempotencyKey("hr-insurance-policy-version")};
    }
    try{
      const result=await hrApi.createInsurancePolicyVersion(attempt.current.body,getAccessToken(),attempt.current.key,abort.signal);
      if(abort.signal.aborted)return;setSaved(result);attempt.current=null;setReload(n=>n+1);void showDetail(result.id);
    }catch(error){if(!abort.signal.aborted)setMessage(errorMessage(error));}finally{busy.current=false;if(!abort.signal.aborted)setSaving(false);}
  };
  const sourceQuery=(nextPage:number,nextKeyword=sourceKeyword)=>{edit();setSource(null);setVariant("");setSourcePage(nextPage);setSourceKeyword(nextKeyword);};
  return <>
    <section className="ds-panel"><div className={local.heading}><div><span className="ds-eyebrow">版本目录</span><h2>已保存的政策</h2><p>每个版本保留独立月份范围。选择版本后仍需完成期间核对与确认。</p></div><strong>共 {total} 个版本</strong></div>
      <form className={local.fields} onSubmit={e=>{e.preventDefault();clearDetail();setPage(1);setKeyword(search.trim());setReload(n=>n+1);}}><label className="form-field"><span>查找政策</span><input type="search" value={search} onChange={e=>setSearch(e.target.value)} maxLength={100} placeholder="政策名称或编号"/></label><div className={local.actions}><button className="ds-button" disabled={listLoading}>查询</button></div></form>
      <div className={`ds-mobile-record-list ${local.records}`}>{listLoading?<p>正在加载政策版本…</p>:rows.length?rows.map(row=><article className="ds-mobile-record" key={row.id}><strong>{row.policyName}</strong><span>{row.policyCode} · 版本 {row.versionNo} · 方案 {row.variantNo}</span><span>{row.effectiveFrom} 至 {row.effectiveThrough}</span><span>已保存定义，尚未启用核算</span><button className="ds-button" type="button" onClick={()=>void showDetail(row.id)}>查看版本</button></article>):<p>尚无匹配的政策版本。</p>}</div>
      <nav className={local.actions} aria-label="政策版本分页"><button className="ds-button" type="button" disabled={listLoading||page<=1} onClick={()=>{clearDetail();setPage(n=>n-1);}}>上一页</button><span>第 {page} / {Math.max(1,Math.ceil(total/20))} 页</span><button className="ds-button" type="button" disabled={listLoading||page>=Math.max(1,Math.ceil(total/20))} onClick={()=>{clearDetail();setPage(n=>n+1);}}>下一页</button></nav>
    </section>
    {canCreate?<section className={`ds-panel ${local.section}`}><div className={local.heading}><div><span className="ds-eyebrow">政策维护</span><h2>保存新的政策版本</h2><p>保存后费率与月份不可修改；变更时另建版本。这里不会生成参保期间或工资条。</p></div></div>
      <form onSubmit={save}><fieldset className={local.form} disabled={saving}><div className={local.fields}>
        <label className="form-field"><span>政策编号</span><input value={code} maxLength={64} required onChange={e=>{edit();setCode(e.target.value);}} placeholder="字母、数字、下划线或短横线"/></label>
        <label className="form-field"><span>政策名称</span><input value={name} maxLength={200} required onChange={e=>{edit();setName(e.target.value);}}/></label>
        <label className="form-field"><span>开始月份</span><input type="month" min="1900-01" max="2100-12" value={from} required onChange={e=>{edit();setFrom(e.target.value);}}/></label>
        <label className="form-field"><span>结束月份</span><input type="month" min={from||"1900-01"} max="2100-12" value={through} required onChange={e=>{edit();setThrough(e.target.value);}}/></label>
        <label className="form-field"><span>费率来源</span><select value={mode} required onChange={e=>{edit();setMode(e.target.value);setSource(null);setVariant("");setDraft({});}}><option value="">请选择来源</option><option value="manual">填写已确认的业务费率</option>{canCopy?<option value="copy">复制指定历史政策</option>:null}</select></label>
        <label className="form-field"><span>政策方案</span><select value={variant} required onChange={e=>{edit();setVariant(e.target.value);}}><option value="">请选择方案</option>{(mode==="copy"?source?.availableVariants??[]:[1,2]).map(v=><option key={v} value={v}>方案 {v}</option>)}</select></label>
        <label className="form-field"><span>业务依据</span><textarea value={reason} maxLength={500} required onChange={e=>{edit();setReason(e.target.value);}} placeholder="填写政策依据及适用说明"/></label>
      </div>
      {mode==="copy"?<div className={local.section}><h3>选择历史政策</h3><div className={local.fields}><label className="form-field"><span>查找历史政策</span><input type="search" value={sourceSearch} maxLength={100} onChange={e=>setSourceSearch(e.target.value)}/></label><div className={local.actions}><button className="ds-button" type="button" disabled={sourceLoading} onClick={()=>sourceQuery(1,sourceSearch.trim())}>查询历史政策</button></div><label className="form-field"><span>历史政策</span><select value={source?.id??""} disabled={sourceLoading} onChange={e=>{edit();setVariant("");setSource(sources.find(p=>p.id===e.target.value)??null);}}><option value="">请选择历史政策</option>{sources.map(p=><option key={p.id} value={p.id}>{p.name??p.code} · 版本 {p.version}</option>)}</select></label></div><div className={local.actions}><button className="ds-button" type="button" disabled={sourceLoading||sourcePage<=1} onClick={()=>sourceQuery(sourcePage-1)}>上一页历史政策</button><span>第 {sourcePage} / {Math.max(1,Math.ceil(sourceTotal/20))} 页</span><button className="ds-button" type="button" disabled={sourceLoading||sourcePage>=Math.max(1,Math.ceil(sourceTotal/20))} onClick={()=>sourceQuery(sourcePage+1)}>下一页历史政策</button></div><p>复制时重新核验来源版本与完整费率。历史政策的日期和状态不会自动成为本期政策。</p></div>:null}
      {mode==="manual"?<><div className={local.actions}><button className="ds-button" type="button" onClick={()=>{edit();setDraft(old=>Object.fromEntries(kinds.flatMap(kind=>componentKeys.map(component=>{const key=factorKey(kind,component);return [key,{percent:old[key]?.percent??"",fixed:null}];}))));}}>全部不使用固定附加额</button><button className="ds-button" type="button" onClick={()=>{edit();setDraft(old=>Object.fromEntries(Object.entries(old).map(([key,value])=>[key,{...value,fixed:""}])));}}>重新填写固定附加额</button></div><div className={local.factors}>{kinds.map(kind=><article className={`ds-scene-card ${local.factorCard}`} key={kind}><h3>{labels[kind]}</h3>{componentKeys.map(component=>{const key=factorKey(kind,component),field=draft[key]??{percent:"",fixed:""};return <div className={local.factorRow} key={component}><label className="form-field"><span>{labels[kind]}{components[component]}费率（%）</span><input type="number" inputMode="decimal" min="0" max="99999999999999.9999" step="0.0001" value={field.percent} required onFocus={e=>e.currentTarget.select()} onChange={e=>{edit();setDraft(old=>({...old,[key]:{...field,percent:e.target.value}}));}}/></label><label className="form-field"><span>{labels[kind]}{components[component]}固定附加额（元）</span>{field.fixed===null?<span>不使用固定附加额</span>:<input type="number" inputMode="decimal" min="-999999999999999.999" max="999999999999999.999" step="0.001" value={field.fixed} required onFocus={e=>e.currentTarget.select()} onChange={e=>{edit();setDraft(old=>({...old,[key]:{...field,fixed:e.target.value}}));}}/>}</label></div>;})}</article>)}</div><p>费率按百分数填写，例如 8 表示 8%。政策合计、单位、个人和补充分别定义，不自动互相推算。</p></>:null}
      <div className={local.actions}><PermissionButton className="ds-button ds-button-primary" permission={HR_INSURANCE_POLICY_PERMISSIONS.VERSION_CREATE} type="submit" disabled={!ready||saving}>{saving?"正在保存…":"保存政策版本"}</PermissionButton></div></fieldset></form>
    </section>:<section className={`ds-panel ${local.section}`}><p>当前可查看政策版本；保存新版本需要独立的政策维护授权。</p></section>}
    {saved?<section className={`ds-panel ${local.section}`} role="status"><strong>{saved.policyName} · 版本 {saved.versionNo} 已保存</strong><p>保存定义成功，尚未启用核算。可在版本目录再次查看。</p></section>:null}
    {message?<p className="form-error" role="alert">{message}</p>:null}
    {detailLoading?<p role="status">正在读取政策版本…</p>:null}
    {selected?<section className={`ds-panel ${local.section}`} aria-label="政策版本详情"><div className={local.heading}><div><h2>{selected.policyName} · 版本 {selected.versionNo}</h2><p>{selected.effectiveFrom} 至 {selected.effectiveThrough} · 方案 {selected.variantNo} · {selected.originKind==="manual"?"业务费率定义":"历史政策复制"}</p></div><button className="ds-button" type="button" onClick={clearDetail}>关闭详情</button></div><p>{selected.reason}</p><div className={`ds-mobile-record-list ${local.records}`}>{selected.items.map(item=><article className="ds-mobile-record" key={item.insuranceKind}><strong>{labels[item.insuranceKind]}</strong>{componentKeys.map(component=><span key={component}>{components[component]}：{insurancePercentFromRate(item.factors[component].rate)??"待核对"}% · {item.factors[component].fixedAmount===null?"无固定附加额":`固定附加额 ¥ ${item.factors[component].fixedAmount}`}</span>)}</article>)}</div></section>:null}
  </>;
}
export function HrInsurancePoliciesClient(){
  const user=useAuthUser(),allowed=[HR_PERMISSIONS.HR_INSURANCE_READ,HR_PERMISSIONS.HR_INSURANCE_AMOUNT_READ].every(p=>hasPermission(user,p));
  const context=JSON.stringify([user?.id,user?.tenant_id,user?.park_id,user?.permissions,user?.roles,user?.is_super,user?.data_scope,user?.data_scopes,user?.field_policies]);
  const fallback=<main className={`content ds-page ${styles.page}`}><section className="ds-panel"><ForbiddenState message="无权访问社保政策版本"/></section></main>;
  return <PermissionGuard module="hr" permission={HR_PERMISSIONS.HR_INSURANCE_PAGE} fallback={fallback}>{allowed?<main className={`content ds-page ${styles.page}`}><section className="ds-hero"><div className="ds-hero-copy"><span className="ds-eyebrow">员工保障</span><h1>社保政策版本</h1><p>明确适用月份和业务费率，保留每次政策变更的独立版本。</p><Link className="ds-button" href="/hr/insurance">返回五险一金台账</Link></div></section><Workbench key={context}/></main>:fallback}</PermissionGuard>;
}
