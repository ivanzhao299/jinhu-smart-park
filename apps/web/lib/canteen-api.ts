/**
 * 园区餐厅（canteen）typed API 客户端。
 * 路径与字段严格对齐 docs/canteen/api.md 冻结契约；鉴权/幂等复用 apps/web 既有约定。
 * 实际请求 = API_PREFIX(/api/v1) + 下列 path，对应后端 @Controller("canteen")。
 */
import type { PaginatedResult } from "@jinhu/shared";
import { apiRequest, createIdempotencyKey } from "./api-client";
import type {
  CanteenCashierSession,
  CanteenCategory,
  CanteenDish,
  CanteenOrder,
  CanteenOrderItem,
  CanteenOutlet,
  CanteenPageQuery,
  CanteenPayment,
  CanteenPaymentStatus,
  CreateCanteenOutletInput,
  OpenCanteenSessionInput,
  PosCheckoutQrInput,
  PosCheckoutQrResult,
  PosCheckoutSubsidyInput,
  PosCheckoutSubsidyResult,
  PosEmployeeLookup,
  SaveCanteenCategoryInput,
  SaveCanteenDishInput,
  UpdateCanteenOutletStatusInput,
  UpdateDishShelfInput,
  UpdateDishStockInput
} from "./canteen-types";

function compactObject(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== null && value !== "") out[key] = value;
  }
  return out;
}

function toPageParams(query: CanteenPageQuery = {}): URLSearchParams {
  const params = new URLSearchParams();
  params.set("page", String(query.page ?? 1));
  params.set("pageSize", String(query.pageSize ?? 20));
  return params;
}

export const canteenApi = {
  /* ---------------- Outlets 档口 ---------------- */
  async listOutlets(token?: string): Promise<CanteenOutlet[]> {
    const response = await apiRequest<CanteenOutlet[]>("/canteen/outlets", { token });
    return response.data;
  },
  async getOutlet(id: string, token?: string): Promise<CanteenOutlet> {
    const response = await apiRequest<CanteenOutlet>(`/canteen/outlets/${id}`, { token });
    return response.data;
  },
  async createOutlet(input: CreateCanteenOutletInput, token?: string): Promise<CanteenOutlet> {
    const response = await apiRequest<CanteenOutlet>("/canteen/outlets", {
      method: "POST",
      token,
      idempotencyKey: createIdempotencyKey("canteen-outlet-create"),
      body: compactObject(input as unknown as Record<string, unknown>)
    });
    return response.data;
  },
  async updateOutletStatus(id: string, input: UpdateCanteenOutletStatusInput, token?: string): Promise<CanteenOutlet> {
    const response = await apiRequest<CanteenOutlet>(`/canteen/outlets/${id}/status`, {
      method: "PATCH",
      token,
      idempotencyKey: createIdempotencyKey("canteen-outlet-status"),
      body: compactObject(input as unknown as Record<string, unknown>)
    });
    return response.data;
  },

  /* ---------------- Categories 品类 ---------------- */
  async listCategories(outletId: string, token?: string): Promise<CanteenCategory[]> {
    const response = await apiRequest<CanteenCategory[]>(`/canteen/outlets/${outletId}/categories`, { token });
    return response.data;
  },
  async createCategory(outletId: string, input: SaveCanteenCategoryInput, token?: string): Promise<CanteenCategory> {
    const response = await apiRequest<CanteenCategory>(`/canteen/outlets/${outletId}/categories`, {
      method: "POST",
      token,
      idempotencyKey: createIdempotencyKey("canteen-category-create"),
      body: compactObject(input as unknown as Record<string, unknown>)
    });
    return response.data;
  },
  async updateCategory(id: string, input: SaveCanteenCategoryInput, token?: string): Promise<CanteenCategory> {
    const response = await apiRequest<CanteenCategory>(`/canteen/categories/${id}`, {
      method: "PUT",
      token,
      idempotencyKey: createIdempotencyKey("canteen-category-update"),
      body: compactObject(input as unknown as Record<string, unknown>)
    });
    return response.data;
  },
  async deleteCategory(id: string, token?: string): Promise<{ id: string }> {
    const response = await apiRequest<{ id: string }>(`/canteen/categories/${id}`, {
      method: "DELETE",
      token,
      idempotencyKey: createIdempotencyKey("canteen-category-delete")
    });
    return response.data;
  },

  /* ---------------- Dishes 餐品 ---------------- */
  async listDishes(
    outletId: string,
    query: { category_id?: string; status?: string; keyword?: string } = {},
    token?: string
  ): Promise<CanteenDish[]> {
    const params = new URLSearchParams();
    if (query.category_id) params.set("category_id", query.category_id);
    if (query.status) params.set("status", query.status);
    if (query.keyword) params.set("keyword", query.keyword);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    const response = await apiRequest<CanteenDish[]>(`/canteen/outlets/${outletId}/dishes${suffix}`, { token });
    return response.data;
  },
  async getDish(id: string, token?: string): Promise<CanteenDish> {
    const response = await apiRequest<CanteenDish>(`/canteen/dishes/${id}`, { token });
    return response.data;
  },
  async createDish(input: SaveCanteenDishInput, token?: string): Promise<CanteenDish> {
    const response = await apiRequest<CanteenDish>("/canteen/dishes", {
      method: "POST",
      token,
      idempotencyKey: createIdempotencyKey("canteen-dish-create"),
      body: compactObject(input as unknown as Record<string, unknown>)
    });
    return response.data;
  },
  async updateDish(id: string, input: Partial<SaveCanteenDishInput>, token?: string): Promise<CanteenDish> {
    const response = await apiRequest<CanteenDish>(`/canteen/dishes/${id}`, {
      method: "PUT",
      token,
      idempotencyKey: createIdempotencyKey("canteen-dish-update"),
      body: compactObject(input as unknown as Record<string, unknown>)
    });
    return response.data;
  },
  async updateDishShelf(id: string, input: UpdateDishShelfInput, token?: string): Promise<CanteenDish> {
    const response = await apiRequest<CanteenDish>(`/canteen/dishes/${id}/shelf`, {
      method: "PATCH",
      token,
      idempotencyKey: createIdempotencyKey("canteen-dish-shelf"),
      body: compactObject(input as unknown as Record<string, unknown>)
    });
    return response.data;
  },
  async updateDishStock(id: string, input: UpdateDishStockInput, token?: string): Promise<CanteenDish> {
    const response = await apiRequest<CanteenDish>(`/canteen/dishes/${id}/stock`, {
      method: "PATCH",
      token,
      idempotencyKey: createIdempotencyKey("canteen-dish-stock"),
      body: compactObject(input as unknown as Record<string, unknown>)
    });
    return response.data;
  },

  /* ---------------- Orders 订单/流水 ---------------- */
  async listOrders(query: Record<string, unknown> & CanteenPageQuery = {}, token?: string): Promise<PaginatedResult<CanteenOrder>> {
    const params = toPageParams(query);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "" && !["page", "pageSize"].includes(key)) {
        params.set(key, String(value));
      }
    }
    const response = await apiRequest<PaginatedResult<CanteenOrder>>(`/canteen/orders?${params.toString()}`, { token });
    return response.data;
  },
  async getOrder(id: string, token?: string): Promise<CanteenOrder> {
    const response = await apiRequest<CanteenOrder>(`/canteen/orders/${id}`, { token });
    return response.data;
  },
  async listOrderItems(orderId: string, token?: string): Promise<CanteenOrderItem[]> {
    const response = await apiRequest<CanteenOrderItem[]>(`/canteen/orders/${orderId}/items`, { token });
    return response.data;
  },
  async cancelOrder(id: string, reason?: string, token?: string): Promise<CanteenOrder> {
    const response = await apiRequest<CanteenOrder>(`/canteen/orders/${id}/cancel`, {
      method: "POST",
      token,
      idempotencyKey: createIdempotencyKey("canteen-order-cancel"),
      body: compactObject({ reason })
    });
    return response.data;
  },

  /* ---------------- Payments 支付流水 ---------------- */
  async listPayments(query: Record<string, unknown> & CanteenPageQuery = {}, token?: string): Promise<PaginatedResult<CanteenPayment>> {
    const params = toPageParams(query);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "" && !["page", "pageSize"].includes(key)) {
        params.set(key, String(value));
      }
    }
    const response = await apiRequest<PaginatedResult<CanteenPayment>>(`/canteen/payments?${params.toString()}`, { token });
    return response.data;
  },
  async getPaymentStatus(paymentNo: string, token?: string): Promise<CanteenPaymentStatus> {
    const response = await apiRequest<CanteenPaymentStatus>(`/canteen/payments/${encodeURIComponent(paymentNo)}/status`, { token });
    return response.data;
  },

  /* ---------------- POS 收银 ---------------- */
  async openSession(input: OpenCanteenSessionInput, token?: string): Promise<CanteenCashierSession> {
    const response = await apiRequest<CanteenCashierSession>("/canteen/pos/sessions/open", {
      method: "POST",
      token,
      idempotencyKey: createIdempotencyKey("canteen-session-open"),
      body: compactObject(input as unknown as Record<string, unknown>)
    });
    return response.data;
  },
  async getCurrentSession(token?: string): Promise<CanteenCashierSession | null> {
    const response = await apiRequest<CanteenCashierSession | null>("/canteen/pos/sessions/current", { token });
    return response.data;
  },
  async closeSession(sessionId: string, token?: string): Promise<CanteenCashierSession> {
    const response = await apiRequest<CanteenCashierSession>(`/canteen/pos/sessions/${sessionId}/close`, {
      method: "POST",
      token,
      idempotencyKey: createIdempotencyKey("canteen-session-close")
    });
    return response.data;
  },
  async checkoutQr(input: PosCheckoutQrInput, token?: string): Promise<PosCheckoutQrResult> {
    const response = await apiRequest<PosCheckoutQrResult>("/canteen/pos/checkout/qr", {
      method: "POST",
      token,
      idempotencyKey: createIdempotencyKey("canteen-checkout-qr"),
      body: compactObject(input as unknown as Record<string, unknown>)
    });
    return response.data;
  },
  async checkoutSubsidy(input: PosCheckoutSubsidyInput, token?: string): Promise<PosCheckoutSubsidyResult> {
    const response = await apiRequest<PosCheckoutSubsidyResult>("/canteen/pos/checkout/subsidy", {
      method: "POST",
      token,
      idempotencyKey: createIdempotencyKey("canteen-checkout-subsidy"),
      body: compactObject(input as unknown as Record<string, unknown>)
    });
    return response.data;
  },
  async lookupEmployee(employeeCode: string, token?: string): Promise<PosEmployeeLookup> {
    const response = await apiRequest<PosEmployeeLookup>("/canteen/pos/lookup-employee", {
      method: "POST",
      token,
      idempotencyKey: createIdempotencyKey("canteen-lookup-employee"),
      body: compactObject({ employee_code: employeeCode })
    });
    return response.data;
  },

  /* ---------------- 管理端：班次/日结查看 ---------------- */
  async listSessions(query: Record<string, unknown> & CanteenPageQuery = {}, token?: string): Promise<PaginatedResult<CanteenCashierSession>> {
    const params = toPageParams(query);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "" && !["page", "pageSize"].includes(key)) {
        params.set(key, String(value));
      }
    }
    const response = await apiRequest<PaginatedResult<CanteenCashierSession>>(`/canteen/pos/sessions?${params.toString()}`, { token });
    return response.data;
  }
};
