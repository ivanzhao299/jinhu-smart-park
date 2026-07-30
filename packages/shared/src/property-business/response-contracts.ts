/**
 * Existing dashboard responses currently consumed by both API and Web.
 * Money and percentage values stay decimal strings across the HTTP boundary.
 */
export interface HomestayDashboardResponse {
  business_date: string;
  arrivals: number;
  departures: number;
  occupied: number;
  rentable_units: number;
  occupancy_rate: string;
  average_daily_rate: string;
  pending_turnovers: number;
  revenue?: string;
}

export interface HousingDashboardResponse {
  draft_leases: number;
  pending_approval: number;
  pending_signature: number;
  active_leases: number;
  checkout_pending: number;
  receivable_amount?: string;
  collected_amount?: string;
  outstanding_amount?: string;
  approved_purchase_cost?: string;
}
