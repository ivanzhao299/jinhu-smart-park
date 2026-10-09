"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {createIdempotencyKey} from "../../../lib/api-client";
import {getAccessToken} from "../../../lib/authz";
import {hrApi,type HrEmployeeSchedule,type HrAttendanceShift} from "../../../lib/hr-api";
import {hrLoadErrorMessage} from "../hr-errors";
import styles from "../hr-workbench.module.css";

export function AttendanceScheduleEditor({employeeId,workDate,shifts,disabled,onBusyChange,onSaved}:{employeeId:string;workDate:string;shifts:HrAttendanceShift[];disabled:boolean;onBusyChange:(busy:boolean)=>void;onSaved:()=>Promise<void>}){
 const [current,setCurrent]=useState<HrEmployeeSchedule|null>(null),[ready,setReady]=useState(false),[loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[shiftId,setShiftId]=useState(""),[reason,setReason]=useState(""),[error,setError]=useState(""),[message,setMessage]=useState("");
 const read=useRef<AbortController|null>(null),mounted=useRef(true),inFlight=useRef(false),submission=useRef<{signature:string;key:string}|null>(null),owner=useRef("");
 const onSavedRef=useRef(onSaved);onSavedRef.current=onSaved;
 const context=JSON.stringify([employeeId,workDate]);owner.current=context;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;read.current?.abort();if(inFlight.current)onBusyChange(false)}},[onBusyChange]);
 const load=useCallback(async()=>{
  read.current?.abort();const controller=new AbortController();read.current=controller;
  setReady(false);setCurrent(null);setShiftId("");setReason("");setError("");setMessage("");submission.current=null;
  if(!employeeId||!workDate){setLoading(false);return}
  setLoading(true);
  try{const row=await hrApi.attendanceSchedule(employeeId,workDate,getAccessToken(),controller.signal);if(controller.signal.aborted)return;setCurrent(row);setShiftId(row?.shiftId??"");setReady(true)}
  catch(failure){if(!controller.signal.aborted)setError(hrLoadErrorMessage(failure,"读取当日排班失败，请重试"))}
  finally{if(!controller.signal.aborted)setLoading(false)}
 },[employeeId,workDate]);
 useEffect(()=>{void load();return()=>read.current?.abort()},[load]);
 const enabled=shifts.filter(shift=>shift.status==="enabled"),chosen=shiftId||(!current?enabled[0]?.id??"":""),available=enabled.some(shift=>shift.id===chosen);
 const save=async()=>{
  if(disabled||inFlight.current||!ready||!available||!employeeId||!workDate||current&&(!reason.trim()||chosen===current.shiftId))return;
  const target=context,token=getAccessToken(),body=current?{shiftId:chosen,expectedVersion:current.version,reason:reason.trim()}:{employeeId,shiftId:chosen,workDate};
  const signature=JSON.stringify([current?.id??null,body]);if(submission.current?.signature!==signature)submission.current={signature,key:createIdempotencyKey("hr-attendance-schedule")};
  inFlight.current=true;setSaving(true);onBusyChange(true);setError("");setMessage("");
  try{
   if(current){const saved=await hrApi.updateAttendanceSchedule(current.id,body,token,submission.current.key);if(!mounted.current||owner.current!==target)return;setCurrent(saved)}
   else{const saved=await hrApi.createAttendanceSchedule(body,token,submission.current.key);if(!mounted.current||owner.current!==target)return;setCurrent(saved)}
   setReason("");submission.current=null;setMessage("排班已保存，请重算该员工当日考勤。待确认月结需要重新计算；已封账输入通过更正流程更新。");
   try{await onSavedRef.current()}catch{if(mounted.current&&owner.current===target)setMessage("排班已保存；结果列表刷新失败，请重新读取。")}
  }catch(failure){if(mounted.current&&owner.current===target)setError(hrLoadErrorMessage(failure,"保存排班失败，请核对后重试"))}
  finally{inFlight.current=false;if(mounted.current&&owner.current===target){setSaving(false);onBusyChange(false)}}
 };
 return <div>
  {loading?<p role="status">正在读取当日排班…</p>:null}
  {ready?<p>{current?`当前排班：${current.shiftName} ${current.startLocal??""}—${current.endLocal??""}`:"当天尚未排班，可以新增。"}{current?.requiresRecalculation?" · 待重算日考勤":""}</p>:null}
  <div className={styles.operationFields}><label className="form-field"><span>班次</span><select disabled={disabled||saving||!ready} value={chosen} onChange={event=>setShiftId(event.target.value)}><option value="">请选择班次</option>{current&&!enabled.some(shift=>shift.id===current.shiftId)?<option value={current.shiftId}>{current.shiftName}（当前班次不可新选）</option>:null}{enabled.map(shift=><option key={shift.id} value={shift.id}>{shift.shiftName} {shift.startLocal}—{shift.endLocal} · 迟到宽限{shift.lateGraceMinutes} / 早退宽限{shift.earlyGraceMinutes}分钟</option>)}</select></label>{current?<label className="form-field"><span>排班调整原因</span><textarea required maxLength={500} disabled={disabled||saving} value={reason} onChange={event=>setReason(event.target.value)}/></label>:null}</div>
  {error?<p role="alert" className="form-error">{error}</p>:null}{message?<p role="status">{message}</p>:null}
  <div className={styles.actionRow}><button type="button" className="ds-button" disabled={disabled||saving||!ready||!available||Boolean(current&&(!reason.trim()||chosen===current.shiftId))} onClick={()=>void save()}>{current?"保存排班调整":"保存当日排班"}</button>{employeeId&&workDate?<button type="button" className="ds-button" disabled={disabled||saving||loading} onClick={()=>void load()}>重新读取排班</button>:null}</div>
 </div>;
}
