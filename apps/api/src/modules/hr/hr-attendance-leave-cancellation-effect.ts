import { approvedLeaveMinutesForWindow } from "./hr-attendance-approved-window";

export interface ApprovedLeaveSource {
  id: string;
  requestType: string;
  status: string;
  startAt: Date | null;
  endAt: Date | null;
}

export interface LeaveCancellationFact {
  sourceRequestId: string;
  status: string;
  startAt: Date;
  endAt: Date;
}

export interface EffectiveLeaveFragment {
  sourceRequestId: string;
  requestType: "leave";
  status: "approved";
  startAt: Date;
  endAt: Date;
}

/** Subtract only the approved cancellations bound to each original leave.
 * The caller authorizes and scopes both source sets before passing facts here.
 * Historical undated leave keeps the existing no-minute behavior. Invalid
 * approved cancellation facts fail instead of quietly erasing or adding time.
 */
export function effectiveApprovedLeaveFragments(
  sources: ReadonlyArray<ApprovedLeaveSource>,
  cancellations: ReadonlyArray<LeaveCancellationFact>,
): EffectiveLeaveFragment[] {
  const output: EffectiveLeaveFragment[] = [];
  for (const source of sources) {
    if (source.requestType !== "leave" || source.status !== "approved" || !source.startAt || !source.endAt) continue;
    const start = source.startAt.getTime(), end = source.endAt.getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const cuts = cancellations.filter(row => row.status === "approved" && row.sourceRequestId === source.id)
      .map(row => {
        const from = row.startAt.getTime(), to = row.endAt.getTime();
        if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || from < start || to > end) {
          throw new Error("ATTENDANCE_LEAVE_CANCELLATION_INVALID_FACT");
        }
        return [from, to] as const;
      }).sort((left, right) => left[0] - right[0]);
    const append = (from: number, to: number) => {
      if (to > from) output.push({ sourceRequestId: source.id, requestType: "leave", status: "approved", startAt: new Date(from), endAt: new Date(to) });
    };
    let cursor = start;
    for (const [from, to] of cuts) {
      if (from > cursor) append(cursor, from);
      cursor = Math.max(cursor, to);
    }
    append(cursor, end);
  }
  return output;
}

export function approvedLeaveMinutesAfterCancellations(
  sources: ReadonlyArray<ApprovedLeaveSource>,
  cancellations: ReadonlyArray<LeaveCancellationFact>,
  start: Date,
  end: Date,
): number {
  return approvedLeaveMinutesForWindow(effectiveApprovedLeaveFragments(sources, cancellations), start, end);
}
