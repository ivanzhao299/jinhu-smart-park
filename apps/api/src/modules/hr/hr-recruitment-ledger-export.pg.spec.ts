import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { HR_PERMISSIONS as H } from "@jinhu/shared";
import { DataSource, type EntityManager } from "typeorm";
import { HrRecruitmentService } from "./hr-recruitment.service";

test("real isolated PostgreSQL: recruitment exports preserve scope, masked projection, complete snapshot and limits", {
  skip: process.env.HR_RECRUITMENT_LEDGER_EXPORT_PG_REQUIRED !== "1", timeout: 90_000
}, async () => {
  const suffix = randomBytes(6).toString("hex"), name = `hr-recruit-export-${suffix}`, password = randomBytes(18).toString("hex");
  const docker = (args: string[]) => execFileSync("docker", args, { encoding: "utf8", env: { ...process.env, POSTGRES_PASSWORD: password }, timeout: 20_000, stdio: ["ignore", "pipe", "pipe"] }).trim();
  let created = false, db: DataSource | undefined, writer: DataSource | undefined;
  try {
    docker(["image", "inspect", "postgres:16-alpine", "--format", "{{.Id}}"]);
    docker(["run", "-d", "--name", name, "--label", `hr-recruit-export=${suffix}`, "--tmpfs", "/var/lib/postgresql/data", "-p", "127.0.0.1::5432", "-e", "POSTGRES_PASSWORD", "postgres:16-alpine"]); created = true;
    const port = Number(docker(["port", name, "5432/tcp"]).split(":").at(-1)); assert.ok(port);
    const options = { type: "postgres" as const, host: "127.0.0.1", port, username: "postgres", password, database: "postgres" };
    for (let i = 0; i < 80 && !db; i++) { const candidate = new DataSource(options); try { await candidate.initialize(); db = candidate; } catch { if (candidate.isInitialized) await candidate.destroy(); await delay(150); } }
    assert.ok(db); writer = await new DataSource(options).initialize();
    await db.query("CREATE TABLE sys_org(id uuid primary key,tenant_id text,park_id text,parent_id uuid,org_name text,is_deleted boolean default false)");
    await db.query("CREATE TABLE sys_user(id uuid primary key,tenant_id text,park_id text,display_name text)");
    await db.query("CREATE TABLE hr_position(id uuid primary key,tenant_id text,park_id text,position_name text)");
    await db.query("CREATE TABLE hr_employee(id uuid primary key,tenant_id text,park_id text,user_id uuid,primary_org_id uuid,is_deleted boolean default false)");
    await db.query("CREATE TABLE hr_recruitment_requisition(id uuid primary key,tenant_id text,park_id text,version int default 1,requisition_code text,title text,org_id uuid,position_id uuid,headcount int default 2,hired_count int default 0,owner_user_id uuid,planned_onboard_date date default '2026-07-01',status text default 'open',is_deleted boolean default false,create_time timestamptz default '2026-07-01T00:00:00Z')");
    await db.query("CREATE TABLE hr_candidate(id uuid primary key,tenant_id text,park_id text,candidate_no text,full_name text,requisition_id uuid,stage text default 'screening',source text,expected_onboard_date date default '2026-07-01',latest_evaluation text,mobile_masked text default '138****0000',email_masked text,identity_masked text,converted_employee_id uuid,mobile_encrypted text default 'private-cipher',is_deleted boolean default false,create_time timestamptz default '2026-07-01T00:00:00Z')");
    const scope = { tenantId: "tenant", parkId: "park" }, org = randomUUID(), child = randomUUID(), sibling = randomUUID(), foreignOrg = randomUUID(), actorId = randomUUID();
    await db.query("INSERT INTO sys_org(id,tenant_id,park_id,parent_id,org_name) VALUES($1,$4,$5,NULL,'Root'),($2,$4,$5,$1,'Child'),($3,$4,$5,NULL,'Sibling'),($6,'foreign','foreign',NULL,'Foreign')", [org, child, sibling, scope.tenantId, scope.parkId, foreignOrg]);
    await db.query("INSERT INTO sys_user VALUES($1,$2,$3,'Synthetic HR')", [actorId, scope.tenantId, scope.parkId]);
    await db.query("INSERT INTO hr_employee VALUES($1,$2,$3,$4,$5,false)", [randomUUID(), scope.tenantId, scope.parkId, actorId, org]);
    const reqs = Array.from({ length: 21 }, () => randomUUID()), candidates = Array.from({ length: 21 }, () => randomUUID());
    for (let i = 0; i < reqs.length; i++) {
      await db.query("INSERT INTO hr_recruitment_requisition(id,tenant_id,park_id,requisition_code,title,org_id,owner_user_id) VALUES($1,$2,$3,$4,$5,$6,$7)", [reqs[i], scope.tenantId, scope.parkId, `SYN-R${i}`, `Synthetic role ${i}`, i % 2 ? child : org, actorId]);
      await db.query("INSERT INTO hr_candidate(id,tenant_id,park_id,candidate_no,full_name,requisition_id) VALUES($1,$2,$3,$4,$5,$6)", [candidates[i], scope.tenantId, scope.parkId, `SYN-C${i}`, `Synthetic person ${i}`, reqs[i]]);
    }
    const siblingReq = randomUUID(), foreignReq = randomUUID();
    await db.query("INSERT INTO hr_recruitment_requisition(id,tenant_id,park_id,requisition_code,title,org_id) VALUES($1,$2,$3,'OTHER','Sibling role',$4),($5,'foreign','foreign','SYN-FOREIGN','Foreign role',$6),($7,$2,$3,'SYN-BAD-REF','Invalid foreign reference',$6),($8,$2,'other-park','SYN-OTHER-PARK','Other park',$4),($9,$2,$3,'SYN-DELETED','Deleted',$4)", [siblingReq, scope.tenantId, scope.parkId, sibling, foreignReq, foreignOrg, randomUUID(), randomUUID(), randomUUID()]);
    await db.query("UPDATE hr_recruitment_requisition SET is_deleted=true WHERE requisition_code='SYN-DELETED'");
    await db.query("INSERT INTO hr_candidate(id,tenant_id,park_id,candidate_no,full_name,requisition_id,is_deleted) VALUES($1,'foreign','foreign','SYN-FOREIGN','Foreign',$2,false),($3,$4,$5,'SYN-BAD-REF','Invalid foreign reference',$2,false),($6,$4,$5,'SYN-DELETED','Deleted',$7,true),($8,$4,'other-park','SYN-OTHER-PARK','Other park',$7,false)", [randomUUID(), foreignReq, randomUUID(), scope.tenantId, scope.parkId, randomUUID(), reqs[0], randomUUID()]);
    const audits: Array<{ path: string; afterJson: unknown }> = []; let transactions = 0, failAudit = false, concurrent: "requisition" | "candidate" | null = null;
    const original = db.transaction.bind(db);
    const facade = { query: db.query.bind(db), transaction: (isolation: "REPEATABLE READ", run: (m: EntityManager) => Promise<unknown>) => {
      transactions++; assert.equal(isolation, "REPEATABLE READ"); return original(isolation, async manager => {
        const query = manager.query.bind(manager), hooked = Object.create(manager) as EntityManager;
        Object.defineProperty(hooked, "query", { value: async (sql: string, params?: unknown[]) => {
          const value = await query(sql, params);
          if (concurrent && sql.includes("snapshot_at")) {
            const kind = concurrent; concurrent = null;
            if (kind === "requisition") {
              await writer!.query("UPDATE hr_recruitment_requisition SET title='Updated role' WHERE id=$1", [reqs[0]]);
              await writer!.query("INSERT INTO hr_recruitment_requisition(id,tenant_id,park_id,requisition_code,title,org_id) VALUES($1,$2,$3,'SYN-NEW','New role',$4)", [randomUUID(), scope.tenantId, scope.parkId, org]);
            } else {
              await writer!.query("UPDATE hr_candidate SET full_name='Updated person' WHERE id=$1", [candidates[0]]);
              await writer!.query("INSERT INTO hr_candidate(id,tenant_id,park_id,candidate_no,full_name,requisition_id) VALUES($1,$2,$3,'SYN-NEW','New person',$4)", [randomUUID(), scope.tenantId, scope.parkId, reqs[0]]);
            }
          } return value;
        } }); return run(hooked);
      });
    } };
    const service = new HrRecruitmentService(facade as unknown as DataSource, {} as never, { recordOperationRequired: async (value: { path: string; afterJson: unknown }) => { if (failAudit) throw new Error("audit unavailable"); audits.push(value); } } as never);
    const actor = { sub: actorId, username: "synthetic", ...scope, roles: [], permissions: [H.HR_REQUISITION_READ, H.HR_CANDIDATE_READ] };
    const rq = { keyword: "SYN-", status: "open" }, cq = { keyword: "SYN-", stage: "screening" };
    const r = await service.exportRequisitions(scope, actor, rq), c = await service.exportCandidates(scope, actor, cq);
    assert.equal(r.total, 21); assert.equal(c.total, 21); assert.deepEqual(r.items.map(x => x.id), [...reqs].sort()); assert.deepEqual(c.items.map(x => x.id), [...candidates].sort());
    assert.equal(r.items[0]!.plannedOnboardDate, "2026-07-01"); assert.equal(c.items[0]!.expectedOnboardDate, "2026-07-01"); assert.equal(c.items[0]!.mobileMasked, "138****0000");
    assert.ok(!JSON.stringify(c).includes("private-cipher")); assert.ok(!("mobile_encrypted" in c.items[0]!)); assert.equal(new Date(c.snapshotAt).toISOString(), c.snapshotAt);
    assert.equal((await service.listRequisitions(scope, actor, { ...rq, page: 2, page_size: 20 })).items.length, 1);
    assert.equal((await service.listCandidates(scope, actor, { ...cq, page: 2, page_size: 20 })).items.length, 1);
    const team = { ...actor, permissions: [H.HR_REQUISITION_TEAM_READ] }; assert.equal((await service.exportRequisitions(scope, team, {})).total, 21); assert.equal((await service.exportRequisitions(scope, actor, {})).total, 22);
    assert.deepEqual(audits.find(x => x.path.endsWith("candidates/export"))?.afterJson, { fieldGroups: ["identity", "contact"], projection: "masked", itemCount: 21 });
    for (const denied of [{ ...actor, permissions: [] }, { ...actor, tenantId: "other" }, { ...actor, parkId: "other" }]) {
      const before = transactions; await assert.rejects(service.exportRequisitions(scope, denied, {}), ForbiddenException); await assert.rejects(service.exportCandidates(scope, denied, {}), ForbiddenException); assert.equal(transactions, before);
    }
    assert.equal((await service.exportRequisitions(scope, actor, { keyword: "not-present" })).total, 0); assert.equal((await service.exportCandidates(scope, actor, { stage: "hired" })).total, 0);
    failAudit = true; await assert.rejects(service.exportCandidates(scope, actor, cq), /audit unavailable/); await assert.rejects(service.exportRequisitions(scope, actor, rq), /audit unavailable/); failAudit = false;
    concurrent = "requisition"; const frozenR = await service.exportRequisitions(scope, actor, rq); assert.equal(frozenR.total, 21); assert.equal(frozenR.items.find(x => x.id === reqs[0])?.title, "Synthetic role 0"); assert.equal((await service.exportRequisitions(scope, actor, rq)).total, 22);
    concurrent = "candidate"; const frozenC = await service.exportCandidates(scope, actor, cq); assert.equal(frozenC.total, 21); assert.equal(frozenC.items.find(x => x.id === candidates[0])?.fullName, "Synthetic person 0"); assert.equal((await service.exportCandidates(scope, actor, cq)).total, 22);
    await db.query("INSERT INTO hr_recruitment_requisition(id,tenant_id,park_id,requisition_code,title,org_id) SELECT md5('r-limit-'||n)::uuid,$1,$2,'SYN-LIMIT-'||n,'Boundary',$3 FROM generate_series(1,4978)n", [scope.tenantId, scope.parkId, org]);
    await db.query("INSERT INTO hr_candidate(id,tenant_id,park_id,candidate_no,full_name,requisition_id) SELECT md5('c-limit-'||n)::uuid,$1,$2,'SYN-LIMIT-'||n,'Boundary',$3 FROM generate_series(1,4978)n", [scope.tenantId, scope.parkId, reqs[0]]);
    assert.equal((await service.exportRequisitions(scope, actor, rq)).total, 5000); assert.equal((await service.exportCandidates(scope, actor, cq)).total, 5000);
    await db.query("INSERT INTO hr_recruitment_requisition(id,tenant_id,park_id,requisition_code,title,org_id) VALUES($1,$2,$3,'SYN-OVER','Overflow',$4)", [randomUUID(), scope.tenantId, scope.parkId, org]);
    await db.query("INSERT INTO hr_candidate(id,tenant_id,park_id,candidate_no,full_name,requisition_id) VALUES($1,$2,$3,'SYN-OVER','Overflow',$4)", [randomUUID(), scope.tenantId, scope.parkId, reqs[0]]);
    const beforeOverflow = audits.length; await assert.rejects(service.exportRequisitions(scope, actor, rq), /超过5000/); await assert.rejects(service.exportCandidates(scope, actor, cq), /超过5000/); assert.equal(audits.length, beforeOverflow);
  } finally {
    if (writer?.isInitialized) await writer.destroy(); if (db?.isInitialized) await db.destroy(); if (created) docker(["rm", "-f", name]); assert.equal(docker(["ps", "-aq", "--filter", `label=hr-recruit-export=${suffix}`]), "");
  }
});
