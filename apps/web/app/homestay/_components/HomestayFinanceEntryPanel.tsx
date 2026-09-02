"use client";

import { PROPERTY_BUSINESS_PERMISSIONS, type CreatePendingPropertyApprovalResult, type HomestayFinanceApprovalSource, type HomestayFinanceItem } from "@jinhu/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { PropertyPanelSurface, propertyErrorMessage, propertyLabels, type PropertyCapabilityProjection } from "../../../features/property-shared";
import { apiRequest, createIdempotencyKey } from "../../../lib/api-client";
import { getAccessToken } from "../../../lib/authz";
import { useAuthUser } from "../../../lib/auth-context";
import { hasAccess } from "../../../lib/permissions";
import styles from "./HomestayWorkbench.module.css";
import { homestayFinanceEntryTypes } from "./homestay-workbench.logic";

function useFinanceEntry(onSaved: () => void) {
  const [bookingId, setBookingId] = useState("");
  const [entryType, setEntryType] = useState<"charge" | "payment" | "refund" | "waiver">("payment");
  const [sourceLedgerId, setSourceLedgerId] = useState("");
  const [chargeType, setChargeType] = useState("room");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const lock = useRef(false);
  const retryKey = useRef<{ signature: string; key: string } | null>(null);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!bookingId || lock.current) return;
    lock.current = true;
    setSubmitting(true);
    const signature = `${bookingId}:${entryType}:${sourceLedgerId}:${chargeType}:${amount}:${paymentMethod}:${reason}`;
    if (retryKey.current?.signature !== signature) {
      retryKey.current = { signature, key: createIdempotencyKey("homestay-finance-register") };
    }
    setMessage("");
    try {
      const response = await apiRequest<CreatePendingPropertyApprovalResult | object>(`/homestay/bookings/${bookingId}/ledger`, {
        method: "POST", token: getAccessToken() ?? undefined,
        idempotencyKey: retryKey.current.key,
        body: {
          entry_type: entryType, charge_type: chargeType.trim(), amount,
          payment_method: entryType === "payment" ? paymentMethod : undefined,
          source_ledger_entry_id: ["refund", "waiver"].includes(entryType) ? sourceLedgerId : undefined,
          reason: reason.trim()
        }
      });
      retryKey.current = null;
      const result = response.data as Partial<CreatePendingPropertyApprovalResult>;
      setMessage(result.request?.requestId
        ? `审批申请已提交。审批状态：${propertyLabels.decisionStatus(result.request.decisionStatus)}；执行状态：${propertyLabels.executionStatus(result.request.executionStatus)}。`
        : "普通费用流水已登记。");
      onSaved();
    } catch (error) {
      setMessage(propertyErrorMessage(error, "财务流水登记失败，请稍后重试"));
    } finally {
      lock.current = false;
      setSubmitting(false);
    }
  }
  return {
    amount, bookingId, chargeType, entryType, message, paymentMethod, reason, sourceLedgerId,
    setAmount, setBookingId, setChargeType, setEntryType, setMessage, setPaymentMethod, setReason, setSourceLedgerId,
    submit, submitting
  };
}

export function HomestayFinanceEntryPanel({
  capability,
  items,
  onSaved
}: {
  capability: PropertyCapabilityProjection;
  items: readonly HomestayFinanceItem[];
  onSaved(): void;
}) {
  const form = useFinanceEntry(onSaved);
  const user = useAuthUser();
  const ordinaryAllowed = capability.actionAllowed("homestay.finance.register");
  const approvalAllowed = capability.pageAllowed && capability.moduleAvailable
    && hasAccess(user, PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_BOOKING_READ, "homestay")
    && hasAccess(user, PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_APPROVAL_CREATE, "asset");
  const refundAllowed = approvalAllowed
    && hasAccess(user, PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_FINANCE_REGISTER, "homestay")
    && hasAccess(user, PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_FINANCE_WAIVE, "homestay");
  const waiverAllowed = approvalAllowed
    && hasAccess(user, PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_FINANCE_WAIVE, "homestay");
  const highRiskAllowed = refundAllowed || waiverAllowed;
  const selectedBooking = items.find((item) => item.bookingId === form.bookingId);
  const allowedEntryTypes = useMemo(() => homestayFinanceEntryTypes(
    selectedBooking?.bookingStatus ?? null,
    { ordinary: ordinaryAllowed, refund: refundAllowed, waiver: waiverAllowed }
  ), [ordinaryAllowed, refundAllowed, selectedBooking?.bookingStatus, waiverAllowed]);
  const [sources, setSources] = useState<HomestayFinanceApprovalSource[]>([]);
  const selectedSource = sources.find((item) => item.id === form.sourceLedgerId);
  const ledgerRequestId = useRef(0);
  useEffect(() => {
    if (allowedEntryTypes.length && !allowedEntryTypes.includes(form.entryType)) {
      form.setEntryType(allowedEntryTypes[0]!);
    }
  }, [allowedEntryTypes, form.entryType]);
  useEffect(() => {
    const requestId = ++ledgerRequestId.current;
    form.setSourceLedgerId("");
    setSources([]);
    if (!form.bookingId || !highRiskAllowed || !allowedEntryTypes.includes(form.entryType)
      || !["refund", "waiver"].includes(form.entryType)) return;
    void apiRequest<HomestayFinanceApprovalSource[]>(`/homestay/bookings/${form.bookingId}/finance-sources?entry_type=${form.entryType}`, {
      token: getAccessToken() ?? undefined
    }).then((response) => {
      if (requestId === ledgerRequestId.current) setSources(response.data);
    }).catch((error) => {
      if (requestId === ledgerRequestId.current) {
        setSources([]);
        form.setMessage(propertyErrorMessage(error, "加载可操作来源失败，请稍后重试"));
      }
    });
  }, [allowedEntryTypes, form.bookingId, form.entryType, highRiskAllowed]);
  if (!ordinaryAllowed && !highRiskAllowed) return null;
  return (
    <PropertyPanelSurface title="登记财务流水" description="退款与减免将提交审批；审批完成前不会写入财务流水。">
      <form onSubmit={form.submit}>
        <fieldset className={styles.toolbar} disabled={form.submitting}>
          <label>订单<select required value={form.bookingId} onChange={(event) => form.setBookingId(event.target.value)}>
            <option value="">请选择订单</option>
            {items.map((item) => <option key={item.bookingId} value={item.bookingId}>{item.bookingCode}</option>)}
          </select></label>
          <label>流水类型<select disabled={!form.bookingId || !allowedEntryTypes.length} value={form.entryType} onChange={(event) => { form.setEntryType(event.target.value as typeof form.entryType); form.setSourceLedgerId(""); }}>
            {!form.bookingId ? <option value={form.entryType}>请先选择订单</option> : null}
            {form.bookingId && !allowedEntryTypes.length ? <option value={form.entryType}>当前订单状态不可登记</option> : null}
            {allowedEntryTypes.includes("payment") ? <option value="payment">收款</option> : null}
            {allowedEntryTypes.includes("charge") ? <option value="charge">费用</option> : null}
            {allowedEntryTypes.includes("refund") ? <option value="refund">退款（需审批）</option> : null}
            {allowedEntryTypes.includes("waiver") ? <option value="waiver">减免（需审批）</option> : null}
          </select></label>
          {["refund", "waiver"].includes(form.entryType) ? <label>来源流水<select required value={form.sourceLedgerId} onChange={(event) => { const source = sources.find((item) => item.id === event.target.value); form.setSourceLedgerId(event.target.value); if (source?.chargeType) form.setChargeType(source.chargeType); }}>
            <option value="">请选择来源流水</option>
            {sources.map((entry) => <option key={entry.id} value={entry.id}>{propertyLabels.homestayLedgerType(entry.entryType)} · 可退/减 ¥{entry.availableAmount} · {entry.occurredAt || "已确认"}</option>)}
          </select></label> : null}
          <label>费用类型<input required maxLength={32} readOnly={["refund", "waiver"].includes(form.entryType)} value={form.chargeType} onChange={(event) => form.setChargeType(event.target.value)} /></label>
          <label>金额<input required type="number" min="0.01" max={selectedSource?.availableAmount} step="0.01" value={form.amount} onFocus={(event) => event.target.select()} onChange={(event) => form.setAmount(event.target.value)} /></label>
          {form.entryType === "payment" ? <label>收款方式<input required maxLength={32} value={form.paymentMethod} onChange={(event) => form.setPaymentMethod(event.target.value)} /></label> : null}
          <label>说明<input required maxLength={500} value={form.reason} onChange={(event) => form.setReason(event.target.value)} /></label>
          <button className="primary-button" disabled={!form.bookingId || !allowedEntryTypes.includes(form.entryType)} type="submit">{["refund", "waiver"].includes(form.entryType) ? "提交审批" : "登记流水"}</button>
        </fieldset>
      </form>
      <p aria-live="polite">{form.submitting ? "正在登记流水…" : form.message}</p>
    </PropertyPanelSurface>
  );
}
