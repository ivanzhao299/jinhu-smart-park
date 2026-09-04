const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export type LeaveRoutineBranch = "single_first_insert" | "first_insert" | "middle_select" | "final_select";

export interface LeaveRoutineDaySegment {
  workDate: string;
  branch: LeaveRoutineBranch;
  legacyHours: number;
  modernMinutes: number;
}

export interface LeaveRoutineImpact {
  plannedMinutes: number;
  effectiveMinutes: number;
  dayCount: number;
  segments: LeaveRoutineDaySegment[];
}

interface LeaveRoutineRequestLike {
  requestType: string;
  status: string;
  startAt: Date | null;
  endAt: Date | null;
}

const shanghaiDate = (instant: Date) => new Date(instant.getTime() + SHANGHAI_OFFSET_MS).toISOString().slice(0, 10);

const shanghaiInstant = (date: string, hour: number) =>
  new Date(new Date(`${date}T00:00:00Z`).getTime() - SHANGHAI_OFFSET_MS + hour * 60 * MINUTE_MS);

const nextDate = (date: string) => new Date(new Date(`${date}T00:00:00Z`).getTime() + DAY_MS).toISOString().slice(0, 10);

const legacyDatediffHours = (from: Date, to: Date) =>
  Math.floor(to.getTime() / (60 * MINUTE_MS)) - Math.floor(from.getTime() / (60 * MINUTE_MS));

/**
 * Describes the observable bs_readfromLeave calendar branches while producing the
 * normalized modern leave impact. The historical procedure's first-day write and
 * later-day SELECT-only anomaly is evidence, not a mutation pattern to reproduce.
 */
export function projectLeaveRoutineSegments(startAt: Date | null, endAt: Date | null): LeaveRoutineDaySegment[] {
  if (!startAt || !endAt || !Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime()) || endAt <= startAt || endAt.getTime() - startAt.getTime() > 31 * DAY_MS) return [];
  const firstDate = shanghaiDate(startAt);
  const finalDate = shanghaiDate(endAt);
  const segments: LeaveRoutineDaySegment[] = [];
  for (let workDate = firstDate, index = 0; workDate <= finalDate && index < 32; workDate = nextDate(workDate), index += 1) {
    const isFirst = workDate === firstDate;
    const isFinal = workDate === finalDate;
    const workStart = shanghaiInstant(workDate, 9);
    const workEnd = shanghaiInstant(workDate, 17);
    const overlapStart = new Date(Math.max(startAt.getTime(), workStart.getTime()));
    const overlapEnd = new Date(Math.min(endAt.getTime(), workEnd.getTime()));
    const modernMinutes = Math.max(0, Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / MINUTE_MS));
    const branch: LeaveRoutineBranch = isFirst ? (isFinal ? "single_first_insert" : "first_insert") : isFinal ? "final_select" : "middle_select";
    const legacyHours = isFirst
      ? legacyDatediffHours(startAt, workEnd)
      : isFinal
        ? legacyDatediffHours(workStart, endAt)
        : 8;
    segments.push({ workDate, branch, legacyHours, modernMinutes });
  }
  return segments;
}

export function projectLeaveRoutineImpact(request: LeaveRoutineRequestLike): LeaveRoutineImpact {
  const segments = request.requestType === "leave" ? projectLeaveRoutineSegments(request.startAt, request.endAt) : [];
  const plannedMinutes = segments.reduce((sum, segment) => sum + segment.modernMinutes, 0);
  return {
    plannedMinutes,
    effectiveMinutes: request.status === "approved" ? plannedMinutes : 0,
    dayCount: segments.filter(segment => segment.modernMinutes > 0).length,
    segments,
  };
}

export function approvedLeaveMinutesForWorkDate(requests: LeaveRoutineRequestLike[], workDate: string): number {
  return requests.reduce((sum, request) => {
    if (request.status !== "approved" || request.requestType !== "leave") return sum;
    return sum + (projectLeaveRoutineSegments(request.startAt, request.endAt).find(segment => segment.workDate === workDate)?.modernMinutes ?? 0);
  }, 0);
}
