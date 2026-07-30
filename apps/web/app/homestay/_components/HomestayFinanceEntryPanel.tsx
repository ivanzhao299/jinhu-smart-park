"use client";

import type { HomestayFinanceItem } from "@jinhu/shared";
import { useRef, useState } from "react";
import { PropertyPanelSurface, type PropertyCapabilityProjection } from "../../../features/property-shared";
import { apiRequest, createIdempotencyKey } from "../../../lib/api-client";
import { getAccessToken } from "../../../lib/authz";
import styles from "./HomestayWorkbench.module.css";

function useFinanceEntry(onSaved: () => void) {
  const [bookingId, setBookingId] = useState("");
  const [entryType, setEntryType] = useState<"charge" | "payment">("payment");
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
    const signature = `${bookingId}:${entryType}:${chargeType}:${amount}:${paymentMethod}:${reason}`;
    if (retryKey.current?.signature !== signature) {
      retryKey.current = { signature, key: createIdempotencyKey("homestay-finance-register") };
    }
    setMessage("");
    try {
      await apiRequest(`/homestay/bookings/${bookingId}/ledger`, {
        method: "POST", token: getAccessToken() ?? undefined,
        idempotencyKey: retryKey.current.key,
        body: {
          entry_type: entryType, charge_type: chargeType.trim(), amount,
          payment_method: entryType === "payment" ? paymentMethod : undefined,
          reason: reason.trim()
        }
      });
      retryKey.current = null;
      setMessage("普通费用流水已登记。");
      onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "登记失败");
    } finally {
      lock.current = false;
      setSubmitting(false);
    }
  }
  return {
    amount, bookingId, chargeType, entryType, message, paymentMethod, reason,
    setAmount, setBookingId, setChargeType, setEntryType, setPaymentMethod, setReason,
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
  if (!capability.actionAllowed("homestay.finance.register")) return null;
  return (
    <PropertyPanelSurface title="登记普通费用流水" description="仅支持费用和收款；退款、减免需等待 Track B 审批能力。">
      <form onSubmit={form.submit}>
        <fieldset className={styles.toolbar} disabled={form.submitting}>
          <label>订单<select required value={form.bookingId} onChange={(event) => form.setBookingId(event.target.value)}>
            <option value="">请选择订单</option>
            {items.map((item) => <option key={item.bookingId} value={item.bookingId}>{item.bookingCode}</option>)}
          </select></label>
          <label>流水类型<select value={form.entryType} onChange={(event) => form.setEntryType(event.target.value as typeof form.entryType)}><option value="payment">收款</option><option value="charge">费用</option></select></label>
          <label>费用类型<input required maxLength={32} value={form.chargeType} onChange={(event) => form.setChargeType(event.target.value)} /></label>
          <label>金额<input required type="number" min="0.01" step="0.01" value={form.amount} onFocus={(event) => event.target.select()} onChange={(event) => form.setAmount(event.target.value)} /></label>
          {form.entryType === "payment" ? <label>收款方式<input required maxLength={32} value={form.paymentMethod} onChange={(event) => form.setPaymentMethod(event.target.value)} /></label> : null}
          <label>说明<input required maxLength={500} value={form.reason} onChange={(event) => form.setReason(event.target.value)} /></label>
          <button className="primary-button" type="submit">登记流水</button>
        </fieldset>
      </form>
      <div className="ds-action-bar">
        <button className="secondary-button" disabled type="button">退款（等待审批能力启用）</button>
        <button className="secondary-button" disabled type="button">减免（等待审批能力启用）</button>
      </div>
      <p aria-live="polite">{form.submitting ? "正在登记流水…" : form.message}</p>
    </PropertyPanelSurface>
  );
}
