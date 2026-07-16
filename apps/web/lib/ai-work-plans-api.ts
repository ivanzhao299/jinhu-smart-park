import type { PaginatedResult } from "@jinhu/shared";
import { apiRequest, createIdempotencyKey } from "./api-client";
import type { AiWorkPlan, AiWorkPlanDetail, WorkforceDirectoryPerson } from "./ai-work-plans-types";

export async function createAiWorkPlan(token: string, input: { instruction: string; default_due_at?: string; location?: string }) {
  return (await apiRequest<AiWorkPlanDetail>("/ai/work-plans", {
    method: "POST",
    token,
    idempotencyKey: createIdempotencyKey("ai-work-plan-create"),
    body: input
  })).data;
}
export async function listAiWorkPlans(token: string) {
  return (await apiRequest<PaginatedResult<AiWorkPlan>>("/ai/work-plans?page=1&page_size=12", { token })).data;
}

export async function getAiWorkPlan(token: string, id: string) {
  return (await apiRequest<AiWorkPlanDetail>(`/ai/work-plans/${id}`, { token })).data;
}

export async function getWorkforceDirectory(token: string) {
  return (await apiRequest<WorkforceDirectoryPerson[]>("/ai/work-plans/directory", { token })).data;
}

export async function updateAiWorkPlanTask(
  token: string,
  planId: string,
  taskId: string,
  input: {
    confirmed_assignee_id?: string | null;
    due_at?: string | null;
    title?: string;
    acceptance_criteria?: string;
    planned_effort_minutes?: number;
  }
) {
  return (await apiRequest<AiWorkPlanDetail>(`/ai/work-plans/${planId}/tasks/${taskId}`, {
    method: "PATCH",
    token,
    body: input
  })).data;
}

export async function approveAiWorkPlan(token: string, planId: string, comment?: string) {
  return (await apiRequest<AiWorkPlanDetail>(`/ai/work-plans/${planId}/approve`, {
    method: "POST",
    token,
    idempotencyKey: createIdempotencyKey("ai-work-plan-approve"),
    body: { comment }
  })).data;
}

export async function materializeAiWorkPlan(token: string, planId: string) {
  return (await apiRequest<AiWorkPlanDetail>(`/ai/work-plans/${planId}/materialize`, {
    method: "POST",
    token,
    idempotencyKey: createIdempotencyKey("ai-work-plan-materialize"),
    body: { confirm: true }
  })).data;
}

export async function rejectAiWorkPlan(token: string, planId: string, reason: string) {
  return (await apiRequest<AiWorkPlanDetail>(`/ai/work-plans/${planId}/reject`, {
    method: "POST",
    token,
    idempotencyKey: createIdempotencyKey("ai-work-plan-reject"),
    body: { reason }
  })).data;
}
