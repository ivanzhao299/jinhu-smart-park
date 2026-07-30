import { createServer } from "node:http";

const unitId = "10000000-0000-4000-8000-000000000001";
const bookingId = "20000000-0000-4000-8000-000000000001";
const turnoverId = "30000000-0000-4000-8000-000000000001";
const user = {
  id: "40000000-0000-4000-8000-000000000001",
  username: "homestay_uat",
  real_name: "民宿运营验收员",
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

const fixtures = {
  "/api/v1/users/me": user,
  "/api/v1/homestay/dashboard": {
    business_date: "2026-07-25", arrivals: 6, departures: 4, occupied: 28,
    rentable_units: 36, occupancy_rate: "77.78", average_daily_rate: "328.00",
    pending_turnovers: 3, revenue: "9840.00"
  },
  "/api/v1/park-units": {
    items: [{ id: unitId, unitCode: "A-0801", unitName: "人才公寓 801" }],
    total: 1, page: 1, page_size: 100
  },
  "/api/v1/homestay/bookings": {
    items: [{
      id: bookingId, bookingCode: "HS-20260725-001", unitId, status: "confirmed",
      arrivalDate: "2026-07-25", departureDate: "2026-07-28", guestCount: 2,
      roomAmount: "984.00", totalAmount: "984.00", sourceType: "direct"
    }],
    total: 1, page: 1, page_size: 100
  },
  "/api/v1/homestay/turnovers": [{
    id: turnoverId, bookingId, unitId, status: "cleaning", assigneeName: "张师傅",
    photoFileIds: [], exceptionDescription: null
  }],
  "/api/v1/homestay/availability": [{
    unit_id: unitId, unit_code: "A-0801", unit_name: "人才公寓 801",
    operation_mode: "short_stay", room_state: "occupied"
  }],
  [`/api/v1/homestay/bookings/${bookingId}`]: {
    credentials: [{
      id: "50000000-0000-4000-8000-000000000001",
      credentialType: "card", credentialLabel: "前台门卡 08", status: "issued"
    }],
    ledger_summary: {
      charges: "984.00", payments: "500.00", refunds: "0.00", waivers: "0.00", balance: "484.00"
    }
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
      accessToken: "homestay-visual-uat-token",
      user: { id: user.id, username: user.username, tenantId: user.tenant_id, parkId: user.park_id,
        roles: ["SUPER_ADMIN"], permissions: ["*"] }
    });
  }
  if (request.method === "GET" && path in fixtures) return send(response, fixtures[path]);
  if (request.method === "POST" || request.method === "PUT") return send(response, { accepted: true });
  response.writeHead(404).end(JSON.stringify({ code: 404, message: `No fixture for ${path}`, data: null }));
}).listen(4010, "127.0.0.1");

function send(response, data) {
  response.writeHead(200).end(JSON.stringify({ code: 0, message: "success", data }));
}
