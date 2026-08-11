import { randomUUID } from "node:crypto";

const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3001/api/v1";
const tenantId = process.env.TENANT_ID ?? process.env.DEFAULT_TENANT_ID ?? "10000001";
const parkId = process.env.PARK_ID ?? process.env.DEFAULT_PARK_ID ?? "20000001";
const username = process.env.ADMIN_USERNAME ?? "admin";
const password = process.env.ADMIN_PASSWORD ?? "Jinhu@123456";
const runId = (process.env.TEST_RUN_ID ?? randomUUID()).replace(/[^a-zA-Z0-9]/g, "").slice(-12);

async function request(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, options);
  const body = await response.json().catch(() => null);
  return { response, body };
}
function data(body) { return body && typeof body === "object" && "data" in body ? body.data : body; }
function assertStatus(label, result, expected) {
  if (!expected.includes(result.response.status)) throw new Error(`${label}: expected ${expected.join("/")}, got ${result.response.status}; ${JSON.stringify(result.body).slice(0, 300)}`);
  console.log(`[PASS] ${label}`);
}
function headers(token, action) {
  return { authorization: `Bearer ${token}`, "content-type": "application/json", "x-idempotency-key": `org-hierarchy-${action}-${runId}-${randomUUID()}` };
}

const login = await request("/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tenantId, parkId, username, password }) });
assertStatus("login", login, [200, 201]);
const token = data(login.body)?.accessToken;
if (!token) throw new Error("login did not return access token");

const created = [];
let createdUserId = null;
try {
  let parentId = null;
  for (const [index, kind] of ["root", "child", "grandchild"].entries()) {
    const result = await request("/orgs", {
      method: "POST", headers: headers(token, `create-${kind}`),
      body: JSON.stringify({ parentId, orgCode: `REG_${runId}_${index}`, orgName: `组织层级回归-${kind}-${runId}`, orgType: index === 0 ? "group" : "department", sortOrder: 900 + index })
    });
    assertStatus(`create ${kind}`, result, [200, 201]);
    const org = data(result.body);
    if (!org?.id) throw new Error(`create ${kind} did not return id`);
    created.push(org.id); parentId = org.id;
  }

  const tree = await request("/orgs/tree", { headers: { authorization: `Bearer ${token}` } });
  assertStatus("read organization tree", tree, [200]);
  const serialized = JSON.stringify(data(tree.body));
  for (const id of created) if (!serialized.includes(id)) throw new Error(`tree missing created organization ${id}`);

  const cycle = await request(`/orgs/${created[0]}`, { method: "PATCH", headers: headers(token, "cycle"), body: JSON.stringify({ parentId: created[2] }) });
  assertStatus("reject cyclic parent", cycle, [400]);

  const blockedDelete = await request(`/orgs/${created[0]}`, { method: "DELETE", headers: headers(token, "blocked-delete") });
  assertStatus("reject parent deletion", blockedDelete, [400]);

  const userResult = await request("/users", {
    method: "POST", headers: headers(token, "create-user"),
    body: JSON.stringify({ username: `reg_org_${runId}`, displayName: `组织回归用户-${runId}`, password: `OrgReg@${runId}` })
  });
  assertStatus("create organization regression user", userResult, [200, 201]);
  createdUserId = data(userResult.body)?.id;
  if (!createdUserId) throw new Error("create user did not return id");

  const assignment = { orgId: created[0], postId: null, isPrimary: true };
  const assignResult = await request(`/users/${createdUserId}/orgs`, {
    method: "POST", headers: headers(token, "assign-user-org"), body: JSON.stringify({ assignments: [assignment] })
  });
  assertStatus("assign user primary organization", assignResult, [200, 201]);
  if (data(assignResult.body)?.[0]?.orgId !== created[0] || data(assignResult.body)?.[0]?.isPrimary !== true) {
    throw new Error("primary organization assignment was not returned");
  }

  const duplicate = await request(`/users/${createdUserId}/orgs`, {
    method: "POST", headers: headers(token, "duplicate-user-org"), body: JSON.stringify({ assignments: [assignment, assignment] })
  });
  assertStatus("reject duplicate user organization relation", duplicate, [400]);

  const multiplePrimary = await request(`/users/${createdUserId}/orgs`, {
    method: "POST", headers: headers(token, "multiple-primary"),
    body: JSON.stringify({ assignments: [assignment, { orgId: created[1], postId: null, isPrimary: true }] })
  });
  assertStatus("reject multiple primary organizations", multiplePrimary, [400]);
} finally {
  if (createdUserId) {
    const clearResult = await request(`/users/${createdUserId}/orgs`, { method: "POST", headers: headers(token, "cleanup-user-orgs"), body: JSON.stringify({ assignments: [] }) });
    if (![200, 201].includes(clearResult.response.status)) throw new Error(`cleanup user organizations failed with ${clearResult.response.status}`);
    const result = await request(`/users/${createdUserId}`, { method: "DELETE", headers: headers(token, "cleanup-user") });
    if (![200, 201, 404].includes(result.response.status)) throw new Error(`cleanup user failed with ${result.response.status}`);
  }
  for (const id of [...created].reverse()) {
    const result = await request(`/orgs/${id}`, { method: "DELETE", headers: headers(token, `cleanup-${id}`) });
    if (![200, 201, 404].includes(result.response.status)) throw new Error(`cleanup organization ${id} failed with ${result.response.status}`);
  }
}

console.log("[PASS] first-release organization hierarchy regression completed");
