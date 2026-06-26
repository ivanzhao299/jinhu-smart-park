import { apiRequest } from "./api-client";
import type { WorkflowInboxResponse } from "./workflow-inbox-types";

export const workflowInboxApi = {
  async getInbox(token?: string): Promise<WorkflowInboxResponse> {
    const response = await apiRequest<WorkflowInboxResponse>("/workflow/inbox", { token });
    return response.data;
  },

  async markMessageRead(id: string, token?: string): Promise<{ id: string }> {
    const response = await apiRequest<{ id: string }>(`/workflow/messages/${id}/read`, {
      method: "POST",
      token
    });
    return response.data;
  },

  async markAllRead(token?: string): Promise<{ updated: number }> {
    const response = await apiRequest<{ updated: number }>("/workflow/messages/read-all", {
      method: "POST",
      token
    });
    return response.data;
  }
};
