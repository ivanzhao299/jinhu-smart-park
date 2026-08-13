"use client";

import {
  SYSTEM_PERMISSIONS,
  type FileRecord,
  type PaginatedResult
} from "@jinhu/shared";
import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FileUploader } from "../../../components/files/FileUploader";
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
import { hasAccess } from "../../../lib/permissions";
import {
  MutationFeedback
} from "./HousingFormPrimitives";
import styles from "./HousingWorkbench.module.css";
import { loadHousingMeters } from "./housing-picker-loaders";
import {
  housingHandoverTypes,
  isHousingFinancialHandover,
  type HousingHandoverType
} from "./housing-workbench-contract";
import { useStableIdempotency } from "./use-stable-idempotency";

export function HousingHandoverForm({
  capabilities,
  leaseId,
  leaseStatus,
  onCompleted
}: {
  capabilities: PropertyCapabilityProjection;
  leaseId: string;
  leaseStatus: string;
  onCompleted(): Promise<void>;
}) {
  const allowedTypes = useMemo(() => housingHandoverTypes(leaseStatus), [leaseStatus]);
  const [type, setType] = useState<HousingHandoverType>(allowedTypes[0] ?? "move_in");
  const [amounts, setAmounts] = useState({ damage: "0.00", unsettled: "0.00", deduction: "0.00" });
  const [meter, setMeter] = useState<RemoteEntityOption | null>(null);
  const [reading, setReading] = useState("");
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  const removeLock = useRef(false);
  const idempotency = useStableIdempotency();
  const user = useAuthUser();
  const energyAllowed = hasAccess(user, SYSTEM_PERMISSIONS.ENERGY_METER_READ, "energy");
  const bizType = `housing_handover_${type}`;
  const fileCapability = capabilities.fileCapability(bizType);
  const financial = isHousingFinancialHandover({
    handoverType: type, damageAmount: amounts.damage,
    unsettledAmount: amounts.unsettled, depositDeductionAmount: amounts.deduction
  });
  const financialAllowed = capabilities.actionAllowed("housing.handovers.complete-move-out-financial");
  useEffect(() => {
    if (!allowedTypes.includes(type)) setType(allowedTypes[0] ?? "move_in");
  }, [allowedTypes, type]);
  usePendingHandoverFiles({ bizType, canRead: allowedTypes.length > 0 && fileCapability.canRead, capabilities, leaseId, setFiles, setMessage });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || uploading || removing || (financial && !financialAllowed)) return;
    lock.current = true; setSubmitting(true); setMessage("");
    const operation = "housing-handover-complete";
    const body = handoverBody(new FormData(event.currentTarget), {
      amounts, files, meter, reading, type
    });
    try {
      const response = await executeHandover(leaseId, body, idempotency.keyFor(operation, body));
      idempotency.complete(operation);
      const request = (response.data as { request?: { requestId?: string; decisionStatus?: string; executionStatus?: string } }).request;
      setMessage(request?.requestId ? `审批申请已提交（${request.requestId}；决策 ${request.decisionStatus}；执行 ${request.executionStatus}）。` : "交割记录已完成。");
      setFiles([]); await onCompleted();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "交割提交失败");
    } finally {
      lock.current = false; setSubmitting(false);
    }
  }

  async function removeFile(fileId: string) {
    if (removeLock.current) return;
    removeLock.current = true;
    const operation = `housing-handover-file-delete-${fileId}`;
    setRemoving(true);
    try {
      await apiRequest(`/files/${encodeURIComponent(fileId)}`, {
        method: "DELETE", token: getAccessToken(),
        idempotencyKey: idempotency.keyFor(operation, { fileId })
      });
      idempotency.complete(operation);
      setFiles((current) => current.filter((file) => file.id !== fileId));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "附件删除失败");
    } finally {
      removeLock.current = false; setRemoving(false);
    }
  }

  if (!capabilities.actionAllowed("housing.handovers.complete") || allowedTypes.length === 0) return null;
  return (
    <HandoverFormView allowedTypes={allowedTypes} amounts={amounts} bizType={bizType} capabilities={capabilities} energyAllowed={energyAllowed} fileCapability={fileCapability} files={files} financial={financial} financialAllowed={financialAllowed} leaseId={leaseId} meter={meter} message={message} onAmounts={setAmounts} onFiles={setFiles} onMeter={setMeter} onReading={setReading} onRemoveFile={removeFile} onSubmit={submit} onType={(value) => { setType(value); setMeter(null); setReading(""); setAmounts({ damage: "0.00", unsettled: "0.00", deduction: "0.00" }); }} onUploading={setUploading} reading={reading} removing={removing} submitting={submitting} type={type} uploading={uploading} />
  );
}

function usePendingHandoverFiles(input: {
  bizType: string; canRead: boolean; capabilities: PropertyCapabilityProjection;
  leaseId: string; setFiles(value: FileRecord[]): void; setMessage(value: string): void;
}) {
  useEffect(() => {
    if (!input.canRead) { input.setFiles([]); return; }
    const query = new URLSearchParams({ biz_type: input.bizType, biz_id: input.leaseId, page: "1", page_size: "100" });
    void apiRequest<PaginatedResult<FileRecord>>(`/files?${query.toString()}`, {
      token: getAccessToken()
    }).then((response) => input.setFiles(response.data.items))
      .catch((error: Error) => input.setMessage(`待提交现场照片恢复失败：${error.message}`));
  }, [input.bizType, input.canRead, input.capabilities.invalidationKey, input.leaseId]);
}

async function executeHandover(
  leaseId: string,
  body: ReturnType<typeof handoverBody>,
  idempotencyKey: string
) {
  return apiRequest(`/housing/leases/${encodeURIComponent(leaseId)}/handovers`, {
    method: "POST", token: getAccessToken(), idempotencyKey, body
  });
}

function handoverBody(form: FormData, value: {
  amounts: { damage: string; unsettled: string; deduction: string };
  files: FileRecord[]; meter: RemoteEntityOption | null; reading: string; type: HousingHandoverType;
}) {
  return {
      handover_type: value.type,
      item_snapshot: [{ description: String(form.get("items") ?? "") }],
      meter_readings: value.meter && value.reading
        ? [{ meter_id: value.meter.id, reading_value: value.reading }] : [],
      credentials: [{ description: String(form.get("credentials") ?? "") }],
      photo_file_ids: value.files.map((file) => file.id),
      damage_amount: value.amounts.damage,
      unsettled_amount: value.amounts.unsettled,
      deposit_deduction_amount: value.amounts.deduction,
      remark: String(form.get("remark") ?? "")
  };
}

function HandoverFormView(props: {
  allowedTypes: readonly HousingHandoverType[];
  amounts: { damage: string; unsettled: string; deduction: string }; bizType: string;
  capabilities: PropertyCapabilityProjection; energyAllowed: boolean;
  fileCapability: ReturnType<PropertyCapabilityProjection["fileCapability"]>;
  files: FileRecord[]; financial: boolean; financialAllowed: boolean; leaseId: string;
  meter: RemoteEntityOption | null; message: string;
  onAmounts(value: { damage: string; unsettled: string; deduction: string }): void;
  onFiles(value: FileRecord[]): void; onMeter(value: RemoteEntityOption | null): void;
  onReading(value: string): void; onRemoveFile(fileId: string): Promise<void>;
  onSubmit(event: FormEvent<HTMLFormElement>): void;
  onType(value: HousingHandoverType): void; onUploading(value: boolean): void;
  reading: string; removing: boolean; submitting: boolean; type: HousingHandoverType; uploading: boolean;
}) {
  return (
    <PropertyPanelSurface title="完成现场交割">
      <form className={styles.stack} onSubmit={props.onSubmit}>
        <fieldset className={styles.fieldset} disabled={props.submitting || props.removing}>
          <HandoverFields {...props} />
          <HandoverAttachments {...props} />
          <HandoverConfirmation financial={props.financial} financialAllowed={props.financialAllowed} />
          <button className="ds-button ds-button-primary" disabled={props.submitting || props.uploading || props.removing || (props.financial && !props.financialAllowed)} type="submit">{props.uploading ? "等待照片上传…" : props.submitting ? "提交中…" : props.financial ? "提交财务退租审批" : "确认完成交割"}</button>
        </fieldset>
      </form>
      <MutationFeedback message={props.message} />
    </PropertyPanelSurface>
  );
}

function HandoverAttachments(props: Parameters<typeof HandoverFormView>[0]) {
  const locked = props.submitting || props.uploading || props.removing;
  return <>
    {props.fileCapability.canUpload ? <FileUploader bizId={props.leaseId} bizType={props.bizType}
      compact disabled={locked} label="上传现场照片"
      onUploaded={(file) => props.onFiles([...props.files, file])}
      onUploadingChange={props.onUploading} policyKey="image" /> : null}
    {props.files.length ? <PendingAttachmentList files={props.files} mutationDisabled={locked}
      onRemove={props.fileCapability.canDelete ? (id) => void props.onRemoveFile(id) : undefined} /> : null}
    {props.removing ? <p aria-live="polite">正在移除现场照片…</p> : null}
  </>;
}

function HandoverConfirmation({ financial, financialAllowed }: { financial: boolean; financialAllowed: boolean }) {
  if (financial && !financialAllowed) {
    return <p className={styles.dangerNotice} role="alert">当前岗位缺少财务退租审批申请权限，操作保持关闭。</p>;
  }
  return <label><input name="confirmed" required type="checkbox" />
    {financial ? "我已核对金额与证据，并确认提交审批。" : "我已核对租约、房源、物品、表底和钥匙信息。"}
  </label>;
}

function HandoverFields(props: Parameters<typeof HandoverFormView>[0]) {
  return (
    <div className={styles.formGrid}>
      <label>交割类型<select onChange={(event) => props.onType(event.target.value as HousingHandoverType)} value={props.type}>{props.allowedTypes.map((value) => <option key={value} value={value}>{value === "move_in" ? "入住交割" : "退租交割"}</option>)}</select></label>
      <label>物品清单<input maxLength={500} name="items" required /></label>
      {props.energyAllowed ? <><RemoteEntityPicker authorized contextValid={props.capabilities.moduleAvailable} invalidationKey={props.capabilities.invalidationKey} label="现场表计（可选）" loadOptions={(input) => loadHousingMeters(props.leaseId, input)} onChange={props.onMeter} value={props.meter} />{props.meter ? <label>现场读数<input inputMode="decimal" min="0" onChange={(event) => props.onReading(event.target.value)} required step="0.000001" type="number" value={props.reading} /></label> : null}</> : null}
      <label>钥匙 / 门卡<input maxLength={500} name="credentials" required /></label>
      {props.type === "move_out" ? <>{(["damage", "unsettled", "deduction"] as const).map((key) => <label key={key}>{key === "damage" ? "损坏金额" : key === "unsettled" ? "未结费用" : "押金抵扣"}<input min="0" onChange={(event) => props.onAmounts({ ...props.amounts, [key]: event.target.value })} required step="0.01" type="number" value={props.amounts[key]} /></label>)}</> : null}
      <label>备注<textarea maxLength={500} name="remark" /></label>
    </div>
  );
}
