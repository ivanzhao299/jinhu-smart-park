"use client";

import { HR_PERMISSIONS, SYSTEM_PERMISSIONS } from "@jinhu/shared";
import { useRef, useState } from "react";
import { AttachmentList } from "../../../components/files/AttachmentList";
import { FileUploader } from "../../../components/files/FileUploader";
import { useAuthUser } from "../../../lib/auth-context";
import type { HrTrainingParticipant } from "../../../lib/hr-api";
import { hasPermission } from "../../../lib/permissions";
import styles from "../hr-workbench.module.css";
import { TrainingMemoFields } from "./TrainingMemoFields";
import { trainingResultPayload, type TrainingResultMode, type TrainingResultPayload } from "./training-result-form";

function ResultField({ name, label, value, numeric, mode, max, step }: {
  name: string; label: string; value?: string | null; numeric?: boolean; mode: TrainingResultMode; max?: string; step?: string;
}) {
  const [action, setAction] = useState(mode === "complete" && name === "hours" ? "write" : "preserve");
  return <>
    <label className="form-field"><span>{label}操作</span><select name={`${name}Action`} value={action} onChange={event => setAction(event.target.value)}>
      <option value="preserve">保持原值</option><option value="write">填写或修改</option>
      {mode === "correct" && name !== "hours" ? <option value="clear">清空</option> : null}
    </select></label>
    {action === "write" ? <label className="form-field"><span>{label}</span><input name={name} type={numeric ? "number" : "text"} min={numeric ? "0" : undefined} max={max} step={step} required={numeric} maxLength={numeric ? undefined : 1000} defaultValue={typeof value === "string" ? value : ""} onFocus={numeric ? event => event.target.select() : undefined}/></label> : <p>{label}：{value === null || value === undefined ? "未登记" : value === "" ? "空文本" : value}</p>}
  </>;
}

export function TrainingResultForm({ participant, mode, busy, onSubmit }: {
  participant: HrTrainingParticipant & { id: string }; mode: TrainingResultMode; busy: boolean; onSubmit: (payload: TrainingResultPayload) => Promise<boolean>;
}) {
  const user = useAuthUser();
  const canCost = hasPermission(user, HR_PERMISSIONS.HR_TRAINING_COST_READ);
  const canCertificate = hasPermission(user, HR_PERMISSIONS.HR_TRAINING_DOCUMENT_MANAGE);
  const canUpload = canCertificate && hasPermission(user, SYSTEM_PERMISSIONS.FILE_UPLOAD);
  const canReadCertificate = hasPermission(user, HR_PERMISSIONS.HR_TRAINING_DOCUMENT_READ) && hasPermission(user, SYSTEM_PERMISSIONS.FILE_READ);
  const [certificateAction, setCertificateAction] = useState("preserve"), [certificateId, setCertificateId] = useState(""), [certificateName, setCertificateName] = useState(""), [uploading, setUploading] = useState(false), [refreshKey, setRefreshKey] = useState(0), [message, setMessage] = useState("");
  const flight = useRef(false), uploadFlight = useRef(false);
  const locked = busy || uploading;
  return <form onSubmit={async event => {
    event.preventDefault();
    if (locked || flight.current || uploadFlight.current) return;
    setMessage("");
    try {
      const payload = trainingResultPayload(new FormData(event.currentTarget), mode, participant.correctionVersion, canCost, canCertificate);
      flight.current = true;
      await onSubmit(payload);
    } catch (error) { setMessage(error instanceof Error ? error.message : "提交结果失败"); }
    finally { flight.current = false; }
  }}>
    <fieldset className={`${styles.formGrid} ${styles.trainingResultFields}`} disabled={locked}>
      <legend>{mode === "correct" ? "维护培训结果" : "记录培训完成结果"}</legend>
      <ResultField name="hours" label="完成学时" value={participant.completedHours} numeric mode={mode} max="999999.99" step="0.01"/>
      <ResultField name="score" label="成绩" value={participant.score} numeric mode={mode} max="100" step="0.01"/>
      <ResultField name="evaluation" label="评价" value={participant.evaluation} mode={mode}/>
      <TrainingMemoFields memo={participant.memo}/>
      {canCost ? <ResultField name="actualCost" label="实际费用" value={participant.actualCost} numeric mode={mode} max="9999999999999999.9999" step="0.0001"/> : null}
      {canCertificate ? <>
        <label className="form-field"><span>证书操作</span><select name="certificateFileIdAction" value={certificateAction} onChange={event => setCertificateAction(event.target.value)}><option value="preserve">保持原证书</option><option value="write">选用已上传证书</option>{mode === "correct" ? <option value="clear">清空当前证书关联</option> : null}</select></label>
        <input type="hidden" name="certificateFileId" value={certificateId}/>
        <p>{certificateAction === "write" ? certificateName || "请上传或从下方附件选用证书" : participant.certificateFileId ? "当前已登记证书" : "当前证书未登记或不可见"}</p>
      </> : null}
      {mode === "correct" ? <label className="form-field"><span>更正原因</span><input name="reason" required maxLength={1000}/></label> : null}
      <button className="ds-button ds-button-primary" disabled={locked}>{mode === "correct" ? "保存培训结果更正" : "记录完成"}</button>
    </fieldset>
    {canUpload ? <FileUploader label="上传培训证书" bizType="hr_training_certificate" bizId={participant.id} compact disabled={locked} onUploadingChange={value => { uploadFlight.current = value; setUploading(value); }} onUploaded={file => { setCertificateId(file.id); setCertificateName(file.originalName); setCertificateAction("write"); setRefreshKey(value => value + 1); }}/> : null}
    {canReadCertificate ? <AttachmentList bizType="hr_training_certificate" bizId={participant.id} compact refreshKey={refreshKey} allowDelete={false} mutationDisabled={locked} readPermissions={[HR_PERMISSIONS.HR_TRAINING_DOCUMENT_READ]} downloadPermissions={[SYSTEM_PERMISSIONS.FILE_DOWNLOAD]} onSelected={canCertificate ? file => { setCertificateId(file.id); setCertificateName(file.originalName); setCertificateAction("write"); } : undefined}/> : null}
    {message ? <p className="form-error" role="alert">{message}</p> : null}
  </form>;
}

export function TrainingCertificateRecords({ participantId }: { participantId: string }) {
  const user = useAuthUser();
  if (!hasPermission(user, HR_PERMISSIONS.HR_TRAINING_DOCUMENT_READ) || !hasPermission(user, SYSTEM_PERMISSIONS.FILE_READ)) return null;
  return <AttachmentList bizType="hr_training_certificate" bizId={participantId} compact allowDelete={false} readPermissions={[HR_PERMISSIONS.HR_TRAINING_DOCUMENT_READ]} downloadPermissions={[SYSTEM_PERMISSIONS.FILE_DOWNLOAD]}/>;
}
