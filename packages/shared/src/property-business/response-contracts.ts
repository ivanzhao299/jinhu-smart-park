import type {
  HomestayBookingStatus,
  PaginatedResult,
  RentalSegment,
  UnitUsageType
} from "../index";

/**
 * Stable property-workbench HTTP projections.
 *
 * These contracts intentionally describe response DTOs instead of ORM entities.
 * Money, rates, readings and percentages remain decimal strings across the
 * boundary. Optional blocks are permission projections and must be omitted when
 * the caller lacks their exact read permission.
 */
export interface HomestayDashboardResponse {
  business_date: string;
  arrivals: number;
  departures: number;
  occupied: number;
  rentable_units: number;
  occupancy_rate: string;
  average_daily_rate?: string;
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

export interface PropertyWorkbenchFileRef {
  id: string;
  originalName: string;
  mimeType: string;
  fileSize: string;
}

export interface PropertyWorkbenchUnitRef {
  id: string;
  unitCode: string;
  unitName: string;
}

export interface PropertyWorkbenchEligibleUnitRef extends PropertyWorkbenchUnitRef {
  usage_type: UnitUsageType;
  rental_segment: RentalSegment | null;
  eligible: boolean;
  ineligible_reasons: string[];
}

export interface PropertyWorkbenchUnitFacets {
  usage_type: Array<{ value: UnitUsageType; rental_segment: RentalSegment | null }>;
  rental_segment: RentalSegment[];
}

export interface PropertyWorkbenchEligibleUnitListResponse
extends PaginatedResult<PropertyWorkbenchEligibleUnitRef> {
  facets: PropertyWorkbenchUnitFacets;
}

export interface PropertyWorkbenchPartyRef {
  id: string;
  displayName: string;
}

export interface PropertyWorkbenchWorkOrderRef {
  id: string;
  woCode: string;
  title: string;
  status: string;
}

export const HOMESTAY_ROOM_STATES = [
  "available",
  "reserved",
  "held",
  "occupied",
  "turnover",
  "out_of_service",
  "mode_unavailable"
] as const;

export type HomestayRoomState = (typeof HOMESTAY_ROOM_STATES)[number];

export interface HomestayAvailabilityItem {
  unit_id: string;
  unit_code: string;
  unit_name: string;
  operation_mode: string | null;
  room_state: HomestayRoomState;
}

/** Current `/homestay/availability` response before A-2.5 API adoption. */
export type HomestayAvailabilityResponse = HomestayAvailabilityItem[];

/**
 * Frozen A-2.5 workbench target. The homestay API owner must introduce this
 * pagination wrapper without changing the existing snake_case item projection.
 */
export type HomestayAvailabilityListResponse =
  PaginatedResult<HomestayAvailabilityItem>;
export type HomestayAvailabilityDetailResponse = HomestayAvailabilityItem;

export type HomestayUnitCandidate = PropertyWorkbenchEligibleUnitRef;
export type HomestayUnitCandidateListResponse =
  PropertyWorkbenchEligibleUnitListResponse;
export type HomestayUnitListResponse = HomestayUnitCandidateListResponse;

export interface HomestayUnitDetailResponse extends PropertyWorkbenchUnitRef {
  operationMode: string | null;
  operationStatus: string | null;
}

export type HomestayGuestCandidate = PropertyWorkbenchPartyRef;
export type HomestayGuestCandidateListResponse =
  PaginatedResult<HomestayGuestCandidate>;

export type HomestayWorkOrderCandidate = PropertyWorkbenchWorkOrderRef;
export type HomestayWorkOrderCandidateListResponse =
  PaginatedResult<HomestayWorkOrderCandidate>;

export interface HomestayRateDayResponse {
  business_date: string;
  base_rate: string;
  override_rate: string | null;
  final_rate: string;
  price_source: "base" | "date_override";
}

export interface HomestayRateListItem extends PropertyWorkbenchUnitRef {
  currency: string;
  base_daily_rate: string;
  checkout_requires_inspection: boolean;
}

export type HomestayRateListResponse =
  PaginatedResult<HomestayRateListItem>;

export interface HomestayRateCalendarConfiguredResponse {
  configured: true;
  unit_id: string;
  currency: string;
  base_daily_rate: string;
  checkout_requires_inspection: boolean;
  cancellation_policy: {
    free_cancel_before_hours: number;
    late_cancel_fee_type: "fixed" | "percentage";
    late_cancel_fee_value: string;
    captured_at: string;
  };
  days: HomestayRateDayResponse[];
}

export interface HomestayRateCalendarUnconfiguredResponse {
  configured: false;
  unit_id: string;
}

export type HomestayRateCalendarResponse =
  | HomestayRateCalendarConfiguredResponse
  | HomestayRateCalendarUnconfiguredResponse;

export type HomestayRateDetailResponse = HomestayRateCalendarResponse;

export interface HomestayBookingResponse {
  id: string;
  bookingCode: string;
  unitId: string;
  arrivalDate: string;
  departureDate: string;
  status: string;
  guestCount: number;
  sourceType: string;
  roomAmount?: string;
  adjustmentAmount?: string;
  totalAmount?: string;
}

export interface HomestayBookingListItem extends HomestayBookingResponse {
  unitCode: string | null;
  unitName: string | null;
}

export type HomestayBookingListResponse =
  PaginatedResult<HomestayBookingListItem>;

export interface HomestayBookingNightResponse {
  id: string;
  businessDate: string;
  baseRate?: string;
  overrideRate?: string | null;
  finalRate?: string;
  priceSource?: "base" | "date_override";
}

export interface HomestayBookingGuestResponse {
  id: string;
  partyId: string;
  partyDisplayName: string;
  isPrimary: boolean;
  verificationStatus: "unverified" | "verified" | "rejected";
}

export interface HomestayCredentialResponse {
  id: string;
  credentialType: string;
  credentialLabel: string;
  credentialReference: string | null;
  status: "issued" | "returned" | "lost" | "void";
  issuedAt: string;
  returnedAt: string | null;
}

export interface HomestayLedgerEntryResponse {
  id: string;
  entryType: string;
  chargeType: string;
  amount: string;
  paymentMethod: string | null;
  status: string;
  occurredAt: string;
  reason: string | null;
}

export interface HomestayLedgerSummaryResponse {
  charges: string;
  payments: string;
  refunds: string;
  waivers: string;
  balance: string;
}

export interface HomestayFinanceApprovalSource {
  id: string;
  entryType: "charge" | "payment";
  chargeType: string;
  amount: string;
  availableAmount: string;
  occurredAt: string;
}

export interface HomestayBookingDetailResponse {
  booking: HomestayBookingResponse;
  nights: HomestayBookingNightResponse[];
  guests: HomestayBookingGuestResponse[];
  credentials: HomestayCredentialResponse[];
  ledger?: HomestayLedgerEntryResponse[];
  ledger_summary?: HomestayLedgerSummaryResponse | null;
  finance_visible: boolean;
  actions: HomestayBookingActionResponse[];
  turnover: HomestayTurnoverResponse | null;
}

export interface HomestayBookingActionResponse {
  id: string;
  action: string;
  beforeStatus: string | null;
  afterStatus: string | null;
  reason: string | null;
  operatorName: string;
  actionTime: string;
}

export interface HomestayStayListItem extends HomestayBookingListItem {
  checkedInAt: string | null;
  checkedOutAt: string | null;
  credentialCount: number;
}

export type HomestayStayListResponse =
  PaginatedResult<HomestayStayListItem>;
export type HomestayStayDetailResponse = HomestayBookingDetailResponse;

export interface HomestayTurnoverResponse {
  id: string;
  bookingId: string;
  unitId: string;
  status: string;
  assigneeId: string | null;
  assigneeName: string | null;
  photoFileIds?: string[];
  consumables: Array<{ name: string; quantity: number; unit?: string }>;
  exceptionDescription: string | null;
  linkedWorkOrderId: string | null;
}

export interface HomestayTurnoverListItem extends HomestayTurnoverResponse {
  unitCode: string | null;
  unitName: string | null;
  createTime: string;
}

export type HomestayTurnoverListResponse =
  PaginatedResult<HomestayTurnoverListItem>;

export interface HomestayTurnoverDetailResponse
  extends HomestayTurnoverListItem {
  evidence?: PropertyWorkbenchFileRef[];
  linkedWorkOrder?: {
    code: string;
    title: string;
    status: string;
  };
}

export interface PropertyWorkbenchTaskItem {
  id: string;
  sourceType: string;
  sourceId: string;
  title: string;
  status: string;
  assigneeId: string | null;
  dueAt: string | null;
}

export type HomestayTaskListResponse =
  PaginatedResult<PropertyWorkbenchTaskItem>;
export type HousingTaskListResponse =
  PaginatedResult<PropertyWorkbenchTaskItem>;

export interface HomestayFinanceItem {
  bookingId: string;
  bookingCode: string;
  bookingStatus: HomestayBookingStatus;
  totalAmount?: string;
  paidAmount: string;
  refundedAmount: string;
  waivedAmount: string;
  balanceAmount: string;
}

export type HomestayFinanceListResponse =
  PaginatedResult<HomestayFinanceItem>;

export interface HousingTenantListItem extends PropertyWorkbenchPartyRef {
  mobile?: string | null;
  email?: string | null;
  identityNumberMasked?: string | null;
  verificationStatus: string;
}

export type HousingTenantListResponse =
  PaginatedResult<HousingTenantListItem>;
export type HousingTenantResponse = HousingTenantListItem;

export const HOUSING_LEASE_UNIT_ELIGIBILITY_REASONS = {
  UNIT_INACTIVE: "UNIT_INACTIVE",
  UNIT_USAGE_NOT_ALLOWED_FOR_MODE: "UNIT_USAGE_NOT_ALLOWED_FOR_MODE",
  OPERATION_CONFIG_MISSING: "OPERATION_CONFIG_MISSING",
  OPERATION_MODE_NOT_LONG_RENT: "OPERATION_MODE_NOT_LONG_RENT",
  OPERATION_STATUS_NOT_ENABLED: "OPERATION_STATUS_NOT_ENABLED",
  LEASE_PERIOD_OCCUPIED: "LEASE_PERIOD_OCCUPIED"
} as const;

export type HousingLeaseUnitEligibilityReason =
  (typeof HOUSING_LEASE_UNIT_ELIGIBILITY_REASONS)[keyof typeof HOUSING_LEASE_UNIT_ELIGIBILITY_REASONS];

export interface HousingLeaseUnitEligibilityProjection {
  eligible: boolean;
  reasonCodes: HousingLeaseUnitEligibilityReason[];
}

export interface HousingLeaseResponse {
  id: string;
  leaseCode: string;
  unitId: string;
  tenantPartyId: string;
  startDate: string;
  endDate: string;
  status: string;
  paymentCycleMonths: number;
  signatureFileId?: string | null;
  monthlyRent?: string;
  depositAmount?: string;
  eligibility?: HousingLeaseUnitEligibilityProjection;
}

export interface HousingLeaseListQuery {
  keyword?: string;
  status?: string;
  unit_id?: string;
  tenant_party_id?: string;
  sort?: HousingLeaseSort;
  order?: HousingSortOrder;
  page: number;
  page_size: number;
}

export const HOUSING_SORT_ORDERS = ["asc", "desc"] as const;
export type HousingSortOrder = typeof HOUSING_SORT_ORDERS[number];

export const HOUSING_TASK_SORTS = ["dueAt", "status", "title"] as const;
export type HousingTaskSort = typeof HOUSING_TASK_SORTS[number];
export const HOUSING_HANDOVER_SORTS = ["createTime", "status", "leaseCode"] as const;
export type HousingHandoverSort = typeof HOUSING_HANDOVER_SORTS[number];
export const HOUSING_LEASE_SORTS = ["startDate", "status", "leaseCode"] as const;
export type HousingLeaseSort = typeof HOUSING_LEASE_SORTS[number];
export const HOUSING_BILLING_SORTS = ["startDate", "status", "leaseCode"] as const;
export type HousingBillingSort = typeof HOUSING_BILLING_SORTS[number];
export const HOUSING_FINANCE_SORTS = ["startDate", "status", "leaseCode"] as const;
export type HousingFinanceSort = typeof HOUSING_FINANCE_SORTS[number];
export const HOUSING_REPAIR_SORTS = ["createTime", "status", "code"] as const;
export type HousingRepairSort = typeof HOUSING_REPAIR_SORTS[number];
export const HOUSING_PURCHASE_SORTS = ["purchaseDate", "status", "code"] as const;
export type HousingPurchaseSort = typeof HOUSING_PURCHASE_SORTS[number];
export const HOUSING_UNIT_CANDIDATE_SORTS = ["code", "name"] as const;
export type HousingUnitCandidateSort = typeof HOUSING_UNIT_CANDIDATE_SORTS[number];
export const HOUSING_ENERGY_METER_CANDIDATE_SORTS = ["code", "name"] as const;
export type HousingEnergyMeterCandidateSort =
  typeof HOUSING_ENERGY_METER_CANDIDATE_SORTS[number];

export interface HousingTaskListQuery {
  status?: string;
  source_type?: string;
  sort?: HousingTaskSort;
  order?: HousingSortOrder;
  page: number;
  page_size: number;
}

export interface HousingHandoverListQuery {
  handover_type?: string;
  status?: string;
  sort?: HousingHandoverSort;
  order?: HousingSortOrder;
  page: number;
  page_size: number;
}

export interface HousingBillingListQuery {
  status?: string;
  sort?: HousingBillingSort;
  order?: HousingSortOrder;
  page: number;
  page_size: number;
}

export interface HousingFinanceListQuery {
  status?: string;
  sort?: HousingFinanceSort;
  order?: HousingSortOrder;
  page: number;
  page_size: number;
}

export interface HousingRepairListQuery {
  status?: string;
  sort?: HousingRepairSort;
  order?: HousingSortOrder;
  page: number;
  page_size: number;
}

export interface HousingPurchaseListQuery {
  approval_status?: string;
  unit_id?: string;
  sort?: HousingPurchaseSort;
  order?: HousingSortOrder;
  page: number;
  page_size: number;
}

export interface HousingUnitCandidateQuery {
  keyword?: string;
  usage_type?: UnitUsageType;
  sort?: HousingUnitCandidateSort;
  order?: HousingSortOrder;
  page: number;
  page_size: number;
}

export type HousingUnitCandidateResponse = PropertyWorkbenchEligibleUnitRef;

export type HousingUnitCandidateListResponse =
  PropertyWorkbenchEligibleUnitListResponse;

export interface HousingLeaseListItem extends HousingLeaseResponse {
  unitCode: string | null;
  unitName: string | null;
  tenantDisplayName: string | null;
}

export type HousingLeaseListResponse =
  PaginatedResult<HousingLeaseListItem>;

export interface HousingLeaseDetailResponse {
  lease: HousingLeaseResponse;
  tenant?: HousingTenantListItem | null;
  occupants?: HousingLeaseOccupantResponse[];
  charge_plans?: HousingChargePlanResponse[];
  receivables?: HousingReceivableResponse[];
  ledger?: HousingLedgerEntryResponse[];
  handovers?: HousingEmbeddedHandoverResponse[];
  pending_handover_files?: {
    move_in: PropertyWorkbenchFileRef[];
    move_out: PropertyWorkbenchFileRef[];
  };
  repairs?: HousingRepairSummaryResponse[];
  pending_repair_files?: PropertyWorkbenchFileRef[];
  finance_summary?: HousingFinanceSummaryResponse | null;
}

export interface HousingLeaseOccupantResponse {
  id: string;
  partyId: string;
  partyDisplayName: string | null;
  occupantRole: string;
  emergencyContact: boolean;
}

export interface HousingHandoverResponse {
  id: string;
  leaseId: string;
  handoverType: "move_in" | "move_out";
  status: string;
  handoverAt: string | null;
  meterReadings: ReadonlyArray<Record<string, unknown>>;
  itemSnapshot: ReadonlyArray<Record<string, unknown>>;
  credentials?: ReadonlyArray<Record<string, unknown>>;
  remark: string | null;
  damageAmount?: string;
  unsettledAmount?: string;
  depositDeductionAmount?: string;
}

/**
 * `GET /housing/leases/:id` embeds `photo_files` only when the actor has both
 * handover-domain read access and `file:read`. List-only unit/lease display
 * enrichment is not required at this boundary.
 */
export interface HousingEmbeddedHandoverResponse
  extends HousingHandoverResponse {
  photo_files?: PropertyWorkbenchFileRef[];
}

export interface HousingHandoverListItem extends HousingHandoverResponse {
  leaseCode: string;
  unitId: string;
  unitCode: string | null;
  unitName: string | null;
}

export type HousingHandoverListResponse =
  PaginatedResult<HousingHandoverListItem>;

export interface HousingHandoverDetailResponse
  extends HousingHandoverListItem {
  photo_files?: PropertyWorkbenchFileRef[];
}

export interface HousingChargePlanResponse {
  id: string;
  leaseId: string;
  chargeType: string;
  billingSource: string;
  cycleMonths: number;
  amount?: string | null;
  unitPrice?: string | null;
  meterId: string | null;
  enabled: boolean;
}

export interface HousingReceivableResponse {
  id: string;
  leaseId: string;
  chargeType: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  amount?: string;
  paidAmount?: string;
  waivedAmount?: string;
  status: string;
}

export interface HousingBillingListItem {
  lease: HousingLeaseListItem;
  charge_plans: HousingChargePlanResponse[];
  receivables: HousingReceivableResponse[];
}

export type HousingBillingListResponse =
  PaginatedResult<HousingBillingListItem>;

export interface HousingLedgerEntryResponse {
  id: string;
  leaseId: string;
  receivableId: string | null;
  entryType: string;
  chargeType: string;
  amount: string;
  paymentMethod: string | null;
  status: "confirmed" | "void";
  reason: string;
  occurredAt: string;
}

export interface HousingFinanceSummaryResponse {
  receivable: string;
  paid: string;
  waived: string;
  outstanding: string;
  deposit_balance: string;
}

export const HOUSING_FINANCE_RECEIVABLE_TYPES = ["ordinary", "deposit"] as const;
export type HousingFinanceReceivableType =
  typeof HOUSING_FINANCE_RECEIVABLE_TYPES[number];

export const HOUSING_FINANCE_ENTRY_KINDS = ["payment", "deposit_receipt"] as const;
export type HousingFinanceEntryKind =
  typeof HOUSING_FINANCE_ENTRY_KINDS[number];

export interface HousingFinanceReceivableRef {
  id: string;
  receivableType: HousingFinanceReceivableType;
  entryKind: HousingFinanceEntryKind;
  chargeType: string;
  lastPaymentRecorderId?: string | null;
  dueDate: string;
  amount: string;
  paidAmount: string;
  waivedAmount: string;
  balance: string;
  status: string;
}

export interface HousingFinanceListItem {
  lease: HousingLeaseListItem;
  summary: HousingFinanceSummaryResponse;
  receivables: HousingFinanceReceivableRef[];
}

export type HousingFinanceListResponse =
  PaginatedResult<HousingFinanceListItem>;

export interface HousingRepairSummaryResponse {
  id: string;
  woCode: string;
  title: string;
  priority: string;
  urgency: string | null;
  status: string;
  assigneeName: string | null;
  overdueFlag: boolean;
  createTime: string;
}

export type HousingRepairWorkOrderRef = Pick<
  HousingRepairSummaryResponse,
  "id" | "woCode" | "title" | "status"
>;

export interface HousingEnergyMeterCandidateQuery {
  keyword?: string;
  sort?: HousingEnergyMeterCandidateSort;
  order?: HousingSortOrder;
  page: number;
  page_size: number;
}

export interface HousingEnergyMeterCandidateResponse {
  id: string;
  meterCode: string;
  meterName: string;
  meterType: string;
  unit: string;
  multiplier: string;
}

export type HousingEnergyMeterCandidateListResponse =
  PaginatedResult<HousingEnergyMeterCandidateResponse>;

export interface HousingRepairListItem extends HousingRepairSummaryResponse {
  leaseId: string;
  leaseCode: string;
  unitId: string;
  unitCode: string | null;
  unitName: string | null;
}

export type HousingRepairListResponse =
  PaginatedResult<HousingRepairListItem>;

export interface HousingRepairDetailResponse extends HousingRepairListItem {
  description: string | null;
  evidence?: PropertyWorkbenchFileRef[];
}

export interface HousingPurchaseResponse {
  id: string;
  purchaseCode: string;
  unitId: string | null;
  vendorName: string;
  purchaseDate: string;
  costCategory: string;
  approvalStatus: string;
  paymentStatus: string;
  totalAmount?: string;
}

export interface HousingPurchaseListItem extends HousingPurchaseResponse {
  transferredItemCount: number;
  receiptFiles?: PropertyWorkbenchFileRef[];
}

export type HousingPurchaseListResponse =
  PaginatedResult<HousingPurchaseListItem>;

export interface HousingPurchaseItemResponse {
  id: string;
  itemName: string;
  quantity: string;
  unit: string | null;
  unitPrice?: string;
  amount?: string;
  transferredReceivableId: string | null;
}

export interface HousingPurchaseDetailResponse {
  purchase: HousingPurchaseResponse;
  items: HousingPurchaseItemResponse[];
  receiptFiles?: PropertyWorkbenchFileRef[];
}

export interface PartyRoleResponse {
  id: string;
  roleType: string;
  sourceType: string | null;
  sourceId: string | null;
  status: string;
  createTime: string;
}

export interface PartyListItemResponse {
  id: string;
  tenantId: string;
  parkId: string;
  partyType: string;
  displayName: string;
  sourceDomain: string | null;
  verificationStatus: string;
  consentStatus: string;
  currentConsentFactId?: string | null;
  processingRestrictedAt?: string | null;
  createTime: string;
  updateTime: string;
  version: number;
  remark: string | null;
  mobile?: string | null;
  email?: string | null;
  identityDocumentType?: string | null;
  identityNumberMasked?: string | null;
}

export const PARTY_IDENTITY_REVEAL_REASON_CODES = [
  "BUSINESS_OPERATION",
  "LEGAL_COMPLIANCE",
  "DISPUTE_HANDLING",
  "DATA_SUBJECT_REQUEST"
] as const;
export type PartyIdentityRevealReasonCode = typeof PARTY_IDENTITY_REVEAL_REASON_CODES[number];

export interface PartyIdentityRevealResponse {
  partyId: string;
  identityNumber: string;
}

export const PARTY_LIST_SORTS = [
  "displayName",
  "createTime",
  "verificationStatus"
] as const;
export type PartyListSort = typeof PARTY_LIST_SORTS[number];

export interface PartyListQuery {
  party_type?: string;
  keyword?: string | null;
  sort?: PartyListSort;
  order?: HousingSortOrder;
  page: number;
  page_size: number;
}

export type HousingTenantListQuery = PartyListQuery;

export type PartyListResponse = PaginatedResult<PartyListItemResponse>;

export interface PartyDetailResponse extends PartyListItemResponse {
  roles: PartyRoleResponse[];
}
