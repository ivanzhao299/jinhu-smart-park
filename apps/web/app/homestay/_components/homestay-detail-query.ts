import type { HomestayBookingDetailResponse, HomestayTurnoverDetailResponse } from "@jinhu/shared";
import { ApiError, apiRequest } from "../../../lib/api-client";

export async function loadHomestayDetail(
  kind: "booking" | "stay" | "turnover",
  entityId: string,
  token: string,
  canReadBooking: boolean
) {
  const endpoint = kind === "turnover" ? "turnovers" : kind === "stay" ? "stays" : "bookings";
  try {
    return await apiRequest<HomestayBookingDetailResponse | HomestayTurnoverDetailResponse>(
      `/homestay/${endpoint}/${entityId}`, { token }
    );
  } catch (error) {
    // The stay projection excludes no-show bookings immediately after a successful action.
    // Re-read the authorized booking projection, including on a hard refresh of this URL.
    if (kind !== "stay" || !canReadBooking || !(error instanceof ApiError) || error.status !== 404) throw error;
    const response = await apiRequest<HomestayBookingDetailResponse>(
      `/homestay/bookings/${entityId}`, { token }
    );
    if (response.data.booking.status !== "no_show") throw error;
    return response;
  }
}
