import { apiRequest, createIdempotencyKey } from "./api-client";
import type {
  CreateEngineeringProjectInput,
  EngineeringProject,
  EngineeringProjectAvailableAction,
  EngineeringProjectPage,
  EngineeringProjectQuery,
  EngineeringProjectStatusLog,
  ExecuteEngineeringProjectActionInput,
  UpdateEngineeringProjectInput
} from "./engineering-projects-types";

export const engineeringProjectsApi = {
  async createProject(input: CreateEngineeringProjectInput, token?: string): Promise<EngineeringProject> {
    const response = await apiRequest<EngineeringProject>("/engineering/projects", {
      method: "POST",
      token,
      idempotencyKey: createIdempotencyKey("engineering-project-create"),
      body: compactObject(input)
    });
    return response.data;
  },

  async listProjects(query: EngineeringProjectQuery = {}, token?: string): Promise<EngineeringProjectPage> {
    const params = toSearchParams(query);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    const response = await apiRequest<EngineeringProjectPage>(`/engineering/projects${suffix}`, { token });
    return response.data;
  },

  async getProject(id: string, token?: string): Promise<EngineeringProject> {
    const response = await apiRequest<EngineeringProject>(`/engineering/projects/${id}`, { token });
    return response.data;
  },

  async updateProject(id: string, input: UpdateEngineeringProjectInput, token?: string): Promise<EngineeringProject> {
    const response = await apiRequest<EngineeringProject>(`/engineering/projects/${id}`, {
      method: "PATCH",
      token,
      idempotencyKey: createIdempotencyKey("engineering-project-update"),
      body: compactObject(input)
    });
    return response.data;
  },

  async deleteProject(id: string, token?: string): Promise<{ id: string }> {
    const response = await apiRequest<{ id: string }>(`/engineering/projects/${id}`, {
      method: "DELETE",
      token,
      idempotencyKey: createIdempotencyKey("engineering-project-delete")
    });
    return response.data;
  },

  async executeProjectAction(
    id: string,
    action: string,
    input: ExecuteEngineeringProjectActionInput,
    token?: string
  ): Promise<EngineeringProject> {
    const response = await apiRequest<EngineeringProject>(`/engineering/projects/${id}/actions/${action}`, {
      method: "POST",
      token,
      idempotencyKey: createIdempotencyKey("engineering-project-action"),
      body: compactObject(input)
    });
    return response.data;
  },

  async getAvailableActions(id: string, token?: string): Promise<EngineeringProjectAvailableAction[]> {
    const response = await apiRequest<EngineeringProjectAvailableAction[]>(`/engineering/projects/${id}/actions`, { token });
    return response.data;
  },

  async getStatusLogs(id: string, token?: string): Promise<EngineeringProjectStatusLog[]> {
    const response = await apiRequest<EngineeringProjectStatusLog[]>(`/engineering/projects/${id}/status-logs`, { token });
    return response.data;
  }
};

export function toSearchParams(query: EngineeringProjectQuery): URLSearchParams {
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
