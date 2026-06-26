import { apiRequest, createIdempotencyKey } from "./api-client";
import type {
  CreateEngineeringDailyReportInput,
  EngineeringDailyReport,
  EngineeringDailyReportPage,
  EngineeringDailyReportQuery,
  ReviewEngineeringDailyReportInput,
  UpdateEngineeringDailyReportInput
} from "./engineering-daily-reports-types";

export const engineeringDailyReportsApi = {
  async createDailyReport(input: CreateEngineeringDailyReportInput, token?: string): Promise<EngineeringDailyReport> {
    const response = await apiRequest<EngineeringDailyReport>("/engineering/daily-reports", {
      method: "POST",
      token,
      idempotencyKey: createIdempotencyKey("engineering-daily-report-create"),
      body: compactObject(input)
    });
    return response.data;
  },

  async listDailyReports(query: EngineeringDailyReportQuery = {}, token?: string): Promise<EngineeringDailyReportPage> {
    const params = toSearchParams(query);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    const response = await apiRequest<EngineeringDailyReportPage>(`/engineering/daily-reports${suffix}`, { token });
    return response.data;
  },

  async getDailyReport(id: string, token?: string): Promise<EngineeringDailyReport> {
    const response = await apiRequest<EngineeringDailyReport>(`/engineering/daily-reports/${id}`, { token });
    return response.data;
  },

  async updateDailyReport(id: string, input: UpdateEngineeringDailyReportInput, token?: string): Promise<EngineeringDailyReport> {
    const response = await apiRequest<EngineeringDailyReport>(`/engineering/daily-reports/${id}`, {
      method: "PATCH",
      token,
      idempotencyKey: createIdempotencyKey("engineering-daily-report-update"),
      body: compactObject(input)
    });
    return response.data;
  },

  async deleteDailyReport(id: string, token?: string): Promise<{ id: string }> {
    const response = await apiRequest<{ id: string }>(`/engineering/daily-reports/${id}`, {
      method: "DELETE",
      token,
      idempotencyKey: createIdempotencyKey("engineering-daily-report-delete")
    });
    return response.data;
  },

  async submitDailyReport(id: string, token?: string): Promise<EngineeringDailyReport> {
    const response = await apiRequest<EngineeringDailyReport>(`/engineering/daily-reports/${id}/submit`, {
      method: "POST",
      token,
      idempotencyKey: createIdempotencyKey("engineering-daily-report-submit")
    });
    return response.data;
  },

  async reviewDailyReport(id: string, input: ReviewEngineeringDailyReportInput, token?: string): Promise<EngineeringDailyReport> {
    const response = await apiRequest<EngineeringDailyReport>(`/engineering/daily-reports/${id}/review`, {
      method: "POST",
      token,
      idempotencyKey: createIdempotencyKey("engineering-daily-report-review"),
      body: compactObject(input)
    });
    return response.data;
  },

  async getProjectDailyReports(projectId: string, query: EngineeringDailyReportQuery = {}, token?: string): Promise<EngineeringDailyReport[]> {
    const params = toSearchParams(query);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    const response = await apiRequest<EngineeringDailyReport[]>(`/engineering/projects/${projectId}/daily-reports${suffix}`, { token });
    return response.data;
  }
};

export function toSearchParams(query: EngineeringDailyReportQuery): URLSearchParams {
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
