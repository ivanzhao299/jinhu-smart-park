import type { FileRecord, PaginatedResult } from "@jinhu/shared";
import { apiRequest } from "../../../lib/api-client";
import { getAccessToken } from "../../../lib/authz";

export function pendingFilesQuery(bizType: string, bizId?: string): string {
  const query = new URLSearchParams({
    biz_type: bizType,
    page: "1",
    page_size: "100"
  });
  if (bizId) query.set("biz_id", bizId);
  if (bizType === "housing_repair" && bizId) query.set("pending", "true");
  return query.toString();
}

export async function loadPendingFiles(
  bizType: string,
  bizId?: string
): Promise<FileRecord[]> {
  const response = await apiRequest<PaginatedResult<FileRecord>>(
    `/files?${pendingFilesQuery(bizType, bizId)}`,
    { token: getAccessToken() }
  );
  return response.data.items;
}

export async function deletePendingFile(
  fileId: string,
  idempotencyKey: string
): Promise<void> {
  await apiRequest(`/files/${encodeURIComponent(fileId)}`, {
    method: "DELETE",
    token: getAccessToken(),
    idempotencyKey
  });
}
