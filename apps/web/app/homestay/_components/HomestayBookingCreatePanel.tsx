"use client";

import type { HomestayBookingResponse, HomestayUnitCandidateListResponse } from "@jinhu/shared";
import { useMemo, useRef, useState } from "react";
import {
  PropertyPanelSurface,
  RemoteEntityPicker,
  type PropertyCapabilityProjection,
  type RemoteEntityOption
} from "../../../features/property-shared";
import { usePropertyDraft } from "../../../features/property-shared/offline/use-property-draft";
import { apiRequest, createIdempotencyKey } from "../../../lib/api-client";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { addBusinessDateDays, businessDate } from "../../../lib/business-date";
import styles from "./HomestayWorkbench.module.css";

const BOOKING_DRAFT_SCHEMA = {
  unitId: "string",
  unitLabel: "string",
  arrivalDate: "string",
  departureDate: "string",
  guestCount: "string"
} as const;

async function loadUnits(input: { page: number; pageSize: number; signal: AbortSignal }) {
  const response = await apiRequest<HomestayUnitCandidateListResponse>(
    `/homestay/unit-candidates?page=${input.page}&page_size=${input.pageSize}`,
    { token: getAccessToken() ?? undefined, signal: input.signal }
  );
  return {
    items: response.data.items.map((item) => ({
      id: item.id,
      label: `${item.unitCode} · ${item.unitName}`
    })),
    page: response.data.page,
    pageSize: response.data.page_size,
    total: response.data.total
  };
}

function useBookingCreate(onCreated: () => void) {
  const user = useAuthUser();
  const [unit, setUnit] = useState<RemoteEntityOption | null>(null);
  const [arrivalDate, setArrivalDate] = useState(businessDate());
  const [departureDate, setDepartureDate] = useState(addBusinessDateDays(businessDate(), 1));
  const [guestCount, setGuestCount] = useState("1");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const lock = useRef(false);
  const retryKey = useRef<{ signature: string; key: string } | null>(null);
  const draftValue = useMemo(() => ({
    unitId: unit?.id ?? "",
    unitLabel: unit?.label ?? "",
    arrivalDate,
    departureDate,
    guestCount
  }), [arrivalDate, departureDate, guestCount, unit]);
  const offlineDraft = usePropertyDraft({
    context: user ? {
      tenantId: user.tenant_id,
      parkId: user.park_id,
      userId: user.id,
      route: "/homestay/bookings",
      entityId: "new-booking"
    } : null,
    schema: BOOKING_DRAFT_SCHEMA,
    scope: user ? {
      tenantId: user.tenant_id,
      parkId: user.park_id,
      userId: user.id,
      module: "homestay",
      permissionFingerprint: JSON.stringify([user.data_scope, ...user.permissions].sort())
    } : null,
    value: draftValue,
    onRestore: (draft) => {
      const unitId = String(draft.unitId);
      const unitLabel = String(draft.unitLabel);
      setUnit(unitId && unitLabel ? { id: unitId, label: unitLabel } : null);
      setArrivalDate(String(draft.arrivalDate));
      setDepartureDate(String(draft.departureDate));
      setGuestCount(String(draft.guestCount));
    }
  });
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!unit || lock.current) return;
    lock.current = true;
    setSubmitting(true);
    const signature = `${unit.id}:${arrivalDate}:${departureDate}:${guestCount}`;
    if (retryKey.current?.signature !== signature) {
      retryKey.current = { signature, key: createIdempotencyKey("homestay-booking-create") };
    }
    setMessage("");
    try {
      await apiRequest<HomestayBookingResponse>("/homestay/bookings", {
        method: "POST",
        token: getAccessToken() ?? undefined,
        idempotencyKey: retryKey.current.key,
        body: {
          unit_id: unit.id, arrival_date: arrivalDate, departure_date: departureDate,
          guest_count: Number(guestCount), source_type: "direct"
        }
      });
      retryKey.current = null;
      await offlineDraft.clear();
      setMessage("订单草稿已创建。");
      onCreated();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "创建失败");
    } finally {
      lock.current = false;
      setSubmitting(false);
    }
  }
  return {
    arrivalDate, departureDate, guestCount, message, setArrivalDate, setDepartureDate,
    setGuestCount, setUnit, submit, submitting, unit, draftStatus: offlineDraft.status
  };
}

export function HomestayBookingCreatePanel({
  capability,
  onCreated
}: {
  capability: PropertyCapabilityProjection;
  onCreated(): void;
}) {
  const form = useBookingCreate(onCreated);
  const updateArrival = (value: string) => {
    form.setArrivalDate(value);
    if (form.departureDate <= value) form.setDepartureDate(nextDate(value));
  };
  return (
    <PropertyPanelSurface title="创建订单草稿" description="使用授权房源选择器，不需要填写内部编号。">
      <form onSubmit={form.submit}>
        <fieldset className={styles.toolbar} disabled={form.submitting}>
          <RemoteEntityPicker
            authorized contextValid={capability.moduleAvailable}
            invalidationKey={capability.invalidationKey} label="房源"
            loadOptions={loadUnits} onChange={form.setUnit} required value={form.unit}
          />
          <label>入住日期<input required type="date" value={form.arrivalDate} onChange={(event) => updateArrival(event.target.value)} /></label>
          <label>离店日期<input required type="date" min={nextDate(form.arrivalDate)} value={form.departureDate} onChange={(event) => form.setDepartureDate(event.target.value)} /></label>
          <label>入住人数<input required type="number" min="1" max="50" step="1" value={form.guestCount} onFocus={(event) => event.target.select()} onChange={(event) => form.setGuestCount(event.target.value)} /></label>
          <button className="primary-button" type="submit">创建草稿</button>
        </fieldset>
      </form>
      <p aria-live="polite">{form.submitting ? "正在创建订单草稿…" : form.message}</p>
      {form.draftStatus === "saved" ? <p aria-live="polite">非敏感草稿已保存在本机，24 小时后自动失效。</p> : null}
      {form.draftStatus === "error" ? <p aria-live="polite">本机草稿保存不可用，请勿刷新或关闭页面。</p> : null}
    </PropertyPanelSurface>
  );
}

function nextDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
