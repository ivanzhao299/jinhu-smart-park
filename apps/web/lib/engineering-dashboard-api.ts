import { apiRequest } from "./api-client";
import type { EngineeringDashboardOverview } from "./engineering-dashboard-types";

export const engineeringDashboardApi = {
  async getOverview(token?: string): Promise<EngineeringDashboardOverview> {
    const response = await apiRequest<EngineeringDashboardOverview>("/engineering/dashboard", { token });
    return response.data;
  }
};
