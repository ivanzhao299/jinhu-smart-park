"use client";

import type { HomestayBookingResponse } from "@jinhu/shared";
import { useState } from "react";
import { PropertyPanelSurface } from "../../../features/property-shared";
import styles from "./HomestayWorkbench.module.css";

export function HomestayReschedulePanel({
  booking,
  mutate
}: {
  booking: HomestayBookingResponse;
  mutate(endpoint: string, body?: unknown): Promise<void>;
}) {
  const [arrivalDate, setArrivalDate] = useState(booking.arrivalDate);
  const [departureDate, setDepartureDate] = useState(booking.departureDate);
  const [reason, setReason] = useState("");
  return (
    <PropertyPanelSurface title="订单改期">
      <form className={styles.toolbar} onSubmit={(event) => {
        event.preventDefault();
        void mutate(`/homestay/bookings/${booking.id}/reschedule`, {
          arrival_date: arrivalDate,
          departure_date: departureDate,
          reason: reason.trim()
        });
      }}>
        <label>入住日期<input required type="date" value={arrivalDate} onChange={(event) => setArrivalDate(event.target.value)} /></label>
        <label>离店日期<input required type="date" min={nextDate(arrivalDate)} value={departureDate} onChange={(event) => setDepartureDate(event.target.value)} /></label>
        <label>改期原因<input required maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
        <button className="primary-button" type="submit">提交改期</button>
      </form>
    </PropertyPanelSurface>
  );
}

function nextDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
