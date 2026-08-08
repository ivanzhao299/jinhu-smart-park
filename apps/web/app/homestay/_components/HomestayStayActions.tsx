"use client";

import type { HomestayBookingDetailResponse, HomestayGuestCandidateListResponse } from "@jinhu/shared";
import { useMemo, useState } from "react";
import {
  ConsequenceDialog, PropertyPanelSurface, RemoteEntityPicker,
  type PropertyCapabilityProjection, type RemoteEntityOption
} from "../../../features/property-shared";
import { apiRequest } from "../../../lib/api-client";
import { getAccessToken } from "../../../lib/authz";
import { businessDate } from "../../../lib/business-date";
import styles from "./HomestayWorkbench.module.css";

type Mutate = (endpoint: string, body?: unknown) => Promise<void>;

function loadGuests(bookingId: string) {
  return async (input: { query: string; page: number; pageSize: number; signal: AbortSignal }) => {
    const params = new URLSearchParams({
      booking_id: bookingId,
      keyword: input.query, page: String(input.page), page_size: String(input.pageSize)
    });
    const response = await apiRequest<HomestayGuestCandidateListResponse>(
      `/homestay/guest-candidates?${params.toString()}`,
      { token: getAccessToken() ?? undefined, signal: input.signal }
    );
    return {
      items: response.data.items.map((item) => ({ id: item.id, label: item.displayName })),
      page: response.data.page, pageSize: response.data.page_size, total: response.data.total
    };
  };
}

export function HomestayStayActions({
  data, capability, mutate
}: {
  data: HomestayBookingDetailResponse;
  capability: PropertyCapabilityProjection;
  mutate: Mutate;
}) {
  const bookingId = data.booking.id;
  const canNoShow = capability.actionAllowed("homestay.stays.no-show")
    && data.booking.status === "confirmed" && data.booking.arrivalDate <= businessDate();
  return (
    <>
      {capability.actionAllowed("homestay.stays.add-guest")
        ? <GuestRegistration bookingId={bookingId} capability={capability} isFirst={data.guests.length === 0} mutate={mutate} />
        : null}
      {capability.actionAllowed("homestay.stays.issue-credential")
        ? <CredentialIssue bookingId={bookingId} mutate={mutate} /> : null}
      {capability.actionAllowed("homestay.stays.return-credential")
        ? <CredentialReturns bookingId={bookingId} data={data} mutate={mutate} /> : null}
      {canNoShow ? <NoShow bookingId={bookingId} data={data} mutate={mutate} /> : null}
    </>
  );
}

function GuestRegistration({ bookingId, capability, isFirst, mutate }: {
  bookingId: string; capability: PropertyCapabilityProjection; isFirst: boolean; mutate: Mutate;
}) {
  const [guest, setGuest] = useState<RemoteEntityOption | null>(null);
  const guestLoader = useMemo(() => loadGuests(bookingId), [bookingId]);
  return <PropertyPanelSurface title="登记住客"><div className={styles.toolbar}>
    <RemoteEntityPicker authorized contextValid={capability.moduleAvailable}
      invalidationKey={capability.invalidationKey} label="住客" loadOptions={guestLoader}
      onChange={setGuest} required value={guest} />
    <button className="primary-button" disabled={!guest} type="button"
      onClick={() => guest && void mutate(`/homestay/bookings/${bookingId}/guests`, {
        party_id: guest.id, is_primary: isFirst, verification_status: "unverified"
      })}>
      登记住客
    </button>
  </div></PropertyPanelSurface>;
}

function CredentialIssue({ bookingId, mutate }: { bookingId: string; mutate: Mutate }) {
  const [type, setType] = useState<"key" | "card" | "voucher">("card");
  const [label, setLabel] = useState("");
  return <PropertyPanelSurface title="发放入住凭证"><div className={styles.toolbar}>
    <label>凭证类型<select value={type} onChange={(event) => setType(event.target.value as typeof type)}><option value="card">房卡</option><option value="key">钥匙</option><option value="voucher">凭条</option></select></label>
    <label>凭证名称<input required maxLength={100} value={label} onChange={(event) => setLabel(event.target.value)} /></label>
    <button className="primary-button" disabled={!label.trim()} type="button"
      onClick={() => void mutate(`/homestay/bookings/${bookingId}/credentials`, {
        credential_type: type, credential_label: label.trim()
      })}>
      发放凭证
    </button>
  </div></PropertyPanelSurface>;
}

function CredentialReturns({ bookingId, data, mutate }: {
  bookingId: string; data: HomestayBookingDetailResponse; mutate: Mutate;
}) {
  const issued = data.credentials.filter((item) => item.status === "issued");
  if (!issued.length) return null;
  return <PropertyPanelSurface title="回收凭证"><div className="ds-action-bar">
    {issued.map((item) => <button className="secondary-button" key={item.id} type="button"
      onClick={() => void mutate(`/homestay/bookings/${bookingId}/credentials/${item.id}/return`)}>
      回收 {item.credentialLabel}
    </button>)}
  </div></PropertyPanelSurface>;
}

function NoShow({ bookingId, data, mutate }: {
  bookingId: string; data: HomestayBookingDetailResponse; mutate: Mutate;
}) {
  const [open, setOpen] = useState(false);
  return <PropertyPanelSurface title="登记未到店">
    <button className="secondary-button" type="button" onClick={() => setOpen(true)}>登记未到店</button>
    <ConsequenceDialog actionLabel="确认登记未到店"
      consequences={["订单将进入未到店终态，后续入住操作将不可用。"]}
      onConfirm={(reason) => mutate(`/homestay/bookings/${bookingId}/no-show`, { reason })}
      onOpenChange={setOpen} open={open}
      reasonPolicy={{ kind: "required", label: "登记原因", minLength: 1, maxLength: 500 }}
      resultingState="未到店"
      target={{ id: bookingId, label: `${data.booking.bookingCode} · ${data.booking.arrivalDate} 至 ${data.booking.departureDate}` }}
      title="确认登记未到店"
    />
  </PropertyPanelSurface>;
}
