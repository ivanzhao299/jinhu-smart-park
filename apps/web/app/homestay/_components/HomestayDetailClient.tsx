"use client";

import type {
  HomestayBookingDetailResponse,
  HomestayTurnoverDetailResponse
} from "@jinhu/shared";
import { StatusPill } from "@jinhu/ui";
import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CanonicalDetailShell,
  projectPropertyCapabilities,
  resolveReturnHref,
  type CanonicalDetailState
} from "../../../features/property-shared";
import { AttachmentList } from "../../../components/files/AttachmentList";
import { FileUploader } from "../../../components/files/FileUploader";
import { ApiError, apiRequest, createIdempotencyKey } from "../../../lib/api-client";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import styles from "./HomestayWorkbench.module.css";
import { HomestayStayActions } from "./HomestayStayActions";
import { HomestayReschedulePanel } from "./HomestayReschedulePanel";
import { HomestayTurnoverActions } from "./HomestayTurnoverActions";
import { HOMESTAY_DETAIL_READ_ACTIONS } from "./homestay-workbench.logic";

type DetailKind = "booking" | "stay" | "turnover";

function useDetailQuery(kind: DetailKind, entityId: string, readAllowed: boolean, invalidationKey: string) {
  const [data, setData] = useState<HomestayBookingDetailResponse | HomestayTurnoverDetailResponse | null>(null);
  const [state, setState] = useState<CanonicalDetailState>({ kind: "loading" });
  const load = useCallback(async () => {
    if (!readAllowed) {
      setState({ kind: "forbidden" });
      return;
    }
    setState((current) => current.kind === "ready"
      ? { kind: "ready", stale: true }
      : { kind: "loading" });
    try {
      const endpoint = kind === "turnover"
        ? `/homestay/turnovers/${entityId}`
        : kind === "stay"
          ? `/homestay/stays/${entityId}`
          : `/homestay/bookings/${entityId}`;
      const response = await apiRequest<HomestayBookingDetailResponse | HomestayTurnoverDetailResponse>(
        endpoint,
        { token: getAccessToken() ?? undefined }
      );
      setData(response.data);
      setState({ kind: "ready" });
    } catch (loadError) {
      if (loadError instanceof ApiError && loadError.status === 403) setState({ kind: "forbidden" });
      else if (loadError instanceof ApiError && loadError.status === 404) setState({ kind: "not-found" });
      else setState({ kind: "failure", message: loadError instanceof Error ? loadError.message : "详情加载失败" });
    }
  }, [entityId, kind, readAllowed]);
  useEffect(() => void load(), [load, invalidationKey]);
  return { data, load, setState, state };
}

function useDetailMutation(
  load: () => Promise<void>,
  setState: React.Dispatch<React.SetStateAction<CanonicalDetailState>>
) {
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const lock = useRef(false);
  const retry = useRef<{ signature: string; key: string } | null>(null);
  async function mutate(endpoint: string, body?: unknown) {
    if (lock.current) return;
    lock.current = true;
    setSubmitting(true);
    setMessage("");
    const signature = `${endpoint}:${JSON.stringify(body ?? {})}`;
    if (retry.current?.signature !== signature) {
      retry.current = { signature, key: createIdempotencyKey("homestay-action") };
    }
    try {
      await apiRequest(endpoint, {
        method: "POST",
        token: getAccessToken() ?? undefined,
        idempotencyKey: retry.current.key,
        body: body ?? {}
      });
      setMessage("操作已完成。");
      retry.current = null;
      await load();
    } catch (actionError) {
      if (actionError instanceof ApiError && actionError.status === 409) {
        setState({ kind: "conflict", message: actionError.message });
      } else {
        setMessage(actionError instanceof Error ? actionError.message : "操作失败");
      }
    } finally {
      lock.current = false;
      setSubmitting(false);
    }
  }
  return { message, mutate, submitting };
}

export function HomestayDetailClient({ kind, entityId }: { kind: DetailKind; entityId: string }) {
  const user = useAuthUser();
  const featureId = kind === "turnover" ? "homestay.turnovers" : kind === "stay" ? "homestay.stays" : "homestay.bookings";
  const capability = useMemo(() => projectPropertyCapabilities(user, featureId), [featureId, user]);
  const query = useDetailQuery(
    kind, entityId, capability.actionAllowed(HOMESTAY_DETAIL_READ_ACTIONS[kind]),
    capability.invalidationKey
  );
  const action = useDetailMutation(query.load, query.setState);
  const [attachmentVersion, setAttachmentVersion] = useState(0);
  const returnHref = useReturnHref(kind);

  const title = kind === "turnover"
    ? "周转详情"
    : `订单详情${isBookingDetail(query.data) ? ` · ${query.data.booking.bookingCode}` : ""}`;

  return (
    <CanonicalDetailShell
      entityKey={`${kind}:${entityId}`}
      presentation="full"
      returnControl={<Link className="secondary-button" href={returnHref as Route}>返回列表</Link>}
      state={query.state}
      title={title}
      actions={<button className="secondary-button" type="button" onClick={() => void query.load()}>刷新</button>}
    >
      <div aria-busy={action.submitting} inert={action.submitting}>
      {isBookingDetail(query.data)
        ? <BookingDetail data={query.data} kind={kind} capability={capability} mutate={action.mutate} />
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
        tasks: { pathTemplate: "/homestay/tasks", allowedQueryKeys: ["page", "page_size", "status", "source_type", "business_date", "sort"] },
        finance: { pathTemplate: "/homestay/finance", allowedQueryKeys: ["page", "page_size", "status", "sort"] },
        stays: { pathTemplate: "/homestay/stays", allowedQueryKeys: ["page", "page_size", "queue", "business_date", "sort"] },
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
  data,
  kind,
  capability,
  mutate
}: {
  data: HomestayBookingDetailResponse;
  kind: DetailKind;
  capability: ReturnType<typeof projectPropertyCapabilities>;
  mutate(endpoint: string, body?: unknown): Promise<void>;
}) {
  const booking = data.booking;
  const isStay = kind === "stay";
  const canReschedule = !isStay && capability.actionAllowed("homestay.bookings.reschedule") && ["draft", "confirmed"].includes(booking.status);
  return (
    <>
      <BookingOverview data={data} />
      <BookingGuests data={data} />
      {isStay ? <HomestayStayActions capability={capability} data={data} mutate={mutate} /> : null}
      {canReschedule ? <HomestayReschedulePanel booking={booking} mutate={mutate} /> : null}
      <BookingProjections data={data} />
      <BookingActions booking={booking} capability={capability} isStay={isStay} mutate={mutate} />
    </>
  );
}

function BookingOverview({ data }: { data: HomestayBookingDetailResponse }) {
  const booking = data.booking;
  return <><section className={styles.detailGrid}>
    <div className="ds-panel"><h2>订单</h2><dl>
      <dt>订单号</dt><dd>{booking.bookingCode}</dd>
      <dt>入住期间</dt><dd>{booking.arrivalDate} 至 {booking.departureDate}</dd>
      <dt>房源</dt><dd>已关联房源</dd>
      <dt>状态</dt><dd><StatusPill value={booking.status} /></dd>
      <dt>入住人数</dt><dd>{booking.guestCount}</dd>
    </dl></div>
    {(booking.roomAmount !== undefined || booking.totalAmount !== undefined) ? <div className="ds-panel"><h2>授权金额</h2><dl>
      <dt>房费</dt><dd>{booking.roomAmount ?? "—"}</dd><dt>调整</dt><dd>{booking.adjustmentAmount ?? "—"}</dd>
      <dt>合计</dt><dd>{booking.totalAmount ?? "—"}</dd>
    </dl></div> : null}
  </section><section className="ds-panel"><h2>每日房价</h2>
    {data.nights.length ? data.nights.map((night) => <p key={night.id}>{night.businessDate} · {night.finalRate ?? "金额未授权"} · {night.priceSource ?? "价格来源未授权"}</p>) : <p>暂无每日房价记录。</p>}
  </section></>;
}

function BookingGuests({ data }: { data: HomestayBookingDetailResponse }) {
  return <section className="ds-panel"><h2>住客与凭证</h2>
    <p>住客 {data.guests.length} 人，凭证 {data.credentials.length} 项。</p>
    {data.guests.map((guest) => <p key={guest.id}>{guest.partyDisplayName} · {guest.isPrimary ? "主住客" : "同行住客"} · <StatusPill value={guest.verificationStatus} /></p>)}
    {data.credentials.map((credential) => <p key={credential.id}>{credential.credentialLabel} · <StatusPill value={credential.status} /> · {credential.credentialReference ?? "未显示引用"}</p>)}
  </section>;
}

function BookingProjections({ data }: { data: HomestayBookingDetailResponse }) {
  return <>{data.finance_visible && data.ledger_summary ? <section className="ds-panel"><h2>民宿子账</h2>
    <p className={styles.finance}>费用 {data.ledger_summary.charges} · 已收 {data.ledger_summary.payments} · 退款 {data.ledger_summary.refunds} · 减免 {data.ledger_summary.waivers} · 余额 {data.ledger_summary.balance}</p>
  </section> : null}
  {data.ledger ? <section className="ds-panel"><h2>账务流水</h2>
    {data.ledger.map((entry) => <p key={entry.id}>{entry.occurredAt} · {entry.entryType} · {entry.amount} · {entry.status}</p>)}
  </section> : null}
  {data.turnover ? <section className="ds-panel"><h2>关联周转</h2>
    <p><StatusPill value={data.turnover.status} /> · {data.turnover.assigneeName ?? "待分配"} · {data.turnover.exceptionDescription ?? "无异常"}</p>
  </section> : null}
  <section className="ds-panel"><h2>操作审计</h2>
    {data.actions.length ? data.actions.map((action) => <p key={action.id}>{action.actionTime} · {action.operatorName} · {action.action} · {action.beforeStatus ?? "—"} → {action.afterStatus ?? "—"} · {action.reason ?? "无说明"}</p>) : <p>暂无操作记录。</p>}
  </section></>;
}

function BookingActions({ booking, capability, isStay, mutate }: {
  booking: HomestayBookingDetailResponse["booking"];
  capability: ReturnType<typeof projectPropertyCapabilities>; isStay: boolean;
  mutate(endpoint: string, body?: unknown): Promise<void>;
}) {
  const canConfirm = !isStay && capability.actionAllowed("homestay.bookings.confirm") && booking.status === "draft";
  const canCheckIn = isStay && capability.actionAllowed("homestay.stays.check-in") && booking.status === "confirmed";
  const canCheckOut = isStay && capability.actionAllowed("homestay.stays.check-out") && booking.status === "checked_in";
  return <section className="ds-panel"><h2>可执行操作</h2><div className="ds-action-bar">
    {canConfirm ? <button className="primary-button" type="button" onClick={() => void mutate(`/homestay/bookings/${booking.id}/confirm`)}>确认订单</button> : null}
    {canCheckIn ? <button className="primary-button" type="button" onClick={() => void mutate(`/homestay/bookings/${booking.id}/check-in`)}>办理入住</button> : null}
    {canCheckOut ? <button className="primary-button" type="button" onClick={() => void mutate(`/homestay/bookings/${booking.id}/check-out`)}>办理退房</button> : null}
    {capability.actionCapability("homestay.bookings.cancel").blockedUntilTrackB ? <button className="secondary-button" disabled type="button">取消订单（等待审批能力启用）</button> : null}
  </div></section>;
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
  mutate(endpoint: string, body?: unknown): Promise<void>;
  attachmentVersion: number;
  onUploaded(): void;
}) {
  const files = capability.fileCapability("homestay_turnover");
  const [uploading, setUploading] = useState(false);
  return (
    <>
      <section className={styles.detailGrid}>
        <div className="ds-panel"><h2>任务信息</h2><dl>
          <dt>房源</dt><dd>{[data.unitCode, data.unitName].filter(Boolean).join(" · ") || "已关联房源"}</dd>
          <dt>状态</dt><dd><StatusPill value={data.status} /></dd>
          <dt>负责人</dt><dd>{data.assigneeName ?? "待领取"}</dd>
          <dt>异常</dt><dd>{data.exceptionDescription ?? "无"}</dd>
          <dt>关联工单</dt><dd>{data.linkedWorkOrder ? `${data.linkedWorkOrder.code} · ${data.linkedWorkOrder.title} · ${data.linkedWorkOrder.status}` : "无"}</dd>
        </dl></div>
        <div className="ds-panel"><h2>耗材</h2>
          {data.consumables.length ? data.consumables.map((item, index) => <p key={`${item.name}-${index}`}>{item.name} × {item.quantity} {item.unit ?? ""}</p>) : <p>未登记耗材</p>}
        </div>
      </section>
      {files.canRead ? (
        <section className="ds-panel"><h2>周转证据</h2>
          <AttachmentList bizId={data.id} bizType="homestay_turnover" compact mutationDisabled={uploading || !files.canDelete} refreshKey={attachmentVersion} />
        </section>
      ) : null}
      {files.canUpload ? (
        <section className="ds-panel"><h2>上传现场证据</h2>
          <FileUploader bizId={data.id} bizType="homestay_turnover" compact onUploaded={onUploaded} onUploadingChange={setUploading} />
        </section>
      ) : null}
      <HomestayTurnoverActions capability={capability} data={data} disabled={uploading} mutate={mutate} />
    </>
  );
}
