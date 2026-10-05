"use client";
import { useState } from "react";

export type TrainingPlanFactsFormValue = {courseTitle:string|null;startDate:string;endDate:string;factRevision:number};
export function trainingPlanFactsPayload(form:FormData,current:TrainingPlanFactsFormValue,canCourse:boolean){
 const courseName=String(form.get("courseName")??"").trim(),startDate=String(form.get("startDate")??""),endDate=String(form.get("endDate")??"");
 return {expectedRevision:current.factRevision,reason:String(form.get("reason")??"").trim(),
  ...(canCourse&&courseName!==current.courseTitle?{courseName}:{}),
  ...(startDate!==current.startDate.slice(0,10)?{startDate}:{}),
  ...(endDate!==current.endDate.slice(0,10)?{endDate}:{})};
}
export function TrainingPlanFactsForm({current,canCourse,busy,className,onSubmit}:{current:TrainingPlanFactsFormValue;canCourse:boolean;busy:boolean;className:string|undefined;onSubmit:(form:FormData)=>Promise<unknown>}){
 const [start,setStart]=useState(current.startDate.slice(0,10)),[end,setEnd]=useState(current.endDate.slice(0,10));
 return <form className={className} action={async form=>{await onSubmit(form);}}>
  {canCourse?<label className="form-field"><span>课程名称</span><input name="courseName" defaultValue={current.courseTitle??""} required maxLength={160}/></label>:<p>课程：{current.courseTitle??"未登记"}</p>}
  <label className="form-field"><span>开始日期</span><input name="startDate" type="date" required value={start} max={end||undefined} onChange={e=>setStart(e.target.value)}/></label>
  <label className="form-field"><span>结束日期</span><input name="endDate" type="date" required value={end} min={start||undefined} onChange={e=>setEnd(e.target.value)}/></label>
  <label className="form-field"><span>修改原因</span><input name="reason" required maxLength={1000}/></label>
  <button className="ds-button ds-button-primary" disabled={busy}>保存课程及日期</button>
 </form>;
}
