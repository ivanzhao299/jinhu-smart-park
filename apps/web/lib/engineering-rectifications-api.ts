import { apiRequest, createIdempotencyKey } from "./api-client";
import type {
  CreateEngineeringRectificationInput,
  EngineeringRectification,
  EngineeringRectificationActionInput,
  EngineeringRectificationPage,
  EngineeringRectificationQuery,
  UpdateEngineeringRectificationInput
} from "./engineering-rectifications-types";

export const engineeringRectificationsApi = {
  async createRectification(input: CreateEngineeringRectificationInput, token?: string): Promise<EngineeringRectification> {
    const response = await apiRequest<EngineeringRectification>("/engineering/rectifications", {
      method: "POST",
      token,
      idempotencyKey: createIdempotencyKey("engineering-rectification-create"),
      body: compactObject(input)
    });
    return response.data;
  },

  async listRectifications(query: EngineeringRectificationQuery = {}, token?: string): Promise<EngineeringRectificationPage> {
    const params = toSearchParams(query);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    const response = await apiRequest<EngineeringRectificationPage>(`/engineering/rectifications${suffix}`, { token });
    return response.data;
  },

  async getRectification(id: string, token?: string): Promise<EngineeringRectification> {
    const response = await apiRequest<EngineeringRectification>(`/engineering/rectifications/${id}`, { token });
    return response.data;
  },

  async updateRectification(id: string, input: UpdateEngineeringRectificationInput, token?: string): Promise<EngineeringRectification> {
    const response = await apiRequest<EngineeringRectification>(`/engineering/rectifications/${id}`, {
      method: "PATCH",
      token,
      idempotencyKey: createIdempotencyKey("engineering-rectification-update"),
      body: compactObject(input)
    });
    return response.data;
  },

  async executeRectificationAction(id: string, input: EngineeringRectificationActionInput, token?: string): Promise<EngineeringRectification> {
    const response = await apiRequest<EngineeringRectification>(`/engineering/rectifications/${id}/actions`, {
      method: "POST",
      token,
      idempotencyKey: createIdempotencyKey(`engineering-rectification-action-${input.action}`),
      body: compactObject(input)
    });
    return response.data;
  },

  async deleteRectification(id: string, token?: string): Promise<{ id: string }> {
    const response = await apiRequest<{ id: string }>(`/engineering/rectifications/${id}`, {
      method: "DELETE",
      token,
      idempotencyKey: createIdempotencyKey("engineering-rectification-delete")
    });
    return response.data;
  },

  async getProjectRectifications(projectId: string, token?: string): Promise<EngineeringRectification[]> {
    const response = await apiRequest<EngineeringRectification[]>(`/engineering/projects/${projectId}/rectifications`, { token });
    return response.data;
  }
};

export function toSearchParams(query: EngineeringRectificationQuery): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  return params;
}

function compactObject<T extends object>(input: T): Partial<T> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== null && value !== "")) as Partial<T>;
}
