import type { InspectItemRow, InspectTaskResultRow, ResultInput } from "./terminal-types";

export interface ResultFieldAccess {
  valueTextEditable: boolean;
  valueNumberEditable: boolean;
  photoFileIdsEditable: boolean;
}

export interface ResultMutationPayload {
  item_id: string;
  result: string;
  value_text?: string | null;
  value_number?: number | null;
  photo_file_ids?: string[];
  create_hazard: boolean;
}

export function prepareResultInputs(
  itemsProjection: unknown,
  resultsProjection: unknown,
  access: ResultFieldAccess
): Record<string, ResultInput> {
  if (!isInspectItemArray(itemsProjection) || !isInspectResultArray(resultsProjection)) {
    throw new Error("巡检执行数据格式异常，请刷新后重试或联系管理员");
  }
  const items = itemsProjection;
  const results = resultsProjection;
  const existing = new Map(results.map((result) => [result.itemId, result]));
  return Object.fromEntries(items.map((item) => {
    const result = existing.get(item.id);
    const valueTextEditable = access.valueTextEditable
      && (!result || Object.prototype.hasOwnProperty.call(result, "valueText"));
    const valueNumberEditable = access.valueNumberEditable
      && (!result || Object.prototype.hasOwnProperty.call(result, "valueNumber"));
    const photoFileIdsEditable = access.photoFileIdsEditable
      && (!result || isStringArray(result.photoFileIds));
    return [item.id, {
      result: result?.result ?? "normal",
      valueText: valueTextEditable && typeof result?.valueText === "string" ? result.valueText : "",
      valueTextEditable,
      valueNumber: valueNumberEditable && isNumericProjection(result?.valueNumber) ? String(result?.valueNumber ?? "") : "",
      valueNumberEditable,
      photoFileIds: photoFileIdsEditable && isStringArray(result?.photoFileIds) ? result.photoFileIds : [],
      photoFileIdsEditable,
      createHazard: !result?.hazardCreated
    } satisfies ResultInput];
  }));
}

export function mergeLocalDraftResultInputs(
  authoritative: Record<string, ResultInput>,
  draft: Record<string, ResultInput> | undefined
): Record<string, ResultInput> {
  return Object.fromEntries(Object.entries(authoritative).map(([itemId, current]) => {
    const saved = draft?.[itemId];
    if (!saved) return [itemId, current];
    return [itemId, {
      ...current,
      result: typeof saved.result === "string" ? saved.result : current.result,
      valueText: current.valueTextEditable && typeof saved.valueText === "string" ? saved.valueText : current.valueText,
      valueNumber: current.valueNumberEditable && typeof saved.valueNumber === "string" ? saved.valueNumber : current.valueNumber,
      photoFileIds: current.photoFileIdsEditable && isStringArray(saved.photoFileIds) ? saved.photoFileIds : current.photoFileIds,
      createHazard: typeof saved.createHazard === "boolean" ? saved.createHazard : current.createHazard
    } satisfies ResultInput];
  }));
}

export function buildResultMutationPayload(
  itemId: string,
  input: ResultInput,
  createHazard: boolean
): ResultMutationPayload {
  return {
    item_id: itemId,
    result: input.result,
    ...(input.valueTextEditable ? { value_text: input.valueText.trim() || null } : {}),
    ...(input.valueNumberEditable ? { value_number: input.valueNumber.trim() ? Number(input.valueNumber) : null } : {}),
    ...(input.photoFileIdsEditable ? { photo_file_ids: input.photoFileIds } : {}),
    create_hazard: createHazard
  };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isInspectItemArray(value: unknown): value is InspectItemRow[] {
  return Array.isArray(value) && value.every((item) => (
    typeof item === "object"
    && item !== null
    && typeof (item as { id?: unknown }).id === "string"
    && Boolean((item as { id: string }).id.trim())
  ));
}

function isInspectResultArray(value: unknown): value is InspectTaskResultRow[] {
  return Array.isArray(value) && value.every((result) => (
    typeof result === "object"
    && result !== null
    && typeof (result as { itemId?: unknown }).itemId === "string"
    && Boolean((result as { itemId: string }).itemId.trim())
  ));
}

function isNumericProjection(value: unknown): value is string | number | null | undefined {
  if (value === null || value === undefined || value === "") return true;
  return (typeof value === "string" || typeof value === "number") && Number.isFinite(Number(value));
}
