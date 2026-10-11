export const WORK_CALENDAR_KINDS=["working","rest","statutory_holiday","other_holiday","unset"] as const;
export type WorkCalendarKind=typeof WORK_CALENDAR_KINDS[number];
export interface WorkCalendarDay {id:string;workDate:string;dayKind:WorkCalendarKind;dayName:string;version:number;updatedAt:string;}
export interface WorkCalendarHistory {id:string;version:number;dayKind:WorkCalendarKind;dayName:string;reason:string;occurredAt:string;actorName:string;}
export interface WorkCalendarBody {expectedVersion:number;dayKind:WorkCalendarKind;dayName:string;reason:string;}
