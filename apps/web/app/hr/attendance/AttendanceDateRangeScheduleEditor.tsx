"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {createIdempotencyKey} from "../../../lib/api-client";
import {getAccessToken} from "../../../lib/authz";
import {addBusinessDateDays,businessDate} from "../../../lib/business-date";
import {hrApi,type HrAttendanceShift,type HrEmployeeSchedule} from "../../../lib/hr-api";
import {hrLoadErrorMessage} from "../hr-errors";
import styles from "../hr-workbench.module.css";
import local from "./date-range-schedule.module.css";

type Operation = {kind:"create";body:{employeeId:string;shiftId:string;workDate:string}} |
 {kind:"update";id:string;body:{shiftId:string;expectedVersion:number;reason:string}};
type Item = {date:string;row:HrEmployeeSchedule|null;operation:Operation|null;key:string;state:"preview"|"success"|"failed"};
type Plan = {signature:string;items:Item[];ready:boolean};
function dates(a:string,b:string):string[]{
 const valid=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(`${value}T00:00:00Z`))&&addBusinessDateDays(value,0)===value;
 if(!valid(a)||!valid(b)||a>b)return [];
 const result:string[]=[];
 for(let date=a;date<=b;date=addBusinessDateDays(date,1)){result.push(date);if(result.length>31)return []}
 return result;
}
export function AttendanceDateRangeScheduleEditor({employeeId,employeeName,employeeCode,shifts,disabled,onBusyChange,onSaved}:{employeeId:string;employeeName?:string;employeeCode?:string;shifts:HrAttendanceShift[];disabled:boolean;onBusyChange:(v:boolean)=>void;onSaved:()=>Promise<void>}){
 const [start,setStart]=useState(businessDate()),[end,setEnd]=useState(businessDate());
 const [shift,setShift]=useState(""),[reason,setReason]=useState("");
 const [selected,setSelected]=useState<Set<string>>(new Set());
 const [plan,setPlan]=useState<Plan|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const mounted=useRef(false),generation=useRef(0),flight=useRef(false),stop=useRef(false);
 const ownsBusy=useRef(false),read=useRef<AbortController|null>(null);
 const callbacks=useRef({onBusyChange,onSaved});callbacks.current={onBusyChange,onSaved};
 const list=useMemo(()=>dates(start,end),[start,end]);
 const chosen=[...selected].filter(date=>list.includes(date)).sort();
 const enabled=shifts.filter(row=>row.status==="enabled"),targetShift=enabled.find(row=>row.id===shift);
 const token=getAccessToken();
 const signature=JSON.stringify([token,employeeId,start,end,shift,reason.trim(),chosen]);
 const owner=useRef(signature);owner.current=signature;
 const name=employeeName?`${employeeName}${employeeCode?`（${employeeCode}）`:""}`:"请先选择考勤员工";
 useEffect(()=>{mounted.current=true;return()=>{
  mounted.current=false;generation.current++;read.current?.abort();stop.current=true;
  if(ownsBusy.current){ownsBusy.current=false;callbacks.current.onBusyChange(false)}
 }},[]);
 const release=()=>{flight.current=false;if(ownsBusy.current){ownsBusy.current=false;callbacks.current.onBusyChange(false)}if(mounted.current)setBusy(false)};
 const begin=()=>{flight.current=true;ownsBusy.current=true;setBusy(true);callbacks.current.onBusyChange(true);setMessage("");return ++generation.current};
 const live=(id:number,context:string,access:typeof token)=>mounted.current&&generation.current===id&&owner.current===context&&getAccessToken()===access;
 const inspect=async()=>{
  if(flight.current||disabled||!employeeId||!targetShift||!chosen.length)return;
  const context=signature,access=getAccessToken(),id=begin();
  const previous=plan?.signature===context?plan:null;
  setPlan(previous?{...previous,ready:false}:null);
  const controller=new AbortController();read.current=controller;
  try{
   const next:Item[]=[];
   for(const date of chosen){
    if(!live(id,context,access))return;
    const row=await hrApi.attendanceSchedule(employeeId,date,access,controller.signal);
    if(!live(id,context,access))return;
    const retained=previous?.items.find(item=>item.date===date);
    // An uncertain submission owns its original method, target, body and key even after rereading.
    if(retained&&(retained.state==="success"||retained.state==="failed")){next.push(retained);continue}
    const operation:Operation|null=row?.shiftId===shift?null:row?
     {kind:"update",id:row.id,body:{shiftId:shift,expectedVersion:row.version,reason:reason.trim()}}:
     {kind:"create",body:{employeeId,shiftId:shift,workDate:date}};
    next.push({date,row,operation,key:createIdempotencyKey("hr-attendance-range-schedule"),state:"preview"});
   }
   setPlan({signature:context,items:next,ready:true});
   setMessage("已完成只读核对；范围不是原子事务，成功日期不会重发。");
  }catch(failure){if(live(id,context,access))setMessage(hrLoadErrorMessage(failure,"读取日期范围排班失败；不会发送任何写入。"))}
  finally{if(generation.current===id)release()}
 };
 const run=async()=>{
  if(flight.current||disabled||!plan?.ready||plan.signature!==signature||!targetShift)return;
  if(plan.items.some(item=>item.operation?.kind==="update"&&!item.operation.body.reason))return;
  const context=signature,access=getAccessToken(),id=begin();stop.current=false;
  let success=false;
  try{
   for(const item of plan.items){
    if(stop.current||!live(id,context,access))break;
    if(item.state==="success"||!item.operation)continue;
    const operation=item.operation;
    try{
     if(operation.kind==="update")await hrApi.updateAttendanceSchedule(operation.id,operation.body,access,item.key);
     else await hrApi.createAttendanceSchedule(operation.body,access,item.key);
     if(!live(id,context,access))return;
     item.state="success";success=true;setPlan({...plan,items:[...plan.items]});
    }catch(failure){
     if(!live(id,context,access))return;
     item.state="failed";setPlan({...plan,items:[...plan.items]});
     setMessage(`${item.date} 未确认完成；${hrLoadErrorMessage(failure,"保存失败")}。后续日期尚未发送，重试保留原请求体和幂等键。`);
     break;
    }
   }
   if(!live(id,context,access))return;
   if(stop.current)setMessage("已停止后续日期；已保存日期继续有效。");
   else if(plan.items.every(item=>!item.operation||item.state==="success"))setMessage("选定日期排班已处理完成。请重算日考勤；月结须重新计算，已封账输入通过更正流程更新。");
   if(success){try{await callbacks.current.onSaved()}catch{
    if(live(id,context,access))setMessage(current=>`${current} 排班已保存；结果列表刷新失败，请重新读取。`);
   }}
  }finally{if(generation.current===id)release()}
 };
 const locked=busy||disabled;
 const needReason=plan?.items.some(item=>item.operation?.kind==="update"&&!item.operation.body.reason)??false;
 return <section className={local.editor}>
  <header><h3>日期范围排班</h3><small>逐日选择自然日，最多连续31天；不推断周末或节假日。</small></header>
  <div className={styles.operationFields}>
   <div className={styles.operationContext}><span>员工</span><strong>{name}</strong></div>
   <label className="form-field"><span>范围开始日期</span><input type="date" value={start} disabled={locked} onChange={e=>setStart(e.target.value)}/></label>
   <label className="form-field"><span>范围结束日期</span><input type="date" value={end} disabled={locked} onChange={e=>setEnd(e.target.value)}/></label>
   <label className="form-field"><span>范围排班班次</span><select value={shift} disabled={locked} onChange={e=>setShift(e.target.value)}><option value="">请选择启用班次</option>{enabled.map(row=><option key={row.id} value={row.id}>{row.shiftName} {row.startLocal}—{row.endLocal}</option>)}</select></label>
   <label className="form-field"><span>范围排班调整原因</span><textarea aria-label="范围排班调整原因" maxLength={500} value={reason} disabled={locked} onChange={e=>setReason(e.target.value)}/><small>修改已有排班时必填；填写后请重新核对计划。</small></label>
  </div>
  {list.length?<>
   <div className={styles.actionRow}><button className="ds-button" type="button" disabled={locked} onClick={()=>setSelected(new Set(list))}>全选当前日期范围</button><button className="ds-button" type="button" disabled={locked} onClick={()=>setSelected(new Set())}>清空日期</button></div>
   <div className={local.days}>{list.map(date=><label key={date}><input aria-label={date} type="checkbox" disabled={locked} checked={selected.has(date)} onChange={e=>setSelected(previous=>{const next=new Set(previous);if(e.target.checked)next.add(date);else next.delete(date);return next})}/>{date}</label>)}</div>
  </>:<p className="form-error">请输入有效的自然日期范围，含起止日最多31天。</p>}
  <div className={styles.actionRow}>
   <button className="ds-button" type="button" disabled={locked||!chosen.length||!employeeId||!targetShift} onClick={()=>void inspect()}>核对日期范围排班</button>
   {plan?<button className="ds-button ds-button-primary" type="button" disabled={locked||!plan.ready||plan.signature!==signature||needReason} onClick={()=>void run()}>确认按日期顺序保存</button>:null}
   {busy?<button type="button" className="ds-button" onClick={()=>{stop.current=true}}>停止后续日期</button>:null}
  </div>
  {plan?<div className={`ds-panel ${local.plan}`}><strong>只读计划：{name} · 目标班次 {targetShift?.shiftName} {targetShift?.startLocal}—{targetShift?.endLocal}</strong>
   <div className={local.planDays}>{plan.items.map(item=><span key={item.date}>{item.date} · {item.row?`${item.row.shiftName} V${item.row.version}`:"尚未排班"} · {item.operation?.kind==="create"?"拟新增":item.operation?"拟调整":"无需变更"} · {item.state==="success"?"已保存":item.state==="failed"?"未确认完成":"待确认"}</span>)}</div>
  </div>:null}
  {message?<p role="status">{message}</p>:null}
 </section>;
}
