"use client";

import type { FormEvent } from "react";
import { useRef, useState } from "react";
import {
  PropertyPanelSurface,
  RemoteEntityPicker,
  type PropertyCapabilityProjection,
  type RemoteEntityOption
} from "../../../features/property-shared";
import { apiRequest } from "../../../lib/api-client";
import { getAccessToken } from "../../../lib/authz";
import styles from "./HousingWorkbench.module.css";
import {
  loadHousingTenants,
  loadHousingUnits
} from "./housing-picker-loaders";
import { useStableIdempotency } from "./use-stable-idempotency";

export function HousingLeaseCreatePanel({
  capabilities,
  onCreated
}: {
  capabilities: PropertyCapabilityProjection;
  onCreated(): void;
}) {
  const [unit, setUnit] = useState<RemoteEntityOption | null>(null);
  const [tenant, setTenant] = useState<RemoteEntityOption | null>(null);
  const [startDate, setStartDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  const idempotency = useStableIdempotency();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!unit || !tenant || lock.current) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    lock.current = true;
    setSubmitting(true);
    setMessage("");
    const body = leaseBody(form, unit.id, tenant.id);
    try {
      await apiRequest("/housing/leases", {
        method: "POST",
        token: getAccessToken(),
        idempotencyKey: idempotency.keyFor("housing-lease-create", body), body
      });
      idempotency.complete("housing-lease-create");
      setMessage("租约草稿已创建。");
      setUnit(null);
      setTenant(null);
      formElement.reset();
      onCreated();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "创建租约失败");
    } finally {
      lock.current = false;
      setSubmitting(false);
    }
  }

  return (
    <PropertyPanelSurface title="创建租约草稿" description="房源与租客均来自住房域授权候选。">
      <form aria-busy={submitting} className={styles.stack} onSubmit={submit}>
        <fieldset className={styles.fieldset} disabled={submitting}>
          <LeasePickers capabilities={capabilities} tenant={tenant} unit={unit} setTenant={setTenant} setUnit={setUnit} />
          <LeaseFields onStartDate={setStartDate} startDate={startDate} />
        </fieldset>
        <button className="ds-button ds-button-primary" disabled={submitting} type="submit">
          {submitting ? "创建中…" : "创建草稿"}
        </button>
      </form>
      {message ? <p aria-live="polite">{message}</p> : null}
    </PropertyPanelSurface>
  );
}

function LeasePickers({
  capabilities,
  tenant,
  unit,
  setTenant,
  setUnit
}: {
  capabilities: PropertyCapabilityProjection;
  tenant: RemoteEntityOption | null;
  unit: RemoteEntityOption | null;
  setTenant(value: RemoteEntityOption | null): void;
  setUnit(value: RemoteEntityOption | null): void;
}) {
  return (
    <div className={styles.formGrid}>
      <RemoteEntityPicker authorized contextValid={capabilities.moduleAvailable} invalidationKey={capabilities.invalidationKey} label="住房房源" loadOptions={loadHousingUnits} onChange={setUnit} required value={unit} />
      <RemoteEntityPicker authorized contextValid={capabilities.moduleAvailable} invalidationKey={capabilities.invalidationKey} label="租客" loadOptions={loadHousingTenants} onChange={setTenant} required value={tenant} />
    </div>
  );
}

function LeaseFields({ startDate, onStartDate }: { startDate: string; onStartDate(value: string): void }) {
  return (
    <div className={styles.formGrid}>
      <label>开始日期<input name="start_date" onChange={(event) => onStartDate(event.target.value)} required type="date" /></label>
      <label>结束日期<input min={startDate || undefined} name="end_date" required type="date" /></label>
      <label>首期到期日<input min={startDate || undefined} name="first_due_date" required type="date" /></label>
      <label>付款周期（月）<input defaultValue="1" max="120" min="1" name="payment_cycle_months" required step="1" type="number" /></label>
      <label>账单日<input defaultValue="1" max="28" min="1" name="billing_day" required step="1" type="number" /></label>
      <label>月租<input min="0" name="monthly_rent" required step="0.01" type="number" /></label>
      <label>押金<input min="0" name="deposit_amount" required step="0.01" type="number" /></label>
      <label>备注<textarea maxLength={500} name="remark" /></label>
    </div>
  );
}

function leaseBody(form: FormData, unitId: string, tenantId: string) {
  return {
    unit_id: unitId,
    tenant_party_id: tenantId,
    start_date: String(form.get("start_date")),
    end_date: String(form.get("end_date")),
    payment_cycle_months: Number(form.get("payment_cycle_months")),
    billing_day: Number(form.get("billing_day")),
    monthly_rent: String(form.get("monthly_rent")),
    deposit_amount: String(form.get("deposit_amount")),
    first_due_date: String(form.get("first_due_date")),
    tail_period_rule: "prorate",
    remark: String(form.get("remark") ?? "")
  };
}
