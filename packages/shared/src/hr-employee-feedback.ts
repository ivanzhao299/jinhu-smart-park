export const HR_EMPLOYEE_FEEDBACK_KINDS=['suggestion','complaint'] as const;
export const HR_EMPLOYEE_FEEDBACK_STATUSES=['draft','submitted','answered','withdrawn','cancelled'] as const;
export type HrEmployeeFeedbackKind=typeof HR_EMPLOYEE_FEEDBACK_KINDS[number];
export type HrEmployeeFeedbackStatus=typeof HR_EMPLOYEE_FEEDBACK_STATUSES[number];
export type HrEmployeeFeedbackView='mine'|'hr';
export type HrEmployeeFeedbackAction='create'|'edit'|'submit'|'cancel'|'withdraw'|'reply';
export const HR_EMPLOYEE_FEEDBACK_LIMITS={title:120,content:4000,reply:4000,reason:1000} as const;
export interface HrEmployeeFeedbackDraft {kind:HrEmployeeFeedbackKind;title:string;content:string;reason:string;}
export interface HrEmployeeFeedbackEdit extends HrEmployeeFeedbackDraft {expectedVersion:number;}
export interface HrEmployeeFeedbackCommand {expectedVersion:number;reason:string;}
export interface HrEmployeeFeedbackReply extends HrEmployeeFeedbackCommand {reply:string;}
export interface HrEmployeeFeedbackReceipt {id:string;version:number;status:HrEmployeeFeedbackStatus;actionId:string;}
export interface HrEmployeeFeedbackEmployee {id:string;employeeCode:string;name:string;}
export interface HrEmployeeFeedbackContext {canSelf:boolean;canHr:boolean;employee:HrEmployeeFeedbackEmployee|null;}
export interface HrEmployeeFeedbackItem {id:string;kind:HrEmployeeFeedbackKind;title:string;status:HrEmployeeFeedbackStatus;version:number;employee:HrEmployeeFeedbackEmployee;createdAt:string;updatedAt:string;}
export interface HrEmployeeFeedbackDetail extends HrEmployeeFeedbackItem {content:string;reply:string|null;capabilities:{canEdit:boolean;canSubmit:boolean;canCancel:boolean;canWithdraw:boolean;canReply:boolean};}
export interface HrEmployeeFeedbackHistoryItem {id:string;version:number;action:HrEmployeeFeedbackAction;fromStatus:HrEmployeeFeedbackStatus|null;toStatus:HrEmployeeFeedbackStatus;reason:string;actorName:string|null;createdAt:string;snapshot:{kind:HrEmployeeFeedbackKind;title:string;content:string;reply:string|null;status:HrEmployeeFeedbackStatus};}
export interface HrEmployeeFeedbackPage<T> {items:T[];total:number;page:number;pageSize:number;}
export function isHrEmployeeFeedbackText(value:unknown,max:number,min=1):value is string{return typeof value==='string'&&[...value].length<=max&&[...value.trim()].length>=min&&!value.includes(String.fromCharCode(0));}
