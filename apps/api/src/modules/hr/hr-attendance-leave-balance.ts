import { approvedLeaveMinutesForWindow } from "./hr-attendance-approved-window";
import {
  effectiveApprovedLeaveFragments,
  type ApprovedLeaveSource,
  type LeaveCancellationFact,
} from "./hr-attendance-leave-cancellation-effect";

export interface ClassifiedLeaveSource extends ApprovedLeaveSource {
  leaveTypeId: string | null;
}

export interface LeaveBalanceOpening {
  leaveTypeId: string;
  openingMinutes: number | null;
  adjustmentMinutes: number;
}

export type LeaveBalanceBlocker =
  | "opening_unknown"
  | "schedule_coverage_incomplete"
  | "source_coverage_incomplete"
  | "approved_leave_undated"
  | "leave_classification_incomplete"
  | "leave_type_overlap";

export interface LeaveBalanceInput {
  from: Date;
  to: Date;
  /** Server evidence only: an empty schedule is not proof of a rest period. */
  scheduleCoverageComplete: boolean;
  sourceCoverageComplete: boolean;
  schedules: ReadonlyArray<{ startAt: Date; endAt: Date }>;
  openings: ReadonlyArray<LeaveBalanceOpening>;
  sources: ReadonlyArray<ClassifiedLeaveSource>;
  cancellations: ReadonlyArray<LeaveCancellationFact>;
}

type Interval = readonly [number, number];
const MAX_MINUTES = 2147483647;

function instant(value: Date): number {
  const ms = value.getTime();
  if (!Number.isFinite(ms) || ms % 60000 !== 0) throw new Error("LEAVE_BALANCE_INVALID_INSTANT");
  return ms;
}

function interval(start: Date, end: Date): Interval {
  const from = instant(start), to = instant(end);
  if (to <= from) throw new Error("LEAVE_BALANCE_INVALID_INTERVAL");
  return [from, to];
}

function quantity(value: number, signed = false): number {
  if (!Number.isInteger(value) || Math.abs(value) > MAX_MINUTES || (!signed && value < 0)) {
    throw new Error("LEAVE_BALANCE_INVALID_QUANTITY");
  }
  return value;
}

function mergeWindows(windows: Interval[]): Interval[] {
  const result: Array<[number, number]> = [];
  for (const [from, to] of windows.sort((a, b) => a[0] - b[0])) {
    const previous = result.at(-1);
    if (previous && from <= previous[1]) previous[1] = Math.max(previous[1], to);
    else result.push([from, to]);
  }
  return result;
}

/** Project explicit quota facts. Does not grant entitlement, reserve leave, reject
 * approval or update payroll. Callers must authorize all inputs and obtain them
 * from one database snapshot, including complete schedule/source coverage.
 */
export function calculateLeaveBalances(input: LeaveBalanceInput) {
  const [from, to] = interval(input.from, input.to);
  const windows = mergeWindows(input.schedules.map(row => interval(row.startAt, row.endAt))
    .map(([start, end]) => [Math.max(from, start), Math.min(to, end)] as Interval)
    .filter(([start, end]) => end > start));
  const openings = new Map<string, LeaveBalanceOpening>();
  for (const row of input.openings) {
    if (!row.leaveTypeId || openings.has(row.leaveTypeId)) throw new Error("LEAVE_BALANCE_DUPLICATE_TYPE");
    if (row.openingMinutes !== null) quantity(row.openingMinutes);
    quantity(row.adjustmentMinutes, true);
    openings.set(row.leaveTypeId, row);
  }
  const sources = new Map<string, ClassifiedLeaveSource>();
  let undated = false;
  for (const row of input.sources) {
    if (!row.id || sources.has(row.id)) throw new Error("LEAVE_BALANCE_DUPLICATE_SOURCE");
    sources.set(row.id, row);
    if (row.requestType !== "leave" || row.status !== "approved") continue;
    if (row.leaveTypeId !== null && !openings.has(row.leaveTypeId)) throw new Error("LEAVE_BALANCE_UNKNOWN_TYPE");
    if (!row.startAt || !row.endAt) undated = true;
    else interval(row.startAt, row.endAt);
  }
  for (const row of input.cancellations) {
    if (row.status !== "approved") continue;
    const source = sources.get(row.sourceRequestId);
    if (!source || source.requestType !== "leave" || source.status !== "approved") {
      throw new Error("LEAVE_BALANCE_ORPHAN_CANCELLATION");
    }
    interval(row.startAt, row.endAt);
    if (!source.startAt || !source.endAt) throw new Error("LEAVE_BALANCE_UNDATED_CANCELLATION_SOURCE");
  }
  const fragments = effectiveApprovedLeaveFragments(input.sources, input.cancellations);
  const minutes = (rows: typeof fragments) => quantity(windows.reduce((sum, [start, end]) =>
    sum + approvedLeaveMinutesForWindow(rows, new Date(start), new Date(end)), 0));
  const unclassified = fragments.filter(row => sources.get(row.sourceRequestId)!.leaveTypeId === null);
  const unclassifiedMinutes = minutes(unclassified);
  const conflicts = new Set<string>();
  for (let left = 0; left < fragments.length; left++) {
    const a = fragments[left]!, aType = sources.get(a.sourceRequestId)!.leaveTypeId;
    for (const b of fragments.slice(left + 1)) {
      const bType = sources.get(b.sourceRequestId)!.leaveTypeId;
      if (aType === bType) continue;
      const start = Math.max(a.startAt.getTime(), b.startAt.getTime());
      const end = Math.min(a.endAt.getTime(), b.endAt.getTime());
      if (windows.some(([workStart, workEnd]) => Math.min(end, workEnd) > Math.max(start, workStart))) {
        if (aType !== null) conflicts.add(aType);
        if (bType !== null) conflicts.add(bType);
      }
    }
  }
  const common: LeaveBalanceBlocker[] = [];
  if (!input.scheduleCoverageComplete) common.push("schedule_coverage_incomplete");
  if (!input.sourceCoverageComplete) common.push("source_coverage_incomplete");
  if (undated) common.push("approved_leave_undated");
  if (unclassifiedMinutes > 0) common.push("leave_classification_incomplete");
  const items = input.openings.map(opening => {
    const typed = fragments.filter(row => sources.get(row.sourceRequestId)!.leaveTypeId === opening.leaveTypeId);
    const observedMinutes = minutes(typed), blockers = [...common];
    if (conflicts.has(opening.leaveTypeId)) blockers.push("leave_type_overlap");
    // Opening availability affects the balance, not the observed leave quantity.
    const consumedMinutes = blockers.length ? null : observedMinutes;
    if (opening.openingMinutes === null) blockers.push("opening_unknown");
    const balanceMinutes = blockers.length || opening.openingMinutes === null ? null
      : quantity(opening.openingMinutes + opening.adjustmentMinutes - observedMinutes, true);
    return { ...opening, observedMinutes, consumedMinutes, balanceMinutes, blockers };
  });
  return { from: input.from.toISOString(), to: input.to.toISOString(), unclassifiedMinutes, items };
}
