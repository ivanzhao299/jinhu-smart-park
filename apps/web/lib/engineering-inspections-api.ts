import { apiRequest, createIdempotencyKey } from "./api-client";
import type {
  CreateEngineeringInspectionInput,
  CreateEngineeringIssueInput,
  EngineeringInspection,
  EngineeringInspectionPage,
  EngineeringInspectionQuery,
  EngineeringIssue,
  EngineeringIssuePage,
  EngineeringIssueQuery,
  GenerateEngineeringRectificationInput,
  UpdateEngineeringInspectionInput,
  UpdateEngineeringIssueInput
} from "./engineering-inspections-types";
import type { EngineeringRectification } from "./engineering-rectifications-types";

export const engineeringInspectionsApi = {
  async createInspection(input: CreateEngineeringInspectionInput, token?: string): Promise<EngineeringInspection> {
    const response = await apiRequest<EngineeringInspection>("/engineering/inspections", {
      method: "POST",
      token,
      idempotencyKey: createIdempotencyKey("engineering-inspection-create"),
      body: compactObject(input)
    });
    return response.data;
  },

  async listInspections(query: EngineeringInspectionQuery = {}, token?: string): Promise<EngineeringInspectionPage> {
    const params = toSearchParams(query);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    const response = await apiRequest<EngineeringInspectionPage>(`/engineering/inspections${suffix}`, { token });
    return response.data;
  },

  async getInspection(id: string, token?: string): Promise<EngineeringInspection> {
    const response = await apiRequest<EngineeringInspection>(`/engineering/inspections/${id}`, { token });
    return response.data;
  },

  async updateInspection(id: string, input: UpdateEngineeringInspectionInput, token?: string): Promise<EngineeringInspection> {
    const response = await apiRequest<EngineeringInspection>(`/engineering/inspections/${id}`, {
      method: "PATCH",
      token,
      idempotencyKey: createIdempotencyKey("engineering-inspection-update"),
      body: compactObject(input)
    });
    return response.data;
  },

  async deleteInspection(id: string, token?: string): Promise<{ id: string }> {
    const response = await apiRequest<{ id: string }>(`/engineering/inspections/${id}`, {
      method: "DELETE",
      token,
      idempotencyKey: createIdempotencyKey("engineering-inspection-delete")
    });
    return response.data;
  },

  async submitInspection(id: string, token?: string): Promise<EngineeringInspection> {
    const response = await apiRequest<EngineeringInspection>(`/engineering/inspections/${id}/submit`, {
      method: "POST",
      token,
      idempotencyKey: createIdempotencyKey("engineering-inspection-submit")
    });
    return response.data;
  },

  async getProjectInspections(projectId: string, token?: string): Promise<EngineeringInspection[]> {
    const response = await apiRequest<EngineeringInspection[]>(`/engineering/projects/${projectId}/inspections`, { token });
    return response.data;
  },

  async createInspectionIssue(inspectionId: string, input: CreateEngineeringIssueInput, token?: string): Promise<EngineeringIssue> {
    const response = await apiRequest<EngineeringIssue>(`/engineering/inspections/${inspectionId}/issues`, {
      method: "POST",
      token,
      idempotencyKey: createIdempotencyKey("engineering-inspection-issue-create"),
      body: compactObject(input)
    });
    return response.data;
  },

  async getInspectionIssues(inspectionId: string, token?: string): Promise<EngineeringIssue[]> {
    const response = await apiRequest<EngineeringIssue[]>(`/engineering/inspections/${inspectionId}/issues`, { token });
    return response.data;
  },

  async createIssue(input: CreateEngineeringIssueInput, token?: string): Promise<EngineeringIssue> {
    const response = await apiRequest<EngineeringIssue>("/engineering/issues", {
      method: "POST",
      token,
      idempotencyKey: createIdempotencyKey("engineering-issue-create"),
      body: compactObject(input)
    });
    return response.data;
  },

  async listIssues(query: EngineeringIssueQuery = {}, token?: string): Promise<EngineeringIssuePage> {
    const params = toSearchParams(query);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    const response = await apiRequest<EngineeringIssuePage>(`/engineering/issues${suffix}`, { token });
    return response.data;
  },

  async updateIssue(id: string, input: UpdateEngineeringIssueInput, token?: string): Promise<EngineeringIssue> {
    const response = await apiRequest<EngineeringIssue>(`/engineering/issues/${id}`, {
      method: "PATCH",
      token,
      idempotencyKey: createIdempotencyKey("engineering-issue-update"),
      body: compactObject(input)
    });
    return response.data;
  },

  async generateRectificationFromIssue(id: string, input: GenerateEngineeringRectificationInput = {}, token?: string): Promise<EngineeringRectification> {
    const response = await apiRequest<EngineeringRectification>(`/engineering/issues/${id}/generate-rectification`, {
      method: "POST",
      token,
      idempotencyKey: createIdempotencyKey("engineering-issue-generate-rectification"),
      body: compactObject(input)
    });
    return response.data;
  },

  async deleteIssue(id: string, token?: string): Promise<{ id: string }> {
    const response = await apiRequest<{ id: string }>(`/engineering/issues/${id}`, {
      method: "DELETE",
      token,
      idempotencyKey: createIdempotencyKey("engineering-issue-delete")
    });
    return response.data;
  }
};

export function toSearchParams(query: EngineeringInspectionQuery | EngineeringIssueQuery): URLSearchParams {
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
