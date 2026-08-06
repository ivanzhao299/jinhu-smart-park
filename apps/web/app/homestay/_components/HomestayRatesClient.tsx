"use client";

import type { HomestayRateCalendarResponse, HomestayUnitCandidateListResponse } from "@jinhu/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PageState, PropertyPageSurface, PropertyPanelSurface, RemoteEntityPicker,
  type RemoteEntityOption, projectPropertyCapabilities
} from "../../../features/property-shared";
import { apiRequest, createIdempotencyKey } from "../../../lib/api-client";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { addBusinessDateDays, businessDate } from "../../../lib/business-date";
import styles from "./HomestayWorkbench.module.css";

type FeeType = "fixed" | "percentage";
type RateDraft = {
  baseRate: string; freeCancelHours: string; feeType: FeeType;
  feeValue: string; requiresInspection: boolean;
};
type OverrideDraft = { date: string; rate: string; reason: string };

async function loadUnits(input: { page: number; pageSize: number; signal: AbortSignal }) {
  const response = await apiRequest<HomestayUnitCandidateListResponse>(
    `/homestay/unit-candidates?page=${input.page}&page_size=${input.pageSize}`,
    { token: getAccessToken() ?? undefined, signal: input.signal }
  );
  return {
    items: response.data.items.map((item) => ({
      id: item.id, label: `${item.unitCode} · ${item.unitName}`
    })),
    page: response.data.page, pageSize: response.data.page_size, total: response.data.total
  };
}

function useRateCalendar(unit: RemoteEntityOption | null, canRead: boolean, invalidationKey: string) {
  const [calendar, setCalendar] = useState<HomestayRateCalendarResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!unit || !canRead) return;
    setLoading(true);
    setError("");
    try {
      const from = businessDate();
      const response = await apiRequest<HomestayRateCalendarResponse>(
        `/homestay/rates/${unit.id}?date_from=${from}&date_to=${addBusinessDateDays(from, 13)}`,
        { token: getAccessToken() ?? undefined }
      );
      setCalendar(response.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "价格加载失败");
    } finally {
      setLoading(false);
    }
  }, [canRead, unit]);
  useEffect(() => void load(), [load, invalidationKey]);
  return { calendar, error, load, loading, setError };
}

function useRateDraft(calendar: HomestayRateCalendarResponse | null) {
  const [draft, setDraft] = useState<RateDraft>({
    baseRate: "", freeCancelHours: "24", feeType: "fixed",
    feeValue: "0", requiresInspection: false
  });
  useEffect(() => {
    if (!calendar) return;
    setDraft({
      baseRate: calendar.base_daily_rate,
      freeCancelHours: String(calendar.cancellation_policy.free_cancel_before_hours),
      feeType: calendar.cancellation_policy.late_cancel_fee_type,
      feeValue: calendar.cancellation_policy.late_cancel_fee_value,
      requiresInspection: calendar.checkout_requires_inspection
    });
  }, [calendar]);
  const update = (patch: Partial<RateDraft>) => setDraft((current) => ({ ...current, ...patch }));
  return { draft, update };
}

function useRateSaves(unit: RemoteEntityOption | null, reload: () => Promise<void>) {
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const lock = useRef(false);
  const keys = useRef<Record<"base" | "override", { signature: string; key: string } | null>>({
    base: null, override: null
  });
  async function save(kind: "base" | "override", signature: string, endpoint: string, method: "PUT" | "POST", body: object) {
    if (!unit || lock.current) return;
    lock.current = true;
    setSubmitting(true);
    if (keys.current[kind]?.signature !== signature) {
      keys.current[kind] = { signature, key: createIdempotencyKey(`homestay-rate-${kind}`) };
    }
    setMessage("");
    try {
      await apiRequest(endpoint, {
        method, token: getAccessToken() ?? undefined,
        idempotencyKey: keys.current[kind]!.key, body
      });
      keys.current[kind] = null;
      setMessage(kind === "base" ? "价格配置已保存。" : "日期覆盖价已保存。");
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      lock.current = false;
      setSubmitting(false);
    }
  }
  return { message, save, submitting };
}

export function HomestayRatesClient() {
  const user = useAuthUser();
  const capability = useMemo(() => projectPropertyCapabilities(user, "homestay.rates"), [user]);
  const canRead = capability.actionAllowed("homestay.rates.read");
  return (
    <PropertyPageSurface>
      <header className="ds-hero">
        <p className="ds-eyebrow">民宿管理</p><h1>价格</h1>
        <p>选择房源查看未来价格日历，并在授权后维护基础价格。</p>
      </header>
      {!capability.pageAllowed || !canRead
        ? <PageState state={{ kind: "forbidden-full" }} />
        : <RatesAuthorized capability={capability} canManage={capability.actionAllowed("homestay.rates.upsert")} />}
    </PropertyPageSurface>
  );
}

function RatesAuthorized({
  capability,
  canManage
}: {
  capability: ReturnType<typeof projectPropertyCapabilities>;
  canManage: boolean;
}) {
  const [unit, setUnit] = useState<RemoteEntityOption | null>(null);
  const query = useRateCalendar(unit, true, capability.invalidationKey);
  const rate = useRateDraft(query.calendar);
  const saves = useRateSaves(unit, query.load);
  const [override, setOverride] = useState<OverrideDraft>({ date: businessDate(), rate: "", reason: "" });
  const saveBase = (event: React.FormEvent) => {
    event.preventDefault();
    const d = rate.draft;
    const signature = `${unit?.id}:${d.baseRate}:${d.freeCancelHours}:${d.feeType}:${d.feeValue}:${d.requiresInspection}`;
    void saves.save("base", signature, `/homestay/rates/${unit?.id}`, "PUT", {
      base_daily_rate: d.baseRate, free_cancel_before_hours: Number(d.freeCancelHours),
      late_cancel_fee_type: d.feeType, late_cancel_fee_value: d.feeValue,
      checkout_requires_inspection: d.requiresInspection
    });
  };
  const saveOverride = (event: React.FormEvent) => {
    event.preventDefault();
    const signature = `${unit?.id}:${override.date}:${override.rate}:${override.reason}`;
    void saves.save("override", signature, `/homestay/rates/${unit?.id}/overrides`, "POST", {
      business_date: override.date, daily_rate: override.rate, reason: override.reason.trim()
    });
  };
  return (
    <>
      <PropertyPanelSurface title="房源选择">
        <RemoteEntityPicker authorized contextValid={capability.moduleAvailable}
          invalidationKey={capability.invalidationKey} label="民宿房源"
          loadOptions={loadUnits} onChange={setUnit} value={unit} />
      </PropertyPanelSurface>
      <RateCalendar calendar={query.calendar} error={query.error} loading={query.loading} reload={query.load} unit={unit} />
      {query.calendar && canManage ? (
        <>
          <BaseRateForm draft={rate.draft} onSubmit={saveBase} submitting={saves.submitting} update={rate.update} />
          <OverrideRateForm draft={override} onSubmit={saveOverride} setDraft={setOverride} submitting={saves.submitting} />
        </>
      ) : null}
      <p aria-live="polite">{saves.submitting ? "正在保存价格…" : saves.message || (query.calendar && query.error ? `刷新失败：${query.error}` : "")}</p>
    </>
  );
}

function RateCalendar({
  calendar, error, loading, reload, unit
}: {
  calendar: HomestayRateCalendarResponse | null; error: string; loading: boolean;
  reload(): Promise<void>; unit: RemoteEntityOption | null;
}) {
  const state = loading ? { kind: "initial-loading" as const }
    : error && !calendar ? { kind: "initial-failure" as const, message: error }
      : !unit ? { kind: "empty-filtered" as const }
        : calendar ? { kind: "ready" as const } : { kind: "empty-initial" as const };
  return (
    <PageState state={state} retryAction={<button className="secondary-button" type="button" onClick={() => void reload()}>重试</button>}>
      {calendar ? <PropertyPanelSurface title="未来 14 日价格"><div className="ds-scene-grid">
        {calendar.days.map((day) => <article className="ds-scene-card" key={day.business_date}>
          <strong>{day.business_date}</strong><p>最终价：{day.final_rate}</p>
          <small>{day.price_source === "date_override" ? "日期覆盖价" : "基础价"}</small>
        </article>)}
      </div></PropertyPanelSurface> : null}
    </PageState>
  );
}

function BaseRateForm({ draft, onSubmit, submitting, update }: {
  draft: RateDraft; onSubmit(event: React.FormEvent): void; submitting: boolean;
  update(patch: Partial<RateDraft>): void;
}) {
  return <PropertyPanelSurface title="基础价格配置"><form onSubmit={onSubmit}>
    <fieldset className={styles.toolbar} disabled={submitting}>
      <label>基础日价<input required type="number" min="0" step="0.01" value={draft.baseRate} onFocus={(event) => event.target.select()} onChange={(event) => update({ baseRate: event.target.value })} /></label>
      <label>免费取消小时<input required type="number" min="0" max="8760" step="1" value={draft.freeCancelHours} onFocus={(event) => event.target.select()} onChange={(event) => update({ freeCancelHours: event.target.value })} /></label>
      <label>违约费类型<select value={draft.feeType} onChange={(event) => update({ feeType: event.target.value as FeeType })}><option value="fixed">固定金额</option><option value="percentage">百分比</option></select></label>
      <label>违约费值<input required type="number" min="0" max={draft.feeType === "percentage" ? "100" : undefined} step="0.01" value={draft.feeValue} onFocus={(event) => event.target.select()} onChange={(event) => update({ feeValue: event.target.value })} /></label>
      <label><input type="checkbox" checked={draft.requiresInspection} onChange={(event) => update({ requiresInspection: event.target.checked })} /> 退房需检查</label>
      <button className="primary-button" type="submit">保存价格</button>
    </fieldset>
  </form></PropertyPanelSurface>;
}

function OverrideRateForm({ draft, onSubmit, setDraft, submitting }: {
  draft: OverrideDraft; onSubmit(event: React.FormEvent): void;
  setDraft(value: OverrideDraft): void; submitting: boolean;
}) {
  const update = (patch: Partial<OverrideDraft>) => setDraft({ ...draft, ...patch });
  return <PropertyPanelSurface title="日期覆盖价"><form onSubmit={onSubmit}>
    <fieldset className={styles.toolbar} disabled={submitting}>
      <label>业务日期<input required type="date" value={draft.date} onChange={(event) => update({ date: event.target.value })} /></label>
      <label>覆盖日价<input required type="number" min="0.01" step="0.01" value={draft.rate} onFocus={(event) => event.target.select()} onChange={(event) => update({ rate: event.target.value })} /></label>
      <label>调整原因<input required maxLength={500} value={draft.reason} onChange={(event) => update({ reason: event.target.value })} /></label>
      <button className="primary-button" type="submit">保存覆盖价</button>
    </fieldset>
  </form></PropertyPanelSurface>;
}
