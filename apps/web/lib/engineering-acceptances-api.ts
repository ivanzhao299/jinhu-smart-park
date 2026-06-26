import { apiRequest, createIdempotencyKey } from "./api-client";
import type {
  CreateEngineeringAcceptanceInput,
  EngineeringAcceptance,
  EngineeringAcceptancePage,
  EngineeringAcceptanceQuery,
  ReviewEngineeringAcceptanceInput,
  UpdateEngineeringAcceptanceInput
} from "./engineering-acceptances-types";

export const engineeringAcceptancesApi = {
  async createAcceptance(input: CreateEngineeringAcceptanceInput, token?: string): Promise<EngineeringAcceptance> {
    const response = await apiRequest<EngineeringAcceptance>("/engineering/acceptances", {
      method: "POST",
      token,
      idempotencyKey: createIdempotencyKey("engineering-acceptance-create"),
      body: compactObject(input)
    });
    return response.data;
  },

  async listAcceptances(query: EngineeringAcceptanceQuery = {}, token?: string): Promise<EngineeringAcceptancePage> {
    const params = toSearchParams(query);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    const response = await apiRequest<EngineeringAcceptancePage>(`/engineering/acceptances${suffix}`, { token });
    return response.data;
  },

  async getAcceptance(id: string, token?: string): Promise<EngineeringAcceptance> {
    const response = await apiRequest<EngineeringAcceptance>(`/engineering/acceptances/${id}`, { token });
    return response.data;
  },

  async updateAcceptance(id: string, input: UpdateEngineeringAcceptanceInput, token?: string): Promise<EngineeringAcceptance> {
    const response = await apiRequest<EngineeringAcceptance>(`/engineering/acceptances/${id}`, {
      method: "PATCH",
      token,
      idempotencyKey: createIdempotencyKey("engineering-acceptance-update"),
      body: compactObject(input)
    });
    return response.data;
  },

  async deleteAcceptance(id: string, token?: string): Promise<{ id: string }> {
    const response = await apiRequest<{ id: string }>(`/engineering/acceptances/${id}`, {
      method: "DELETE",
      token,
      idempotencyKey: createIdempotencyKey("engineering-acceptance-delete")
    });
    return response.data;
  },

  async submitAcceptance(id: string, token?: string): Promise<EngineeringAcceptance> {
    const response = await apiRequest<EngineeringAcceptance>(`/engineering/acceptances/${id}/submit`, {
      method: "POST",
      token,
      idempotencyKey: createIdempotencyKey("engineering-acceptance-submit")
    });
    return response.data;
  },

  async reviewAcceptance(id: string, input: ReviewEngineeringAcceptanceInput, token?: string): Promise<EngineeringAcceptance> {
    const response = await apiRequest<EngineeringAcceptance>(`/engineering/acceptances/${id}/review`, {
      method: "POST",
      token,
      idempotencyKey: createIdempotencyKey("engineering-acceptance-review"),
      body: compactObject(input)
    });
    return response.data;
  },

  async closeAcceptance(id: string, token?: string): Promise<EngineeringAcceptance> {
    const response = await apiRequest<EngineeringAcceptance>(`/engineering/acceptances/${id}/close`, {
      method: "POST",
      token,
      idempotencyKey: createIdempotencyKey("engineering-acceptance-close")
    });
    return response.data;
  },

  async getProjectAcceptances(projectId: string, token?: string): Promise<EngineeringAcceptance[]> {
    const response = await apiRequest<EngineeringAcceptance[]>(`/engineering/projects/${projectId}/acceptances`, { token });
    return response.data;
  }
};

export function toSearchParams(query: EngineeringAcceptanceQuery): URLSearchParams {
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
