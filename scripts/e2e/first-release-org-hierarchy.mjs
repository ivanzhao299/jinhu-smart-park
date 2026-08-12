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
let invalidCreatedUserId = null;
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

  const siblingResult = await request("/orgs", {
    method: "POST", headers: headers(token, "create-sibling"),
    body: JSON.stringify({ parentId: created[0], orgCode: `REG_${runId}_sibling`, orgName: `组织层级回归-sibling-${runId}`, orgType: "department", sortOrder: 904 })
  });
  assertStatus("create sibling", siblingResult, [200, 201]);
  const siblingId = data(siblingResult.body)?.id;
  if (!siblingId) throw new Error("create sibling did not return id");
  created.push(siblingId);

  const tree = await request("/orgs/tree", { headers: { authorization: `Bearer ${token}` } });
  assertStatus("read organization tree", tree, [200]);
  const serialized = JSON.stringify(data(tree.body));
  for (const id of created) if (!serialized.includes(id)) throw new Error(`tree missing created organization ${id}`);

  const cycle = await request(`/orgs/${created[0]}`, { method: "PATCH", headers: headers(token, "cycle"), body: JSON.stringify({ parentId: created[2] }) });
  assertStatus("reject cyclic parent", cycle, [400]);

  const blockedDelete = await request(`/orgs/${created[0]}`, { method: "DELETE", headers: headers(token, "blocked-delete") });
  assertStatus("reject parent deletion", blockedDelete, [400]);

  const concurrentParents = await Promise.all([
    request(`/orgs/${created[1]}`, {
      method: "PATCH", headers: headers(token, "concurrent-child-to-sibling"), body: JSON.stringify({ parentId: siblingId })
    }),
    request(`/orgs/${siblingId}`, {
      method: "PATCH", headers: headers(token, "concurrent-sibling-to-child"), body: JSON.stringify({ parentId: created[1] })
    })
  ]);
  const concurrentStatuses = concurrentParents.map((result) => result.response.status).sort((a, b) => a - b);
  if (JSON.stringify(concurrentStatuses) !== JSON.stringify([200, 400])) {
    throw new Error(`concurrent parent updates: expected one 200 and one 400, got ${concurrentStatuses.join("/")}`);
  }
  console.log("[PASS] serialize concurrent cyclic parent updates");
  for (const [id, action] of [[created[1], "reset-child-parent"], [siblingId, "reset-sibling-parent"]]) {
    const reset = await request(`/orgs/${id}`, {
      method: "PATCH", headers: headers(token, action), body: JSON.stringify({ parentId: created[0] })
    });
    assertStatus(action, reset, [200]);
  }

  const invalidUsername = `reg_org_invalid_${runId}`;
  const invalidUser = await request("/users", {
    method: "POST", headers: headers(token, "create-user-invalid-org"),
    body: JSON.stringify({
      username: invalidUsername,
      displayName: `组织回归无效用户-${runId}`,
      password: `OrgReg@${runId}`,
      assignments: [{ orgId: randomUUID(), postId: null, isPrimary: true }]
    })
  });
  assertStatus("reject user creation with invalid organization", invalidUser, [400]);
  const invalidUserList = await request(`/users?page=1&page_size=20&keyword=${encodeURIComponent(invalidUsername)}`, {
    headers: { authorization: `Bearer ${token}` }
  });
  assertStatus("verify invalid user creation rolled back", invalidUserList, [200]);
  const invalidMatches = (data(invalidUserList.body)?.items ?? []).filter((item) => item.username === invalidUsername);
  invalidCreatedUserId = invalidMatches[0]?.id ?? null;
  if (invalidMatches.length !== 0) throw new Error("invalid organization assignment left a partially created user");
  console.log("[PASS] invalid organization assignment rolls back user creation");

  const assignment = { orgId: created[0], postId: null, isPrimary: true };
  const userResult = await request("/users", {
    method: "POST", headers: headers(token, "create-user"),
    body: JSON.stringify({
      username: `reg_org_${runId}`,
      displayName: `组织回归用户-${runId}`,
      password: `OrgReg@${runId}`,
      assignments: [assignment]
    })
  });
  assertStatus("atomically create user with organization assignment", userResult, [200, 201]);
  createdUserId = data(userResult.body)?.id;
  if (!createdUserId) throw new Error("create user did not return id");

  const assignResult = await request(`/users/${createdUserId}/orgs`, {
    headers: { authorization: `Bearer ${token}` }
  });
  assertStatus("read atomically created primary organization", assignResult, [200]);
  if (data(assignResult.body)?.[0]?.orgId !== created[0] || data(assignResult.body)?.[0]?.isPrimary !== true) {
    throw new Error("primary organization assignment was not returned");
  }

  const originalDisplayName = `组织回归用户-${runId}`;
  const rejectedUpdateName = `不应提交-${runId}`;
  const invalidAtomicUpdate = await request(`/users/${createdUserId}`, {
    method: "PATCH", headers: headers(token, "atomic-update-invalid-org"),
    body: JSON.stringify({
      displayName: rejectedUpdateName,
      assignments: [{ orgId: randomUUID(), postId: null, isPrimary: true }]
    })
  });
  assertStatus("reject atomic profile update with invalid organization", invalidAtomicUpdate, [400]);
  const afterRejectedUpdate = await request(`/users/${createdUserId}`, { headers: { authorization: `Bearer ${token}` } });
  assertStatus("read user after rejected atomic update", afterRejectedUpdate, [200]);
  if (data(afterRejectedUpdate.body)?.displayName !== originalDisplayName) {
    throw new Error("invalid assignment left a partially updated user profile");
  }
  const assignmentsAfterRejectedUpdate = await request(`/users/${createdUserId}/orgs`, {
    headers: { authorization: `Bearer ${token}` }
  });
  assertStatus("read assignments after rejected atomic update", assignmentsAfterRejectedUpdate, [200]);
  if (data(assignmentsAfterRejectedUpdate.body)?.[0]?.orgId !== created[0]) {
    throw new Error("invalid atomic update changed organization assignments");
  }
  console.log("[PASS] invalid atomic profile and organization update rolls back together");

  const updatedDisplayName = `组织回归更新用户-${runId}`;
  const validAtomicUpdate = await request(`/users/${createdUserId}`, {
    method: "PATCH", headers: headers(token, "atomic-update-valid-org"),
    body: JSON.stringify({
      displayName: updatedDisplayName,
      assignments: [{ orgId: created[1], postId: null, isPrimary: true }]
    })
  });
  assertStatus("atomically update profile and organization", validAtomicUpdate, [200]);
  const assignmentsAfterValidUpdate = await request(`/users/${createdUserId}/orgs`, {
    headers: { authorization: `Bearer ${token}` }
  });
  assertStatus("read assignments after valid atomic update", assignmentsAfterValidUpdate, [200]);
  if (data(validAtomicUpdate.body)?.displayName !== updatedDisplayName || data(assignmentsAfterValidUpdate.body)?.[0]?.orgId !== created[1]) {
    throw new Error("valid atomic update did not commit profile and organization together");
  }
  console.log("[PASS] valid atomic profile and organization update commits together");

  const duplicate = await request(`/users/${createdUserId}/orgs`, {
    method: "POST", headers: headers(token, "duplicate-user-org"), body: JSON.stringify({ assignments: [assignment, assignment] })
  });
  assertStatus("reject duplicate user organization relation", duplicate, [400]);

  const multiplePrimary = await request(`/users/${createdUserId}/orgs`, {
    method: "POST", headers: headers(token, "multiple-primary"),
    body: JSON.stringify({ assignments: [assignment, { orgId: created[1], postId: null, isPrimary: true }] })
  });
  assertStatus("reject multiple primary organizations", multiplePrimary, [400]);

  const concurrentAssignments = await Promise.all([
    request(`/users/${createdUserId}/orgs`, {
      method: "POST", headers: headers(token, "concurrent-user-org-root"),
      body: JSON.stringify({ assignments: [{ orgId: created[0], postId: null, isPrimary: false }] })
    }),
    request(`/users/${createdUserId}/orgs`, {
      method: "POST", headers: headers(token, "concurrent-user-org-child"),
      body: JSON.stringify({ assignments: [{ orgId: created[1], postId: null, isPrimary: false }] })
    })
  ]);
  for (const result of concurrentAssignments) assertStatus("serialize concurrent organization replacement", result, [200, 201]);
  const finalAssignments = await request(`/users/${createdUserId}/orgs`, { headers: { authorization: `Bearer ${token}` } });
  assertStatus("read serialized organization replacement", finalAssignments, [200]);
  const finalItems = data(finalAssignments.body) ?? [];
  if (finalItems.length !== 1 || ![created[0], created[1]].includes(finalItems[0]?.orgId)) {
    throw new Error(`concurrent organization replacement produced a union: ${JSON.stringify(finalItems)}`);
  }
  console.log("[PASS] concurrent organization replacement is last-writer-wins");
} finally {
  if (invalidCreatedUserId) {
    const result = await request(`/users/${invalidCreatedUserId}`, { method: "DELETE", headers: headers(token, "cleanup-invalid-user") });
    if (![200, 201, 404].includes(result.response.status)) throw new Error(`cleanup invalid user failed with ${result.response.status}`);
  }
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
