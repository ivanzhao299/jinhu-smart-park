"use client";
import {useState} from "react";
import {HrEmployeeSelection,type HrEmployeeOption} from "../components/HrEmployeeSelection";
import styles from "./hr-talent.module.css";

interface Props {name:"employeeId"|"employeeIds"|"ownerEmployeeId";selected:HrEmployeeOption[];onChange:(rows:HrEmployeeOption[])=>void;disabled:boolean;multiple?:boolean;}
export function TalentEmployeePicker({name,selected,onChange,disabled,multiple=false}:Props){
 const [error,setError]=useState("");
 const choose=(id:string,row?:HrEmployeeOption)=>{
  setError("");
  if(!multiple){onChange(row?[row]:[]);return;}
  if(!row||selected.some(employee=>employee.id===id))return;
  if(selected.length>=500){setError("单次盘点最多选择500人，请分批创建会议。");return;}
  onChange([...selected,row]);
 };
 return <div className={styles.employeePicker}>
  <HrEmployeeSelection purpose="talent" disabled={disabled} required={!multiple} selectedId={multiple?"":selected[0]?.id??""} currentEmployee={multiple?undefined:selected[0]} onChange={choose}/>
  {selected.map(row=><input key={row.id} type="hidden" name={name} value={row.id}/>)}
  {multiple?<section aria-label="已选盘点员工"><p role="status">已选 {selected.length} / 500 人</p><div className={styles.selectedEmployees}>{selected.map(row=><article className="ds-mobile-record" key={row.id}><span>{row.fullName} · {row.employeeCode}</span><button type="button" className="ds-button ds-button-secondary" disabled={disabled} onClick={()=>{setError("");onChange(selected.filter(employee=>employee.id!==row.id));}} aria-label={`移除${row.fullName}`}>移除</button></article>)}</div></section>:null}
  {error?<p className="form-error" role="alert">{error}</p>:null}
 </div>;
}
