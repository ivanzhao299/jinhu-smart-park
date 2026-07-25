"use client";

import type { PaginatedResult } from "@jinhu/shared";
import { SYSTEM_PERMISSIONS } from "@jinhu/shared";
import { CalendarDays, CheckCircle2, Hotel, RefreshCw, Sparkles, Users } from "lucide-react";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PermissionButton } from "../../components/auth/PermissionButton";
import { FileUploader } from "../../components/files/FileUploader";
import { apiRequest, createIdempotencyKey } from "../../lib/api-client";
import { getAccessToken } from "../../lib/authz";
import { addBusinessDateDays, businessDate } from "../../lib/business-date";
import type { UnitRow } from "../assets/units/types";
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
  revenue: string;
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
}

interface Turnover {
  id: string;
  bookingId: string;
  unitId: string;
  status: "pending" | "cleaning" | "inspection" | "completed" | "exception";
  assigneeName: string | null;
  photoFileIds: string[];
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
  };
}

interface RoomState {
  unit_id: string;
  unit_code: string;
  unit_name: string;
  operation_mode: string | null;
  room_state: "available" | "occupied" | "turnover" | "mode_unavailable" | "out_of_service";
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

const today = () => businessDate();
const tomorrow = () => addBusinessDateDays(today(), 1);

export function HomestayOperationsClient() {
  const [dashboard, setDashboard] = useState(emptyDashboard);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [turnovers, setTurnovers] = useState<Turnover[]>([]);
  const [roomStates, setRoomStates] = useState<RoomState[]>([]);
  const [credentials, setCredentials] = useState<StayCredential[]>([]);
  const [ledgerSummary, setLedgerSummary] = useState<BookingDetail["ledger_summary"] | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState("");
  const [guestPartyId, setGuestPartyId] = useState("");
  const [credentialLabel, setCredentialLabel] = useState("前台门卡");
  const [rateForm, setRateForm] = useState({
    unitId: "",
    baseDailyRate: "300",
    freeCancelHours: "24",
    feeType: "fixed",
    feeValue: "0",
    requiresInspection: false
  });
  const [bookingForm, setBookingForm] = useState({
    unitId: "",
    arrivalDate: today(),
    departureDate: tomorrow(),
    guestCount: "1",
    sourceType: "direct"
  });
  const [turnoverPhotos, setTurnoverPhotos] = useState<Record<string, string[]>>({});
  const [turnoverWorkOrders, setTurnoverWorkOrders] = useState<Record<string, string>>({});
  const [financeForm, setFinanceForm] = useState({
    entryType: "payment",
    amount: "0",
    paymentMethod: "cash",
    reason: "人工收款登记"
  });

  const unitName = useMemo(
    () => new Map(units.map((unit) => [unit.id, `${unit.unitCode} · ${unit.unitName}`])),
    [units]
  );

  const refresh = useCallback(async () => {
    const token = getAccessToken();
    setLoading(true);
    try {
      const [dashboardResponse, unitsResponse, bookingsResponse, turnoversResponse, roomStateResponse] = await Promise.all([
        apiRequest<Dashboard>("/homestay/dashboard", { token }),
        apiRequest<PaginatedResult<UnitRow>>("/park-units?page=1&page_size=100", { token }).catch(() => null),
        apiRequest<PaginatedResult<Booking>>("/homestay/bookings?page=1&page_size=100", { token }),
        apiRequest<Turnover[]>("/homestay/turnovers", { token }),
        apiRequest<RoomState[]>(`/homestay/availability?date_from=${today()}&date_to=${tomorrow()}`, { token })
      ]);
      setDashboard(dashboardResponse.data);
      const availableUnits = unitsResponse?.data.items ?? [];
      setUnits(availableUnits);
      setBookings(bookingsResponse.data.items);
      setTurnovers(turnoversResponse.data);
      setRoomStates(roomStateResponse.data);
      const firstUnit = availableUnits[0]?.id ?? "";
      setRateForm((current) => ({ ...current, unitId: current.unitId || firstUnit }));
      setBookingForm((current) => ({ ...current, unitId: current.unitId || firstUnit }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载民宿运营数据失败");
    } finally {
      setLoading(false);
    }
  }, []);

  const prepareBooking = useCallback(async (bookingId: string) => {
    setSelectedBookingId(bookingId);
    const response = await apiRequest<BookingDetail>(`/homestay/bookings/${bookingId}`, {
      token: getAccessToken()
    });
    setCredentials(response.data.credentials);
    setLedgerSummary(response.data.ledger_summary);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function saveRate(event: FormEvent) {
    event.preventDefault();
    if (!rateForm.unitId) return;
    await runAction("基础日价已保存", () =>
      apiRequest(`/homestay/rates/${rateForm.unitId}`, {
        method: "PUT",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey("homestay-rate"),
        body: {
          base_daily_rate: Number(rateForm.baseDailyRate),
          free_cancel_before_hours: Number(rateForm.freeCancelHours),
          late_cancel_fee_type: rateForm.feeType,
          late_cancel_fee_value: Number(rateForm.feeValue),
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
    action: "confirm" | "check-in" | "check-out" | "cancel" | "no-show"
  ) {
    const body = ["cancel", "no-show"].includes(action) ? { reason: "运营人员人工确认" } : undefined;
    await runAction(`订单操作已完成：${action}`, () =>
      apiRequest(`/homestay/bookings/${booking.id}/${action}`, {
        method: "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey(`homestay-${action}`),
        body
      })
    );
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
    if (!selectedBookingId || !credentialLabel.trim()) return;
    await runAction("入住凭证已人工发放", () =>
      apiRequest(`/homestay/bookings/${selectedBookingId}/credentials`, {
        method: "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey("homestay-credential"),
        body: { credential_type: "card", credential_label: credentialLabel }
      })
    );
    await prepareBooking(selectedBookingId);
  }

  async function returnCredential(credentialId: string) {
    if (!selectedBookingId) return;
    await runAction("入住凭证已回收", () =>
      apiRequest(`/homestay/bookings/${selectedBookingId}/credentials/${credentialId}/return`, {
        method: "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey("homestay-credential-return")
      })
    );
    await prepareBooking(selectedBookingId);
  }

  async function registerFinance() {
    if (!selectedBookingId || Number(financeForm.amount) <= 0) return;
    await runAction("费用流水已登记并核销", () =>
      apiRequest(`/homestay/bookings/${selectedBookingId}/ledger`, {
        method: "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey("homestay-ledger"),
        body: {
          entry_type: financeForm.entryType,
          charge_type: financeForm.entryType === "payment" ? "room_collection" : "manual_adjustment",
          amount: Number(financeForm.amount),
          payment_method: financeForm.entryType === "payment" ? financeForm.paymentMethod : undefined,
          reason: financeForm.reason
        }
      })
    );
    await prepareBooking(selectedBookingId);
  }

  async function turnoverAction(task: Turnover, action: "start" | "complete" | "inspect" | "exception") {
    await runAction(`保洁任务已更新：${action}`, () =>
      apiRequest(`/homestay/turnovers/${task.id}/actions/${action}`, {
        method: "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey(`homestay-turnover-${action}`),
        body: {
          photo_file_ids: turnoverPhotos[task.id] ?? task.photoFileIds,
          exception_description: action === "exception" ? "现场发现异常，等待维修处理" : undefined,
          linked_work_order_id: turnoverWorkOrders[task.id] || undefined
        }
      })
    );
  }

  async function runAction(messageText: string, action: () => Promise<unknown>) {
    setLoading(true);
    setMessage("");
    try {
      await action();
      setMessage(messageText);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失败");
    } finally {
      setLoading(false);
    }
  }

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

      <section className="ds-kpi-grid">
        {([
          { label: "今日到店", value: dashboard.arrivals, Icon: CalendarDays },
          { label: "今日离店", value: dashboard.departures, Icon: CheckCircle2 },
          { label: "当前在住", value: dashboard.occupied, Icon: Users },
          { label: "可营房源", value: dashboard.rentable_units, Icon: Hotel },
          { label: "入住率", value: `${dashboard.occupancy_rate}%`, Icon: Users },
          { label: "平均房价", value: `¥${dashboard.average_daily_rate}`, Icon: CalendarDays },
          { label: "待保洁", value: dashboard.pending_turnovers, Icon: Sparkles },
          { label: "今日实收", value: `¥${dashboard.revenue}`, Icon: Hotel }
        ]).map(({ label, value, Icon }) => (
          <article className="ds-kpi-card" key={label}>
            <Icon size={20} />
            <span>{label}</span>
            <strong>{String(value)}</strong>
          </article>
        ))}
      </section>

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
        <form className="ds-panel" onSubmit={saveRate}>
          <h2>房源日价与取消规则</h2>
          <label>整套房源<select value={rateForm.unitId} onChange={(event) => setRateForm({ ...rateForm, unitId: event.target.value })}>
            <option value="">选择房源</option>
            {units.map((unit) => <option value={unit.id} key={unit.id}>{unitName.get(unit.id)}</option>)}
          </select></label>
          <div className={styles.formGrid}>
            <label>基础日价<input type="number" min="0" step="0.01" value={rateForm.baseDailyRate} onFocus={(event) => event.target.select()} onChange={(event) => setRateForm({ ...rateForm, baseDailyRate: event.target.value })} /></label>
            <label>免费取消（小时前）<input type="number" min="0" step="1" value={rateForm.freeCancelHours} onFocus={(event) => event.target.select()} onChange={(event) => setRateForm({ ...rateForm, freeCancelHours: event.target.value })} /></label>
            <label>超时取消费<select value={rateForm.feeType} onChange={(event) => setRateForm({ ...rateForm, feeType: event.target.value })}><option value="fixed">固定金额</option><option value="percentage">房费比例</option></select></label>
            <label>费用值<input type="number" min="0" step="0.01" value={rateForm.feeValue} onFocus={(event) => event.target.select()} onChange={(event) => setRateForm({ ...rateForm, feeValue: event.target.value })} /></label>
          </div>
          <label className={styles.checkbox}><input type="checkbox" checked={rateForm.requiresInspection} onChange={(event) => setRateForm({ ...rateForm, requiresInspection: event.target.checked })} />保洁后需复检才恢复可售</label>
          <PermissionButton permission={SYSTEM_PERMISSIONS.HOMESTAY_RATE_MANAGE} className="button button-primary" type="submit">保存价格规则</PermissionButton>
        </form>

        <form className="ds-panel" onSubmit={createBooking}>
          <h2>直订 / 人工录单</h2>
          <label>整套房源<select required value={bookingForm.unitId} onChange={(event) => setBookingForm({ ...bookingForm, unitId: event.target.value })}>
            <option value="">选择房源</option>
            {units.map((unit) => <option value={unit.id} key={unit.id}>{unitName.get(unit.id)}</option>)}
          </select></label>
          <div className={styles.formGrid}>
            <label>入住日<input type="date" required value={bookingForm.arrivalDate} onChange={(event) => setBookingForm({ ...bookingForm, arrivalDate: event.target.value })} /></label>
            <label>退房日<input type="date" required min={bookingForm.arrivalDate} value={bookingForm.departureDate} onChange={(event) => setBookingForm({ ...bookingForm, departureDate: event.target.value })} /></label>
            <label>住客人数<input type="number" min="1" max="50" step="1" value={bookingForm.guestCount} onFocus={(event) => event.target.select()} onChange={(event) => setBookingForm({ ...bookingForm, guestCount: event.target.value })} /></label>
            <label>订单来源<select value={bookingForm.sourceType} onChange={(event) => setBookingForm({ ...bookingForm, sourceType: event.target.value })}><option value="direct">自营直订</option><option value="manual">人工录单</option><option value="ota_reserved">OTA 预留字段</option></select></label>
          </div>
          <PermissionButton permission={SYSTEM_PERMISSIONS.HOMESTAY_BOOKING_CREATE} className="button button-primary" type="submit">计算逐夜价格并锁房</PermissionButton>
        </form>
      </section>

      <section className="ds-panel">
        <div className={styles.sectionTitle}><div><h2>订单与今日现场操作</h2><p>草稿锁房 30 分钟；入住前需登记实名住客并发放凭证。</p></div></div>
        <div className="ds-table-shell">
          <table>
            <thead><tr><th>订单</th><th>房源</th><th>住期</th><th>金额</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>{bookings.map((booking) => (
              <tr key={booking.id}>
                <td>{booking.bookingCode}</td><td>{unitName.get(booking.unitId) ?? booking.unitId}</td>
                <td>{booking.arrivalDate} → {booking.departureDate}</td><td>¥{booking.totalAmount}</td>
                <td><span className={styles.status}>{booking.status}</span></td>
                <td className={styles.actions}>
                  {booking.status === "draft" ? <PermissionButton permission={SYSTEM_PERMISSIONS.HOMESTAY_BOOKING_CONFIRM} onClick={() => void bookingAction(booking, "confirm")}>确认</PermissionButton> : null}
                  {booking.status === "confirmed" ? <PermissionButton permission={SYSTEM_PERMISSIONS.HOMESTAY_STAY_MANAGE} onClick={() => { void prepareBooking(booking.id); setMessage("请先在下方登记实名住客和入住凭证"); }}>入住准备</PermissionButton> : null}
                  {booking.status === "confirmed" ? <PermissionButton permission={SYSTEM_PERMISSIONS.HOMESTAY_STAY_MANAGE} onClick={() => void bookingAction(booking, "no-show")}>未到店</PermissionButton> : null}
                  {booking.status === "checked_in" ? <PermissionButton permission={SYSTEM_PERMISSIONS.HOMESTAY_STAY_MANAGE} onClick={() => void bookingAction(booking, "check-out")}>退房</PermissionButton> : null}
                  {["draft", "confirmed"].includes(booking.status) ? <PermissionButton permission={SYSTEM_PERMISSIONS.HOMESTAY_BOOKING_CANCEL} onClick={() => void bookingAction(booking, "cancel")}>取消</PermissionButton> : null}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div className="ds-mobile-record-list">
          {bookings.map((booking) => <article className="ds-mobile-record" key={booking.id}>
            <strong>{booking.bookingCode}</strong><span>{unitName.get(booking.unitId)}</span>
            <span>{booking.arrivalDate} → {booking.departureDate}</span><span>{booking.status} · ¥{booking.totalAmount}</span>
            <div className={styles.actions}>
              {booking.status === "draft" ? <PermissionButton permission={SYSTEM_PERMISSIONS.HOMESTAY_BOOKING_CONFIRM} onClick={() => void bookingAction(booking, "confirm")}>确认</PermissionButton> : null}
              {booking.status === "confirmed" ? <PermissionButton permission={SYSTEM_PERMISSIONS.HOMESTAY_STAY_MANAGE} onClick={() => void prepareBooking(booking.id)}>入住准备</PermissionButton> : null}
              {booking.status === "confirmed" ? <PermissionButton permission={SYSTEM_PERMISSIONS.HOMESTAY_STAY_MANAGE} onClick={() => void bookingAction(booking, "no-show")}>未到店</PermissionButton> : null}
              {booking.status === "checked_in" ? <PermissionButton permission={SYSTEM_PERMISSIONS.HOMESTAY_STAY_MANAGE} onClick={() => void bookingAction(booking, "check-out")}>退房</PermissionButton> : null}
              {["draft", "confirmed"].includes(booking.status) ? <PermissionButton permission={SYSTEM_PERMISSIONS.HOMESTAY_BOOKING_CANCEL} onClick={() => void bookingAction(booking, "cancel")}>取消</PermissionButton> : null}
            </div>
          </article>)}
        </div>
      </section>

      {selectedBookingId ? <section className={`ds-panel ${styles.stayPanel}`}>
        <h2>入住准备</h2>
        <p>订单：{bookings.find((item) => item.id === selectedBookingId)?.bookingCode}</p>
        <div className={styles.inlineForm}>
          <label>共享个人档案 ID<input value={guestPartyId} placeholder="UUID" onChange={(event) => setGuestPartyId(event.target.value)} /></label>
          <PermissionButton permission={SYSTEM_PERMISSIONS.HOMESTAY_STAY_MANAGE} type="button" onClick={() => void addGuest()}>登记并内部核验</PermissionButton>
          <label>门卡 / 钥匙标签<input value={credentialLabel} onChange={(event) => setCredentialLabel(event.target.value)} /></label>
          <PermissionButton permission={SYSTEM_PERMISSIONS.HOMESTAY_STAY_MANAGE} type="button" onClick={() => void issueCredential()}>人工发放凭证</PermissionButton>
          {credentials.map((credential) => (
            <div className={styles.credential} key={credential.id}>
              <span>{credential.credentialLabel} · {credential.status}</span>
              {credential.status === "issued" ? (
                <PermissionButton
                  permission={SYSTEM_PERMISSIONS.HOMESTAY_STAY_MANAGE}
                  type="button"
                  onClick={() => void returnCredential(credential.id)}
                >
                  回收凭证
                </PermissionButton>
              ) : null}
            </div>
          ))}
          <label>流水类型<select value={financeForm.entryType} onChange={(event) => setFinanceForm({ ...financeForm, entryType: event.target.value })}>
            <option value="payment">人工收款</option>
            <option value="refund">人工退款确认</option>
            <option value="charge">其他费用</option>
            <option value="waiver">人工减免</option>
          </select></label>
          <label>金额<input type="number" min="0.01" step="0.01" value={financeForm.amount} onFocus={(event) => event.target.select()} onChange={(event) => setFinanceForm({ ...financeForm, amount: event.target.value })} /></label>
          <label>收款方式<select value={financeForm.paymentMethod} onChange={(event) => setFinanceForm({ ...financeForm, paymentMethod: event.target.value })}>
            <option value="cash">现金</option><option value="bank_transfer">银行转账</option><option value="offline_other">其他线下方式</option>
          </select></label>
          <label>登记原因<input maxLength={500} value={financeForm.reason} onChange={(event) => setFinanceForm({ ...financeForm, reason: event.target.value })} /></label>
          <PermissionButton
            permission={financeForm.entryType === "waiver"
              ? SYSTEM_PERMISSIONS.HOMESTAY_FINANCE_WAIVE
              : SYSTEM_PERMISSIONS.HOMESTAY_FINANCE_REGISTER}
            type="button"
            onClick={() => void registerFinance()}
          >
            登记流水
          </PermissionButton>
          {ledgerSummary ? <div className={styles.ledgerSummary}>应收 ¥{ledgerSummary.charges} · 已收 ¥{ledgerSummary.payments} · 退款 ¥{ledgerSummary.refunds} · 减免 ¥{ledgerSummary.waivers} · 余额 ¥{ledgerSummary.balance}</div> : null}
          <PermissionButton permission={SYSTEM_PERMISSIONS.HOMESTAY_STAY_MANAGE} className="button button-primary" type="button" onClick={() => {
            const booking = bookings.find((item) => item.id === selectedBookingId);
            if (booking) void bookingAction(booking, "check-in");
          }}>办理入住</PermissionButton>
        </div>
      </section> : null}

      <section className="ds-panel">
        <div className={styles.sectionTitle}><div><h2>退房保洁</h2><p>退房立即转为不可售；保洁或复检完成后才释放运营占用。</p></div></div>
        <div className={styles.turnoverGrid}>{turnovers.map((task) => (
          <article className={styles.turnoverCard} key={task.id}>
            <div><strong>{unitName.get(task.unitId) ?? task.unitId}</strong><span>{task.status}</span></div>
            <FileUploader
              bizType="homestay_turnover"
              bizId={task.id}
              policyKey="image"
              compact
              label="上传现场照片"
              onUploaded={(file) => setTurnoverPhotos((current) => ({
                ...current,
                [task.id]: [...(current[task.id] ?? task.photoFileIds), file.id]
              }))}
            />
            <label>关联维修工单 ID（可选）
              <input
                value={turnoverWorkOrders[task.id] ?? ""}
                placeholder="UUID"
                onChange={(event) => setTurnoverWorkOrders((current) => ({
                  ...current,
                  [task.id]: event.target.value
                }))}
              />
            </label>
            <div className={styles.actions}>
              {task.status === "pending" ? <PermissionButton permission={SYSTEM_PERMISSIONS.HOMESTAY_TURNOVER_EXECUTE} onClick={() => void turnoverAction(task, "start")}>开始保洁</PermissionButton> : null}
              {["cleaning", "exception"].includes(task.status) ? <PermissionButton permission={SYSTEM_PERMISSIONS.HOMESTAY_TURNOVER_EXECUTE} onClick={() => void turnoverAction(task, "complete")}>完成保洁</PermissionButton> : null}
              {task.status === "inspection" ? <PermissionButton permission={SYSTEM_PERMISSIONS.HOMESTAY_TURNOVER_EXECUTE} onClick={() => void turnoverAction(task, "inspect")}>复检通过</PermissionButton> : null}
              {task.status !== "completed" ? <PermissionButton permission={SYSTEM_PERMISSIONS.HOMESTAY_TURNOVER_EXECUTE} onClick={() => void turnoverAction(task, "exception")}>上报异常</PermissionButton> : null}
            </div>
          </article>
        ))}</div>
      </section>
    </main>
  );
}
