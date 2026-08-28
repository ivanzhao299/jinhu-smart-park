import "reflect-metadata";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { DataSource } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { FileBusinessAccessService } from "../files/file-business-access.service";
import { FileEntity } from "../files/entities/file.entity";
import { FilesService } from "../files/files.service";
import {
  HR_ENTITIES,
  HrContractChangeEntity,
  HrContractEntity,
  HrContractTypeEntity,
  HrEmployeeInsuranceItemEntity,
  HrEmployeeInsurancePeriodEntity,
  HrPayrollPeriodEntity,
  HrPayrollRunEntity,
  HrPayslipEntity
} from "./entities/hr.entities";
import { HrService } from "./hr.service";

const required = process.env.HR_SENSITIVE_READ_PG_REQUIRED === "1";
if (required && !process.env.POSTGRES_PASSWORD) throw new Error("POSTGRES_PASSWORD is required");
const suite = required ? describe : describe.skip;

suite("HR P0 sensitive reads real-service PostgreSQL gate", () => {
  let db: DataSource;
  let hr: HrService;
  let files: FilesService;
  const scope = { tenantId: "10000001", parkId: "20000001" };
  const managerUserId = randomUUID(), selfUserId = randomUUID();
  const managerEmployeeId = randomUUID(), managedEmployeeId = randomUUID(), siblingEmployeeId = randomUUID(), selfEmployeeId = randomUUID();
  const managedFileId = randomUUID(), siblingFileId = randomUUID(), selfFileId = randomUUID();
  const insuranceId = randomUUID(), insuranceItemId = randomUUID();
  const contractTypeId = randomUUID(), contractId = randomUUID();
  const payrollPeriodId = randomUUID(), payrollRunId = randomUUID(), payslipId = randomUUID();
  let auditFails = false;
  const auditService = {
    async recordOperationRequired(): Promise<void> {
      if (auditFails) throw new Error("required audit persistence failed");
    },
    async recordOperation(): Promise<void> {}
  };
  const actor = (sub: string, permissions: string[]): JwtPrincipal => ({
    sub, username: `sensitive-${sub.slice(0, 6)}`, tenantId: scope.tenantId, parkId: scope.parkId, roles: [], permissions
  });

  before(async () => {
    db = new DataSource({
      type: "postgres", host: process.env.POSTGRES_HOST ?? "127.0.0.1", port: Number(process.env.POSTGRES_PORT ?? 5432),
      database: process.env.POSTGRES_DB, username: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD,
      entities: [...HR_ENTITIES, FileEntity], synchronize: false
    });
    await db.initialize();
    const orgs = await db.query(
      "SELECT id FROM sys_org WHERE tenant_id=$1 AND park_id=$2 AND is_deleted=false AND status='enabled' ORDER BY id LIMIT 2",
      [scope.tenantId, scope.parkId]
    ) as Array<{ id: string }>;
    assert.ok(orgs.length >= 2);
    await db.query(
      "INSERT INTO sys_user(id,tenant_id,park_id,username,display_name,password_hash,status) VALUES($1,$3,$4,$5,'Sensitive manager','x','enabled'),($2,$3,$4,$6,'Sensitive self','x','enabled')",
      [managerUserId, selfUserId, scope.tenantId, scope.parkId, `sensitive-manager-${managerUserId}`, `sensitive-self-${selfUserId}`]
    );
    await db.query("UPDATE sys_org SET leader_user_id=$1 WHERE id=$2", [managerUserId, orgs[0]!.id]);
    await db.query(
      `INSERT INTO hr_employee(id,tenant_id,park_id,employee_code,full_name,user_id,primary_org_id,employment_status)
       VALUES($1,$5,$6,'P0-S-MGR','Manager',$7,$9,'active'),($2,$5,$6,'P0-S-TEAM','Managed',NULL,$9,'active'),
       ($3,$5,$6,'P0-S-SIB','Sibling',NULL,$10,'active'),($4,$5,$6,'P0-S-SELF','Self',$8,$10,'active')`,
      [managerEmployeeId, managedEmployeeId, siblingEmployeeId, selfEmployeeId, scope.tenantId, scope.parkId, managerUserId, selfUserId, orgs[0]!.id, orgs[1]!.id]
    );

    const fileRepo = db.getRepository(FileEntity);
    const makeFile = (id: string, employeeId: string) => fileRepo.create({
      id, ...scope, fileCode: `P0-${id.slice(0, 6)}`, originalName: "record.pdf", storedName: "record.pdf", fileUrl: `/files/${id}/download`,
      fileSize: "4", mimeType: "application/pdf", md5: "00000000000000000000000000000000", contentSha256: null, bizType: "hr_employee_document", bizId: employeeId,
      storageType: "local", storageBucket: null, storagePath: "record.pdf", isEncrypted: false, status: 1,
      createBy: managerUserId, updateBy: managerUserId
    });
    await fileRepo.save([makeFile(managedFileId, managedEmployeeId), makeFile(siblingFileId, siblingEmployeeId), makeFile(selfFileId, selfEmployeeId)]);

    await db.getRepository(HrEmployeeInsurancePeriodEntity).save({ id: insuranceId, ...scope, employeeId: managedEmployeeId, periodYear: 2098, periodMonth: 1, legacyId: 980001, needsReview: false, sourceSnapshot: {}, createBy: managerUserId, updateBy: managerUserId });
    await db.getRepository(HrEmployeeInsuranceItemEntity).save({ id: insuranceItemId, ...scope, periodId: insuranceId, insuranceKind: "pension", contributionBase: "10000", totalAmount: "2800", employerAmount: "2000", employeeAmount: "800", supplementAmount: "0", legacyBaseNegative: false, createBy: managerUserId, updateBy: managerUserId });
    await db.getRepository(HrContractTypeEntity).save({ id: contractTypeId, ...scope, typeCode: "P0-S", typeName: "Sensitive", status: "enabled", isHistoricalImport: false, createBy: managerUserId, updateBy: managerUserId });
    await db.getRepository(HrContractEntity).save({ id: contractId, ...scope, employeeId: managedEmployeeId, contractTypeId, contractNo: `P0-S-${contractId}`, startDate: "2098-01-01", endDate: "2099-01-01", probationEndDate: null, contractTermMonths: 12, signatureDate: null, effectiveDate: null, positionTitle: null, workType: null, departmentNameSnapshot: null, probationMonths: null, probationSalary: "7000", baseSalary: "9000", status: "active", isHistoricalImport: false, sourceSnapshot: {}, createBy: managerUserId, updateBy: managerUserId });
    await db.getRepository(HrPayrollPeriodEntity).save({ id: payrollPeriodId, ...scope, periodMonth: "2098-01-01", startDate: "2098-01-01", endDate: "2098-01-31", status: "open", createBy: managerUserId, updateBy: managerUserId });
    await db.getRepository(HrPayrollRunEntity).save({ id: payrollRunId, ...scope, periodId: payrollPeriodId, runNo: 1, correctionOfRunId: null, status: "confirmed", employeeCount: 1, grossTotal: "9000", deductionTotal: "1000", netTotal: "8000", calculatedAt: new Date(), reviewedAt: new Date(), confirmedAt: new Date(), confirmedBy: managerUserId, createBy: managerUserId, updateBy: managerUserId });
    await db.getRepository(HrPayslipEntity).save({ id: payslipId, ...scope, runId: payrollRunId, employeeId: managedEmployeeId, compensationSnapshot: { privatePlan: "P0" }, grossAmount: "9000", deductionAmount: "500", personalTax: "500", netAmount: "8000", status: "confirmed", createBy: managerUserId, updateBy: managerUserId });

    const args = Array(33).fill(undefined);
    args[0] = db.getRepository(HR_ENTITIES[1]!);
    args[15] = db.getRepository(HrPayrollPeriodEntity); args[16] = db.getRepository(HrPayrollRunEntity); args[17] = db.getRepository(HrPayslipEntity);
    args[19] = db.getRepository(HrContractTypeEntity); args[20] = db.getRepository(HrContractEntity); args[21] = db.getRepository(HrContractChangeEntity);
    args[24] = db.getRepository(HrEmployeeInsurancePeriodEntity); args[25] = db.getRepository(HrEmployeeInsuranceItemEntity);
    args[29] = { publishWorkReportSubmitted: async () => undefined, publishWorkReportReviewed: async () => undefined };
    args[30] = db; args[31] = auditService; args[32] = { decrypt: () => null, encrypt: () => ({ encrypted: null, masked: null, fingerprint: null }) };
    hr = Reflect.construct(HrService, args) as HrService;
    const access = Reflect.construct(FileBusinessAccessService, [db, {}, {}]) as FileBusinessAccessService;
    files = Reflect.construct(FilesService, [fileRepo, { resolve: () => "/not-opened" }, auditService, access]) as FilesService;
  });

  after(async () => {
    if (!db?.isInitialized) return;
    await db.query("DELETE FROM sys_file WHERE id=ANY($1::uuid[])", [[managedFileId, siblingFileId, selfFileId]]);
    await db.query("DELETE FROM hr_payslip WHERE id=$1", [payslipId]);
    await db.query("DELETE FROM hr_payroll_run WHERE id=$1", [payrollRunId]);
    await db.query("DELETE FROM hr_payroll_period WHERE id=$1", [payrollPeriodId]);
    await db.query("DELETE FROM hr_employee_insurance_item WHERE id=$1", [insuranceItemId]);
    await db.query("DELETE FROM hr_employee_insurance_period WHERE id=$1", [insuranceId]);
    await db.query("DELETE FROM hr_contract WHERE id=$1", [contractId]);
    await db.query("DELETE FROM hr_contract_type WHERE id=$1", [contractTypeId]);
    await db.query("DELETE FROM hr_employee WHERE id=ANY($1::uuid[])", [[managerEmployeeId, managedEmployeeId, siblingEmployeeId, selfEmployeeId]]);
    await db.query("DELETE FROM sys_user WHERE id=ANY($1::uuid[])", [[managerUserId, selfUserId]]);
    await db.destroy();
  });

  it("enforces employee document self/team/park scopes and direct UUID safe denial", async () => {
    const team = actor(managerUserId, [HR_PERMISSIONS.HR_EMPLOYEE_DOCUMENT_TEAM_READ]);
    await files.detailForActor(scope, team, managedFileId);
    await assert.rejects(files.detailForActor(scope, team, siblingFileId), ForbiddenException);
    await assert.rejects(files.detailForActor(scope, team, randomUUID()), NotFoundException);
    await assert.rejects(files.detailForActor({ ...scope, parkId: "cross-park" }, team, managedFileId), NotFoundException);
    await files.detailForActor(scope, actor(selfUserId, [HR_PERMISSIONS.HR_EMPLOYEE_DOCUMENT_SELF_READ]), selfFileId);
    await files.detailForActor(scope, actor(managerUserId, [HR_PERMISSIONS.HR_EMPLOYEE_DOCUMENT_READ]), siblingFileId);
  });

  it("keeps insurance amounts, contract salary, and payroll details behind exact atoms and projections", async () => {
    const manager = actor(managerUserId, [HR_PERMISSIONS.HR_INSURANCE_TEAM_READ]);
    const masked = await hr.insurancePeriodDetail(scope, manager, insuranceId) as Record<string, unknown>;
    assert.equal("employeeAmount" in masked, false);
    assert.equal("employerAmount" in masked, false);
    const amount = await hr.insurancePeriodDetail(scope, actor(managerUserId, [HR_PERMISSIONS.HR_INSURANCE_TEAM_READ, HR_PERMISSIONS.HR_INSURANCE_AMOUNT_READ]), insuranceId) as Record<string, unknown>;
    assert.equal(amount.employeeAmount, "800.00");
    assert.equal("employerAmount" in amount, false);

    const contractMasked = await hr.contractDetail(scope, actor(managerUserId, [HR_PERMISSIONS.HR_CONTRACT_READ]), contractId) as Record<string, unknown>;
    assert.equal("baseSalary" in contractMasked, false);
    const contractSalary = await hr.contractDetail(scope, actor(managerUserId, [HR_PERMISSIONS.HR_CONTRACT_READ, HR_PERMISSIONS.HR_CONTRACT_SALARY_READ]), contractId) as Record<string, unknown>;
    assert.equal(contractSalary.baseSalary, "9000.00");

    const slips = await hr.payrollRunPayslips(scope, actor(managerUserId, [HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ]), payrollRunId);
    assert.equal(slips.length, 1);
    assert.equal((slips[0] as unknown as Record<string, unknown>).netAmount, "8000.00");
    assert.equal("compensationSnapshot" in (slips[0] as unknown as Record<string, unknown>), false);
  });

  it("fails all sensitive reads before returning data when required audit persistence fails", async () => {
    auditFails = true;
    await assert.rejects(hr.insurancePeriodDetail(scope, actor(managerUserId, [HR_PERMISSIONS.HR_INSURANCE_TEAM_READ]), insuranceId), /required audit persistence failed/u);
    await assert.rejects(hr.contractDetail(scope, actor(managerUserId, [HR_PERMISSIONS.HR_CONTRACT_READ]), contractId), /required audit persistence failed/u);
    await assert.rejects(hr.payrollRunPayslips(scope, actor(managerUserId, [HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ]), payrollRunId), /required audit persistence failed/u);
    await assert.rejects(files.detailForActor(scope, actor(managerUserId, [HR_PERMISSIONS.HR_EMPLOYEE_DOCUMENT_READ]), managedFileId), /required audit persistence failed/u);
    auditFails = false;
    assert.equal((await db.query("SELECT count(*)::int AS count FROM sys_file WHERE id=ANY($1::uuid[])", [[managedFileId, siblingFileId, selfFileId]]) as Array<{ count: number }>)[0]!.count, 3);
  });

  it("official seed upgrade retires broad manager grants and does not grant insurance amounts", async () => {
    const role = (await db.query("SELECT id FROM sys_role WHERE tenant_id=$1 AND code='DEPARTMENT_MANAGER' AND is_deleted=false LIMIT 1", [scope.tenantId]) as Array<{ id: string }>)[0];
    assert.ok(role);
    const permissionRows = await db.query("SELECT id,code FROM sys_permission WHERE tenant_id=$1 AND code=ANY($2::text[]) AND is_deleted=false", [scope.tenantId, [HR_PERMISSIONS.HR_INSURANCE_READ, HR_PERMISSIONS.HR_INSURANCE_AMOUNT_READ]]) as Array<{ id: string; code: string }>;
    assert.equal(permissionRows.length, 2);
    for (const permission of permissionRows) {
      await db.query(`INSERT INTO rel_role_perm(tenant_id,park_id,role_id,permission_id,create_time,update_time,is_deleted,version,remark)
        VALUES($1,$2,$3,$4,now(),now(),false,1,'P0 forced stale broad grant')
        ON CONFLICT(tenant_id,park_id,role_id,permission_id) WHERE is_deleted=false
        DO UPDATE SET is_deleted=false,update_time=now(),remark=EXCLUDED.remark`, [scope.tenantId, scope.parkId, role.id, permission.id]);
    }
    await db.query(readFileSync("../../database/seeds/production/000016_hr_management_foundation.sql", "utf8"));
    const remaining = await db.query("SELECT p.code FROM rel_role_perm rp JOIN sys_permission p ON p.id=rp.permission_id WHERE rp.tenant_id=$1 AND rp.role_id=$2 AND rp.is_deleted=false AND p.code=ANY($3::text[]) ORDER BY p.code", [scope.tenantId, role.id, [HR_PERMISSIONS.HR_INSURANCE_READ, HR_PERMISSIONS.HR_INSURANCE_AMOUNT_READ]]);
    assert.deepEqual(remaining, []);
  });
});
