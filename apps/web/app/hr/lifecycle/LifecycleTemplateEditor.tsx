"use client";
import {useEffect,useId,useRef,useState} from "react";
import {hrApi,type HrLifecycleTemplateDetail,type HrLifecycleTemplateItem} from "../../../lib/hr-api";
import {getAccessToken} from "../../../lib/authz";
import {hrLoadErrorMessage} from "../hr-errors";
import styles from "./lifecycle-template.module.css";
const MAX_ITEMS=50;
type DraftItem={key:number;code:string;name:string;category:string;defaultDueDays:string;required:boolean};
const emptyItem=(key:number):DraftItem=>({key,code:"",name:"",category:"documents",defaultDueDays:"",required:true});
export function LifecycleTemplateEditor({template,onSaved}:{template?:HrLifecycleTemplateDetail;onSaved:()=>Promise<void>|void}){
 const categoryListId=useId();
 const serial=useRef(template?.items.length??1),flight=useRef(false),alive=useRef(true);
 // The owning context and template-version keys remount this complete draft.
 const [code,setCode]=useState(""),[name,setName]=useState(""),[type,setType]=useState<"onboarding"|"offboarding">("onboarding"),[busy,setBusy]=useState(false),[error,setError]=useState(""),[success,setSuccess]=useState("");
 const [items,setItems]=useState<DraftItem[]>(()=>template?template.items.map((item,index)=>({...item,key:index,defaultDueDays:item.defaultDueDays==null?"":String(item.defaultDueDays)})):[emptyItem(0)]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const update=(key:number,value:Partial<DraftItem>)=>{setError("");setSuccess("");setItems(rows=>rows.map(row=>row.key===key?{...row,...value}:row));};
 const move=(index:number,delta:number)=>{setError("");setSuccess("");setItems(rows=>{const next=[...rows],target=index+delta;if(target<0||target>=next.length)return rows;[next[index],next[target]]=[next[target]!,next[index]!];return next;});};
 const submit=async()=>{
  if(flight.current)return;
  setError("");setSuccess("");
  if(!template&&(!code.trim()||!name.trim())){setError("请填写模板编号和名称。");return;}
  if(items.length<1||items.length>MAX_ITEMS){setError("模板必须包含1至50项任务。");return;}
  const codes=new Set<string>(),payload:HrLifecycleTemplateItem[]=[];
  for(const [index,item] of items.entries()){
   const itemCode=item.code.trim(),itemName=item.name.trim(),category=item.category.trim(),due=item.defaultDueDays;
   if(!itemCode||!itemName||!category){setError(`第${index+1}项的编号、名称和分类不能为空。`);return;}
   if(codes.has(itemCode)){setError(`任务编号“${itemCode}”重复，请使用唯一编号。`);return;}codes.add(itemCode);
   if(due!==""&&(!/^-?\d+$/.test(due)||Number(due)<-365||Number(due)>365)){setError(`第${index+1}项的相对截止天数必须是-365至365的整数。`);return;}
   payload.push({code:itemCode,name:itemName,category,required:item.required,...(due===""?{}:{defaultDueDays:Number(due)})});
  }
  flight.current=true;setBusy(true);
  try{
   const result=template?await hrApi.publishLifecycleTemplateVersion(template.id,{items:payload},getAccessToken()):await hrApi.createLifecycleTemplate({code:code.trim(),name:name.trim(),type,items:payload},getAccessToken());
   if(!alive.current)return;
   setSuccess(`已发布模板V${result.versionNo}，共${result.itemCount}项任务。`);
   if(!template){setCode("");setName("");setType("onboarding");setItems([emptyItem(serial.current++)]);}
   try{await onSaved();}catch(e){if(alive.current)setError(`模板已发布，刷新失败：${hrLoadErrorMessage(e,"请刷新列表")}`);}
  }catch(e){if(alive.current)setError(hrLoadErrorMessage(e,"发布模板失败"));}
  finally{flight.current=false;if(alive.current)setBusy(false);}
 };
 return <form className={styles.editor} onSubmit={event=>{event.preventDefault();void submit();}} noValidate>
  {template?<p>当前V{template.versionNo} · {template.itemCount}项；发布后生成新版本，既有清单保持原版本快照。</p>:<div className={styles.fields}><label className="form-field"><span>模板编号</span><input required maxLength={64} value={code} disabled={busy} onChange={event=>{setCode(event.target.value);setError("");}}/></label><label className="form-field"><span>模板名称</span><input required maxLength={160} value={name} disabled={busy} onChange={event=>{setName(event.target.value);setError("");}}/></label><label className="form-field"><span>适用环节</span><select value={type} disabled={busy} onChange={event=>setType(event.target.value as "onboarding"|"offboarding")}><option value="onboarding">入职</option><option value="offboarding">离职</option></select></label></div>}
  <p>任务顺序即清单办理顺序；相对截止天数以清单截止日期为基准，留空或清单未设截止日时不设项目截止日。</p>
  <div className={styles.items}>{items.map((item,index)=><fieldset className={`ds-panel ${styles.item}`} key={item.key} disabled={busy}><legend>任务{index+1}</legend><div className={styles.fields}>
   <label className="form-field"><span>任务编号</span><input required maxLength={64} value={item.code} onChange={event=>update(item.key,{code:event.target.value})}/></label>
   <label className="form-field"><span>任务名称</span><input required maxLength={160} value={item.name} onChange={event=>update(item.key,{name:event.target.value})}/></label>
   <label className="form-field"><span>任务分类</span><input required maxLength={32} value={item.category} list={categoryListId} onChange={event=>update(item.key,{category:event.target.value})}/></label>
   <label className="form-field"><span>相对截止天数</span><input type="number" min={-365} max={365} step={1} value={item.defaultDueDays} onFocus={event=>event.target.select()} onChange={event=>update(item.key,{defaultDueDays:event.target.value})}/></label>
   <label className="checkbox-row"><input type="checkbox" checked={item.required} onChange={event=>update(item.key,{required:event.target.checked})}/><span>必须办理</span></label>
  </div><div className={styles.actions}><button type="button" className="ds-button" aria-label={`上移任务${index+1}`} disabled={index===0} onClick={()=>move(index,-1)}>上移</button><button type="button" className="ds-button" aria-label={`下移任务${index+1}`} disabled={index===items.length-1} onClick={()=>move(index,1)}>下移</button><button type="button" className="ds-button" aria-label={`删除任务${index+1}`} disabled={items.length===1} onClick={()=>{setItems(rows=>rows.filter(row=>row.key!==item.key));setError("");setSuccess("");}}>删除</button></div></fieldset>)}</div>
  <datalist id={categoryListId}><option value="documents"/><option value="contract"/><option value="account"/><option value="asset"/><option value="training"/></datalist>
  {error?<p className="form-error" role="alert">{error}</p>:null}{success?<p role="status">{success}</p>:null}
  <div className={styles.actions}><span role="status">共{items.length} / {MAX_ITEMS}项</span><button type="button" className="ds-button" disabled={busy||items.length>=MAX_ITEMS} onClick={()=>{setItems(rows=>[...rows,emptyItem(serial.current++)]);setError("");setSuccess("");}}>添加任务</button><button className="ds-button ds-button-primary" disabled={busy}>{busy?"发布中…":template?"发布新版本":"发布模板"}</button></div>
 </form>;
}
