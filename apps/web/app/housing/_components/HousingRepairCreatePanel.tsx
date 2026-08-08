"use client";

import type { FileRecord } from "@jinhu/shared";
import type { FormEvent } from "react";
import { useRef, useState } from "react";
import { FileUploader } from "../../../components/files/FileUploader";
import { PendingAttachmentList } from "../../../components/files/PendingAttachmentList";
import {
  PropertyPanelSurface,
  RemoteEntityPicker,
  type PropertyCapabilityProjection,
  type RemoteEntityOption
} from "../../../features/property-shared";
import { apiRequest } from "../../../lib/api-client";
import { getAccessToken } from "../../../lib/authz";
import { MutationFeedback } from "./HousingFormPrimitives";
import styles from "./HousingWorkbench.module.css";
import { loadHousingLeases } from "./housing-picker-loaders";
import {
  deletePendingFile,
  loadPendingFiles
} from "./housing-pending-files";
import { useStableIdempotency } from "./use-stable-idempotency";

export function HousingRepairCreatePanel({
  capabilities,
  onCreated
}: {
  capabilities: PropertyCapabilityProjection;
  onCreated(): void;
}) {
  const [lease, setLease] = useState<RemoteEntityOption | null>(null);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  const removeLock = useRef(false);
  const idempotency = useStableIdempotency();
  const fileCapability = capabilities.fileCapability("housing_repair");

  async function selectLease(value: RemoteEntityOption | null) {
    setLease(value);
    setFiles([]);
    if (!value || !fileCapability.canRead) return;
    try {
      setFiles(await loadPendingFiles("housing_repair", value.id));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "待提交图片恢复失败");
    }
  }

  async function removeFile(fileId: string) {
    if (removeLock.current) return;
    removeLock.current = true;
    const operation = `housing-repair-file-delete-${fileId}`;
    setRemoving(true);
    try {
      await deletePendingFile(fileId, idempotency.keyFor(operation, { fileId }));
      idempotency.complete(operation);
      setFiles((current) => current.filter((file) => file.id !== fileId));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "图片移除失败");
    } finally {
      removeLock.current = false; setRemoving(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lease || uploading || removing || lock.current) return;
    const form = new FormData(event.currentTarget);
    const body = repairBody(form, files);
    lock.current = true;
    setSubmitting(true);
    try {
      await apiRequest(`/housing/leases/${encodeURIComponent(lease.id)}/repairs`, {
        method: "POST", token: getAccessToken(),
        idempotencyKey: idempotency.keyFor("housing-repair-create", body), body
      });
      idempotency.complete("housing-repair-create");
      setMessage("报修已代录。");
      setLease(null); setFiles([]); event.currentTarget.reset(); onCreated();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "报修代录失败");
    } finally {
      lock.current = false; setSubmitting(false);
    }
  }

  return <RepairCreateView capabilities={capabilities} fileCapability={fileCapability} files={files}
    lease={lease} message={message} onFiles={setFiles} onLease={selectLease} onRemove={removeFile}
    onSubmit={submit} onUploading={setUploading} removing={removing}
    submitting={submitting} uploading={uploading} />;
}

function RepairCreateView(props: {
  capabilities: PropertyCapabilityProjection;
  fileCapability: ReturnType<PropertyCapabilityProjection["fileCapability"]>; files: FileRecord[];
  lease: RemoteEntityOption | null; message: string; onFiles(value: FileRecord[]): void;
  onLease(value: RemoteEntityOption | null): Promise<void>; onRemove(id: string): Promise<void>;
  onSubmit(event: FormEvent<HTMLFormElement>): void; onUploading(value: boolean): void;
  removing: boolean; submitting: boolean; uploading: boolean;
}) {
  const locked = props.uploading || props.submitting || props.removing;
  return <PropertyPanelSurface title="代录住房报修">
    <form className={styles.stack} onSubmit={props.onSubmit}>
      <fieldset className={styles.fieldset} disabled={props.submitting || props.removing}>
        <RemoteEntityPicker authorized={props.capabilities.actionAllowed("housing.repairs.create")}
          contextValid={props.capabilities.moduleAvailable} invalidationKey={props.capabilities.invalidationKey}
          label="关联租约" loadOptions={loadHousingLeases} onChange={(value) => void props.onLease(value)}
          required value={props.lease} />
        <RepairFields />
        {props.lease && props.fileCapability.canUpload ? <FileUploader bizId={props.lease.id}
          bizType="housing_repair" compact disabled={locked} label="上传现场图片"
          onUploaded={(file) => props.onFiles([...props.files, file])}
          onUploadingChange={props.onUploading} policyKey="image" /> : null}
        {props.files.length ? <PendingAttachmentList files={props.files} mutationDisabled={locked}
          onRemove={props.fileCapability.canDelete ? (id) => void props.onRemove(id) : undefined} /> : null}
        {props.removing ? <p aria-live="polite">正在移除图片…</p> : null}
        <button className="ds-button ds-button-primary" disabled={locked} type="submit">{props.submitting ? "提交中…" : "提交报修"}</button>
      </fieldset>
    </form>
    <MutationFeedback message={props.message} />
  </PropertyPanelSurface>;
}

function RepairFields() {
  return (
    <div className={styles.formGrid}>
      <label>标题<input maxLength={200} name="title" required /></label>
      <label>描述<textarea maxLength={2000} name="description" required /></label>
      <label>优先级<select name="priority"><option value="low">低</option><option value="medium">中</option><option value="high">高</option></select></label>
      <label>紧急程度<select name="urgency"><option value="low">低</option><option value="normal">普通</option><option value="urgent">紧急</option><option value="critical">重大</option></select></label>
      <label>备注<textarea maxLength={500} name="remark" /></label>
    </div>
  );
}

function repairBody(form: FormData, files: FileRecord[]) {
  return {
    title: String(form.get("title")),
    description: String(form.get("description")),
    priority: String(form.get("priority")),
    urgency: String(form.get("urgency")),
    image_file_ids: files.map((file) => file.id),
    remark: String(form.get("remark") ?? "")
  };
}
