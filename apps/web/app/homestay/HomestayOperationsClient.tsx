"use client";

import type { PaginatedResult } from "@jinhu/shared";
import { SYSTEM_PERMISSIONS } from "@jinhu/shared";
import { CalendarDays, CheckCircle2, Hotel, RefreshCw, Sparkles, Users } from "lucide-react";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PermissionButton } from "../../components/auth/PermissionButton";
import { AttachmentList } from "../../components/files/AttachmentList";
import { FileUploader } from "../../components/files/FileUploader";
import { ApiError, apiRequest, createIdempotencyKey } from "../../lib/api-client";
import { useAuthUser } from "../../lib/auth-context";
import { getAccessToken } from "../../lib/authz";
import { addBusinessDateDays, businessDate } from "../../lib/business-date";
import { hasPermission } from "../../lib/permissions";
import type { UnitRow } from "../assets/units/types";
import {
  canMarkHomestayNoShow,
  clampPageToTotal,
  defaultHomestayRateForm,
  homestayAuthoritativeDraftsAfterRefresh,
  homestayBookingDetailCapabilities,
  homestayBookingUnitLabel,
  homestayRateFormFromCalendar,
  homestaySelectedRecordAfterRefresh,
  homestayTurnoverConsumablesPayload,
  homestayTurnoverUnitLabel,
  homestayUnitSelectionAfterLoad,
  isHomestayRateReadyForUnit,
  normalizeHomestayRequiredReason,
  type HomestayConsumableDraft,
  type HomestayRateCalendar
} from "./homestay-operations.logic";
import styles from "./homestay-operations.module.css";

interface Dashboard {
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

interface Booking {
  id: string;
  bookingCode: string;
  unitId: string;
  status: "draft" | "confirmed" | "checked_in" | "checked_out" | "cancelled" | "no_show";
  arrivalDate: string;
  departureDate: string;
  guestCount: number;
  roomAmount: string;
  totalAmount: string;
  sourceType: string;
  unitCode: string | null;
  unitName: string | null;
}

interface Turnover {
  id: string;
  bookingId: string;
  unitId: string;
  unitCode: string | null;
  unitName: string | null;
  status: "pending" | "cleaning" | "inspection" | "completed" | "exception";
  assigneeName: string | null;
  photoFileIds: string[];
  consumables: Array<{ name: string; quantity: number; unit?: string }>;
  exceptionDescription: string | null;
  linkedWorkOrderId: string | null;
}

interface StayCredential {
  id: string;
  credentialType: "key" | "card" | "voucher";
  credentialLabel: string;
  status: "issued" | "returned" | "lost" | "void";
}

interface BookingGuest {
  id: string;
  partyId: string;
  isPrimary: boolean;
  verificationStatus: "unverified" | "verified" | "rejected";
}

interface BookingDetail {
  booking: Omit<Booking, "unitCode" | "unitName">;
  guests: BookingGuest[];
  credentials: StayCredential[];
  ledger_summary: {
    charges: string;
    payments: string;
    refunds: string;
    waivers: string;
    balance: string;
  } | null;
}

interface RoomState {
  unit_id: string;
  unit_code: string;
  unit_name: string;
  operation_mode: string | null;
  room_state: "available" | "occupied" | "turnover" | "mode_unavailable" | "out_of_service";
}

interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
}

type OptionalLoad<T> = { data: T } | { error: string } | null;
type BookingTerminationAction = "cancel" | "no-show";

const BOOKING_PAGE_SIZE = 20;
const UNIT_PAGE_SIZE = 20;
const TURNOVER_PAGE_SIZE = 20;
const emptyPageMeta = (): PageMeta => ({ page: 1, pageSize: BOOKING_PAGE_SIZE, total: 0 });
const emptyUnitPageMeta = (): PageMeta => ({ page: 1, pageSize: UNIT_PAGE_SIZE, total: 0 });
const emptyTurnoverPageMeta = (): PageMeta => ({ page: 1, pageSize: TURNOVER_PAGE_SIZE, total: 0 });
const defaultFinanceForm = (entryType = "payment") => ({
  entryType,
  amount: "0",
  paymentMethod: "cash",
  reason: entryType === "waiver" ? "人工减免" : "人工收款登记"
});
const defaultRateOverrideForm = () => ({
  businessDate: today(),
  dailyRate: "",
  reason: ""
});

function PaginationControls({
  meta,
  disabled,
  onPageChange
}: {
  meta: PageMeta;
  disabled: boolean;
  onPageChange(page: number): void;
}) {
  const totalPages = Math.max(1, Math.ceil(meta.total / meta.pageSize));
  return (
    <span className="pagination-actions">
      <span>共 {meta.total} 条，第 {meta.page}/{totalPages} 页</span>
      <button className="pagination-button" type="button" disabled={disabled || meta.page <= 1} onClick={() => onPageChange(meta.page - 1)}>上一页</button>
      <button className="pagination-button" type="button" disabled={disabled || meta.page >= totalPages} onClick={() => onPageChange(meta.page + 1)}>下一页</button>
    </span>
  );
}

async function loadOptional<T>(
  enabled: boolean,
  loader: () => Promise<{ data: T }>
): Promise<OptionalLoad<T>> {
  if (!enabled) return null;
  try {
    return { data: (await loader()).data };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "数据加载失败" };
  }
}

const emptyDashboard: Dashboard = {
  business_date: "",
  arrivals: 0,
  departures: 0,
  occupied: 0,
  rentable_units: 0,
  occupancy_rate: "0.00",
  average_daily_rate: "0.00",
  pending_turnovers: 0,
  revenue: "0.00"
};
const isPositiveMoney = (value: string) =>
  /^(?=.*[1-9])(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/.test(value.trim());

const today = () => businessDate();
const tomorrow = () => addBusinessDateDays(today(), 1);

export function HomestayOperationsClient() {
  const user = useAuthUser();
  const canReadDashboard = hasPermission(user, SYSTEM_PERMISSIONS.HOMESTAY_DASHBOARD_READ);
  const canReadBookings = hasPermission(user, SYSTEM_PERMISSIONS.HOMESTAY_BOOKING_READ);
  const canCreateBookings = hasPermission(user, SYSTEM_PERMISSIONS.HOMESTAY_BOOKING_CREATE);
  const canRescheduleBookings = hasPermission(user, SYSTEM_PERMISSIONS.HOMESTAY_BOOKING_RESCHEDULE);
  const canReadFinance = hasPermission(user, SYSTEM_PERMISSIONS.HOMESTAY_FINANCE_READ);
  const canManageStay = hasPermission(user, SYSTEM_PERMISSIONS.HOMESTAY_STAY_MANAGE);
  const canRegisterFinance = hasPermission(user, SYSTEM_PERMISSIONS.HOMESTAY_FINANCE_REGISTER);
  const canWaiveFinance = hasPermission(user, SYSTEM_PERMISSIONS.HOMESTAY_FINANCE_WAIVE);
  const canReadRates = hasPermission(user, SYSTEM_PERMISSIONS.HOMESTAY_RATE_READ);
  const canManageRates = hasPermission(user, SYSTEM_PERMISSIONS.HOMESTAY_RATE_MANAGE);
  const canReadTurnovers = hasPermission(user, SYSTEM_PERMISSIONS.HOMESTAY_TURNOVER_READ);
  const canExecuteTurnovers = hasPermission(user, SYSTEM_PERMISSIONS.HOMESTAY_TURNOVER_EXECUTE);
  const canUploadTurnoverEvidence =
    canExecuteTurnovers && hasPermission(user, SYSTEM_PERMISSIONS.FILE_UPLOAD);
  const canReadTurnoverEvidence =
    canReadTurnovers && hasPermission(user, SYSTEM_PERMISSIONS.FILE_READ);
  const canReadRateUnitCandidates = canReadRates || canManageRates;
  const canReadBookingUnitCandidates = canReadBookings || canCreateBookings;
  const [dashboard, setDashboard] = useState(emptyDashboard);
  const [rateUnits, setRateUnits] = useState<UnitRow[]>([]);
  const [bookingUnits, setBookingUnits] = useState<UnitRow[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [turnovers, setTurnovers] = useState<Turnover[]>([]);
  const [roomStates, setRoomStates] = useState<RoomState[]>([]);
  const [guests, setGuests] = useState<BookingGuest[]>([]);
  const [credentials, setCredentials] = useState<StayCredential[]>([]);
  const [ledgerSummary, setLedgerSummary] = useState<BookingDetail["ledger_summary"] | null>(null);
  const [message, setMessage] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [loading, setLoading] = useState(false);
  const [financeSubmitting, setFinanceSubmitting] = useState(false);
  const [rateLoading, setRateLoading] = useState(false);
  const [rateSubmitting, setRateSubmitting] = useState(false);
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [guestSubmitting, setGuestSubmitting] = useState(false);
  const [loadedRateUnitId, setLoadedRateUnitId] = useState("");
  const [credentialSubmitting, setCredentialSubmitting] = useState(false);
  const [credentialReturningId, setCredentialReturningId] = useState("");
  const [rateUnitPage, setRateUnitPage] = useState(emptyUnitPageMeta);
  const [bookingUnitPage, setBookingUnitPage] = useState(emptyUnitPageMeta);
  const [bookingPage, setBookingPage] = useState(emptyPageMeta);
  const [turnoverPage, setTurnoverPage] = useState(emptyTurnoverPageMeta);
  const [selectedBookingId, setSelectedBookingId] = useState("");
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [guestPartyId, setGuestPartyId] = useState("");
  const [credentialType, setCredentialType] = useState<StayCredential["credentialType"]>("card");
  const [credentialLabel, setCredentialLabel] = useState("前台门卡");
  const [rateForm, setRateForm] = useState(defaultHomestayRateForm);
  const [rateOverrideForm, setRateOverrideForm] = useState(defaultRateOverrideForm);
  const [bookingForm, setBookingForm] = useState({
    unitId: "",
    arrivalDate: today(),
    departureDate: tomorrow(),
    guestCount: "1",
    sourceType: "direct"
  });
  const [turnoverAttachmentRefresh, setTurnoverAttachmentRefresh] = useState<Record<string, number>>({});
  const [turnoverWorkOrders, setTurnoverWorkOrders] = useState<Record<string, string>>({});
  const [turnoverExceptions, setTurnoverExceptions] = useState<Record<string, string>>({});
  const [turnoverConsumables, setTurnoverConsumables] = useState<
    Record<string, HomestayConsumableDraft[]>
  >({});
  const [pendingBookingTermination, setPendingBookingTermination] = useState<{
    booking: Booking;
    action: BookingTerminationAction;
  } | null>(null);
  const [bookingTerminationReason, setBookingTerminationReason] = useState("");
  const [pendingReschedule, setPendingReschedule] = useState<Booking | null>(null);
  const [rescheduleForm, setRescheduleForm] = useState({
    arrivalDate: today(),
    departureDate: tomorrow(),
    reason: ""
  });
  const [financeForm, setFinanceForm] = useState(defaultFinanceForm);
  const [bookingDetailRefreshVersion, setBookingDetailRefreshVersion] = useState(0);
  const [rateRefreshVersion, setRateRefreshVersion] = useState(0);
  const [turnoverSubmittingTaskId, setTurnoverSubmittingTaskId] = useState("");
  const refreshSequence = useRef(0);
  const rateLoadSequence = useRef(0);
  const selectedRateUnitIdRef = useRef("");
  const loadedRateUnitIdRef = useRef("");
  const rateSubmissionLock = useRef(false);
  const rateSubmissionKey = useRef<string | null>(null);
  const rateSubmissionSignature = useRef("");
  const overrideSubmissionKey = useRef<string | null>(null);
  const overrideSubmissionSignature = useRef("");
  const bookingSubmissionLock = useRef(false);
  const bookingSubmissionKey = useRef<string | null>(null);
  const bookingSubmissionSignature = useRef("");
  const guestSubmissionLock = useRef(false);
  const guestSubmissionKey = useRef<string | null>(null);
  const guestSubmissionSignature = useRef("");
  const bookingDetailSequence = useRef(0);
  const selectedBookingIdRef = useRef("");
  const selectedBookingRef = useRef<Booking | null>(null);
  const turnoverConsumablesDirty = useRef(new Set<string>());
  const turnoverExceptionsDirty = useRef(new Set<string>());
  const turnoverWorkOrdersDirty = useRef(new Set<string>());
  const financeSubmissionLock = useRef(false);
  const financeSubmissionKey = useRef<string | null>(null);
  const financeSubmissionSignature = useRef("");
  const credentialSubmissionLock = useRef(false);
  const credentialSubmissionKey = useRef<string | null>(null);
  const credentialSubmissionSignature = useRef("");
  const credentialReturnLock = useRef(false);
  const credentialReturnKey = useRef<string | null>(null);
  const credentialReturnSignature = useRef("");
  const bookingActionLock = useRef(false);
  const bookingActionKey = useRef<string | null>(null);
  const bookingActionSignature = useRef("");
  const turnoverActionLock = useRef(false);
  const turnoverActionKey = useRef<string | null>(null);
  const turnoverActionSignature = useRef("");

  const rateUnitName = useMemo(
    () => new Map(rateUnits.map((unit) => [unit.id, `${unit.unitCode} · ${unit.unitName}`])),
    [rateUnits]
  );
  const bookingUnitName = useMemo(
    () => new Map(bookingUnits.map((unit) => [unit.id, `${unit.unitCode} · ${unit.unitName}`])),
    [bookingUnits]
  );
  const bookingDetailCapabilities = selectedBooking
    ? homestayBookingDetailCapabilities(selectedBooking.status, {
      readBooking: canReadBookings,
      manageStay: canManageStay,
      readFinance: canReadFinance,
      registerFinance: canRegisterFinance,
      waiveFinance: canWaiveFinance
    })
    : null;
  const rateReady = isHomestayRateReadyForUnit(
    loadedRateUnitId,
    rateForm.unitId,
    rateLoading || rateSubmitting
  );

  const resetBookingBoundDrafts = useCallback(() => {
    setGuestPartyId("");
    setCredentialType("card");
    setCredentialLabel("前台门卡");
    setFinanceForm(defaultFinanceForm(canRegisterFinance ? "payment" : "waiver"));
    setPendingBookingTermination(null);
    setBookingTerminationReason("");
    setPendingReschedule(null);
    setRescheduleForm({
      arrivalDate: today(),
      departureDate: tomorrow(),
      reason: ""
    });
  }, [canRegisterFinance]);

  const clearBookingContext = useCallback(() => {
    bookingDetailSequence.current += 1;
    selectedBookingIdRef.current = "";
    selectedBookingRef.current = null;
    setSelectedBookingId("");
    setSelectedBooking(null);
    resetBookingBoundDrafts();
    setGuests([]);
    setCredentials([]);
    setLedgerSummary(null);
    setDetailError("");
  }, [resetBookingBoundDrafts]);

  const refresh = useCallback(async () => {
    const sequence = refreshSequence.current + 1;
    refreshSequence.current = sequence;
    setLoading(true);
    try {
      const token = getAccessToken();
      const [
        dashboardResponse,
        rateUnitsResponse,
        bookingUnitsResponse,
        bookingsResponse,
        turnoversResponse,
        roomStateResponse
      ] = await Promise.all([
        loadOptional(canReadDashboard, () => apiRequest<Dashboard>("/homestay/dashboard", { token })),
        loadOptional(canReadRateUnitCandidates, () => apiRequest<PaginatedResult<UnitRow>>(
          `/homestay/unit-candidates?page=${rateUnitPage.page}&page_size=${UNIT_PAGE_SIZE}`,
          { token }
        )),
        loadOptional(canReadBookingUnitCandidates, () => apiRequest<PaginatedResult<UnitRow>>(
          `/homestay/unit-candidates?page=${bookingUnitPage.page}&page_size=${UNIT_PAGE_SIZE}`,
          { token }
        )),
        loadOptional(canReadBookings, () => apiRequest<PaginatedResult<Booking>>(
          `/homestay/bookings?page=${bookingPage.page}&page_size=${BOOKING_PAGE_SIZE}`,
          { token }
        )),
        loadOptional(canReadTurnovers, () => apiRequest<PaginatedResult<Turnover>>(
          `/homestay/turnovers?status=open&page=${turnoverPage.page}&page_size=${TURNOVER_PAGE_SIZE}`,
          { token }
        )),
        loadOptional(canReadBookings, () => apiRequest<RoomState[]>(
          `/homestay/availability?date_from=${today()}&date_to=${tomorrow()}`,
          { token }
        ))
      ]);
      if (refreshSequence.current !== sequence) return;
      const errors = [
        dashboardResponse,
        rateUnitsResponse,
        bookingUnitsResponse,
        bookingsResponse,
        turnoversResponse,
        roomStateResponse
      ]
        .flatMap((result) => result && "error" in result ? [result.error] : []);
      setRefreshError(errors.length ? `部分数据加载失败：${errors.join("；")}` : "");

      if (!dashboardResponse) setDashboard(emptyDashboard);
      else if ("data" in dashboardResponse) setDashboard(dashboardResponse.data);
      if (!rateUnitsResponse) {
        setRateUnits([]);
        setRateUnitPage(emptyUnitPageMeta());
        setRateForm((current) => ({ ...current, unitId: "" }));
      }
      else if ("data" in rateUnitsResponse) {
        const availableUnits = rateUnitsResponse.data.items;
        const loadedUnitIds = availableUnits.map((unit) => unit.id);
        setRateUnits(availableUnits);
        setRateUnitPage({
          page: rateUnitsResponse.data.page,
          pageSize: rateUnitsResponse.data.page_size,
          total: rateUnitsResponse.data.total
        });
        setRateForm((current) => ({
          ...current,
          unitId: homestayUnitSelectionAfterLoad(current.unitId, loadedUnitIds)
        }));
        if (selectedRateUnitIdRef.current) {
          setRateRefreshVersion((current) => current + 1);
        }
      }
      if (!bookingUnitsResponse) {
        setBookingUnits([]);
        setBookingUnitPage(emptyUnitPageMeta());
        setBookingForm((current) => ({ ...current, unitId: "" }));
      }
      else if ("data" in bookingUnitsResponse) {
        const availableUnits = bookingUnitsResponse.data.items;
        const loadedUnitIds = availableUnits.map((unit) => unit.id);
        setBookingUnits(availableUnits);
        setBookingUnitPage({
          page: bookingUnitsResponse.data.page,
          pageSize: bookingUnitsResponse.data.page_size,
          total: bookingUnitsResponse.data.total
        });
        setBookingForm((current) => ({
          ...current,
          unitId: homestayUnitSelectionAfterLoad(current.unitId, loadedUnitIds)
        }));
      }
      if (!bookingsResponse) {
        setBookings([]);
        setBookingPage(emptyPageMeta());
        clearBookingContext();
      } else if ("data" in bookingsResponse) {
        setBookings(bookingsResponse.data.items);
        setBookingPage({
          page: bookingsResponse.data.page,
          pageSize: bookingsResponse.data.page_size,
          total: bookingsResponse.data.total
        });
        const refreshedSelection = homestaySelectedRecordAfterRefresh(
          selectedBookingRef.current,
          bookingsResponse.data.items
        );
        selectedBookingRef.current = refreshedSelection;
        setSelectedBooking(refreshedSelection);
        if (selectedBookingIdRef.current) {
          setBookingDetailRefreshVersion((current) => current + 1);
        }
      }
      if (!turnoversResponse) {
        setTurnovers([]);
        setTurnoverPage(emptyTurnoverPageMeta());
      } else if ("data" in turnoversResponse) {
        const clampedPage = clampPageToTotal(
          turnoversResponse.data.page,
          turnoversResponse.data.page_size,
          turnoversResponse.data.total
        );
        setTurnovers(clampedPage === turnoversResponse.data.page ? turnoversResponse.data.items : []);
        const authoritativeExceptions = Object.fromEntries(
          turnoversResponse.data.items.map((task) => [task.id, task.exceptionDescription ?? ""])
        );
        const authoritativeConsumables = Object.fromEntries(
          turnoversResponse.data.items.map((task) => [
            task.id,
            (task.consumables ?? []).map((item) => ({
              name: item.name,
              quantity: String(item.quantity),
              unit: item.unit ?? ""
            }))
          ])
        );
        const authoritativeWorkOrders = Object.fromEntries(
          turnoversResponse.data.items.map((task) => [task.id, task.linkedWorkOrderId ?? ""])
        );
        setTurnoverExceptions((current) => homestayAuthoritativeDraftsAfterRefresh(
          current,
          authoritativeExceptions,
          turnoverExceptionsDirty.current
        ));
        setTurnoverConsumables((current) => homestayAuthoritativeDraftsAfterRefresh(
          current,
          authoritativeConsumables,
          turnoverConsumablesDirty.current
        ));
        setTurnoverWorkOrders((current) => homestayAuthoritativeDraftsAfterRefresh(
          current,
          authoritativeWorkOrders,
          turnoverWorkOrdersDirty.current
        ));
        setTurnoverPage({
          page: clampedPage,
          pageSize: turnoversResponse.data.page_size,
          total: turnoversResponse.data.total
        });
      }
      if (!roomStateResponse) setRoomStates([]);
      else if ("data" in roomStateResponse) setRoomStates(roomStateResponse.data);
    } finally {
      if (refreshSequence.current === sequence) setLoading(false);
    }
  }, [
    bookingPage.page,
    canReadBookings,
    canReadDashboard,
    canReadTurnovers,
    canReadBookingUnitCandidates,
    canReadRateUnitCandidates,
    clearBookingContext,
    bookingUnitPage.page,
    rateUnitPage.page,
    turnoverPage.page,
  ]);

  const loadRate = useCallback(async (unitId: string, overrideDate: string) => {
    const sequence = rateLoadSequence.current + 1;
    rateLoadSequence.current = sequence;
    selectedRateUnitIdRef.current = unitId;
    loadedRateUnitIdRef.current = "";
    setLoadedRateUnitId("");
    if (!canReadRates || !unitId) {
      setRateForm(defaultHomestayRateForm());
      setRateLoading(false);
      return;
    }
    setRateLoading(true);
    try {
      const response = await apiRequest<HomestayRateCalendar>(
        `/homestay/rates/${unitId}?date_from=${overrideDate}&date_to=${addBusinessDateDays(overrideDate, 1)}`,
        { token: getAccessToken() }
      );
      if (rateLoadSequence.current !== sequence || selectedRateUnitIdRef.current !== unitId) return;
      setRateForm(homestayRateFormFromCalendar(unitId, response.data));
      setRateOverrideForm((current) => ({
        ...current,
        dailyRate: response.data.days.find((day) => day.business_date === overrideDate)?.override_rate ?? ""
      }));
      loadedRateUnitIdRef.current = unitId;
      setLoadedRateUnitId(unitId);
    } catch (error) {
      if (rateLoadSequence.current !== sequence || selectedRateUnitIdRef.current !== unitId) return;
      if (error instanceof ApiError && error.status === 404) {
        setRateForm(defaultHomestayRateForm(unitId));
        setRateOverrideForm((current) => ({ ...current, dailyRate: "" }));
        loadedRateUnitIdRef.current = unitId;
        setLoadedRateUnitId(unitId);
      } else {
        setMessage(error instanceof Error ? error.message : "加载房源价格规则失败");
      }
    } finally {
      if (rateLoadSequence.current === sequence) setRateLoading(false);
    }
  }, [canReadRates]);

  const loadBookingDetail = useCallback(async (bookingId: string, bookingSnapshot?: Booking) => {
    const sequence = bookingDetailSequence.current + 1;
    bookingDetailSequence.current = sequence;
    const targetChanged = selectedBookingIdRef.current !== bookingId;
    if (targetChanged) resetBookingBoundDrafts();
    selectedBookingIdRef.current = bookingId;
    if (bookingSnapshot) {
      selectedBookingRef.current = bookingSnapshot;
      setSelectedBooking(bookingSnapshot);
    }
    setSelectedBookingId(bookingId);
    setGuests([]);
    setCredentials([]);
    setLedgerSummary(null);
    setDetailError("");
    try {
      const response = await apiRequest<BookingDetail>(`/homestay/bookings/${bookingId}`, {
        token: getAccessToken()
      });
      if (
        bookingDetailSequence.current !== sequence
        || selectedBookingIdRef.current !== bookingId
      ) return;
      const currentBooking = selectedBookingRef.current;
      const refreshedBooking: Booking = {
        ...(currentBooking ?? bookingSnapshot ?? response.data.booking),
        ...response.data.booking,
        unitCode: currentBooking?.unitCode ?? bookingSnapshot?.unitCode ?? null,
        unitName: currentBooking?.unitName ?? bookingSnapshot?.unitName ?? null
      };
      selectedBookingRef.current = refreshedBooking;
      setSelectedBooking(refreshedBooking);
      setGuests(response.data.guests);
      setCredentials(response.data.credentials);
      setLedgerSummary(response.data.ledger_summary);
      setDetailError("");
    } catch (error) {
      if (
        bookingDetailSequence.current !== sequence
        || selectedBookingIdRef.current !== bookingId
      ) return;
      setDetailError(error instanceof Error ? error.message : "加载民宿订单详情失败");
    }
  }, [resetBookingBoundDrafts]);

  useEffect(() => {
    setFinanceForm((current) => {
      const currentAllowed = current.entryType === "waiver"
        ? canWaiveFinance
        : canRegisterFinance;
      if (currentAllowed) return current;
      if (canRegisterFinance) return { ...current, entryType: "payment" };
      if (canWaiveFinance) return { ...current, entryType: "waiver" };
      return current;
    });
  }, [canRegisterFinance, canWaiveFinance]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (canReadRates) {
      void loadRate(rateForm.unitId, rateOverrideForm.businessDate);
    } else {
      rateLoadSequence.current += 1;
      setRateLoading(false);
      selectedRateUnitIdRef.current = "";
      loadedRateUnitIdRef.current = "";
      setLoadedRateUnitId("");
    }
  }, [canReadRates, loadRate, rateForm.unitId, rateOverrideForm.businessDate, rateRefreshVersion]);

  useEffect(() => {
    if (bookingDetailRefreshVersion === 0 || !selectedBookingIdRef.current) return;
    void loadBookingDetail(selectedBookingIdRef.current, selectedBookingRef.current ?? undefined);
  }, [bookingDetailRefreshVersion, loadBookingDetail]);

  function changeRateUnit(unitId: string) {
    rateLoadSequence.current += 1;
    selectedRateUnitIdRef.current = unitId;
    loadedRateUnitIdRef.current = "";
    setLoadedRateUnitId("");
    setRateLoading(Boolean(unitId));
    setRateForm(defaultHomestayRateForm(unitId));
    setRateOverrideForm((current) => ({ ...current, dailyRate: "", reason: "" }));
  }

  function changeRateOverrideDate(businessDateValue: string) {
    rateLoadSequence.current += 1;
    loadedRateUnitIdRef.current = "";
    setLoadedRateUnitId("");
    setRateLoading(Boolean(rateForm.unitId && businessDateValue));
    setRateOverrideForm({
      businessDate: businessDateValue,
      dailyRate: "",
      reason: ""
    });
  }

  async function saveRate(event: FormEvent) {
    event.preventDefault();
    if (
      !canManageRates
      || rateSubmissionLock.current
      || !isHomestayRateReadyForUnit(loadedRateUnitIdRef.current, rateForm.unitId, rateLoading)
    ) return;
    const payload = {
      base_daily_rate: rateForm.baseDailyRate,
      free_cancel_before_hours: Number(rateForm.freeCancelHours),
      late_cancel_fee_type: rateForm.feeType,
      late_cancel_fee_value: rateForm.feeValue,
      checkout_requires_inspection: rateForm.requiresInspection
    };
    const signature = JSON.stringify({ unitId: rateForm.unitId, ...payload });
    if (!rateSubmissionKey.current || rateSubmissionSignature.current !== signature) {
      rateSubmissionKey.current = createIdempotencyKey("homestay-rate");
      rateSubmissionSignature.current = signature;
    }
    rateSubmissionLock.current = true;
    setRateSubmitting(true);
    try {
      const succeeded = await runAction("基础日价已保存", () =>
        apiRequest(`/homestay/rates/${rateForm.unitId}`, {
          method: "PUT",
          token: getAccessToken(),
          idempotencyKey: rateSubmissionKey.current!,
          body: payload
        })
      );
      if (succeeded) {
        rateSubmissionKey.current = null;
        rateSubmissionSignature.current = "";
      }
    } finally {
      rateSubmissionLock.current = false;
      setRateSubmitting(false);
    }
  }

  async function saveRateOverride() {
    if (
      !canManageRates
      || rateSubmissionLock.current
      || !isHomestayRateReadyForUnit(loadedRateUnitIdRef.current, rateForm.unitId, rateLoading)
      || !rateOverrideForm.businessDate
      || !isPositiveMoney(rateOverrideForm.dailyRate)
      || !normalizeHomestayRequiredReason(rateOverrideForm.reason, 500)
    ) return;
    const payload = {
      business_date: rateOverrideForm.businessDate,
      daily_rate: rateOverrideForm.dailyRate,
      reason: rateOverrideForm.reason.trim()
    };
    const signature = JSON.stringify({ unitId: rateForm.unitId, ...payload });
    if (!overrideSubmissionKey.current || overrideSubmissionSignature.current !== signature) {
      overrideSubmissionKey.current = createIdempotencyKey("homestay-rate-override");
      overrideSubmissionSignature.current = signature;
    }
    rateSubmissionLock.current = true;
    setRateSubmitting(true);
    try {
      const succeeded = await runAction("日期覆盖价已保存", () =>
        apiRequest(`/homestay/rates/${rateForm.unitId}/overrides`, {
          method: "POST",
          token: getAccessToken(),
          idempotencyKey: overrideSubmissionKey.current!,
          body: payload
        })
      );
      if (succeeded) {
        overrideSubmissionKey.current = null;
        overrideSubmissionSignature.current = "";
        setRateOverrideForm((current) => ({ ...current, reason: "" }));
      }
    } finally {
      rateSubmissionLock.current = false;
      setRateSubmitting(false);
    }
  }

  async function createBooking(event: FormEvent) {
    event.preventDefault();
    if (bookingSubmissionLock.current) return;
    const payload = {
      unit_id: bookingForm.unitId,
      arrival_date: bookingForm.arrivalDate,
      departure_date: bookingForm.departureDate,
      guest_count: Number(bookingForm.guestCount),
      source_type: bookingForm.sourceType
    };
    const signature = JSON.stringify(payload);
    if (!bookingSubmissionKey.current || bookingSubmissionSignature.current !== signature) {
      bookingSubmissionKey.current = createIdempotencyKey("homestay-booking");
      bookingSubmissionSignature.current = signature;
    }
    bookingSubmissionLock.current = true;
    setBookingSubmitting(true);
    try {
      const succeeded = await runAction("订单草稿已创建并临时锁房 30 分钟", () =>
        apiRequest("/homestay/bookings", {
          method: "POST",
          token: getAccessToken(),
          idempotencyKey: bookingSubmissionKey.current!,
          body: payload
        })
      );
      if (succeeded) {
        bookingSubmissionKey.current = null;
        bookingSubmissionSignature.current = "";
      } else {
        // A lost response may still mean the booking committed. Keep the retry key
        // and refresh the operational list so the held room is visible immediately.
        await refresh();
      }
    } finally {
      bookingSubmissionLock.current = false;
      setBookingSubmitting(false);
    }
  }

  async function bookingAction(
    booking: Booking,
    action: "confirm" | "check-in" | "check-out" | BookingTerminationAction,
    reason?: string
  ) {
    if (bookingActionLock.current) return false;
    const destructive = action === "cancel" || action === "no-show";
    const normalizedReason = destructive
      ? normalizeHomestayRequiredReason(reason ?? "", 500)
      : null;
    if (destructive && !normalizedReason) {
      setMessage("请填写 1—500 字的真实业务原因后再确认操作");
      return false;
    }
    const body = destructive ? { reason: normalizedReason } : undefined;
    const signature = JSON.stringify({ bookingId: booking.id, action, body });
    if (!bookingActionKey.current || bookingActionSignature.current !== signature) {
      bookingActionKey.current = createIdempotencyKey(`homestay-${action}`);
      bookingActionSignature.current = signature;
    }
    bookingActionLock.current = true;
    try {
      const succeeded = await runAction(`订单操作已完成：${action}`, () =>
        apiRequest(`/homestay/bookings/${booking.id}/${action}`, {
          method: "POST",
          token: getAccessToken(),
          idempotencyKey: bookingActionKey.current!,
          body
        })
      );
      if (succeeded) {
        bookingActionKey.current = null;
        bookingActionSignature.current = "";
        if (selectedBookingIdRef.current === booking.id) {
          await loadBookingDetail(booking.id);
        }
      }
      return succeeded;
    } finally {
      bookingActionLock.current = false;
    }
  }

  function openBookingTermination(booking: Booking, action: BookingTerminationAction) {
    setPendingBookingTermination({ booking, action });
    setBookingTerminationReason("");
    setMessage("");
  }

  async function confirmBookingTermination(event: FormEvent) {
    event.preventDefault();
    if (!pendingBookingTermination) return;
    const succeeded = await bookingAction(
      pendingBookingTermination.booking,
      pendingBookingTermination.action,
      bookingTerminationReason
    );
    if (succeeded) {
      setPendingBookingTermination(null);
      setBookingTerminationReason("");
    }
  }

  function openReschedule(booking: Booking) {
    setPendingReschedule(booking);
    setRescheduleForm({
      arrivalDate: booking.arrivalDate,
      departureDate: booking.departureDate,
      reason: ""
    });
    setMessage("");
  }

  async function confirmReschedule(event: FormEvent) {
    event.preventDefault();
    if (!pendingReschedule || bookingActionLock.current) return;
    const reason = normalizeHomestayRequiredReason(rescheduleForm.reason, 500);
    if (!reason || rescheduleForm.departureDate <= rescheduleForm.arrivalDate) {
      setMessage("请填写有效的新入住、退房日期和真实改期原因");
      return;
    }
    const booking = pendingReschedule;
    const payload = {
      arrival_date: rescheduleForm.arrivalDate,
      departure_date: rescheduleForm.departureDate,
      reason
    };
    const signature = JSON.stringify({ bookingId: booking.id, action: "reschedule", payload });
    if (!bookingActionKey.current || bookingActionSignature.current !== signature) {
      bookingActionKey.current = createIdempotencyKey("homestay-reschedule");
      bookingActionSignature.current = signature;
    }
    bookingActionLock.current = true;
    try {
      const succeeded = await runAction("订单改期已完成，房价差额已重新计算", () =>
        apiRequest(`/homestay/bookings/${booking.id}/reschedule`, {
          method: "POST",
          token: getAccessToken(),
          idempotencyKey: bookingActionKey.current!,
          body: payload
        })
      );
      if (succeeded) {
        bookingActionKey.current = null;
        bookingActionSignature.current = "";
        setPendingReschedule(null);
      }
    } finally {
      bookingActionLock.current = false;
    }
  }

  async function addGuest() {
    if (!selectedBookingId || !guestPartyId || guestSubmissionLock.current) return;
    const bookingId = selectedBookingId;
    const payload = { party_id: guestPartyId, is_primary: guests.length === 0, verification_status: "verified" };
    const signature = JSON.stringify({ bookingId, ...payload });
    if (!guestSubmissionKey.current || guestSubmissionSignature.current !== signature) {
      guestSubmissionKey.current = createIdempotencyKey("homestay-guest");
      guestSubmissionSignature.current = signature;
    }
    guestSubmissionLock.current = true;
    setGuestSubmitting(true);
    try {
      const succeeded = await runAction("实名入住人已登记", () =>
        apiRequest(`/homestay/bookings/${bookingId}/guests`, {
          method: "POST",
          token: getAccessToken(),
          idempotencyKey: guestSubmissionKey.current!,
          body: payload
        })
      );
      if (succeeded) {
        guestSubmissionKey.current = null;
        guestSubmissionSignature.current = "";
        if (selectedBookingIdRef.current === bookingId) setGuestPartyId("");
      }
    } finally {
      guestSubmissionLock.current = false;
      setGuestSubmitting(false);
    }
  }

  async function issueCredential() {
    if (
      !selectedBookingId
      || !credentialLabel.trim()
      || credentialSubmissionLock.current
    ) return;
    const originatingBookingId = selectedBookingId;
    const payload = {
      credential_type: credentialType,
      credential_label: credentialLabel.trim()
    };
    const submissionSignature = JSON.stringify({ originatingBookingId, ...payload });
    if (
      !credentialSubmissionKey.current
      || credentialSubmissionSignature.current !== submissionSignature
    ) {
      credentialSubmissionKey.current = createIdempotencyKey("homestay-credential");
      credentialSubmissionSignature.current = submissionSignature;
    }
    credentialSubmissionLock.current = true;
    setCredentialSubmitting(true);
    try {
      const succeeded = await runAction("入住凭证已人工发放", () =>
        apiRequest(`/homestay/bookings/${originatingBookingId}/credentials`, {
          method: "POST",
          token: getAccessToken(),
          idempotencyKey: credentialSubmissionKey.current!,
          body: payload
        })
      );
      if (succeeded) {
        credentialSubmissionKey.current = null;
        credentialSubmissionSignature.current = "";
        if (selectedBookingIdRef.current === originatingBookingId) {
          await loadBookingDetail(originatingBookingId);
        }
      }
    } finally {
      credentialSubmissionLock.current = false;
      setCredentialSubmitting(false);
    }
  }

  async function returnCredential(credentialId: string) {
    if (!selectedBookingId || credentialReturnLock.current) return;
    const originatingBookingId = selectedBookingId;
    const submissionSignature = `${originatingBookingId}:${credentialId}`;
    if (!credentialReturnKey.current || credentialReturnSignature.current !== submissionSignature) {
      credentialReturnKey.current = createIdempotencyKey("homestay-credential-return");
      credentialReturnSignature.current = submissionSignature;
    }
    credentialReturnLock.current = true;
    setCredentialReturningId(credentialId);
    try {
      const succeeded = await runAction("入住凭证已回收", () =>
        apiRequest(`/homestay/bookings/${originatingBookingId}/credentials/${credentialId}/return`, {
          method: "POST",
          token: getAccessToken(),
          idempotencyKey: credentialReturnKey.current!
        })
      );
      if (succeeded) {
        credentialReturnKey.current = null;
        credentialReturnSignature.current = "";
        if (selectedBookingIdRef.current === originatingBookingId) {
          await loadBookingDetail(originatingBookingId);
        }
      }
    } finally {
      credentialReturnLock.current = false;
      setCredentialReturningId("");
    }
  }

  async function registerFinance() {
    const entryAllowed = financeForm.entryType === "waiver"
      ? canWaiveFinance
      : canRegisterFinance;
    if (
      !selectedBookingId
      || !entryAllowed
      || !isPositiveMoney(financeForm.amount)
      || financeSubmissionLock.current
    ) return;
    const originatingBookingId = selectedBookingId;
    const payload = {
      entry_type: financeForm.entryType,
      charge_type: financeForm.entryType === "payment" ? "room_collection" : "manual_adjustment",
      amount: financeForm.amount,
      payment_method: financeForm.entryType === "payment" ? financeForm.paymentMethod : undefined,
      reason: financeForm.reason
    };
    const submissionSignature = JSON.stringify({ bookingId: originatingBookingId, ...payload });
    if (!financeSubmissionKey.current || financeSubmissionSignature.current !== submissionSignature) {
      financeSubmissionKey.current = createIdempotencyKey("homestay-ledger");
      financeSubmissionSignature.current = submissionSignature;
    }
    financeSubmissionLock.current = true;
    setFinanceSubmitting(true);
    try {
      const succeeded = await runAction("费用流水已登记并核销", () =>
        apiRequest(`/homestay/bookings/${originatingBookingId}/ledger`, {
          method: "POST",
          token: getAccessToken(),
          idempotencyKey: financeSubmissionKey.current!,
          body: payload
        })
      );
      if (succeeded) {
        financeSubmissionKey.current = null;
        financeSubmissionSignature.current = "";
        if (selectedBookingIdRef.current === originatingBookingId) {
          await loadBookingDetail(originatingBookingId);
        }
      }
    } finally {
      financeSubmissionLock.current = false;
      setFinanceSubmitting(false);
    }
  }

  function updateTurnoverWorkOrder(taskId: string, value: string) {
    turnoverWorkOrdersDirty.current.add(taskId);
    setTurnoverWorkOrders((current) => ({ ...current, [taskId]: value }));
  }

  function updateTurnoverException(taskId: string, value: string) {
    turnoverExceptionsDirty.current.add(taskId);
    setTurnoverExceptions((current) => ({ ...current, [taskId]: value }));
  }

  function updateTurnoverConsumables(
    taskId: string,
    update: (drafts: HomestayConsumableDraft[]) => HomestayConsumableDraft[]
  ) {
    turnoverConsumablesDirty.current.add(taskId);
    setTurnoverConsumables((current) => ({
      ...current,
      [taskId]: update(current[taskId] ?? [])
    }));
  }

  async function turnoverAction(task: Turnover, action: "start" | "complete" | "inspect" | "exception") {
    if (turnoverActionLock.current) return;
    const exceptionDescription = action === "exception"
      ? normalizeHomestayRequiredReason(turnoverExceptions[task.id] ?? "", 1000)
      : null;
    if (action === "exception" && !exceptionDescription) {
      setMessage("请填写 1—1000 字的现场异常说明");
      return;
    }
    const consumables = ["complete", "exception"].includes(action)
      ? homestayTurnoverConsumablesPayload(turnoverConsumables[task.id] ?? [])
      : [];
    if (consumables === null) {
      setMessage("请完整填写耗材名称、最多三位小数的正数数量和不超过 20 字的单位");
      return;
    }
    const body = {
      // An empty list asks the backend to derive the authoritative active association.
      // Never echo the task snapshot because a file may have been detached meanwhile.
      photo_file_ids: [],
      consumables: ["complete", "exception"].includes(action) ? consumables : undefined,
      exception_description: exceptionDescription ?? undefined,
      linked_work_order_id: turnoverWorkOrders[task.id]?.trim() || undefined
    };
    const signature = JSON.stringify({ taskId: task.id, action, body });
    if (!turnoverActionKey.current || turnoverActionSignature.current !== signature) {
      turnoverActionKey.current = createIdempotencyKey(`homestay-turnover-${action}`);
      turnoverActionSignature.current = signature;
    }
    turnoverActionLock.current = true;
    setTurnoverSubmittingTaskId(task.id);
    try {
      const succeeded = await runAction(`保洁任务已更新：${action}`, () =>
        apiRequest(`/homestay/turnovers/${task.id}/actions/${action}`, {
          method: "POST",
          token: getAccessToken(),
          idempotencyKey: turnoverActionKey.current!,
          body
        }),
        () => {
          turnoverWorkOrdersDirty.current.delete(task.id);
          if (["complete", "exception"].includes(action)) {
            turnoverExceptionsDirty.current.delete(task.id);
            turnoverConsumablesDirty.current.delete(task.id);
          }
        }
      );
      if (succeeded) {
        turnoverActionKey.current = null;
        turnoverActionSignature.current = "";
      }
    } finally {
      turnoverActionLock.current = false;
      setTurnoverSubmittingTaskId("");
    }
  }

  async function runAction(
    messageText: string,
    action: () => Promise<unknown>,
    beforeRefresh?: () => void
  ): Promise<boolean> {
    setLoading(true);
    setMessage("");
    try {
      await action();
      beforeRefresh?.();
      setMessage(messageText);
      await refresh();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失败");
      return false;
    } finally {
      setLoading(false);
    }
  }

  function changeBookingPage(page: number) {
    clearBookingContext();
    setBookingPage((current) => ({ ...current, page }));
  }

  const bookingTotalPages = Math.max(1, Math.ceil(bookingPage.total / bookingPage.pageSize));

  return (
    <main className={`ds-page ${styles.page}`}>
      <section className={`ds-hero ${styles.hero}`}>
        <div>
          <span className={styles.eyebrow}>集中式公寓 · 整套短租</span>
          <h1>民宿运营台</h1>
          <p>从直订录单、实名入住，到退房保洁和恢复可售，一处完成现场闭环。</p>
        </div>
        <button className="button button-secondary" type="button" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw size={16} /> 刷新
        </button>
      </section>

      {message ? <div className={styles.message}>{message}</div> : null}
      {refreshError ? <div className={styles.errorMessage} role="alert">{refreshError}</div> : null}
      {detailError ? <div className={styles.errorMessage} role="alert">{detailError}</div> : null}

      {canReadDashboard ? <section className="ds-kpi-grid">
        {([
          { label: "今日到店", value: dashboard.arrivals, Icon: CalendarDays },
          { label: "今日离店", value: dashboard.departures, Icon: CheckCircle2 },
          { label: "当前在住", value: dashboard.occupied, Icon: Users },
          { label: "可营房源", value: dashboard.rentable_units, Icon: Hotel },
          { label: "入住率", value: `${dashboard.occupancy_rate}%`, Icon: Users },
          { label: "平均房价", value: `¥${dashboard.average_daily_rate}`, Icon: CalendarDays },
          { label: "待保洁", value: dashboard.pending_turnovers, Icon: Sparkles },
          ...(canReadFinance ? [{
            label: "今日实收",
            value: `¥${dashboard.revenue ?? "0.00"}`,
            Icon: Hotel
          }] : [])
        ]).map(({ label, value, Icon }) => (
          <article className="ds-kpi-card" key={label}>
            <Icon size={20} />
            <span>{label}</span>
            <strong>{String(value)}</strong>
          </article>
        ))}
      </section> : null}

      <section className="ds-panel">
        <div className={styles.sectionTitle}><div><h2>今日房态</h2><p>房态直接来自共享经营模式与占用账本。</p></div></div>
        <div className={styles.turnoverGrid}>
          {roomStates.map((room) => (
            <article className={styles.turnoverCard} key={room.unit_id}>
              <div><strong>{room.unit_code} · {room.unit_name}</strong><span>{room.room_state}</span></div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.commandGrid}>
        {canReadRates ? <form className="ds-panel" onSubmit={saveRate}>
          <h2>房源日价与取消规则</h2>
          <label>整套房源<select disabled={rateSubmitting} value={rateForm.unitId} onChange={(event) => changeRateUnit(event.target.value)}>
            <option value="">选择房源</option>
            {rateUnits.map((unit) => <option value={unit.id} key={unit.id}>{rateUnitName.get(unit.id)}</option>)}
          </select></label>
          <div className={styles.formGrid}>
            <label>基础日价<input disabled={!canManageRates || rateLoading || rateSubmitting} type="number" min="0" step="0.01" value={rateForm.baseDailyRate} onFocus={(event) => event.target.select()} onChange={(event) => setRateForm({ ...rateForm, baseDailyRate: event.target.value })} /></label>
            <label>免费取消（小时前）<input disabled={!canManageRates || rateLoading || rateSubmitting} type="number" min="0" max="8760" step="1" value={rateForm.freeCancelHours} onFocus={(event) => event.target.select()} onChange={(event) => setRateForm({ ...rateForm, freeCancelHours: event.target.value })} /></label>
            <label>超时取消费<select disabled={!canManageRates || rateLoading || rateSubmitting} value={rateForm.feeType} onChange={(event) => setRateForm({ ...rateForm, feeType: event.target.value as "fixed" | "percentage" })}><option value="fixed">固定金额</option><option value="percentage">房费比例</option></select></label>
            <label>费用值<input disabled={!canManageRates || rateLoading || rateSubmitting} type="number" min="0" max={rateForm.feeType === "percentage" ? "100" : undefined} step="0.01" value={rateForm.feeValue} onFocus={(event) => event.target.select()} onChange={(event) => setRateForm({ ...rateForm, feeValue: event.target.value })} /></label>
          </div>
          <label className={styles.checkbox}><input disabled={!canManageRates || rateLoading || rateSubmitting} type="checkbox" checked={rateForm.requiresInspection} onChange={(event) => setRateForm({ ...rateForm, requiresInspection: event.target.checked })} />保洁后需复检才恢复可售</label>
          <PaginationControls meta={rateUnitPage} disabled={loading || rateLoading || rateSubmitting} onPageChange={(page) => setRateUnitPage((current) => ({ ...current, page }))} />
          <PermissionButton permission={SYSTEM_PERMISSIONS.HOMESTAY_RATE_MANAGE} className="button button-primary" type="submit" disabled={!rateReady || rateLoading || rateSubmitting}>{rateSubmitting ? "正在保存…" : rateLoading ? "正在加载价格…" : "保存价格规则"}</PermissionButton>
          <div className={styles.overridePanel}>
            <strong>日期覆盖价</strong>
            <div className={styles.formGrid}>
              <label>业务日期<input disabled={!canManageRates || rateSubmitting} type="date" value={rateOverrideForm.businessDate} onChange={(event) => changeRateOverrideDate(event.target.value)} /></label>
              <label>覆盖日价<input disabled={!canManageRates || rateLoading || rateSubmitting} type="number" min="0.01" step="0.01" value={rateOverrideForm.dailyRate} onFocus={(event) => event.target.select()} onChange={(event) => setRateOverrideForm({ ...rateOverrideForm, dailyRate: event.target.value })} /></label>
            </div>
            <label>覆盖原因<input disabled={!canManageRates || rateLoading || rateSubmitting} maxLength={500} value={rateOverrideForm.reason} onChange={(event) => setRateOverrideForm({ ...rateOverrideForm, reason: event.target.value })} /></label>
            <PermissionButton permission={SYSTEM_PERMISSIONS.HOMESTAY_RATE_MANAGE} type="button" disabled={!rateReady || rateSubmitting || !isPositiveMoney(rateOverrideForm.dailyRate) || !rateOverrideForm.reason.trim()} onClick={() => void saveRateOverride()}>保存日期覆盖价</PermissionButton>
          </div>
        </form> : null}

        {canCreateBookings ? <form className="ds-panel" onSubmit={createBooking}>
          <h2>直订 / 人工录单</h2>
          <label>整套房源<select required disabled={bookingSubmitting} value={bookingForm.unitId} onChange={(event) => setBookingForm({ ...bookingForm, unitId: event.target.value })}>
            <option value="">选择房源</option>
            {bookingUnits.map((unit) => <option value={unit.id} key={unit.id}>{bookingUnitName.get(unit.id)}</option>)}
          </select></label>
          <PaginationControls meta={bookingUnitPage} disabled={loading || bookingSubmitting} onPageChange={(page) => setBookingUnitPage((current) => ({ ...current, page }))} />
          <div className={styles.formGrid}>
            <label>入住日<input type="date" required disabled={bookingSubmitting} value={bookingForm.arrivalDate} onChange={(event) => {
              const arrivalDate = event.target.value;
              const departureMinimum = arrivalDate ? addBusinessDateDays(arrivalDate, 1) : "";
              setBookingForm({
                ...bookingForm,
                arrivalDate,
                departureDate: departureMinimum && bookingForm.departureDate < departureMinimum
                  ? departureMinimum
                  : bookingForm.departureDate
              });
            }} /></label>
            <label>退房日<input type="date" required disabled={bookingSubmitting} min={bookingForm.arrivalDate ? addBusinessDateDays(bookingForm.arrivalDate, 1) : undefined} value={bookingForm.departureDate} onChange={(event) => setBookingForm({ ...bookingForm, departureDate: event.target.value })} /></label>
            <label>住客人数<input type="number" disabled={bookingSubmitting} min="1" max="50" step="1" value={bookingForm.guestCount} onFocus={(event) => event.target.select()} onChange={(event) => setBookingForm({ ...bookingForm, guestCount: event.target.value })} /></label>
            <label>订单来源<select disabled={bookingSubmitting} value={bookingForm.sourceType} onChange={(event) => setBookingForm({ ...bookingForm, sourceType: event.target.value })}><option value="direct">自营直订</option><option value="manual">人工录单</option><option value="ota_reserved">OTA 预留字段</option></select></label>
          </div>
          <PermissionButton permission={SYSTEM_PERMISSIONS.HOMESTAY_BOOKING_CREATE} className="button button-primary" type="submit" disabled={bookingSubmitting}>{bookingSubmitting ? "正在创建…" : "计算逐夜价格并锁房"}</PermissionButton>
        </form> : null}
      </section>

      <section className="ds-panel">
        <div className={styles.sectionTitle}><div><h2>订单与今日现场操作</h2><p>草稿锁房 30 分钟；入住前需登记实名住客并发放凭证。</p></div></div>
        <div className="ds-table-shell">
          <table>
            <thead><tr><th>订单</th><th>房源</th><th>住期</th><th>金额</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>{bookings.map((booking) => (
              <tr key={booking.id}>
                <td>{booking.bookingCode}</td><td>{homestayBookingUnitLabel(booking)}</td>
                <td>{booking.arrivalDate} → {booking.departureDate}</td><td>¥{booking.totalAmount}</td>
                <td><span className={styles.status}>{booking.status}</span></td>
                <td className={styles.actions}>
                  <button type="button" onClick={() => void loadBookingDetail(booking.id, booking)}>查看详情</button>
                  {booking.status === "draft" ? <PermissionButton permission={SYSTEM_PERMISSIONS.HOMESTAY_BOOKING_CONFIRM} onClick={() => void bookingAction(booking, "confirm")}>确认</PermissionButton> : null}
                  {["draft", "confirmed"].includes(booking.status) && canRescheduleBookings ? <PermissionButton permission={SYSTEM_PERMISSIONS.HOMESTAY_BOOKING_RESCHEDULE} onClick={() => openReschedule(booking)}>改期</PermissionButton> : null}
                  {booking.status === "confirmed" && canMarkHomestayNoShow(booking.arrivalDate, today()) ? <PermissionButton permission={SYSTEM_PERMISSIONS.HOMESTAY_STAY_MANAGE} onClick={() => openBookingTermination(booking, "no-show")}>未到店</PermissionButton> : null}
                  {booking.status === "checked_in" ? <PermissionButton permission={SYSTEM_PERMISSIONS.HOMESTAY_STAY_MANAGE} onClick={() => void bookingAction(booking, "check-out")}>退房</PermissionButton> : null}
                  {["draft", "confirmed"].includes(booking.status) ? <PermissionButton permission={SYSTEM_PERMISSIONS.HOMESTAY_BOOKING_CANCEL} onClick={() => openBookingTermination(booking, "cancel")}>取消</PermissionButton> : null}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div className="ds-mobile-record-list">
          {bookings.map((booking) => <article className="ds-mobile-record" key={booking.id}>
            <strong>{booking.bookingCode}</strong><span>{homestayBookingUnitLabel(booking)}</span>
            <span>{booking.arrivalDate} → {booking.departureDate}</span><span>{booking.status} · ¥{booking.totalAmount}</span>
            <div className={styles.actions}>
              <button type="button" onClick={() => void loadBookingDetail(booking.id, booking)}>查看详情</button>
              {booking.status === "draft" ? <PermissionButton permission={SYSTEM_PERMISSIONS.HOMESTAY_BOOKING_CONFIRM} onClick={() => void bookingAction(booking, "confirm")}>确认</PermissionButton> : null}
              {["draft", "confirmed"].includes(booking.status) && canRescheduleBookings ? <PermissionButton permission={SYSTEM_PERMISSIONS.HOMESTAY_BOOKING_RESCHEDULE} onClick={() => openReschedule(booking)}>改期</PermissionButton> : null}
              {booking.status === "confirmed" && canMarkHomestayNoShow(booking.arrivalDate, today()) ? <PermissionButton permission={SYSTEM_PERMISSIONS.HOMESTAY_STAY_MANAGE} onClick={() => openBookingTermination(booking, "no-show")}>未到店</PermissionButton> : null}
              {booking.status === "checked_in" ? <PermissionButton permission={SYSTEM_PERMISSIONS.HOMESTAY_STAY_MANAGE} onClick={() => void bookingAction(booking, "check-out")}>退房</PermissionButton> : null}
              {["draft", "confirmed"].includes(booking.status) ? <PermissionButton permission={SYSTEM_PERMISSIONS.HOMESTAY_BOOKING_CANCEL} onClick={() => openBookingTermination(booking, "cancel")}>取消</PermissionButton> : null}
            </div>
          </article>)}
        </div>
        {canReadBookings ? <div className="pagination-actions">
          <span>共 {bookingPage.total} 条，第 {bookingPage.page}/{bookingTotalPages} 页</span>
          <button
            className="pagination-button"
            type="button"
            disabled={loading || bookingPage.page <= 1}
            onClick={() => changeBookingPage(bookingPage.page - 1)}
          >
            上一页
          </button>
          <button
            className="pagination-button"
            type="button"
            disabled={loading || bookingPage.page >= bookingTotalPages}
            onClick={() => changeBookingPage(bookingPage.page + 1)}
          >
            下一页
          </button>
        </div> : null}
      </section>

      {pendingBookingTermination ? <form
        className={`ds-panel ${styles.confirmPanel}`}
        role="alertdialog"
        aria-labelledby="homestay-termination-title"
        onSubmit={(event) => void confirmBookingTermination(event)}
      >
        <div>
          <h2 id="homestay-termination-title">
            确认{pendingBookingTermination.action === "cancel" ? "取消订单" : "登记未到店"}
          </h2>
          <p>该操作会终止订单、释放房源，并可能生成取消相关财务流水。请填写真实业务原因。</p>
          <dl className={styles.confirmIdentity}>
            <div><dt>订单</dt><dd>{pendingBookingTermination.booking.bookingCode}</dd></div>
            <div><dt>房源</dt><dd>{homestayBookingUnitLabel(pendingBookingTermination.booking)}</dd></div>
            <div>
              <dt>住期</dt>
              <dd>
                {pendingBookingTermination.booking.arrivalDate}
                {" → "}
                {pendingBookingTermination.booking.departureDate}
              </dd>
            </div>
          </dl>
        </div>
        <label>业务原因
          <textarea
            required
            maxLength={500}
            value={bookingTerminationReason}
            onChange={(event) => setBookingTerminationReason(event.target.value)}
            placeholder="例如：客人临时取消行程，并已由前台电话确认"
          />
        </label>
        <div className={styles.actions}>
          <button
            type="button"
            onClick={() => {
              setPendingBookingTermination(null);
              setBookingTerminationReason("");
            }}
          >
            返回
          </button>
          <button className="button button-primary" type="submit" disabled={loading}>
            {pendingBookingTermination.action === "cancel" ? "确认取消订单" : "确认登记未到店"}
          </button>
        </div>
      </form> : null}

      {pendingReschedule ? <form
        className={`ds-panel ${styles.confirmPanel}`}
        onSubmit={(event) => void confirmReschedule(event)}
      >
        <div>
          <h2>订单改期</h2>
          <p>{pendingReschedule.bookingCode} · {homestayBookingUnitLabel(pendingReschedule)}</p>
        </div>
        <div className={styles.formGrid}>
          <label>新入住日<input type="date" required value={rescheduleForm.arrivalDate} onChange={(event) => {
            const arrivalDate = event.target.value;
            const minimumDeparture = arrivalDate ? addBusinessDateDays(arrivalDate, 1) : "";
            setRescheduleForm((current) => ({
              ...current,
              arrivalDate,
              departureDate: minimumDeparture && current.departureDate < minimumDeparture
                ? minimumDeparture
                : current.departureDate
            }));
          }} /></label>
          <label>新退房日<input type="date" required min={rescheduleForm.arrivalDate ? addBusinessDateDays(rescheduleForm.arrivalDate, 1) : undefined} value={rescheduleForm.departureDate} onChange={(event) => setRescheduleForm((current) => ({ ...current, departureDate: event.target.value }))} /></label>
        </div>
        <label>改期原因<textarea required maxLength={500} value={rescheduleForm.reason} onChange={(event) => setRescheduleForm((current) => ({ ...current, reason: event.target.value }))} /></label>
        <div className={styles.actions}>
          <button type="button" onClick={() => setPendingReschedule(null)}>返回</button>
          <PermissionButton permission={SYSTEM_PERMISSIONS.HOMESTAY_BOOKING_RESCHEDULE} className="button button-primary" type="submit" disabled={loading}>确认改期并重算差价</PermissionButton>
        </div>
      </form> : null}

      {selectedBookingId && selectedBooking ? <section className={`ds-panel ${styles.stayPanel}`}>
        <h2>订单详情与业务处理</h2>
        <p>订单：{selectedBooking.bookingCode} · 状态：{selectedBooking.status}</p>
        <div className={styles.inlineForm}>
          {bookingDetailCapabilities?.showStayOperations ? <>
            <strong>实名入住与凭证</strong>
            <label>共享个人档案 ID<input disabled={guestSubmitting} value={guestPartyId} placeholder="UUID" onChange={(event) => setGuestPartyId(event.target.value)} /></label>
            <PermissionButton permission={SYSTEM_PERMISSIONS.HOMESTAY_STAY_MANAGE} type="button" disabled={guestSubmitting} onClick={() => void addGuest()}>{guestSubmitting ? "正在登记…" : "登记并内部核验"}</PermissionButton>
          </> : null}
          {bookingDetailCapabilities?.showStayOperations ? <div className={styles.guestRoster}>
            <strong>已登记住客 {guests.length}/{selectedBooking.guestCount}</strong>
            {guests.length ? guests.map((guest) => (
              <span key={guest.id}>
                {guest.partyId} · {guest.isPrimary ? "主住客" : "同住人"} · {guest.verificationStatus}
              </span>
            )) : <span>尚未登记实名住客</span>}
          </div> : null}
          {bookingDetailCapabilities?.canIssueCredential ? <>
            <label>凭证类型<select disabled={credentialSubmitting} value={credentialType} onChange={(event) => setCredentialType(event.target.value as StayCredential["credentialType"])}>
              <option value="key">钥匙</option>
              <option value="card">门卡</option>
              <option value="voucher">入住凭证</option>
            </select></label>
            <label>门卡 / 钥匙标签<input disabled={credentialSubmitting} value={credentialLabel} onChange={(event) => setCredentialLabel(event.target.value)} /></label>
            <PermissionButton
              permission={SYSTEM_PERMISSIONS.HOMESTAY_STAY_MANAGE}
              type="button"
              disabled={credentialSubmitting}
              onClick={() => void issueCredential()}
            >
              {credentialSubmitting ? "正在发放…" : "人工发放凭证"}
            </PermissionButton>
          </> : null}
          {credentials.map((credential) => (
            <div className={styles.credential} key={credential.id}>
              <span>{credential.credentialLabel} · {credential.status}</span>
              {bookingDetailCapabilities?.showStayOperations && credential.status === "issued" ? (
                <PermissionButton
                  permission={SYSTEM_PERMISSIONS.HOMESTAY_STAY_MANAGE}
                  type="button"
                  disabled={credentialReturningId === credential.id}
                  onClick={() => void returnCredential(credential.id)}
                >
                  {credentialReturningId === credential.id ? "正在回收…" : "回收凭证"}
                </PermissionButton>
              ) : null}
            </div>
          ))}
          {bookingDetailCapabilities?.showFinanceSummary && ledgerSummary ? (
            <div className={styles.ledgerSummary}>应收 ¥{ledgerSummary.charges} · 已收 ¥{ledgerSummary.payments} · 退款 ¥{ledgerSummary.refunds} · 减免 ¥{ledgerSummary.waivers} · 余额 ¥{ledgerSummary.balance}</div>
          ) : null}
          {bookingDetailCapabilities?.showFinanceForm ? <>
            <strong>财务登记</strong>
            <label>流水类型<select disabled={financeSubmitting} value={financeForm.entryType} onChange={(event) => setFinanceForm({ ...financeForm, entryType: event.target.value })}>
              {canRegisterFinance ? <option value="payment">人工收款</option> : null}
              {canRegisterFinance ? <option value="refund">人工退款确认</option> : null}
              {canRegisterFinance ? <option value="charge">其他费用</option> : null}
              {canWaiveFinance ? <option value="waiver">人工减免</option> : null}
            </select></label>
            <label>金额<input disabled={financeSubmitting} type="number" min="0.01" step="0.01" value={financeForm.amount} onFocus={(event) => event.target.select()} onChange={(event) => setFinanceForm({ ...financeForm, amount: event.target.value })} /></label>
            {financeForm.entryType === "payment" ? <label>收款方式<select disabled={financeSubmitting} value={financeForm.paymentMethod} onChange={(event) => setFinanceForm({ ...financeForm, paymentMethod: event.target.value })}>
              <option value="cash">现金</option><option value="bank_transfer">银行转账</option><option value="offline_other">其他线下方式</option>
            </select></label> : null}
            <label>登记原因<input disabled={financeSubmitting} maxLength={500} value={financeForm.reason} onChange={(event) => setFinanceForm({ ...financeForm, reason: event.target.value })} /></label>
            <PermissionButton
              permission={financeForm.entryType === "waiver"
                ? SYSTEM_PERMISSIONS.HOMESTAY_FINANCE_WAIVE
                : SYSTEM_PERMISSIONS.HOMESTAY_FINANCE_REGISTER}
              type="button"
              disabled={financeSubmitting}
              onClick={() => void registerFinance()}
            >
              登记流水
            </PermissionButton>
          </> : null}
          {bookingDetailCapabilities?.canCheckIn ? <PermissionButton
            permission={SYSTEM_PERMISSIONS.HOMESTAY_STAY_MANAGE}
            className="button button-primary"
            type="button"
            onClick={() => void bookingAction(selectedBooking, "check-in")}
          >办理入住</PermissionButton> : null}
        </div>
      </section> : null}

      <section className="ds-panel">
        <div className={styles.sectionTitle}><div><h2>退房保洁</h2><p>退房立即转为不可售；保洁或复检完成后才释放运营占用。</p></div></div>
        <div className={styles.turnoverGrid}>{turnovers.map((task) => (
          <article className={styles.turnoverCard} key={task.id}>
            <div><strong>{homestayTurnoverUnitLabel(task)}</strong><span>{task.status}</span></div>
            {task.status === "exception" && task.exceptionDescription ? (
              <div className={styles.turnoverException} role="alert">
                <strong>异常说明</strong>
                <span>{task.exceptionDescription}</span>
              </div>
            ) : null}
            {canUploadTurnoverEvidence ? <FileUploader
              bizType="homestay_turnover"
              bizId={task.id}
              policyKey="image"
              compact
              label="上传现场照片"
              onUploaded={() => setTurnoverAttachmentRefresh((current) => ({
                ...current,
                [task.id]: (current[task.id] ?? 0) + 1
              }))}
            /> : null}
            {canReadTurnoverEvidence ? <AttachmentList
              bizType="homestay_turnover"
              bizId={task.id}
              compact
              refreshKey={turnoverAttachmentRefresh[task.id] ?? 0}
            /> : null}
            {canExecuteTurnovers ? <label>关联维修工单 ID（可选）
              <input
                disabled={turnoverSubmittingTaskId === task.id}
                value={turnoverWorkOrders[task.id] ?? ""}
                placeholder="UUID"
                onChange={(event) => updateTurnoverWorkOrder(task.id, event.target.value)}
              />
            </label> : null}
            {canExecuteTurnovers && task.status !== "completed" ? <label>现场异常说明
              <textarea
                disabled={turnoverSubmittingTaskId === task.id}
                maxLength={1000}
                value={turnoverExceptions[task.id] ?? ""}
                placeholder="上报异常前必填：描述损坏、污染位置、影响范围和建议处理方式"
                onChange={(event) => updateTurnoverException(task.id, event.target.value)}
              />
            </label> : null}
            {canExecuteTurnovers && ["cleaning", "exception"].includes(task.status) ? <div className={styles.consumables}>
              <div>
                <strong>保洁耗材</strong>
                <button
                  type="button"
                  disabled={turnoverSubmittingTaskId === task.id}
                  onClick={() => updateTurnoverConsumables(task.id, (drafts) => [
                    ...drafts,
                    { name: "", quantity: "1", unit: "" }
                  ])}
                >
                  添加耗材
                </button>
              </div>
              {(turnoverConsumables[task.id] ?? []).map((item, index) => (
                <div className={styles.consumableRow} key={`${task.id}-${index}`}>
                  <label>名称<input
                    disabled={turnoverSubmittingTaskId === task.id}
                    required
                    maxLength={100}
                    value={item.name}
                    onChange={(event) => updateTurnoverConsumables(
                      task.id,
                      (drafts) => drafts.map((draft, draftIndex) =>
                        draftIndex === index ? { ...draft, name: event.target.value } : draft
                      )
                    )}
                  /></label>
                  <label>数量<input
                    disabled={turnoverSubmittingTaskId === task.id}
                    required
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={item.quantity}
                    onFocus={(event) => event.target.select()}
                    onChange={(event) => updateTurnoverConsumables(
                      task.id,
                      (drafts) => drafts.map((draft, draftIndex) =>
                        draftIndex === index ? { ...draft, quantity: event.target.value } : draft
                      )
                    )}
                  /></label>
                  <label>单位<input
                    disabled={turnoverSubmittingTaskId === task.id}
                    maxLength={20}
                    value={item.unit}
                    onChange={(event) => updateTurnoverConsumables(
                      task.id,
                      (drafts) => drafts.map((draft, draftIndex) =>
                        draftIndex === index ? { ...draft, unit: event.target.value } : draft
                      )
                    )}
                  /></label>
                  <button
                    type="button"
                    disabled={turnoverSubmittingTaskId === task.id}
                    onClick={() => updateTurnoverConsumables(
                      task.id,
                      (drafts) => drafts.filter((_, draftIndex) => draftIndex !== index)
                    )}
                  >
                    移除
                  </button>
                </div>
              ))}
            </div> : null}
            <div className={styles.actions}>
              {task.status === "pending" ? <PermissionButton permission={SYSTEM_PERMISSIONS.HOMESTAY_TURNOVER_EXECUTE} disabled={turnoverSubmittingTaskId === task.id} onClick={() => void turnoverAction(task, "start")}>开始保洁</PermissionButton> : null}
              {["cleaning", "exception"].includes(task.status) ? <PermissionButton permission={SYSTEM_PERMISSIONS.HOMESTAY_TURNOVER_EXECUTE} disabled={turnoverSubmittingTaskId === task.id} onClick={() => void turnoverAction(task, "complete")}>完成保洁</PermissionButton> : null}
              {task.status === "inspection" ? <PermissionButton permission={SYSTEM_PERMISSIONS.HOMESTAY_TURNOVER_EXECUTE} disabled={turnoverSubmittingTaskId === task.id} onClick={() => void turnoverAction(task, "inspect")}>复检通过</PermissionButton> : null}
              {task.status !== "completed" ? <PermissionButton permission={SYSTEM_PERMISSIONS.HOMESTAY_TURNOVER_EXECUTE} disabled={turnoverSubmittingTaskId === task.id} onClick={() => void turnoverAction(task, "exception")}>上报异常</PermissionButton> : null}
            </div>
          </article>
        ))}</div>
        {canReadTurnovers ? (
          <PaginationControls
            meta={turnoverPage}
            disabled={loading}
            onPageChange={(page) => setTurnoverPage((current) => ({ ...current, page }))}
          />
        ) : null}
      </section>
    </main>
  );
}
