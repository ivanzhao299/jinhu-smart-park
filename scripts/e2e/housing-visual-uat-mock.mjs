import { createServer } from "node:http";

const unitId = "61000000-0000-4000-8000-000000000001";
const tenantId = "62000000-0000-4000-8000-000000000001";
const leaseId = "63000000-0000-4000-8000-000000000001";
const purchaseId = "64000000-0000-4000-8000-000000000001";
const purchaseItemId = "65000000-0000-4000-8000-000000000001";
const user = {
  id: "60000000-0000-4000-8000-000000000001",
  username: "housing_uat",
  real_name: "住房出租验收员",
  tenant_id: "10000001",
  park_id: "20000001",
  org_id: null,
  org_name: "人才公寓运营中心",
  roles: [{ role_code: "SUPER_ADMIN", role_name: "超级管理员" }],
  permissions: ["*"],
  data_scope: "tenant",
  is_super: true,
  menus: []
};

const lease = {
  id: leaseId,
  leaseCode: "HL-20260725-001",
  unitId,
  tenantPartyId: tenantId,
  status: "active",
  startDate: "2026-08-01",
  endDate: "2027-07-31",
  paymentCycleMonths: 3,
  monthlyRent: "2800.00",
  depositAmount: "2800.00"
};

const fixtures = {
  "/api/v1/users/me": user,
  "/api/v1/housing/dashboard": {
    draft_leases: 2,
    pending_approval: 3,
    pending_signature: 1,
    active_leases: 42,
    checkout_pending: 2,
    receivable_amount: "428600.00",
    collected_amount: "396800.00",
    outstanding_amount: "31800.00",
    approved_purchase_cost: "12640.00"
  },
  "/api/v1/park-units": {
    items: [{ id: unitId, unitCode: "A-0801", unitName: "人才公寓 801" }],
    total: 1, page: 1, page_size: 100
  },
  "/api/v1/housing/tenants": {
    items: [{
      id: tenantId,
      displayName: "王晓明",
      mobile: "138****8001",
      identityNumberMasked: "320***********001X",
      verificationStatus: "verified"
    }],
    total: 1, page: 1, page_size: 100
  },
  "/api/v1/housing/leases": {
    items: [lease],
    total: 1, page: 1, page_size: 100
  },
  "/api/v1/housing/purchases": {
    items: [{
      id: purchaseId,
      purchaseCode: "HP-20260725-001",
      unitId,
      vendorName: "金湖后勤物资",
      purchaseDate: "2026-07-25",
      costCategory: "consumable",
      totalAmount: "168.00",
      approvalStatus: "approved",
      paymentStatus: "unpaid"
    }],
    total: 1, page: 1, page_size: 100
  },
  [`/api/v1/housing/leases/${leaseId}`]: {
    lease,
    repairs: [{
      id: "67000000-0000-4000-8000-000000000001",
      woCode: "WO-20260725-001",
      title: "卫生间水龙头漏水",
      priority: "medium",
      urgency: "normal",
      status: "20",
      createTime: "2026-07-25T09:30:00.000Z"
    }],
    receivables: [{
      id: "66000000-0000-4000-8000-000000000001",
      chargeType: "rent",
      periodStart: "2026-08-01",
      periodEnd: "2026-11-01",
      dueDate: "2026-08-01",
      amount: "8400.00",
      paidAmount: "5600.00",
      waivedAmount: "0.00",
      status: "partial"
    }],
    finance_summary: {
      receivable: "11200.00",
      paid: "8400.00",
      waived: "0.00",
      outstanding: "2800.00",
      deposit_balance: "2800.00"
    }
  },
  [`/api/v1/housing/purchases/${purchaseId}`]: {
    purchase: {
      id: purchaseId,
      purchaseCode: "HP-20260725-001",
      unitId,
      vendorName: "金湖后勤物资",
      purchaseDate: "2026-07-25",
      costCategory: "consumable",
      totalAmount: "168.00",
      approvalStatus: "approved",
      paymentStatus: "unpaid"
    },
    items: [{
      id: purchaseItemId,
      itemName: "替换门卡",
      amount: "168.00",
      transferredReceivableId: null
    }]
  }
};

createServer((request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:3000");
  response.setHeader("Access-Control-Allow-Credentials", "true");
  response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Idempotency-Key");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  if (request.method === "OPTIONS") return response.writeHead(204).end();
  const path = new URL(request.url ?? "/", `http://${request.headers.host}`).pathname;
  if (request.method === "POST" && path === "/api/v1/auth/login") {
    return send(response, {
      accessToken: "housing-visual-uat-token",
      user: {
        id: user.id,
        username: user.username,
        tenantId: user.tenant_id,
        parkId: user.park_id,
        roles: ["SUPER_ADMIN"],
        permissions: ["*"],
        is_super: true
      }
    });
  }
  if (request.method === "GET" && path in fixtures) return send(response, fixtures[path]);
  if (request.method === "POST" || request.method === "PUT") return send(response, { accepted: true });
  response.writeHead(404).end(JSON.stringify({ code: 404, message: `No fixture for ${path}`, data: null }));
}).listen(4011, "127.0.0.1");

function send(response, data) {
  response.writeHead(200).end(JSON.stringify({ code: 0, message: "success", data }));
}
