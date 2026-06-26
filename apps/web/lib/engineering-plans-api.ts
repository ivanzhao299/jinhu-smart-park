import { apiRequest, createIdempotencyKey } from "./api-client";
import type {
  CreateEngineeringPlanInput,
  EngineeringPlan,
  EngineeringPlanPage,
  EngineeringPlanQuery,
  UpdateEngineeringPlanInput,
  UpdateEngineeringPlanProgressInput,
  UpdateEngineeringPlanStatusInput
} from "./engineering-plans-types";

export const engineeringPlansApi = {
  async createPlan(input: CreateEngineeringPlanInput, token?: string): Promise<EngineeringPlan> {
    const response = await apiRequest<EngineeringPlan>("/engineering/plans", {
      method: "POST",
      token,
      idempotencyKey: createIdempotencyKey("engineering-plan-create"),
      body: compactObject(input)
    });
    return response.data;
  },

  async listPlans(query: EngineeringPlanQuery = {}, token?: string): Promise<EngineeringPlanPage> {
    const params = toSearchParams(query);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    const response = await apiRequest<EngineeringPlanPage>(`/engineering/plans${suffix}`, { token });
    return response.data;
  },

  async getPlan(id: string, token?: string): Promise<EngineeringPlan> {
    const response = await apiRequest<EngineeringPlan>(`/engineering/plans/${id}`, { token });
    return response.data;
  },

  async updatePlan(id: string, input: UpdateEngineeringPlanInput, token?: string): Promise<EngineeringPlan> {
    const response = await apiRequest<EngineeringPlan>(`/engineering/plans/${id}`, {
      method: "PATCH",
      token,
      idempotencyKey: createIdempotencyKey("engineering-plan-update"),
      body: compactObject(input)
    });
    return response.data;
  },

  async deletePlan(id: string, token?: string): Promise<{ id: string }> {
    const response = await apiRequest<{ id: string }>(`/engineering/plans/${id}`, {
      method: "DELETE",
      token,
      idempotencyKey: createIdempotencyKey("engineering-plan-delete")
    });
    return response.data;
  },

  async getProjectPlans(projectId: string, token?: string): Promise<EngineeringPlan[]> {
    const response = await apiRequest<EngineeringPlan[]>(`/engineering/projects/${projectId}/plans`, { token });
    return response.data;
  },

  async updatePlanProgress(id: string, input: UpdateEngineeringPlanProgressInput, token?: string): Promise<EngineeringPlan> {
    const response = await apiRequest<EngineeringPlan>(`/engineering/plans/${id}/progress`, {
      method: "PATCH",
      token,
      idempotencyKey: createIdempotencyKey("engineering-plan-progress"),
      body: compactObject(input)
    });
    return response.data;
  },

  async updatePlanStatus(id: string, input: UpdateEngineeringPlanStatusInput, token?: string): Promise<EngineeringPlan> {
    const response = await apiRequest<EngineeringPlan>(`/engineering/plans/${id}/status`, {
      method: "PATCH",
      token,
      idempotencyKey: createIdempotencyKey("engineering-plan-status"),
      body: compactObject(input)
    });
    return response.data;
  }
};

export function toSearchParams(query: EngineeringPlanQuery): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    params.set(key, String(value));
  }
  return params;
}

function compactObject<T extends object>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== null && value !== "")
  ) as Partial<T>;
}
