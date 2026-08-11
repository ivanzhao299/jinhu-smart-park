"use client";

import Link from "next/link";
import { Download, FileSignature, Printer, RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PermissionGuard } from "../../components/auth/PermissionGuard";
import { FileUploader } from "../../components/files/FileUploader";
import { getAccessToken } from "../../lib/authz";
import { apartmentsApi, type ApartmentRecord } from "../../lib/apartments-api";
import styles from "./ApartmentWorkbench.module.css";

const nav=[['总览','/apartments'],['房源','/apartments/rooms'],['申请','/apartments/applications'],['在住','/apartments/stays'],['退房','/apartments/checkouts'],['文书','/apartments/documents']] as const;
const statusLabels:Record<string,string>={pending_signature:'待签署',online_signed:'线上已签',paper_signed:'纸签已归档',void:'已作废'};

export function ApartmentDocumentsWorkbench(){
 const [templates,setTemplates]=useState<ApartmentRecord[]>([]),[documents,setDocuments]=useState<ApartmentRecord[]>([]),[applications,setApplications]=useState<ApartmentRecord[]>([]),[stays,setStays]=useState<ApartmentRecord[]>([]);
 const [templateId,setTemplateId]=useState(''),[targetId,setTargetId]=useState(''),[selected,setSelected]=useState<ApartmentRecord|null>(null),[signerName,setSignerName]=useState(''),[message,setMessage]=useState(''),[loading,setLoading]=useState(true),[defaultReason,setDefaultReason]=useState('');
 const currentTemplate=useMemo(()=>templates.find(x=>x.id===templateId),[templates,templateId]);
 const usesStay=currentTemplate?.document_type==='move_in_handover'||currentTemplate?.document_type==='move_out_acceptance';
 const targets=usesStay?stays:applications;
 const load=useCallback(async()=>{setLoading(true);setMessage('');try{const token=getAccessToken();const [t,d,a,s,settings]=await Promise.all([apartmentsApi.templates(token),apartmentsApi.documents(token),apartmentsApi.applications(token),apartmentsApi.stays(token),apartmentsApi.settings(token)]);setTemplates(t.filter(x=>x.status==='published'));setDocuments(d);setApplications(a);setStays(s);setDefaultReason(settings.default_application_reason);setTemplateId(v=>v||String(t.find(x=>x.status==='published')?.id??''));}catch(e){setMessage(e instanceof Error?e.message:'文书档案加载失败')}finally{setLoading(false)}},[]);
 useEffect(()=>{void load()},[load]);
 useEffect(()=>setTargetId(''),[templateId]);
 const mutate=async(path:string,body:object)=>{try{await apartmentsApi.mutate(path,body,getAccessToken());setSelected(null);await load()}catch(e){setMessage(e instanceof Error?e.message:'操作失败')}};
 const generate=async()=>{if(!templateId||!targetId){setMessage('请选择正式模板和关联业务记录');return}await mutate('/apartments/documents/generate',{template_id:templateId,...(usesStay?{stay_id:targetId}:{application_id:targetId})})};
 const openRendered=async(doc:ApartmentRecord,download=false)=>{try{const rendered=await apartmentsApi.renderDocument(doc.id,getAccessToken());const url=URL.createObjectURL(new Blob([rendered.html],{type:'text/html;charset=utf-8'}));if(download){const a=document.createElement('a');a.href=url;a.download=rendered.filename;a.click()}else window.open(url,'_blank','noopener,noreferrer');setTimeout(()=>URL.revokeObjectURL(url),30000)}catch(e){setMessage(e instanceof Error?e.message:'文书打开失败')}};
 const saveReason=async()=>{await mutate('/apartments/settings',{default_application_reason:defaultReason})};
 const forbidden=<main className="content ds-page"><section className="ds-panel"><h1>无权访问文书档案</h1></section></main>;
 return <PermissionGuard module="apartment" permission="apartment:documents" fallback={forbidden}><main className="content ds-page">
  <section className={`ds-hero ${styles.hero}`}><div><span className={styles.muted}>集团人才公寓 · 正式文书中心</span><h1>文书档案</h1><p>生成正式文本、打印签字、线上签署和签后归档全程留痕。</p></div><button className="secondary-button" onClick={()=>void load()}><RefreshCw size={16}/>刷新</button></section>
  <nav className={styles.nav}>{nav.map(([n,h])=><Link href={h} key={h}>{n}</Link>)}</nav>
  {message?<p className="form-error">{message}</p>:null}
  <section className="ds-panel"><h2>默认入住理由</h2><p className={styles.muted}>新建申请自动带出，申请人仍可按实际情况修改；不会改写历史申请。</p><textarea maxLength={1000} value={defaultReason} onChange={e=>setDefaultReason(e.target.value)} /><div className={styles.formActions}><button className="secondary-button" onClick={()=>void saveReason()}>保存默认理由</button></div></section>
  <section className="ds-panel"><h2>生成正式文书</h2><div className={styles.form}><label>文书模板<select value={templateId} onChange={e=>setTemplateId(e.target.value)}><option value="">请选择</option>{templates.map(t=><option key={t.id} value={t.id}>{String(t.title)} · V{String(t.version_no)}</option>)}</select></label><label className={styles.wide}>关联{usesStay?'入住记录':'申请记录'}<select value={targetId} onChange={e=>setTargetId(e.target.value)}><option value="">请选择</option>{targets.map(x=><option key={x.id} value={x.id}>{String(x.applicant_name??x.occupant_name)} · {String(x.application_code??x.stay_code)}</option>)}</select></label></div><button className="primary-button" onClick={()=>void generate()}><FileSignature size={16}/>生成待签文书</button></section>
  <section className="ds-panel"><h2>正式模板</h2><div className="ds-command-grid">{templates.map(t=><article className="ds-command-card" key={t.id}><ShieldCheck size={22}/><strong>{String(t.title)}</strong><span>{String(t.document_type)} · V{String(t.version_no)} · 已发布</span></article>)}</div></section>
  <section className="ds-panel"><h2>文书档案</h2><div className={styles.list}>{loading?<div className={styles.empty}>正在加载…</div>:documents.length?documents.map(doc=><article className={`ds-mobile-record ${styles.record}`} key={doc.id}><strong>{String(doc.title)}</strong><span>{String(doc.document_no)}</span><span>{String(doc.applicant_name??'')}</span><span className={styles.muted}>{statusLabels[String(doc.status)]??String(doc.status)}</span><div className={styles.actions}><button className="secondary-button" onClick={()=>void openRendered(doc)}><Printer size={15}/>预览/打印</button><button className="secondary-button" onClick={()=>void openRendered(doc,true)}><Download size={15}/>下载</button>{doc.status==='pending_signature'?<button className="primary-button" onClick={()=>setSelected(doc)}>办理签署</button>:null}</div></article>):<div className={styles.empty}>暂无正式文书，请从上方选择模板生成。</div>}</div></section>
  {selected?<section className="ds-panel"><h2>签署：{String(selected.title)}</h2><div className={styles.form}><label>签署姓名<input value={signerName} maxLength={100} placeholder="请输入本人真实姓名" onChange={e=>setSignerName(e.target.value)}/></label><label className={styles.wide}>签署声明<textarea readOnly value="本人已阅读并确认上述文书内容真实、完整，自愿以线上方式签署并承担相应责任。"/></label></div><div className={styles.actions}><button className="primary-button" disabled={!signerName.trim()} onClick={()=>void mutate(`/apartments/documents/${selected.id}/sign-online`,{signer_name:signerName,statement:'本人已阅读并确认上述文书内容真实、完整，自愿以线上方式签署并承担相应责任。',client_label:navigator.userAgent})}>确认线上签署</button><button className="secondary-button" onClick={()=>setSelected(null)}>取消</button></div><hr/><h3>或上传纸质签字件</h3><FileUploader bizType="apartment_document_signed" bizId={selected.id} policyKey="general" label="上传扫描件或照片" onUploaded={file=>void mutate(`/apartments/documents/${selected.id}/sign-paper`,{signed_file_id:file.id})}/></section>:null}
 </main></PermissionGuard>;
}
