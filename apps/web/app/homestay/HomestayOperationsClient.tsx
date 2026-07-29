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
  homestayBookingDetailCapabilities,
  homestayBookingUnitLabel,
  homestayRateFormFromCalendar,
  homestayTurnoverConsumablesPayload,
  homestayTurnoverUnitLabel,
  homestayUnitSelectionAfterLoad,
  normalizeHomestayRequiredReason,
  shouldRetainHomestayBookingDetail,
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
}

interface StayCredential {
  id: string;
  credentialType: "key" | "card" | "voucher";
  credentialLabel: string;
  status: "issued" | "returned" | "lost" | "void";
}

interface BookingDetail {
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
  const canReadUnitCandidates = canReadRates || canManageRates || canReadBookings || canCreateBookings;
  const [dashboard, setDashboard] = useState(emptyDashboard);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [turnovers, setTurnovers] = useState<Turnover[]>([]);
  const [roomStates, setRoomStates] = useState<RoomState[]>([]);
  const [credentials, setCredentials] = useState<StayCredential[]>([]);
  const [ledgerSummary, setLedgerSummary] = useState<BookingDetail["ledger_summary"] | null>(null);
  const [message, setMessage] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const [loading, setLoading] = useState(false);
  const [financeSubmitting, setFinanceSubmitting] = useState(false);
  const [rateLoading, setRateLoading] = useState(false);
  const [rateReady, setRateReady] = useState(false);
  const [credentialSubmitting, setCredentialSubmitting] = useState(false);
  const [credentialReturningId, setCredentialReturningId] = useState("");
  const [unitPage, setUnitPage] = useState(emptyUnitPageMeta);
  const [bookingPage, setBookingPage] = useState(emptyPageMeta);
  const [turnoverPage, setTurnoverPage] = useState(emptyTurnoverPageMeta);
  const [selectedBookingId, setSelectedBookingId] = useState("");
  const [guestPartyId, setGuestPartyId] = useState("");
  const [credentialType, setCredentialType] = useState<StayCredential["credentialType"]>("card");
  const [credentialLabel, setCredentialLabel] = useState("前台门卡");
  const [rateForm, setRateForm] = useState(defaultHomestayRateForm);
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
    bookingId: string;
    action: BookingTerminationAction;
  } | null>(null);
  const [bookingTerminationReason, setBookingTerminationReason] = useState("");
  const [financeForm, setFinanceForm] = useState({
    entryType: "payment",
    amount: "0",
    paymentMethod: "cash",
    reason: "人工收款登记"
  });
  const refreshSequence = useRef(0);
  const rateLoadSequence = useRef(0);
  const selectedRateUnitIdRef = useRef("");
  const bookingDetailSequence = useRef(0);
  const selectedBookingIdRef = useRef("");
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

  const unitName = useMemo(
    () => new Map(units.map((unit) => [unit.id, `${unit.unitCode} · ${unit.unitName}`])),
    [units]
  );
  const selectedBooking = useMemo(
    () => bookings.find((booking) => booking.id === selectedBookingId) ?? null,
    [bookings, selectedBookingId]
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

  const clearBookingContext = useCallback(() => {
    bookingDetailSequence.current += 1;
    selectedBookingIdRef.current = "";
    setSelectedBookingId("");
    setGuestPartyId("");
    setCredentials([]);
    setLedgerSummary(null);
  }, []);

  const refresh = useCallback(async () => {
    const sequence = refreshSequence.current + 1;
    refreshSequence.current = sequence;
    setLoading(true);
    try {
      const token = getAccessToken();
      const [dashboardResponse, unitsResponse, bookingsResponse, turnoversResponse, roomStateResponse] = await Promise.all([
        loadOptional(canReadDashboard, () => apiRequest<Dashboard>("/homestay/dashboard", { token })),
        loadOptional(canReadUnitCandidates, () => apiRequest<PaginatedResult<UnitRow>>(
          `/homestay/unit-candidates?page=${unitPage.page}&page_size=${UNIT_PAGE_SIZE}`,
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
      const errors = [dashboardResponse, unitsResponse, bookingsResponse, turnoversResponse, roomStateResponse]
        .flatMap((result) => result && "error" in result ? [result.error] : []);
      setRefreshError(errors.length ? `部分数据加载失败：${errors.join("；")}` : "");

      if (!dashboardResponse) setDashboard(emptyDashboard);
      else if ("data" in dashboardResponse) setDashboard(dashboardResponse.data);
      if (!unitsResponse) {
        setUnits([]);
        setUnitPage(emptyUnitPageMeta());
        setRateForm((current) => ({ ...current, unitId: "" }));
        setBookingForm((current) => ({ ...current, unitId: "" }));
      }
      else if ("data" in unitsResponse) {
        const availableUnits = unitsResponse.data.items;
        const loadedUnitIds = availableUnits.map((unit) => unit.id);
        setUnits(availableUnits);
        setUnitPage({
          page: unitsResponse.data.page,
          pageSize: unitsResponse.data.page_size,
          total: unitsResponse.data.total
        });
        setRateForm((current) => ({
          ...current,
          unitId: homestayUnitSelectionAfterLoad(current.unitId, loadedUnitIds)
        }));
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
        if (!shouldRetainHomestayBookingDetail(
          selectedBookingIdRef.current,
          bookingsResponse.data.items.map((booking) => booking.id)
        )) {
          clearBookingContext();
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
        setTurnoverExceptions((current) => {
          const next = { ...current };
          for (const task of turnoversResponse.data.items) {
            if (!(task.id in next)) next[task.id] = task.exceptionDescription ?? "";
          }
          return next;
        });
        setTurnoverConsumables((current) => {
          const next = { ...current };
          for (const task of turnoversResponse.data.items) {
            if (!(task.id in next)) {
              next[task.id] = (task.consumables ?? []).map((item) => ({
                name: item.name,
                quantity: String(item.quantity),
                unit: item.unit ?? ""
              }));
            }
          }
          return next;
        });
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
    canReadUnitCandidates,
    clearBookingContext,
    turnoverPage.page,
    unitPage.page
  ]);

  const loadRate = useCallback(async (unitId: string) => {
    const sequence = rateLoadSequence.current + 1;
    rateLoadSequence.current = sequence;
    selectedRateUnitIdRef.current = unitId;
    setRateReady(false);
    if (!canReadRates || !unitId) {
      setRateForm(defaultHomestayRateForm());
      setRateLoading(false);
      return;
    }
    setRateLoading(true);
    try {
      const response = await apiRequest<HomestayRateCalendar>(
        `/homestay/rates/${unitId}?date_from=${today()}&date_to=${tomorrow()}`,
        { token: getAccessToken() }
      );
      if (rateLoadSequence.current !== sequence || selectedRateUnitIdRef.current !== unitId) return;
      setRateForm(homestayRateFormFromCalendar(unitId, response.data));
      setRateReady(true);
    } catch (error) {
      if (rateLoadSequence.current !== sequence || selectedRateUnitIdRef.current !== unitId) return;
      if (error instanceof ApiError && error.status === 404) {
        setRateForm(defaultHomestayRateForm(unitId));
        setRateReady(true);
      } else {
        setMessage(error instanceof Error ? error.message : "加载房源价格规则失败");
      }
    } finally {
      if (rateLoadSequence.current === sequence) setRateLoading(false);
    }
  }, [canReadRates]);

  const loadBookingDetail = useCallback(async (bookingId: string) => {
    const sequence = bookingDetailSequence.current + 1;
    bookingDetailSequence.current = sequence;
    selectedBookingIdRef.current = bookingId;
    setSelectedBookingId(bookingId);
    setCredentials([]);
    setLedgerSummary(null);
    try {
      const response = await apiRequest<BookingDetail>(`/homestay/bookings/${bookingId}`, {
        token: getAccessToken()
      });
      if (
        bookingDetailSequence.current !== sequence
        || selectedBookingIdRef.current !== bookingId
      ) return;
      setCredentials(response.data.credentials);
      setLedgerSummary(response.data.ledger_summary);
    } catch (error) {
      if (
        bookingDetailSequence.current !== sequence
        || selectedBookingIdRef.current !== bookingId
      ) return;
      setMessage(error instanceof Error ? error.message : "加载民宿订单详情失败");
    }
  }, []);

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
      void loadRate(rateForm.unitId);
    } else {
      rateLoadSequence.current += 1;
      setRateLoading(false);
      setRateReady(false);
    }
  }, [canReadRates, loadRate, rateForm.unitId]);

  async function saveRate(event: FormEvent) {
    event.preventDefault();
    if (!rateForm.unitId || !rateReady || rateLoading) return;
    await runAction("基础日价已保存", () =>
      apiRequest(`/homestay/rates/${rateForm.unitId}`, {
        method: "PUT",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey("homestay-rate"),
        body: {
          base_daily_rate: rateForm.baseDailyRate,
          free_cancel_before_hours: Number(rateForm.freeCancelHours),
          late_cancel_fee_type: rateForm.feeType,
          late_cancel_fee_value: rateForm.feeValue,
          checkout_requires_inspection: rateForm.requiresInspection
        }
      })
    );
  }

  async function createBooking(event: FormEvent) {
    event.preventDefault();
    await runAction("订单草稿已创建并临时锁房 30 分钟", () =>
      apiRequest("/homestay/bookings", {
        method: "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey("homestay-booking"),
        body: {
          unit_id: bookingForm.unitId,
          arrival_date: bookingForm.arrivalDate,
          departure_date: bookingForm.departureDate,
          guest_count: Number(bookingForm.guestCount),
          source_type: bookingForm.sourceType
        }
      })
    );
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
    setPendingBookingTermination({ bookingId: booking.id, action });
    setBookingTerminationReason("");
    setMessage("");
  }

  async function confirmBookingTermination(event: FormEvent) {
    event.preventDefault();
    if (!pendingBookingTermination) return;
    const booking = bookings.find((item) => item.id === pendingBookingTermination.bookingId);
    if (!booking) {
      setPendingBookingTermination(null);
      setBookingTerminationReason("");
      setMessage("订单已离开当前列表，请刷新后重试");
      return;
    }
    const succeeded = await bookingAction(
      booking,
      pendingBookingTermination.action,
      bookingTerminationReason
    );
    if (succeeded) {
      setPendingBookingTermination(null);
      setBookingTerminationReason("");
    }
  }

  async function addGuest() {
    if (!selectedBookingId || !guestPartyId) return;
    await runAction("实名入住人已登记", () =>
      apiRequest(`/homestay/bookings/${selectedBookingId}/guests`, {
        method: "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey("homestay-guest"),
        body: { party_id: guestPartyId, is_primary: true, verification_status: "verified" }
      })
    );
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
      photo_file_ids: task.photoFileIds,
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
    try {
      const succeeded = await runAction(`保洁任务已更新：${action}`, () =>
        apiRequest(`/homestay/turnovers/${task.id}/actions/${action}`, {
          method: "POST",
          token: getAccessToken(),
          idempotencyKey: turnoverActionKey.current!,
          body
        })
      );
      if (succeeded) {
        turnoverActionKey.current = null;
        turnoverActionSignature.current = "";
      }
    } finally {
      turnoverActionLock.current = false;
    }
  }

  async function runAction(messageText: string, action: () => Promise<unknown>): Promise<boolean> {
    setLoading(true);
    setMessage("");
    try {
      await action();
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
          <label>整套房源<select value={rateForm.unitId} onChange={(event) => setRateForm({ ...rateForm, unitId: event.target.value })}>
            <option value="">选择房源</option>
            {units.map((unit) => <option value={unit.id} key={unit.id}>{unitName.get(unit.id)}</option>)}
          </select></label>
          <div className={styles.formGrid}>
            <label>基础日价<input type="number" min="0" step="0.01" value={rateForm.baseDailyRate} onFocus={(event) => event.target.select()} onChange={(event) => setRateForm({ ...rateForm, baseDailyRate: event.target.value })} /></label>
            <label>免费取消（小时前）<input type="number" min="0" max="8760" step="1" value={rateForm.freeCancelHours} onFocus={(event) => event.target.select()} onChange={(event) => setRateForm({ ...rateForm, freeCancelHours: event.target.value })} /></label>
            <label>超时取消费<select value={rateForm.feeType} onChange={(event) => setRateForm({ ...rateForm, feeType: event.target.value as "fixed" | "percentage" })}><option value="fixed">固定金额</option><option value="percentage">房费比例</option></select></label>
            <label>费用值<input type="number" min="0" max={rateForm.feeType === "percentage" ? "100" : undefined} step="0.01" value={rateForm.feeValue} onFocus={(event) => event.target.select()} onChange={(event) => setRateForm({ ...rateForm, feeValue: event.target.value })} /></label>
          </div>
          <label className={styles.checkbox}><input type="checkbox" checked={rateForm.requiresInspection} onChange={(event) => setRateForm({ ...rateForm, requiresInspection: event.target.checked })} />保洁后需复检才恢复可售</label>
          <div><small>价格与预订共用房源候选</small><PaginationControls meta={unitPage} disabled={loading || rateLoading} onPageChange={(page) => setUnitPage((current) => ({ ...current, page }))} /></div>
          <PermissionButton permission={SYSTEM_PERMISSIONS.HOMESTAY_RATE_MANAGE} className="button button-primary" type="submit" disabled={!rateReady || rateLoading}>{rateLoading ? "正在加载价格…" : "保存价格规则"}</PermissionButton>
        </form> : null}

        {canCreateBookings ? <form className="ds-panel" onSubmit={createBooking}>
          <h2>直订 / 人工录单</h2>
          <label>整套房源<select required value={bookingForm.unitId} onChange={(event) => setBookingForm({ ...bookingForm, unitId: event.target.value })}>
            <option value="">选择房源</option>
            {units.map((unit) => <option value={unit.id} key={unit.id}>{unitName.get(unit.id)}</option>)}
          </select></label>
          <PaginationControls meta={unitPage} disabled={loading} onPageChange={(page) => setUnitPage((current) => ({ ...current, page }))} />
          <div className={styles.formGrid}>
            <label>入住日<input type="date" required value={bookingForm.arrivalDate} onChange={(event) => {
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
            <label>退房日<input type="date" required min={bookingForm.arrivalDate ? addBusinessDateDays(bookingForm.arrivalDate, 1) : undefined} value={bookingForm.departureDate} onChange={(event) => setBookingForm({ ...bookingForm, departureDate: event.target.value })} /></label>
            <label>住客人数<input type="number" min="1" max="50" step="1" value={bookingForm.guestCount} onFocus={(event) => event.target.select()} onChange={(event) => setBookingForm({ ...bookingForm, guestCount: event.target.value })} /></label>
            <label>订单来源<select value={bookingForm.sourceType} onChange={(event) => setBookingForm({ ...bookingForm, sourceType: event.target.value })}><option value="direct">自营直订</option><option value="manual">人工录单</option><option value="ota_reserved">OTA 预留字段</option></select></label>
          </div>
          <PermissionButton permission={SYSTEM_PERMISSIONS.HOMESTAY_BOOKING_CREATE} className="button button-primary" type="submit">计算逐夜价格并锁房</PermissionButton>
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
                  <button type="button" onClick={() => void loadBookingDetail(booking.id)}>查看详情</button>
                  {booking.status === "draft" ? <PermissionButton permission={SYSTEM_PERMISSIONS.HOMESTAY_BOOKING_CONFIRM} onClick={() => void bookingAction(booking, "confirm")}>确认</PermissionButton> : null}
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
              <button type="button" onClick={() => void loadBookingDetail(booking.id)}>查看详情</button>
              {booking.status === "draft" ? <PermissionButton permission={SYSTEM_PERMISSIONS.HOMESTAY_BOOKING_CONFIRM} onClick={() => void bookingAction(booking, "confirm")}>确认</PermissionButton> : null}
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

      {selectedBookingId && selectedBooking ? <section className={`ds-panel ${styles.stayPanel}`}>
        <h2>订单详情与业务处理</h2>
        <p>订单：{selectedBooking.bookingCode} · 状态：{selectedBooking.status}</p>
        <div className={styles.inlineForm}>
          {bookingDetailCapabilities?.showStayOperations ? <>
            <strong>实名入住与凭证</strong>
            <label>共享个人档案 ID<input value={guestPartyId} placeholder="UUID" onChange={(event) => setGuestPartyId(event.target.value)} /></label>
            <PermissionButton permission={SYSTEM_PERMISSIONS.HOMESTAY_STAY_MANAGE} type="button" onClick={() => void addGuest()}>登记并内部核验</PermissionButton>
          </> : null}
          {bookingDetailCapabilities?.canIssueCredential ? <>
            <label>凭证类型<select value={credentialType} onChange={(event) => setCredentialType(event.target.value as StayCredential["credentialType"])}>
              <option value="key">钥匙</option>
              <option value="card">门卡</option>
              <option value="voucher">入住凭证</option>
            </select></label>
            <label>门卡 / 钥匙标签<input value={credentialLabel} onChange={(event) => setCredentialLabel(event.target.value)} /></label>
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
            <label>流水类型<select value={financeForm.entryType} onChange={(event) => setFinanceForm({ ...financeForm, entryType: event.target.value })}>
              {canRegisterFinance ? <option value="payment">人工收款</option> : null}
              {canRegisterFinance ? <option value="refund">人工退款确认</option> : null}
              {canRegisterFinance ? <option value="charge">其他费用</option> : null}
              {canWaiveFinance ? <option value="waiver">人工减免</option> : null}
            </select></label>
            <label>金额<input type="number" min="0.01" step="0.01" value={financeForm.amount} onFocus={(event) => event.target.select()} onChange={(event) => setFinanceForm({ ...financeForm, amount: event.target.value })} /></label>
            {financeForm.entryType === "payment" ? <label>收款方式<select value={financeForm.paymentMethod} onChange={(event) => setFinanceForm({ ...financeForm, paymentMethod: event.target.value })}>
              <option value="cash">现金</option><option value="bank_transfer">银行转账</option><option value="offline_other">其他线下方式</option>
            </select></label> : null}
            <label>登记原因<input maxLength={500} value={financeForm.reason} onChange={(event) => setFinanceForm({ ...financeForm, reason: event.target.value })} /></label>
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
                value={turnoverWorkOrders[task.id] ?? ""}
                placeholder="UUID"
                onChange={(event) => setTurnoverWorkOrders((current) => ({
                  ...current,
                  [task.id]: event.target.value
                }))}
              />
            </label> : null}
            {canExecuteTurnovers && task.status !== "completed" ? <label>现场异常说明
              <textarea
                maxLength={1000}
                value={turnoverExceptions[task.id] ?? ""}
                placeholder="上报异常前必填：描述损坏、污染位置、影响范围和建议处理方式"
                onChange={(event) => setTurnoverExceptions((current) => ({
                  ...current,
                  [task.id]: event.target.value
                }))}
              />
            </label> : null}
            {canExecuteTurnovers && ["cleaning", "exception"].includes(task.status) ? <div className={styles.consumables}>
              <div>
                <strong>保洁耗材</strong>
                <button
                  type="button"
                  onClick={() => setTurnoverConsumables((current) => ({
                    ...current,
                    [task.id]: [
                      ...(current[task.id] ?? []),
                      { name: "", quantity: "1", unit: "" }
                    ]
                  }))}
                >
                  添加耗材
                </button>
              </div>
              {(turnoverConsumables[task.id] ?? []).map((item, index) => (
                <div className={styles.consumableRow} key={`${task.id}-${index}`}>
                  <label>名称<input
                    required
                    maxLength={100}
                    value={item.name}
                    onChange={(event) => setTurnoverConsumables((current) => ({
                      ...current,
                      [task.id]: (current[task.id] ?? []).map((draft, draftIndex) =>
                        draftIndex === index ? { ...draft, name: event.target.value } : draft
                      )
                    }))}
                  /></label>
                  <label>数量<input
                    required
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={item.quantity}
                    onFocus={(event) => event.target.select()}
                    onChange={(event) => setTurnoverConsumables((current) => ({
                      ...current,
                      [task.id]: (current[task.id] ?? []).map((draft, draftIndex) =>
                        draftIndex === index ? { ...draft, quantity: event.target.value } : draft
                      )
                    }))}
                  /></label>
                  <label>单位<input
                    maxLength={20}
                    value={item.unit}
                    onChange={(event) => setTurnoverConsumables((current) => ({
                      ...current,
                      [task.id]: (current[task.id] ?? []).map((draft, draftIndex) =>
                        draftIndex === index ? { ...draft, unit: event.target.value } : draft
                      )
                    }))}
                  /></label>
                  <button
                    type="button"
                    onClick={() => setTurnoverConsumables((current) => ({
                      ...current,
                      [task.id]: (current[task.id] ?? []).filter((_, draftIndex) => draftIndex !== index)
                    }))}
                  >
                    移除
                  </button>
                </div>
              ))}
            </div> : null}
            <div className={styles.actions}>
              {task.status === "pending" ? <PermissionButton permission={SYSTEM_PERMISSIONS.HOMESTAY_TURNOVER_EXECUTE} onClick={() => void turnoverAction(task, "start")}>开始保洁</PermissionButton> : null}
              {["cleaning", "exception"].includes(task.status) ? <PermissionButton permission={SYSTEM_PERMISSIONS.HOMESTAY_TURNOVER_EXECUTE} onClick={() => void turnoverAction(task, "complete")}>完成保洁</PermissionButton> : null}
              {task.status === "inspection" ? <PermissionButton permission={SYSTEM_PERMISSIONS.HOMESTAY_TURNOVER_EXECUTE} onClick={() => void turnoverAction(task, "inspect")}>复检通过</PermissionButton> : null}
              {task.status !== "completed" ? <PermissionButton permission={SYSTEM_PERMISSIONS.HOMESTAY_TURNOVER_EXECUTE} onClick={() => void turnoverAction(task, "exception")}>上报异常</PermissionButton> : null}
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
