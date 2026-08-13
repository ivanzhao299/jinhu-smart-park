"use client";

import { PROPERTY_BUSINESS_PERMISSIONS, type HousingFinanceListItem } from "@jinhu/shared";
import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PropertyCapabilityProjection } from "../../../features/property-shared";
import { apiRequest } from "../../../lib/api-client";
import { getAccessToken } from "../../../lib/authz";
import { useAuthUser } from "../../../lib/auth-context";
import { hasAccess } from "../../../lib/permissions";
import {
  ActionDetails,
  MoneyField,
  MutationFeedback
} from "./HousingFormPrimitives";
import styles from "./HousingWorkbench.module.css";
import { useStableIdempotency } from "./use-stable-idempotency";

export function HousingFinanceActions({
  item,
  capabilities,
  reload
}: {
  item: HousingFinanceListItem;
  capabilities: PropertyCapabilityProjection;
  reload(): Promise<void>;
}) {
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const available = useMemo(() => item.receivables.filter(
    (receivable) => receivable.status !== "void"
  ), [item.receivables]);
  const ordinaryAllowed = capabilities.actionAllowed("housing.finance.register");
  const user = useAuthUser();
  const approvalAllowed = capabilities.pageAllowed && capabilities.moduleAvailable
    && hasAccess(user, PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_APPROVAL_CREATE, "asset");
  const refundAllowed = approvalAllowed
    && hasAccess(user, PROPERTY_BUSINESS_PERMISSIONS.HOUSING_FINANCE_REGISTER, "housing_rental")
    && hasAccess(user, PROPERTY_BUSINESS_PERMISSIONS.HOUSING_FINANCE_WAIVE, "housing_rental");
  const waiverAllowed = approvalAllowed
    && hasAccess(user, PROPERTY_BUSINESS_PERMISSIONS.HOUSING_FINANCE_WAIVE, "housing_rental");
  const highRiskAllowed = refundAllowed || waiverAllowed;
  const [entryKind, setEntryKind] = useState<"payment" | "deposit_receipt" | "refund" | "waiver" | "deposit_refund">(
    available.some((item) => item.entryKind === "payment") ? "payment" : "deposit_receipt"
  );
  const [receivableId, setReceivableId] = useState("");
  const lock = useRef(false);
  const idempotency = useStableIdempotency();
  const receivables = useMemo(
    () => available.filter((receivable) => {
      if (entryKind === "refund") {
        return receivable.receivableType !== "deposit" && isPositiveMoney(receivable.paidAmount);
      }
      if (entryKind === "waiver") {
        return receivable.receivableType !== "deposit" && isPositiveMoney(receivable.balance);
      }
      if (entryKind === "deposit_refund") {
        return receivable.receivableType === "deposit" && isPositiveMoney(item.summary.deposit_balance);
      }
      return receivable.entryKind === entryKind && isPositiveMoney(receivable.balance);
    }),
    [available, entryKind, item.summary.deposit_balance]
  );
  const entryKinds = useMemo(() => [
    ...(ordinaryAllowed ? (["payment", "deposit_receipt"] as const)
      .filter((kind) => available.some((receivable) => receivable.entryKind === kind)) : []),
    ...(refundAllowed ? (["refund", ...(isPositiveMoney(item.summary.deposit_balance)
      ? ["deposit_refund" as const] : [])] as const) : []),
    ...(waiverAllowed ? (["waiver"] as const) : [])
  ], [available, item.summary.deposit_balance, ordinaryAllowed, refundAllowed, waiverAllowed]);
  useEffect(() => {
    if (!entryKinds.includes(entryKind)) {
      setEntryKind(entryKinds[0] ?? "payment");
      setReceivableId("");
      return;
    }
    if (receivableId && !receivables.some((receivable) => receivable.id === receivableId)) {
      setReceivableId("");
    }
  }, [entryKind, entryKinds, receivableId, receivables]);
  if (!ordinaryAllowed && !highRiskAllowed) return null;
  if (!available.length) return <span>当前没有可登记收款的应收。</span>;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const body = financeBody(form);
    lock.current = true;
    setSubmitting(true);
    try {
      const response = await apiRequest(`/housing/leases/${encodeURIComponent(item.lease.id)}/ledger`, {
        method: "POST",
        token: getAccessToken(),
        idempotencyKey: idempotency.keyFor("housing-ledger-register", body), body
      });
      idempotency.complete("housing-ledger-register");
      const request = (response.data as { request?: { requestId?: string; decisionStatus?: string; executionStatus?: string } }).request;
      setMessage(request?.requestId ? `审批申请已提交（${request.requestId}；决策 ${request.decisionStatus}；执行 ${request.executionStatus}）。` : "普通财务流水已登记。");
      formElement.reset();
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "财务登记失败");
    } finally {
      lock.current = false;
      setSubmitting(false);
    }
  }

  return (
    <>
      <ActionDetails label="登记财务流水">
        <form className={styles.inlineForm} onSubmit={submit}>
          <fieldset className={styles.fieldset} disabled={submitting}>
            <label>类型<select name="entry_type" onChange={(event) => {
              setEntryKind(event.target.value as typeof entryKind); setReceivableId("");
            }} value={entryKind}>{entryKinds.map((kind) => <option key={kind} value={kind}>{({
              payment: "普通收款", deposit_receipt: "押金收取", refund: "退款（需审批）",
              waiver: "减免（需审批）", deposit_refund: "押金退还（需审批）"
            } as const)[kind]}</option>)}</select></label>
            <label>目标应收<select name="receivable_id" onChange={(event) => setReceivableId(event.target.value)} required value={receivableId}><option value="">请选择应收</option>{receivables.map((receivable) => <option key={receivable.id} value={receivable.id}>{receivable.chargeType} · 到期 {receivable.dueDate} · 待收 ¥{receivable.balance}</option>)}</select></label>
            <label>费用类型<input maxLength={32} name="charge_type" required /></label>
            <MoneyField label="金额" name="amount" positive />
            <label>支付方式<input maxLength={32} name="payment_method" /></label>
            <label>交易参考号<input maxLength={100} name="transaction_reference" /></label>
            <label>登记原因<input maxLength={500} name="reason" required /></label>
            <button className="ds-button ds-button-primary" type="submit">{submitting ? "提交中…" : ["refund", "waiver", "deposit_refund"].includes(entryKind) ? "提交审批" : "确认登记"}</button>
          </fieldset>
        </form>
      </ActionDetails>
      <MutationFeedback message={message} />
    </>
  );
}

function isPositiveMoney(value: string) {
  return /^(?:0\.(?:0*[1-9]\d*)|[1-9]\d*(?:\.\d+)?)$/.test(value);
}

function financeBody(form: FormData) {
  return {
    entry_type: String(form.get("entry_type")),
    receivable_id: String(form.get("receivable_id")),
    charge_type: String(form.get("charge_type")),
    amount: String(form.get("amount")),
    payment_method: String(form.get("payment_method") ?? ""),
    transaction_reference: String(form.get("transaction_reference") ?? ""),
    reason: String(form.get("reason"))
  };
}
