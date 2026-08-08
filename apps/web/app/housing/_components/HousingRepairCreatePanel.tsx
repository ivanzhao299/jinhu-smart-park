"use client";

import type { FileRecord, HousingLeaseDetailResponse } from "@jinhu/shared";
import type { FormEvent } from "react";
import { useRef, useState } from "react";
import { FileUploader, type FileUploaderOfflineContext } from "../../../components/files/FileUploader";
import { propertyOfflinePermissionFingerprint } from "../../../features/property-shared/offline/property-draft-contract";
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
import {
  beginHousingRepairQueueGate,
  housingLeaseProjectionVersion,
  housingRepairSubmissionBlocked
} from "./housing-offline-version";
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
  const leaseState = useHousingRepairLease(fileCapability.canRead, fileCapability.canUpload, setFiles, setMessage);
  const queueGate = useRepairQueueGate(fileCapability.canUpload, leaseState.selectLease);

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
    const lease = leaseState.lease;
    if (housingRepairSubmissionBlocked({
      hasLease: Boolean(lease), queuedUploadCount: queueGate.count, removing,
      submitting: lock.current, uploading: uploading || queueGate.busyRef.current
    })) {
      if (queueGate.count > 0) setMessage("请先恢复上传或明确清除全部本机临时图片，再提交报修。");
      return;
    }
    if (!lease) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
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
      leaseState.clearLease(); setFiles([]); formElement.reset(); onCreated();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "报修代录失败");
    } finally {
      lock.current = false; setSubmitting(false);
    }
  }

  return <RepairCreateView capabilities={capabilities} fileCapability={fileCapability} files={files}
    lease={leaseState.lease} message={message} offlineQueueContext={leaseState.offlineQueueContext} onFiles={setFiles} onLease={queueGate.selectLease} onRemove={removeFile}
    onSubmit={submit} onUploading={setUploading} removing={removing}
    onQueueState={queueGate.onQueueState} queuedUploadCount={queueGate.count} queueBusy={queueGate.busy}
    resolveCurrentEntityVersion={leaseState.resolveCurrentLeaseVersion}
    submitting={submitting} uploading={uploading} />;
}

function useRepairQueueGate(
  canUpload: boolean,
  selectLease: (value: RemoteEntityOption | null) => Promise<void>
) {
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  function updateBusy(value: boolean) {
    busyRef.current = value;
    setBusy(value);
  }
  return {
    busy,
    busyRef,
    count,
    onQueueState(state: { busy: boolean; count: number }) {
      setCount(state.count);
      updateBusy(state.busy);
    },
    async selectLease(value: RemoteEntityOption | null) {
      setCount(0);
      updateBusy(beginHousingRepairQueueGate(Boolean(value), canUpload));
      await selectLease(value);
    }
  };
}

function useHousingRepairLease(
  canReadFiles: boolean,
  canUploadFiles: boolean,
  setFiles: (files: FileRecord[]) => void,
  setMessage: (message: string) => void
) {
  const [lease, setLease] = useState<RemoteEntityOption | null>(null);
  const [leaseVersion, setLeaseVersion] = useState<string | null>(null);
  const leaseSelection = useRef<string | null>(null);
  const user = useAuthUser();
  const offlineQueueContext: FileUploaderOfflineContext | undefined = user && leaseVersion !== null
    ? {
      tenantId: user.tenant_id, parkId: user.park_id, userId: user.id, entityVersion: leaseVersion,
      module: "housing",
      permissionFingerprint: propertyOfflinePermissionFingerprint({
        dataScope: user.data_scope,
        dataScopes: user.data_scopes,
        enabledModules: user.enabled_modules,
        permissions: user.permissions
      })
    }
    : undefined;

  async function selectLease(value: RemoteEntityOption | null) {
    leaseSelection.current = value?.id ?? null;
    setLease(value); setLeaseVersion(null); setFiles([]);
    if (!value) return;
    try {
      const [pendingFiles, version] = await Promise.all([
        canReadFiles ? loadPendingFiles("housing_repair", value.id) : Promise.resolve([]),
        canUploadFiles ? loadLeaseVersion(value.id) : Promise.resolve(null)
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

  async function resolveCurrentLeaseVersion(): Promise<string> {
    if (!lease) throw new Error("关联租约已变化");
    return loadLeaseVersion(lease.id);
  }

  function clearLease() {
    leaseSelection.current = null; setLease(null); setLeaseVersion(null);
  }

  return { clearLease, lease, offlineQueueContext, resolveCurrentLeaseVersion, selectLease };
}

async function loadLeaseVersion(leaseId: string): Promise<string> {
  const detail = await apiRequest<HousingLeaseDetailResponse>(
    `/housing/leases/${encodeURIComponent(leaseId)}`,
    { token: getAccessToken() }
  );
  return housingLeaseProjectionVersion(detail.data.lease);
}

function RepairCreateView(props: {
  capabilities: PropertyCapabilityProjection;
  fileCapability: ReturnType<PropertyCapabilityProjection["fileCapability"]>; files: FileRecord[];
  lease: RemoteEntityOption | null; message: string; onFiles(value: FileRecord[]): void;
  offlineQueueContext?: FileUploaderOfflineContext;
  resolveCurrentEntityVersion(): Promise<string>;
  onLease(value: RemoteEntityOption | null): Promise<void>; onRemove(id: string): Promise<void>;
  onSubmit(event: FormEvent<HTMLFormElement>): void; onUploading(value: boolean): void;
  onQueueState(state: { busy: boolean; count: number }): void; queuedUploadCount: number; queueBusy: boolean;
  removing: boolean; submitting: boolean; uploading: boolean;
}) {
  const locked = props.uploading || props.queueBusy || props.submitting || props.removing;
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
          offlineQueueUnavailableReason={props.offlineQueueContext ? undefined : "正在建立租约版本校验，离线图片暂存暂不可用"}
          resolveCurrentEntityVersion={props.resolveCurrentEntityVersion}
          onUploaded={(file) => props.onFiles([...props.files, file])}
          onUploadingChange={props.onUploading} onQueueStateChange={props.onQueueState}
          policyKey="image" /> : null}
        {props.files.length ? <PendingAttachmentList files={props.files} mutationDisabled={locked}
          onRemove={props.fileCapability.canDelete ? (id) => void props.onRemove(id) : undefined} /> : null}
        {props.removing ? <p aria-live="polite">正在移除图片…</p> : null}
        {props.queuedUploadCount > 0 ? <p aria-live="polite">仍有 {props.queuedUploadCount} 张本机临时图片；必须逐项恢复上传或明确清除后才能提交。</p> : null}
        <button className="ds-button ds-button-primary" disabled={locked || props.queuedUploadCount > 0} type="submit">{props.submitting ? "提交中…" : "提交报修"}</button>
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
