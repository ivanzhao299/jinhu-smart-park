import type { HrCompensationAssignment, HrCompensationAssignmentBody, HrCompensationAssignmentReceipt } from "../../../lib/hr-api";

export function validCompensationDate(value: unknown): value is string {
 if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
 const date = new Date(`${value}T00:00:00.000Z`);
 return !Number.isNaN(date.getTime()) && date.toISOString().slice(0,10) === value && value >= "1900-01-01" && value <= "2100-12-31";
}
export function compensationMoney(value: unknown) {
 if (typeof value !== "string" || !/^(0|[1-9]\d{0,15})(?:\.\d{1,2})?$/u.test(value)) return null;
 const [whole,fraction=""] = value.split(".");
 return `${whole}.${fraction.padEnd(2,"0")}`;
}
export function validCompensationAssignment(row: HrCompensationAssignment) {
 return !!row && [row.id,row.employeeId,row.employeeCode,row.employeeName,row.planId,row.planCode,row.planName,row.status].every(value => typeof value === "string" && !!value)
  && validCompensationDate(row.effectiveFrom) && (row.effectiveTo === null || validCompensationDate(row.effectiveTo)) && (!row.effectiveTo || row.effectiveTo >= row.effectiveFrom)
  && [row.baseSalary,row.allowanceAmount,row.variableTarget].every(value => compensationMoney(value) !== null) && Number.isSafeInteger(row.version) && row.version >= 1;
}
export function previousCompensationDate(value: string) {
 const date = new Date(`${value}T00:00:00.000Z`); date.setUTCDate(date.getUTCDate()-1); return date.toISOString().slice(0,10);
}
export function validCompensationReceipt(receipt: HrCompensationAssignmentReceipt, body: HrCompensationAssignmentBody, predecessor: HrCompensationAssignment|null) {
 if (!receipt || !validCompensationAssignment(receipt.assignment)) return false;
 const row = receipt.assignment;
 if (receipt.id !== row.id || row.employeeId !== body.employeeId || row.planId !== body.planId || row.effectiveFrom !== body.effectiveFrom || row.effectiveTo !== (body.effectiveTo || null) || row.status !== "active" || row.version !== 1 || !(["baseSalary","allowanceAmount","variableTarget"] as const).every(field => compensationMoney(row[field]) === compensationMoney(body[field]))) return false;
 if (!body.replaceAssignmentId) return receipt.replaced === null;
 const replaced = receipt.replaced;
 return !!predecessor && !!replaced && replaced.id === body.replaceAssignmentId && replaced.beforeVersion === body.expectedReplacementVersion && replaced.afterVersion === predecessor.version+1 && replaced.effectiveFrom === predecessor.effectiveFrom && replaced.beforeEffectiveTo === predecessor.effectiveTo && replaced.effectiveTo === previousCompensationDate(body.effectiveFrom);
}
