"use client";

import { PROPERTY_BUSINESS_PERMISSIONS, SYSTEM_PERMISSIONS, type FileRecord } from "@jinhu/shared";
import type {
  HomestayTurnoverDetailResponse, HomestayWorkOrderCandidateListResponse, PaginatedResult
} from "@jinhu/shared";
import { useState } from "react";
import {
  PropertyPanelSurface, RemoteEntityPicker,
  workOrderStatusLabel,
  type PropertyCapabilityProjection, type RemoteEntityOption
} from "../../../features/property-shared";
import { apiRequest } from "../../../lib/api-client";
import { getAccessToken } from "../../../lib/authz";
import { useAuthUser } from "../../../lib/auth-context";
import { hasPermission } from "../../../lib/permissions";
import styles from "./HomestayWorkbench.module.css";

type Action = "start" | "complete" | "inspect" | "exception";
type Mutate = (endpoint: string, body?: unknown) => Promise<boolean>;

function workOrderLoader(unitId: string) {
  return async (input: { query: string; page: number; pageSize: number; signal: AbortSignal }) => {
    const params = new URLSearchParams({
      keyword: input.query, unit_id: unitId,
      page: String(input.page), page_size: String(input.pageSize)
    });
    const response = await apiRequest<HomestayWorkOrderCandidateListResponse>(
      `/homestay/work-order-candidates?${params.toString()}`,
      { token: getAccessToken() ?? undefined, signal: input.signal }
    );
    return {
      items: response.data.items.map((item) => ({
        id: item.id, label: `${item.woCode} · ${item.title}`, secondaryLabel: workOrderStatusLabel(item.status)
      })),
      page: response.data.page, pageSize: response.data.page_size, total: response.data.total
    };
  };
}

async function loadAssigneeOptions(input: {
  query: string; page: number; pageSize: number; signal: AbortSignal
}) {
  const keyword = input.query.trim();
  const response = await apiRequest<PaginatedResult<{ id: string; username: string; displayName: string }>>(
    `/users?page=${input.page}&page_size=${input.pageSize}${keyword ? `&keyword=${encodeURIComponent(keyword)}` : ""}`,
    { token: getAccessToken() ?? undefined, signal: input.signal }
  );
  return {
    items: response.data.items.map((item) => ({
      id: item.id, label: item.displayName || item.username, secondaryLabel: item.username
    })),
    page: response.data.page, pageSize: response.data.page_size, total: response.data.total
  };
}

async function authoritativeFileIds(turnoverId: string): Promise<string[]> {
  const params = new URLSearchParams({
    biz_type: "homestay_turnover", biz_id: turnoverId, page: "1", page_size: "100"
  });
  const response = await apiRequest<PaginatedResult<FileRecord>>(`/files?${params.toString()}`, {
    token: getAccessToken() ?? undefined
  });
  return response.data.items.map((file) => file.id);
}

export function HomestayTurnoverActions({
  capability, data, disabled, mutate
}: {
  capability: PropertyCapabilityProjection;
  data: HomestayTurnoverDetailResponse;
  disabled: boolean;
  mutate: Mutate;
}) {
  const user = useAuthUser();
  const workOrderAllowed = hasPermission(user, SYSTEM_PERMISSIONS.WORKORDER_READ);
  const isSupervisor = hasPermission(user, PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_TASK_SUPERVISE);
  const [draft, setDraft] = useState({
    workOrder: data.linkedWorkOrder ? {
      id: data.linkedWorkOrderId ?? "",
      label: `${data.linkedWorkOrder.code} · ${data.linkedWorkOrder.title}`
    } as RemoteEntityOption : null,
    assignee: null as RemoteEntityOption | null,
    consumableName: "", consumableQuantity: "", exceptionDescription: ""
  });
  if (!capability.actionAllowed("homestay.turnovers.execute")) return null;
  const execute = async (action: Action, extra: Record<string, unknown> = {}) => {
    const body: Record<string, unknown> = {
      ...(draft.workOrder?.id ? { linked_work_order_id: draft.workOrder.id } : {}),
      ...(draft.consumableName.trim() && Number(draft.consumableQuantity) > 0 ? {
        consumables: [{ name: draft.consumableName.trim(), quantity: Number(draft.consumableQuantity) }]
      } : {}),
      ...extra
    };
    if (isSupervisor) {
      if (draft.assignee?.id) {
        body.assignee_id = draft.assignee.id;
        body.assignee_name = draft.assignee.label;
      }
    } else if (!data.assigneeId && user) {
      body.assignee_id = user.id;
      body.assignee_name = user.real_name || user.username;
    }
    if (capability.fileCapability("homestay_turnover").canRead) {
      body.photo_file_ids = await authoritativeFileIds(data.id);
    }
    await mutate(`/homestay/turnovers/${data.id}/actions/${action}`, body);
  };
  const update = (patch: Partial<typeof draft>) => setDraft((current) => ({ ...current, ...patch }));
  return (
    <PropertyPanelSurface title="任务执行">
      <TurnoverInputs capability={capability} data={data} draft={draft} update={update} workOrderAllowed={workOrderAllowed} isSupervisor={isSupervisor} />
      <TurnoverButtons disabled={disabled} execute={execute} status={data.status} />
      {data.status !== "completed"
        ? <TurnoverException disabled={disabled} execute={execute} value={draft.exceptionDescription}
            onChange={(exceptionDescription) => update({ exceptionDescription })} />
        : null}
    </PropertyPanelSurface>
  );
}

type Draft = {
  workOrder: RemoteEntityOption | null;
  assignee: RemoteEntityOption | null;
  consumableName: string;
  consumableQuantity: string;
  exceptionDescription: string;
};

function TurnoverInputs({ capability, data, draft, update, workOrderAllowed, isSupervisor }: {
  capability: PropertyCapabilityProjection; data: HomestayTurnoverDetailResponse;
  draft: Draft; update(patch: Partial<Draft>): void; workOrderAllowed: boolean; isSupervisor: boolean;
}) {
  return <div className={styles.toolbar}>
    {isSupervisor ? <RemoteEntityPicker authorized contextValid={capability.moduleAvailable}
      invalidationKey={`${capability.invalidationKey}:assignee:${data.id}`} label="负责人（可选）"
      loadOptions={loadAssigneeOptions} minQueryLength={0} placeholder="选择保洁负责人，可输入姓名搜索"
      onChange={(assignee) => update({ assignee })} value={draft.assignee} /> : null}
    {workOrderAllowed ? <RemoteEntityPicker authorized contextValid={capability.moduleAvailable}
      invalidationKey={`${capability.invalidationKey}:${data.id}`} label="关联工单（可选）"
      loadOptions={workOrderLoader(data.unitId)} onChange={(workOrder) => update({ workOrder })} value={draft.workOrder} /> : null}
    <label>耗材名称（可选）<input maxLength={100} value={draft.consumableName} onChange={(event) => update({ consumableName: event.target.value })} /></label>
    <label>耗材数量（可选）<input type="number" min="0.001" step="0.001" value={draft.consumableQuantity} onFocus={(event) => event.target.select()} onChange={(event) => update({ consumableQuantity: event.target.value })} /></label>
  </div>;
}

function TurnoverButtons({ disabled, execute, status }: {
  disabled: boolean; execute(action: Action): Promise<void>; status: string;
}) {
  return <div className="ds-action-bar">
    {status === "pending" ? <button className="primary-button" disabled={disabled} type="button" onClick={() => void execute("start")}>开始清洁</button> : null}
    {status === "cleaning" || status === "exception" ? <button className="primary-button" disabled={disabled} type="button" onClick={() => void execute("complete")}>完成清洁</button> : null}
    {status === "inspection" ? <button className="primary-button" disabled={disabled} type="button" onClick={() => void execute("inspect")}>检查通过</button> : null}
    {status === "cleaning" || status === "exception" ? <p className={styles.muted}>完成清洁前需在上方“上传现场证据”处至少上传一张现场照片。</p> : null}
  </div>;
}

function TurnoverException({ disabled, execute, onChange, value }: {
  disabled: boolean; execute(action: Action, extra: Record<string, unknown>): Promise<void>;
  onChange(value: string): void; value: string;
}) {
  return <form className={styles.toolbar} onSubmit={(event) => {
    event.preventDefault();
    void execute("exception", { exception_description: value.trim() });
  }}>
    <label>异常说明<input required maxLength={1000} value={value} onChange={(event) => onChange(event.target.value)} /></label>
    <button className="secondary-button" disabled={disabled} type="submit">登记异常</button>
  </form>;
}
