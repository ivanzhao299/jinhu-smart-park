"use client";

import {
  SYSTEM_PERMISSIONS,
  type HousingChargePlanResponse,
  type HousingBillingListItem
} from "@jinhu/shared";
import { useEffect, useRef, useState } from "react";
import {
  RemoteEntityPicker,
  type PropertyCapabilityProjection,
  type RemoteEntityOption
} from "../../../features/property-shared";
import { apiRequest } from "../../../lib/api-client";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { hasAccess } from "../../../lib/permissions";
import {
  ActionDetails,
  MoneyField,
  MutationFeedback,
  ReadingField
} from "./HousingFormPrimitives";
import styles from "./HousingWorkbench.module.css";
import { loadHousingMeters } from "./housing-picker-loaders";
import { useStableIdempotency } from "./use-stable-idempotency";

export function HousingBillingActions({ item, capabilities, reload }: {
  item: HousingBillingListItem;
  capabilities: PropertyCapabilityProjection;
  reload(): Promise<void>;
}) {
  const user = useAuthUser();
  const [message, setMessage] = useState(""); const [source, setSource] = useState<"fixed" | "manual" | "energy_meter">("fixed");
  const [meter, setMeter] = useState<RemoteEntityOption | null>(null);
  const plans = item.charge_plans.filter((plan) => plan.enabled); const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [submitting, setSubmitting] = useState(false);
  const lock = useRef(false);
  const idempotency = useStableIdempotency();
  const energyAllowed = hasAccess(user, SYSTEM_PERMISSIONS.ENERGY_METER_READ, "energy");
  useEffect(() => {
    if (!plans.some((plan) => plan.id === planId)) setPlanId(plans[0]?.id ?? "");
  }, [planId, plans]);

  async function savePlan(form: FormData) {
    if (source === "energy_meter" && (!energyAllowed || !meter)) {
      setMessage("请选择当前房源的在线能源表计。");
      return;
    }
    const plan = await mutate<HousingChargePlanResponse>("housing-charge-plan", "PUT", "charge-plans", {
      charge_type: String(form.get("charge_type")),
      billing_source: source,
      cycle_months: Number(form.get("cycle_months")),
      amount: source === "fixed" ? String(form.get("amount")) : undefined,
      unit_price: source === "energy_meter" ? String(form.get("unit_price")) : undefined,
      meter_id: source === "energy_meter" ? meter?.id : undefined,
      enabled: true,
      remark: String(form.get("remark") ?? "")
    }, "费用计划已保存。");
    if (plan) setPlanId(plan.id);
  }

  async function generateBill(form: FormData) {
    const plan = plans.find((candidate) => candidate.id === planId);
    if (!plan) return;
    await mutate("housing-bill-generate", "POST", "generate-bills", {
      charge_plan_id: plan.id,
      period_start: String(form.get("period_start")),
      period_end: String(form.get("period_end")),
      manual_amount: plan.billingSource === "manual" ? String(form.get("manual_amount")) : undefined,
      opening_reading: plan.billingSource === "energy_meter" ? String(form.get("opening_reading")) : undefined,
      closing_reading: plan.billingSource === "energy_meter" ? String(form.get("closing_reading")) : undefined,
      reason: String(form.get("reason") ?? "")
    }, "周期账单已生成。");
  }

  async function mutate<T>(
    operation: string, method: "POST" | "PUT", suffix: string, body: object, success: string
  ): Promise<T | undefined> {
    if (lock.current) return undefined;
    lock.current = true;
    setSubmitting(true);
    try {
      const response = await apiRequest<T>(`/housing/leases/${encodeURIComponent(item.lease.id)}/${suffix}`, {
        method, token: getAccessToken(), idempotencyKey: idempotency.keyFor(operation, body), body
      });
      idempotency.complete(operation);
      setMessage(success);
      await reload();
      return response.data;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失败");
      return undefined;
    } finally {
      lock.current = false;
      setSubmitting(false);
    }
  }

  const selectedPlan = plans.find((plan) => plan.id === planId);
  return <BillingActionsView capabilities={capabilities} energyAllowed={energyAllowed}
    leaseId={item.lease.id} message={message} meter={meter} onGenerate={generateBill}
    onMeter={setMeter} onPlan={setPlanId} onSave={savePlan} onSource={setSource}
    planId={planId} plans={plans} selectedPlan={selectedPlan} source={source} submitting={submitting} />;
}

function BillingActionsView(props: {
  capabilities: PropertyCapabilityProjection; energyAllowed: boolean; leaseId: string; message: string;
  meter: RemoteEntityOption | null; onGenerate(form: FormData): Promise<void>;
  onMeter(value: RemoteEntityOption | null): void; onPlan(value: string): void;
  onSave(form: FormData): Promise<void>; onSource(value: "fixed" | "manual" | "energy_meter"): void;
  planId: string; plans: HousingBillingListItem["charge_plans"];
  selectedPlan: HousingBillingListItem["charge_plans"][number] | undefined;
  source: "fixed" | "manual" | "energy_meter"; submitting: boolean;
}) {
  return <>
    {props.capabilities.actionAllowed("housing.billing.save-plan") ? <ChargePlanForm
      capabilities={props.capabilities} energyAllowed={props.energyAllowed} leaseId={props.leaseId}
      meter={props.meter} onMeter={props.onMeter} onSource={props.onSource}
      onSubmit={props.onSave} source={props.source} submitting={props.submitting} /> : null}
    {props.capabilities.actionAllowed("housing.billing.generate") && props.selectedPlan ? <GenerateBillForm
      onPlan={props.onPlan} onSubmit={props.onGenerate} planId={props.planId} plans={props.plans}
      selectedPlan={props.selectedPlan} submitting={props.submitting} /> : null}
    <MutationFeedback message={props.message} />
  </>;
}

function ChargePlanForm(props: {
  capabilities: PropertyCapabilityProjection;
  energyAllowed: boolean;
  leaseId: string;
  meter: RemoteEntityOption | null;
  onMeter(value: RemoteEntityOption | null): void;
  onSource(value: "fixed" | "manual" | "energy_meter"): void;
  onSubmit(form: FormData): Promise<void>;
  source: "fixed" | "manual" | "energy_meter";
  submitting: boolean;
}) {
  return (
    <ActionDetails label="配置费用">
      <form className={styles.inlineForm} onSubmit={(event) => {
        event.preventDefault(); void props.onSubmit(new FormData(event.currentTarget));
      }}>
        <fieldset className={styles.fieldset} disabled={props.submitting}>
          <label>费用类型<input maxLength={32} name="charge_type" required /></label>
          <label>计费来源<select name="billing_source" onChange={(event) => {
            props.onSource(event.target.value as typeof props.source); props.onMeter(null);
          }} value={props.source}><option value="fixed">固定金额</option><option value="manual">人工金额</option>{props.energyAllowed ? <option value="energy_meter">能源表计</option> : null}</select></label>
          <label>周期（月）<input defaultValue="1" max="120" min="1" name="cycle_months" required step="1" type="number" /></label>
          {props.source === "fixed" ? <MoneyField label="固定金额" name="amount" /> : null}
          {props.source === "energy_meter" ? <><RemoteEntityPicker authorized contextValid={props.capabilities.moduleAvailable} invalidationKey={props.capabilities.invalidationKey} label="能源表计" loadOptions={(input) => loadHousingMeters(props.leaseId, input)} onChange={props.onMeter} required value={props.meter} /><MoneyField label="单位价格" name="unit_price" /></> : null}
          <label>备注<input maxLength={500} name="remark" /></label>
          <button className="ds-button ds-button-primary" type="submit">保存</button>
        </fieldset>
      </form>
    </ActionDetails>
  );
}

function GenerateBillForm(props: {
  onPlan(value: string): void;
  onSubmit(form: FormData): Promise<void>;
  planId: string;
  plans: HousingBillingListItem["charge_plans"];
  selectedPlan: HousingBillingListItem["charge_plans"][number];
  submitting: boolean;
}) {
  return (
    <ActionDetails label="生成账单">
      <form className={styles.inlineForm} onSubmit={(event) => {
        event.preventDefault(); void props.onSubmit(new FormData(event.currentTarget));
      }}>
        <fieldset className={styles.fieldset} disabled={props.submitting}>
          <label>费用计划<select name="charge_plan_id" onChange={(event) => props.onPlan(event.target.value)} required value={props.planId}>{props.plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.chargeType} · {plan.billingSource}</option>)}</select></label>
          <label>周期开始<input name="period_start" required type="date" /></label>
          <label>周期结束<input name="period_end" required type="date" /></label>
          {props.selectedPlan.billingSource === "manual" ? <MoneyField label="人工金额" name="manual_amount" /> : null}
          {props.selectedPlan.billingSource === "energy_meter" ? <><ReadingField label="期初读数" name="opening_reading" /><ReadingField label="期末读数" name="closing_reading" /></> : null}
          <label>原因<input maxLength={500} name="reason" /></label>
          <button className="ds-button ds-button-primary" type="submit">生成</button>
        </fieldset>
      </form>
    </ActionDetails>
  );
}
