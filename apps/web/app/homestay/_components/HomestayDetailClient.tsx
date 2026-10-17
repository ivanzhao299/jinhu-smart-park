"use client";

import type {
  CreatePendingPropertyApprovalResult,
  HomestayBookingDetailResponse,
  HomestayTurnoverDetailResponse
} from "@jinhu/shared";
import { StatusPill } from "@jinhu/ui";
import type { Route } from "next";
import Link from "next/link";
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CanonicalDetailShell,
  ConsequenceDialog,
  PropertyPanelSurface,
  displayEntityName,
  formatPropertyDateTime,
  homestayPriceSourceLabel,
  propertyLabels,
  propertyErrorMessage,
  projectPropertyCapabilities,
  resolveReturnHref,
  statusVariant,
  workOrderStatusLabel,
  type CanonicalDetailState
} from "../../../features/property-shared";
import { AttachmentList } from "../../../components/files/AttachmentList";
import { FileUploader } from "../../../components/files/FileUploader";
import { ApiError, apiRequest, createIdempotencyKey, isForbiddenError } from "../../../lib/api-client";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import styles from "./HomestayWorkbench.module.css";
import { HomestayStayActions } from "./HomestayStayActions";
import { HomestayReschedulePanel } from "./HomestayReschedulePanel";
import { HomestayTurnoverActions } from "./HomestayTurnoverActions";
import { HOMESTAY_DETAIL_READ_ACTIONS, homestayTurnoverAssigneeLabel } from "./homestay-workbench.logic";
import { loadHomestayDetail } from "./homestay-detail-query";
import { hasPermission } from "../../../lib/permissions";

type DetailKind = "booking" | "stay" | "turnover";

function useDetailQuery(kind: DetailKind, entityId: string, readAllowed: boolean, invalidationKey: string, canReadBooking: boolean) {
  const [data, setData] = useState<HomestayBookingDetailResponse | HomestayTurnoverDetailResponse | null>(null);
  const [state, setState] = useState<CanonicalDetailState>({ kind: "loading" });
  const load = useCallback(async () => {
    if (!readAllowed) {
      setState({ kind: "forbidden" });
      return false;
    }
    setState((current) => current.kind === "ready"
      ? { kind: "ready", stale: true }
      : { kind: "loading" });
    try {
      const response = await loadHomestayDetail(kind, entityId, getAccessToken(), canReadBooking);
      setData(response.data);
      setState({ kind: "ready" });
      return true;
    } catch (loadError) {
      if (isForbiddenError(loadError)) setState({ kind: "forbidden" });
      else if (loadError instanceof ApiError && loadError.status === 404) setState({ kind: "not-found" });
      else setState({ kind: "failure", message: propertyErrorMessage(loadError, "详情加载失败，请稍后重试") });
      return false;
    }
  }, [entityId, kind, readAllowed, canReadBooking]);
  useEffect(() => void load(), [load, invalidationKey]);
  return { data, load, setState, state };
}

function useDetailMutation(
  load: () => Promise<boolean>,
  setState: React.Dispatch<React.SetStateAction<CanonicalDetailState>>
) {
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const lock = useRef(false);
  const retry = useRef<{ signature: string; key: string } | null>(null);
  async function mutate(endpoint: string, body?: unknown) {
    if (lock.current) return false;
    lock.current = true;
    setSubmitting(true);
    setMessage("");
    setErrorMessage("");
    const signature = `${endpoint}:${JSON.stringify(body ?? {})}`;
    if (retry.current?.signature !== signature) {
      retry.current = { signature, key: createIdempotencyKey("homestay-action") };
    }
    try {
      const response = await apiRequest<CreatePendingPropertyApprovalResult | object>(endpoint, {
        method: "POST",
        token: getAccessToken() ?? undefined,
        idempotencyKey: retry.current.key,
        body: body ?? {}
      });
      const result = response.data as Partial<CreatePendingPropertyApprovalResult>;
      setMessage(result.request?.requestId
        ? `审批申请已提交。审批状态：${propertyLabels.decisionStatus(result.request.decisionStatus)}；执行状态：${propertyLabels.executionStatus(result.request.executionStatus)}。`
        : "操作已完成。");
      retry.current = null;
      if (!await load()) {
        setMessage("操作已完成，但详情刷新失败，请手动刷新确认最新状态。");
      }
      return true;
    } catch (actionError) {
      if (actionError instanceof ApiError && actionError.status === 409) {
        const actionMessage = propertyErrorMessage(actionError, "数据状态已变化，请刷新后重试");
        setErrorMessage(actionMessage);
        const keepConfirmation = ["/no-show", "/lost", "/check-in", "/check-out"]
          .some((action) => endpoint.endsWith(action));
        setState(keepConfirmation
          ? { kind: "ready", stale: true }
          : { kind: "conflict", message: actionMessage });
      } else {
        const actionMessage = propertyErrorMessage(actionError);
        setMessage(actionMessage);
        setErrorMessage(actionMessage);
      }
      return false;
    } finally {
      lock.current = false;
      setSubmitting(false);
    }
  }
  return { errorMessage, message, mutate, submitting };
}

export function HomestayDetailClient({ kind, entityId }: { kind: DetailKind; entityId: string }) {
  const user = useAuthUser();
  const featureId = kind === "turnover" ? "homestay.turnovers" : kind === "stay" ? "homestay.stays" : "homestay.bookings";
  const capability = useMemo(() => projectPropertyCapabilities(user, featureId), [featureId, user]);
  const query = useDetailQuery(
    kind, entityId, capability.actionAllowed(HOMESTAY_DETAIL_READ_ACTIONS[kind]),
    capability.invalidationKey, hasPermission(user, "homestay:booking:read")
  );
  const action = useDetailMutation(query.load, query.setState);
  const [attachmentVersion, setAttachmentVersion] = useState(0);
  const returnHref = useReturnHref(kind);
  const titleRef = useRef<HTMLSpanElement>(null);

  const title = kind === "turnover"
    ? "周转详情"
    : `订单详情${isBookingDetail(query.data) ? ` · ${query.data.booking.bookingCode}` : ""}`;

  return (
    <CanonicalDetailShell
      entityKey={`${kind}:${entityId}`}
      presentation="full"
      returnControl={<Link className="secondary-button" href={returnHref as Route}>返回列表</Link>}
      state={query.state}
      title={<span ref={titleRef} tabIndex={-1}>{title}</span>}
      actions={<button className="secondary-button" type="button" onClick={() => void query.load()}>刷新</button>}
    >
      <div aria-busy={action.submitting} inert={action.submitting} className={styles.detailStack}>
      {isBookingDetail(query.data)
        ? <BookingDetail fallbackFocusRef={titleRef} data={query.data} kind={kind} capability={capability} mutate={action.mutate} mutationError={action.errorMessage} submitting={action.submitting} />
        : query.data
          ? <TurnoverDetail
              capability={capability}
              data={query.data}
              mutate={action.mutate}
              attachmentVersion={attachmentVersion}
              onUploaded={() => setAttachmentVersion((value) => value + 1)}
            />
          : null}
      </div>
      {action.submitting ? <p role="status">正在提交，请勿重复操作。</p> : null}
      <p aria-live="polite">{action.message}</p>
    </CanonicalDetailShell>
  );
}

function useReturnHref(kind: DetailKind) {
  const fallback = kind === "turnover" ? "/homestay/turnovers" : kind === "stay" ? "/homestay/stays" : "/homestay/bookings";
  const [href, setHref] = useState(fallback);
  useEffect(() => {
    const candidate = new URLSearchParams(window.location.search).get("returnTo");
    setHref(resolveReturnHref(candidate, {
      origin: window.location.origin,
      fallbackHref: fallback,
      routes: {
        bookings: { pathTemplate: "/homestay/bookings", allowedQueryKeys: ["page", "page_size", "status", "sort", "keyword", "date_from", "date_to", "unit_id"] },
        tasks: { pathTemplate: "/homestay/tasks", allowedQueryKeys: ["page", "page_size", "status", "source_type", "business_date", "sort", "taskId", "requestId"] },
        finance: { pathTemplate: "/homestay/finance", allowedQueryKeys: ["page", "page_size", "status", "sort"] },
        stays: { pathTemplate: "/homestay/stays", allowedQueryKeys: ["page", "page_size", "queue", "status", "business_date", "sort"] },
        turnovers: { pathTemplate: "/homestay/turnovers", allowedQueryKeys: ["page", "page_size", "status", "sort"] }
      }
    }));
  }, [fallback]);
  return href;
}

function isBookingDetail(
  data: HomestayBookingDetailResponse | HomestayTurnoverDetailResponse | null
): data is HomestayBookingDetailResponse {
  return Boolean(data && "booking" in data);
}

function BookingDetail({
  fallbackFocusRef,
  data,
  kind,
  capability,
  mutate,
  mutationError,
  submitting
}: {
  fallbackFocusRef: RefObject<HTMLElement | null>;
  data: HomestayBookingDetailResponse;
  kind: DetailKind;
  capability: ReturnType<typeof projectPropertyCapabilities>;
  mutate(endpoint: string, body?: unknown): Promise<boolean>;
  mutationError: string;
  submitting: boolean;
}) {
  const booking = data.booking;
  const isStay = kind === "stay";
  const canReschedule = !isStay && capability.actionAllowed("homestay.bookings.reschedule") && ["draft", "confirmed"].includes(booking.status);
  return (
    <>
      <BookingOverview data={data} />
      <BookingGuests data={data} />
      {isStay ? <HomestayStayActions fallbackFocusRef={fallbackFocusRef} capability={capability} data={data} mutate={mutate} busy={submitting} errorMessage={mutationError} /> : null}
      {canReschedule ? <HomestayReschedulePanel booking={booking} mutate={mutate} /> : null}
      <BookingProjections data={data} />
      <BookingActions fallbackFocusRef={fallbackFocusRef} booking={booking} capability={capability} isStay={isStay} mutate={mutate} mutationError={mutationError} submitting={submitting} />
    </>
  );
}

function BookingOverview({ data }: { data: HomestayBookingDetailResponse }) {
  const booking = data.booking;
  return <><section className={styles.detailGrid}>
    <PropertyPanelSurface title="订单"><dl className={styles.panelDefList}>
      <div><dt>订单号</dt><dd>{booking.bookingCode}</dd></div>
      <div><dt>入住期间</dt><dd>{booking.arrivalDate} 至 {booking.departureDate}</dd></div>
      <div><dt>房源</dt><dd>{displayEntityName(booking.unitName, booking.unitCode, "未命名房源")}</dd></div>
      <div><dt>状态</dt><dd><StatusPill variant={statusVariant(booking.status)}>{propertyLabels.bookingStatus(booking.status)}</StatusPill></dd></div>
      <div><dt>入住人数</dt><dd>{booking.guestCount}</dd></div>
    </dl></PropertyPanelSurface>
    {(booking.roomAmount !== undefined || booking.totalAmount !== undefined) ? <PropertyPanelSurface title="授权金额"><dl className={styles.panelDefList}>
      <div><dt>房费</dt><dd className={styles.num}>{booking.roomAmount ?? "—"}</dd></div>
      <div><dt>调整</dt><dd className={styles.num}>{booking.adjustmentAmount ?? "—"}</dd></div>
      <div><dt>合计</dt><dd className={styles.num}>{booking.totalAmount ?? "—"}</dd></div>
    </dl></PropertyPanelSurface> : null}
  </section>
  <PropertyPanelSurface title="每日房价">
    {data.nights.length ? <ul className={styles.rowList}>{data.nights.map((night) => <li key={night.id}>
      <strong>{night.businessDate}</strong>
      <span className={styles.num}>{night.finalRate ?? "金额未授权"}</span>
      <span className={styles.muted}>{homestayPriceSourceLabel(night.priceSource)}</span>
    </li>)}</ul> : <p>暂无每日房价记录。</p>}
  </PropertyPanelSurface></>;
}

function BookingGuests({ data }: { data: HomestayBookingDetailResponse }) {
  return <PropertyPanelSurface title="住客与凭证">
    <p>住客 {data.guests.length} 人，凭证 {data.credentials.length} 项。</p>
    {data.guests.length ? <ul className={styles.rowList}>{data.guests.map((guest) => <li key={guest.id}>
      <strong>{guest.partyDisplayName}</strong>
      <span className={styles.muted}>{guest.isPrimary ? "主住客" : "同行住客"}</span>
      <StatusPill variant={statusVariant(guest.verificationStatus)}>{propertyLabels.homestayGuestVerification(guest.verificationStatus)}</StatusPill>
    </li>)}</ul> : null}
    {data.credentials.length ? <ul className={styles.rowList}>{data.credentials.map((credential) => <li key={credential.id}>
      <strong>{credential.credentialLabel}</strong>
      <StatusPill variant={statusVariant(credential.status)}>{propertyLabels.homestayCredentialStatus(credential.status)}</StatusPill>
      <span className={styles.muted}>{credential.credentialReference ?? "未显示引用"}</span>
    </li>)}</ul> : null}
  </PropertyPanelSurface>;
}

function BookingProjections({ data }: { data: HomestayBookingDetailResponse }) {
  return <>{data.finance_visible && data.ledger_summary ? <PropertyPanelSurface title="民宿子账">
    <div className="ds-kpi-grid">{([
      ["费用", data.ledger_summary.charges],
      ["已收", data.ledger_summary.payments],
      ["退款", data.ledger_summary.refunds],
      ["减免", data.ledger_summary.waivers],
      ["余额", data.ledger_summary.balance]
    ] as const).map(([label, value]) => <article className="ds-kpi-card" key={label}>
      <span>{label}</span><strong className={styles.num}>{value}</strong>
    </article>)}</div>
  </PropertyPanelSurface> : null}
  {data.ledger ? <PropertyPanelSurface title="账务流水">
    {data.ledger.length ? <ul className={styles.rowList}>{data.ledger.map((entry) => <li key={entry.id}>
      <span className={styles.muted}>{formatPropertyDateTime(entry.occurredAt)}</span>
      <span>{propertyLabels.homestayLedgerType(entry.entryType)}</span>
      <strong className={styles.num}>{entry.amount}</strong>
      <StatusPill variant={statusVariant(entry.status)}>{propertyLabels.homestayLedgerStatus(entry.status)}</StatusPill>
    </li>)}</ul> : <p>暂无流水记录。</p>}
  </PropertyPanelSurface> : null}
  {data.turnover ? <PropertyPanelSurface title="关联周转">
    <ul className={styles.rowList}><li>
      <StatusPill variant={statusVariant(data.turnover.status)}>{propertyLabels.turnoverStatus(data.turnover.status)}</StatusPill>
      <span>{data.turnover.assigneeName ?? "待分配"}</span>
      <span className={styles.muted}>{data.turnover.exceptionDescription ?? "无异常"}</span>
    </li></ul>
  </PropertyPanelSurface> : null}
  <PropertyPanelSurface title="操作审计">
    {data.actions.length ? <ul className={styles.rowList}>{data.actions.map((action) => <li key={action.id}>
      <span className={styles.muted}>{formatPropertyDateTime(action.actionTime)}</span>
      <span>{action.operatorName}</span>
      <span>{propertyLabels.homestayAuditAction(action.action)}</span>
      <span className={styles.muted}>{action.beforeStatus ? propertyLabels.bookingStatus(action.beforeStatus) : "无前置状态"} → {action.afterStatus ? propertyLabels.bookingStatus(action.afterStatus) : "无后置状态"}</span>
      {action.reason ? <span className={styles.muted}>说明：{action.reason}</span> : null}
    </li>)}</ul> : <p>暂无操作记录。</p>}
  </PropertyPanelSurface></>;
}

function BookingActions({ booking, capability, isStay, mutate, mutationError, submitting, fallbackFocusRef }: {
  fallbackFocusRef: RefObject<HTMLElement | null>;
  booking: HomestayBookingDetailResponse["booking"];
  capability: ReturnType<typeof projectPropertyCapabilities>; isStay: boolean;
  mutate(endpoint: string, body?: unknown): Promise<boolean>;
  mutationError: string;
  submitting: boolean;
}) {
  const [cancelReason, setCancelReason] = useState("");
  const [pendingStayAction, setPendingStayAction] = useState<"check-in" | "check-out" | null>(null);
  const canConfirm = !isStay && capability.actionAllowed("homestay.bookings.confirm") && booking.status === "draft";
  const canCheckIn = isStay && capability.actionAllowed("homestay.stays.check-in") && booking.status === "confirmed";
  const canCheckOut = isStay && capability.actionAllowed("homestay.stays.check-out") && booking.status === "checked_in";
  const canCancel = !isStay && capability.actionAllowed("homestay.bookings.cancel")
    && ["draft", "confirmed"].includes(booking.status);
  return <PropertyPanelSurface title="可执行操作"><div className="ds-action-bar">
    {canConfirm ? <button className="primary-button" type="button" onClick={() => void mutate(`/homestay/bookings/${booking.id}/confirm`)}>确认订单</button> : null}
    {canCheckIn ? <button className="primary-button" type="button" onClick={() => setPendingStayAction("check-in")}>办理入住</button> : null}
    {canCheckOut ? <button className="primary-button" type="button" onClick={() => setPendingStayAction("check-out")}>办理退房</button> : null}
  </div>
  {canCancel ? <form className={styles.toolbar} onSubmit={(event) => {
    event.preventDefault();
    if (cancelReason.trim()) void mutate(`/homestay/bookings/${booking.id}/cancel`, { reason: cancelReason.trim() });
  }}>
    <label>取消原因<input required maxLength={500} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} /></label>
    <button className="secondary-button" type="submit">提交取消审批</button>
  </form> : null}
  <ConsequenceDialog
    fallbackFocusRef={fallbackFocusRef}
    actionLabel={pendingStayAction === "check-out" ? "确认办理退房" : "确认办理入住"}
    busy={submitting}
    consequences={pendingStayAction === "check-out"
      ? ["订单将进入已退房终态并释放占用。", "系统将创建客房周转任务；未回收或遗失凭证须先完成处置。"]
      : ["订单将进入在住状态并占用该房源。", "系统会校验主住客身份核验与有效入住凭证，失败时不会推进状态。"]}
    errorMessage={mutationError || undefined}
    onConfirm={() => pendingStayAction
      ? mutate(`/homestay/bookings/${booking.id}/${pendingStayAction}`)
      : false}
    onOpenChange={(open) => { if (!open) setPendingStayAction(null); }}
    open={pendingStayAction !== null}
    reasonPolicy={{ kind: "none" }}
    resultingState={pendingStayAction === "check-out" ? "已退房，待周转" : "在住"}
    target={{ id: booking.id, label: `${displayEntityName(booking.unitName, booking.unitCode, "未命名房源")} · ${booking.bookingCode} · ${booking.arrivalDate} 至 ${booking.departureDate}` }}
    title={pendingStayAction === "check-out" ? "确认办理退房" : "确认办理入住"}
  />
  </PropertyPanelSurface>;
}

function TurnoverDetail({
  data,
  capability,
  mutate,
  attachmentVersion,
  onUploaded
}: {
  data: HomestayTurnoverDetailResponse;
  capability: ReturnType<typeof projectPropertyCapabilities>;
  mutate(endpoint: string, body?: unknown): Promise<boolean>;
  attachmentVersion: number;
  onUploaded(): void;
}) {
  const files = capability.fileCapability("homestay_turnover");
  const [uploading, setUploading] = useState(false);
  return (
    <>
      <section className={styles.detailGrid}>
        <PropertyPanelSurface title="任务信息"><dl className={styles.panelDefList}>
          <div><dt>房源</dt><dd>{[data.unitCode, data.unitName].filter(Boolean).join(" · ") || "已关联房源"}</dd></div>
          <div><dt>状态</dt><dd><StatusPill variant={statusVariant(data.status)}>{propertyLabels.turnoverStatus(data.status)}</StatusPill></dd></div>
          <div><dt>负责人</dt><dd>{homestayTurnoverAssigneeLabel(data.assigneeName, data.status)}</dd></div>
          <div><dt>异常</dt><dd>{data.exceptionDescription ?? "无"}</dd></div>
          <div><dt>关联工单</dt><dd>{data.linkedWorkOrder ? `${data.linkedWorkOrder.code} · ${data.linkedWorkOrder.title} · ${workOrderStatusLabel(data.linkedWorkOrder.status)}` : "无"}</dd></div>
        </dl></PropertyPanelSurface>
        <PropertyPanelSurface title="耗材">
          {data.consumables.length ? <ul className={styles.rowList}>{data.consumables.map((item, index) => <li key={`${item.name}-${index}`}>
            <strong>{item.name}</strong><span className={styles.num}>× {item.quantity}</span><span className={styles.muted}>{item.unit ?? ""}</span>
          </li>)}</ul> : <p>未登记耗材</p>}
        </PropertyPanelSurface>
      </section>
      {files.canRead ? (
        <PropertyPanelSurface title="周转证据">
          <AttachmentList bizId={data.id} bizType="homestay_turnover" compact mutationDisabled={uploading || !files.canDelete} refreshKey={attachmentVersion} />
        </PropertyPanelSurface>
      ) : null}
      {files.canUpload ? (
        <PropertyPanelSurface title="上传现场证据">
          <FileUploader bizId={data.id} bizType="homestay_turnover" compact onUploaded={onUploaded} onUploadingChange={setUploading} />
        </PropertyPanelSurface>
      ) : null}
      <HomestayTurnoverActions capability={capability} data={data} disabled={uploading} mutate={mutate} />
    </>
  );
}
