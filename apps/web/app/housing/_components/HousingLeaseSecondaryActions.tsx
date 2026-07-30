"use client";

import type { FileRecord, HousingLeaseDetailResponse } from "@jinhu/shared";
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
import { loadHousingTenants } from "./housing-picker-loaders";
import { useStableIdempotency } from "./use-stable-idempotency";

export function HousingLeaseSecondaryActions({
  data,
  capabilities,
  reload
}: {
  data: HousingLeaseDetailResponse;
  capabilities: PropertyCapabilityProjection;
  reload(): Promise<void>;
}) {
  const [occupant, setOccupant] = useState<RemoteEntityOption | null>(null);
  const [signature, setSignature] = useState<FileRecord | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  const idempotency = useStableIdempotency();
  const removal = useSignatureRemoval(signature, setSignature, setMessage, idempotency);
  const canSign = data.lease.status === "pending_signature"
    && capabilities.actionAllowed("housing.leases.sign");
  const canAdd = !["terminated", "void"].includes(data.lease.status)
    && capabilities.actionAllowed("housing.leases.add-occupant");

  async function sign(form: FormData) {
    if (!signature || uploading || lock.current) return;
    await mutate("housing-lease-sign", "sign", {
      signature_file_id: signature.id,
      signed_at: String(form.get("signed_at") ?? "") || undefined
    }, "线下签署已登记。");
    setSignature(null);
  }

  async function addOccupant(form: FormData) {
    if (!occupant || lock.current) return;
    await mutate("housing-lease-occupant", "occupants", {
      party_id: occupant.id,
      occupant_role: String(form.get("occupant_role")),
      emergency_contact: form.get("emergency_contact") === "on"
    }, "同住人员已登记。");
    setOccupant(null);
  }

  async function mutate(operation: string, suffix: string, body: object, success: string) {
    lock.current = true; setSubmitting(true);
    try {
      await apiRequest(`/housing/leases/${encodeURIComponent(data.lease.id)}/${suffix}`, {
        method: "POST", token: getAccessToken(),
        idempotencyKey: idempotency.keyFor(operation, body), body
      });
      idempotency.complete(operation); setMessage(success); await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失败");
    } finally {
      lock.current = false; setSubmitting(false);
    }
  }

  if (!canSign && !canAdd) return null;
  return <SecondaryActionsView canAdd={canAdd} canSign={canSign} capabilities={capabilities}
    leaseId={data.lease.id} message={message} occupant={occupant} onAdd={addOccupant}
    onOccupant={setOccupant} onRemove={removal.remove} onSign={sign} onSignature={setSignature}
    removing={removal.removing} setUploading={setUploading} signature={signature}
    submitting={submitting} uploading={uploading} />;
}

function useSignatureRemoval(
  signature: FileRecord | null,
  setSignature: (value: FileRecord | null) => void,
  setMessage: (value: string) => void,
  idempotency: ReturnType<typeof useStableIdempotency>
) {
  const [removing, setRemoving] = useState(false);
  const lock = useRef(false);
  async function remove() {
    if (!signature || lock.current) return;
    lock.current = true;
    const operation = `housing-signature-delete-${signature.id}`;
    setRemoving(true);
    try {
      await apiRequest(`/files/${encodeURIComponent(signature.id)}`, {
        method: "DELETE", token: getAccessToken(),
        idempotencyKey: idempotency.keyFor(operation, { fileId: signature.id })
      });
      idempotency.complete(operation); setSignature(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "签署文件移除失败");
    } finally {
      lock.current = false; setRemoving(false);
    }
  }
  return { remove, removing };
}

function SecondaryActionsView(props: {
  canAdd: boolean; canSign: boolean; capabilities: PropertyCapabilityProjection; leaseId: string;
  message: string; occupant: RemoteEntityOption | null; onAdd(form: FormData): Promise<void>;
  onOccupant(value: RemoteEntityOption | null): void; onRemove(): Promise<void>;
  onSign(form: FormData): Promise<void>; onSignature(value: FileRecord | null): void;
  removing: boolean; setUploading(value: boolean): void; signature: FileRecord | null;
  submitting: boolean; uploading: boolean;
}) {
  return <PropertyPanelSurface title="租约低风险经办">
    <div className={styles.stack}>
      {props.canSign ? <SignForm capabilities={props.capabilities} leaseId={props.leaseId}
        onRemove={props.onRemove} onSignature={props.onSignature} onSubmit={props.onSign}
        removing={props.removing} setUploading={props.setUploading} signature={props.signature}
        submitting={props.submitting} uploading={props.uploading} /> : null}
      {props.canAdd ? <OccupantForm capabilities={props.capabilities} occupant={props.occupant}
        onOccupant={props.onOccupant} onSubmit={props.onAdd} submitting={props.submitting} /> : null}
    </div>
    <MutationFeedback message={props.message} />
  </PropertyPanelSurface>;
}

function SignForm(props: {
  capabilities: PropertyCapabilityProjection;
  leaseId: string;
  onSignature(value: FileRecord | null): void;
  onRemove(): Promise<void>;
  onSubmit(form: FormData): Promise<void>;
  setUploading(value: boolean): void;
  signature: FileRecord | null;
  removing: boolean;
  submitting: boolean;
  uploading: boolean;
}) {
  const files = props.capabilities.fileCapability("housing_lease_signature");
  return (
    <form className={styles.stack} onSubmit={(event: FormEvent<HTMLFormElement>) => {
      event.preventDefault(); void props.onSubmit(new FormData(event.currentTarget));
    }}>
      <fieldset className={styles.fieldset} disabled={props.submitting || props.removing}>
        <h3>登记线下签署</h3>
        {files.canUpload ? <FileUploader bizId={props.leaseId} bizType="housing_lease_signature" compact disabled={props.uploading || props.submitting || props.removing} label="上传已签署文件" onUploaded={props.onSignature} onUploadingChange={props.setUploading} policyKey="contract" /> : <p>缺少签署文件上传权限，不能登记签署。</p>}
        {props.signature ? <PendingAttachmentList files={[props.signature]} mutationDisabled={props.uploading || props.submitting || props.removing} onRemove={files.canDelete ? () => void props.onRemove() : undefined} /> : null}
        {props.removing ? <p aria-live="polite">正在移除签署文件…</p> : null}
        <label>签署时间<input name="signed_at" type="datetime-local" /></label>
        <button className="ds-button ds-button-primary" disabled={!props.signature || props.uploading || props.removing || !files.canUpload} type="submit">登记签署</button>
      </fieldset>
    </form>
  );
}

function OccupantForm(props: {
  capabilities: PropertyCapabilityProjection;
  occupant: RemoteEntityOption | null;
  onOccupant(value: RemoteEntityOption | null): void;
  onSubmit(form: FormData): Promise<void>;
  submitting: boolean;
}) {
  return (
    <form className={styles.stack} onSubmit={(event: FormEvent<HTMLFormElement>) => {
      event.preventDefault(); void props.onSubmit(new FormData(event.currentTarget));
    }}>
      <fieldset className={styles.fieldset} disabled={props.submitting}>
        <h3>登记同住人员</h3>
        <RemoteEntityPicker authorized contextValid={props.capabilities.moduleAvailable} invalidationKey={props.capabilities.invalidationKey} label="人员档案" loadOptions={loadHousingTenants} onChange={props.onOccupant} required value={props.occupant} />
        <label>人员角色<select name="occupant_role"><option value="cohabitant">同住人</option><option value="emergency_contact">紧急联系人</option></select></label>
        <label><input name="emergency_contact" type="checkbox" /> 标记为紧急联系人</label>
        <button className="ds-button ds-button-primary" disabled={!props.occupant} type="submit">登记人员</button>
      </fieldset>
    </form>
  );
}
