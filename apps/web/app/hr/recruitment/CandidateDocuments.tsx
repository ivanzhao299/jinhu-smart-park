"use client";
import {HR_PERMISSIONS,SYSTEM_PERMISSIONS} from "@jinhu/shared";
import {useState} from "react";
import {AttachmentList} from "../../../components/files/AttachmentList";
import {FileUploader} from "../../../components/files/FileUploader";
import {useAuthUser} from "../../../lib/auth-context";
import {hasPermission} from "../../../lib/permissions";
import styles from "./recruitment.module.css";

const documentKinds=[
 {bizType:"hr_candidate_resume",label:"简历材料"},
 {bizType:"hr_candidate_offer_evidence",label:"录用材料"},
] as const;
export type CandidateDocumentKind=typeof documentKinds[number]["bizType"];
export function CandidateDocuments({candidateId,disabled,uploadBusy,onUploadingChange}:{candidateId:string;disabled:boolean;uploadBusy:boolean;onUploadingChange:(kind:CandidateDocumentKind,uploading:boolean)=>void}){
 const user=useAuthUser();
 const canRead=hasPermission(user,HR_PERMISSIONS.HR_RECRUITMENT_DOCUMENT_READ)&&hasPermission(user,SYSTEM_PERMISSIONS.FILE_READ);
 const canUpload=hasPermission(user,HR_PERMISSIONS.HR_RECRUITMENT_DOCUMENT_MANAGE)&&hasPermission(user,SYSTEM_PERMISSIONS.FILE_UPLOAD);
 const canDelete=hasPermission(user,HR_PERMISSIONS.HR_RECRUITMENT_DOCUMENT_MANAGE)&&hasPermission(user,SYSTEM_PERMISSIONS.FILE_DELETE);
 const [refresh,setRefresh]=useState<Record<CandidateDocumentKind,number>>({hr_candidate_resume:0,hr_candidate_offer_evidence:0});
 return <div className={`ds-scene-grid ${styles.documents}`} aria-label="候选人材料">{documentKinds.map(({bizType,label})=><section className={`ds-panel ${styles.documentCard}`} key={bizType}>
  <h3>{label}</h3>
  <p>材料与当前候选人关联，重新进入后仍可查看。</p>
  {canUpload?<FileUploader bizType={bizType} bizId={candidateId} label={`上传${label}`} compact disabled={disabled} onUploadingChange={value=>onUploadingChange(bizType,value)} onUploaded={()=>setRefresh(current=>({...current,[bizType]:current[bizType]+1}))}/>:null}
  {canRead?<AttachmentList bizType={bizType} bizId={candidateId} label={`已关联${label}`} emptyLabel={`暂无${label}`} compact refreshKey={refresh[bizType]} mutationDisabled={disabled||uploadBusy} mutationPermission={HR_PERMISSIONS.HR_RECRUITMENT_DOCUMENT_MANAGE} allowDelete={canDelete}/>:<p>当前账号没有材料查看权限。{canUpload?"上传后请由有查看权限的人员核对。":"请由有对应权限的人员办理。"}</p>}
 </section>)}</div>;
}
