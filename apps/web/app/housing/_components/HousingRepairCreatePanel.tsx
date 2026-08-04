"use client";

import type { FileRecord, HousingLeaseDetailResponse } from "@jinhu/shared";
import type { FormEvent } from "react";
import { useRef, useState } from "react";
import { FileUploader, type FileUploaderOfflineContext } from "../../../components/files/FileUploader";
import { PendingAttachmentList } from "../../../components/files/PendingAttachmentList";
import {
  PropertyPanelSurface,
  RemoteEntityPicker,
  type PropertyCapabilityProjection,
  type RemoteEntityOption
} from "../../../features/property-shared";
import { apiRequest } from "../../../lib/api-client";
import { useAuthUser } from "../../../lib/auth-context";
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
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  const removeLock = useRef(false);
  const idempotency = useStableIdempotency();
  const fileCapability = capabilities.fileCapability("housing_repair");
  const leaseState = useHousingRepairLease(fileCapability.canRead, setFiles, setMessage);

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
    if (!leaseState.lease || uploading || removing || lock.current) return;
    const form = new FormData(event.currentTarget);
    const body = repairBody(form, files);
    lock.current = true;
    setSubmitting(true);
    try {
      await apiRequest(`/housing/leases/${encodeURIComponent(leaseState.lease.id)}/repairs`, {
        method: "POST", token: getAccessToken(),
        idempotencyKey: idempotency.keyFor("housing-repair-create", body), body
      });
      idempotency.complete("housing-repair-create");
      setMessage("报修已代录。");
      leaseState.clearLease(); setFiles([]); event.currentTarget.reset(); onCreated();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "报修代录失败");
    } finally {
      lock.current = false; setSubmitting(false);
    }
  }

  return <RepairCreateView capabilities={capabilities} fileCapability={fileCapability} files={files}
    lease={leaseState.lease} message={message} offlineQueueContext={leaseState.offlineQueueContext} onFiles={setFiles} onLease={leaseState.selectLease} onRemove={removeFile}
    onSubmit={submit} onUploading={setUploading} removing={removing}
    resolveCurrentEntityVersion={leaseState.resolveCurrentLeaseVersion}
    submitting={submitting} uploading={uploading} />;
}

function useHousingRepairLease(
  canReadFiles: boolean,
  setFiles: (files: FileRecord[]) => void,
  setMessage: (message: string) => void
) {
  const [lease, setLease] = useState<RemoteEntityOption | null>(null);
  const [leaseVersion, setLeaseVersion] = useState<number | null>(null);
  const leaseSelection = useRef<string | null>(null);
  const user = useAuthUser();
  const offlineQueueContext: FileUploaderOfflineContext | undefined = user && leaseVersion !== null
    ? { tenantId: user.tenant_id, parkId: user.park_id, userId: user.id, entityVersion: leaseVersion }
    : undefined;

  async function selectLease(value: RemoteEntityOption | null) {
    leaseSelection.current = value?.id ?? null;
    setLease(value); setLeaseVersion(null); setFiles([]);
    if (!value || !canReadFiles) return;
    try {
      const [pendingFiles, version] = await Promise.all([
        loadPendingFiles("housing_repair", value.id), loadLeaseVersion(value.id)
      ]);
      if (leaseSelection.current !== value.id) return;
      setFiles(pendingFiles);
      if (version !== null) setLeaseVersion(version);
    } catch (error) {
      if (leaseSelection.current === value.id) {
        setMessage(error instanceof Error ? error.message : "待提交图片恢复失败");
      }
    }
  }

  async function resolveCurrentLeaseVersion(): Promise<number> {
    if (!lease) throw new Error("关联租约已变化");
    const version = await loadLeaseVersion(lease.id);
    if (version === null) throw new Error("当前租约缺少实体版本，不能恢复临时图片");
    return version;
  }

  function clearLease() {
    leaseSelection.current = null; setLease(null); setLeaseVersion(null);
  }

  return { clearLease, lease, offlineQueueContext, resolveCurrentLeaseVersion, selectLease };
}

async function loadLeaseVersion(leaseId: string): Promise<number | null> {
  const detail = await apiRequest<HousingLeaseDetailResponse>(
    `/housing/leases/${encodeURIComponent(leaseId)}`,
    { token: getAccessToken() }
  );
  const version = (detail.data.lease as HousingLeaseDetailResponse["lease"] & { version?: unknown }).version;
  return typeof version === "number" && Number.isInteger(version) && version >= 0 ? version : null;
}

function RepairCreateView(props: {
  capabilities: PropertyCapabilityProjection;
  fileCapability: ReturnType<PropertyCapabilityProjection["fileCapability"]>; files: FileRecord[];
  lease: RemoteEntityOption | null; message: string; onFiles(value: FileRecord[]): void;
  offlineQueueContext?: FileUploaderOfflineContext;
  resolveCurrentEntityVersion(): Promise<number>;
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
          offlineQueueContext={props.offlineQueueContext}
          offlineQueueUnavailableReason={props.offlineQueueContext ? undefined : "当前租约缺少实体版本，离线图片暂存已安全关闭"}
          resolveCurrentEntityVersion={props.resolveCurrentEntityVersion}
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
