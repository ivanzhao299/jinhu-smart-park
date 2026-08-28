import { createHash } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { HR_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { DataSource, type EntityManager } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditService } from "../audit/audit.service";
import type {
  CreateHrCriticalPositionDto,
  CreateHrDevelopmentActionDto,
  CreateHrDevelopmentPlanDto,
  CreateHrSuccessionCandidateDto,
  CreateHrTalentProfileDto,
  CreateHrTalentReviewSessionDto,
  DecideHrTalentSubjectDto,
  HrTalentQueryDto,
  TransitionHrDevelopmentActionDto,
  TransitionHrDevelopmentPlanDto,
} from "./dto/hr-talent.dto";
import { HrNotificationService } from "./hr-notification.service";
import { recordHrSensitiveRead } from "./hr-sensitive-read-audit";

type Row = Record<string, unknown>;
type Access = "park" | "managed_org_tree" | "self" | "none";
const has = (a: JwtPrincipal, p: string) =>
  Boolean(
    a.isSuper || a.permissions?.includes("*") || a.permissions?.includes(p),
  );
const json = (v: unknown) => JSON.stringify(v ?? {});
const digest = (v: unknown) =>
  createHash("sha256").update(json(v)).digest("hex");

@Injectable()
export class HrTalentService {
  constructor(
    private readonly db: DataSource,
    private readonly audit: AuditService,
    private readonly notifications: HrNotificationService,
  ) {}
  private scoped(s: TenantParkScope, a: JwtPrincipal) {
    return a.tenantId === s.tenantId && a.parkId === s.parkId;
  }
  private assertScope(s: TenantParkScope, a: JwtPrincipal) {
    if (!this.scoped(s, a))
      throw new ForbiddenException("Talent scope is unavailable");
  }
  private access(s: TenantParkScope, a: JwtPrincipal): Access {
    if (!this.scoped(s, a)) return "none";
    if (
      has(a, HR_PERMISSIONS.HR_TALENT_READ) ||
      has(a, HR_PERMISSIONS.HR_TALENT_PROFILE_CREATE) ||
      has(a, HR_PERMISSIONS.HR_TALENT_REVIEW) ||
      has(a, HR_PERMISSIONS.HR_SUCCESSION_READ) ||
      has(a, HR_PERMISSIONS.HR_SUCCESSION_MANAGE)
    )
      return "park";
    if (
      has(a, HR_PERMISSIONS.HR_TALENT_TEAM_READ) ||
      has(a, HR_PERMISSIONS.HR_DEVELOPMENT_MANAGE)
    )
      return "managed_org_tree";
    if (
      has(a, HR_PERMISSIONS.HR_TALENT_SELF_READ) ||
      has(a, HR_PERMISSIONS.HR_DEVELOPMENT_SELF_ACTION)
    )
      return "self";
    return "none";
  }
  private managedOrgSql(actorParam: string) {
    return `WITH RECURSIVE managed_org AS(SELECT id FROM sys_org WHERE tenant_id=$1 AND park_id=$2 AND leader_user_id::text=${actorParam}::text AND is_deleted=false AND status='enabled' UNION ALL SELECT o.id FROM sys_org o JOIN managed_org x ON o.parent_id=x.id WHERE o.tenant_id=$1 AND o.park_id=$2 AND o.is_deleted=false AND o.status='enabled') SELECT id FROM managed_org`;
  }
  private employeePredicate(access: Access, alias: string, actorParam: string) {
    return access === "managed_org_tree"
      ? ` AND ${alias}.primary_org_id IN(${this.managedOrgSql(actorParam)})`
      : access === "self"
        ? ` AND ${alias}.user_id=${actorParam}`
        : access === "none"
          ? " AND false"
          : "";
  }
  private async auditRead(
    s: TenantParkScope,
    a: JwtPrincipal,
    resource: string,
    bizType: string,
    path: string,
    count: number,
    projection: "self" | "team" | "park" | "admin" = "park",
  ) {
    await recordHrSensitiveRead(this.audit, s, a, {
      resource,
      action: "读取人才敏感数据",
      bizType,
      bizId: null,
      path,
      fieldGroups: ["feedback"],
      projection,
      itemCount: count,
    });
  }
  private async requireEmployee(
    m: DataSource | EntityManager,
    s: TenantParkScope,
    a: JwtPrincipal,
    employeeId: string,
    write = true,
  ) {
    const access = this.access(s, a);
    if (access === "none")
      throw new ForbiddenException("Talent scope is unavailable");
    const p: unknown[] = [s.tenantId, s.parkId, employeeId, a.sub];
    const row = (
      await m.query(
        `SELECT e.id,e.employee_code "employeeCode",e.full_name "fullName",e.primary_org_id "orgId",e.position_id "positionId",e.manager_employee_id "managerEmployeeId",e.user_id "userId" FROM hr_employee e WHERE e.tenant_id=$1 AND e.park_id=$2 AND e.id=$3 AND e.is_deleted=false${this.employeePredicate(access, "e", "$4")}`,
        p,
      )
    )[0] as Row | undefined;
    if (!row)
      throw write
        ? new ForbiddenException(
            "Employee is outside the authorized talent scope",
          )
        : new NotFoundException("Talent record not found");
    return row;
  }

  async options(s: TenantParkScope, a: JwtPrincipal) {
    this.assertScope(s, a);
    const access = this.access(s, a);
    if (access === "none")
      throw new ForbiddenException("Talent options permission required");
    const p = [s.tenantId, s.parkId, a.sub];
    const employees = await this.db.query(
      `SELECT e.id,e.employee_code "employeeCode",e.full_name "fullName",e.primary_org_id "orgId" FROM hr_employee e WHERE e.tenant_id=$1 AND e.park_id=$2 AND $3::uuid IS NOT NULL AND e.is_deleted=false AND e.employment_status='active'${this.employeePredicate(access, "e", "$3")} ORDER BY e.full_name,e.id LIMIT 500`,
      p,
    );
    const positions =
      access === "park" && has(a, HR_PERMISSIONS.HR_SUCCESSION_MANAGE)
        ? await this.db.query(
            `SELECT id,position_code "positionCode",position_name "positionName" FROM hr_position WHERE tenant_id=$1 AND park_id=$2 AND is_deleted=false ORDER BY position_name LIMIT 500`,
            p.slice(0, 2),
          )
        : [];
    await this.auditRead(
      s,
      a,
      "hr.talent_options",
      "hr_talent_profile_snapshot",
      "/hr/talent/options",
      employees.length,
      access === "managed_org_tree"
        ? "team"
        : access === "self"
          ? "self"
          : "park",
    );
    return { employees, positions };
  }

  async createProfile(
    s: TenantParkScope,
    a: JwtPrincipal,
    d: CreateHrTalentProfileDto,
  ) {
    this.assertScope(s, a);
    if (!has(a, HR_PERMISSIONS.HR_TALENT_PROFILE_CREATE))
      throw new ForbiddenException("Talent profile permission required");
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
    }).format(new Date());
    if (d.asOfDate > today)
      throw new BadRequestException(
        "Talent profile date cannot be in the future",
      );
    return this.db.transaction(async (m) => {
      const employee = await this.requireEmployee(m, s, a, d.employeeId);
      await m.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [
        `${s.tenantId}:${s.parkId}:talent-profile:${d.employeeId}`,
      ]);
      const performance =
        (
          await m.query(
            `SELECT ce.id,ce.final_score "finalScore",ce.final_level_code "finalLevelCode",ce.result_finalized_at "finalizedAt",c.cycle_code "cycleCode",c.cycle_name "cycleName" FROM hr_performance_cycle_employee ce JOIN hr_performance_review_cycle c ON(c.id,c.tenant_id,c.park_id)=(ce.cycle_id,ce.tenant_id,ce.park_id) WHERE ce.tenant_id=$1 AND ce.park_id=$2 AND ce.employee_id=$3 AND ce.status='confirmed' AND ce.result_finalized_at::date<=$4::date ORDER BY ce.result_finalized_at DESC NULLS LAST,ce.id DESC LIMIT 1`,
            [s.tenantId, s.parkId, d.employeeId, d.asOfDate],
          )
        )[0] ?? {};
      const feedback = await m.query(
        `SELECT x.id "subjectId",x.published_at "publishedAt",c.cycle_code "cycleCode",c.cycle_name "cycleName",jsonb_object_agg(r.dimension_code,r.average_score ORDER BY r.dimension_code) dimensions FROM hr_feedback360_subject x JOIN hr_feedback360_cycle c ON(c.id,c.tenant_id,c.park_id)=(x.cycle_id,x.tenant_id,x.park_id) JOIN hr_feedback360_dimension_result r ON(r.subject_id,r.tenant_id,r.park_id)=(x.id,x.tenant_id,x.park_id) WHERE x.tenant_id=$1 AND x.park_id=$2 AND x.employee_id=$3 AND x.status='published' AND x.published_at::date<=$4::date GROUP BY x.id,c.cycle_code,c.cycle_name ORDER BY x.published_at DESC LIMIT 1`,
        [s.tenantId, s.parkId, d.employeeId, d.asOfDate],
      );
      const sources = { employee, performance, feedback: feedback[0] ?? {} };
      const sourceDigest = digest(sources);
      const row = (
        await m.query(
          `INSERT INTO hr_talent_profile_snapshot(tenant_id,park_id,employee_id,snapshot_no,as_of_date,employee_snapshot,performance_source,feedback_source,source_digest,created_by)SELECT $1::varchar,$2::varchar,$3::uuid,COALESCE(max(snapshot_no),0)+1,$4::date,$5::jsonb,$6::jsonb,$7::jsonb,$8::varchar,$9::uuid FROM hr_talent_profile_snapshot WHERE tenant_id=$1::varchar AND park_id=$2::varchar AND employee_id=$3::uuid RETURNING id,snapshot_no "snapshotNo",as_of_date "asOfDate"`,
          [
            s.tenantId,
            s.parkId,
            d.employeeId,
            d.asOfDate,
            json(employee),
            json(performance),
            json(feedback[0] ?? {}),
            sourceDigest,
            a.sub,
          ],
        )
      )[0];
      return row;
    });
  }

  async profiles(s: TenantParkScope, a: JwtPrincipal, q: HrTalentQueryDto) {
    this.assertScope(s, a);
    const access = this.access(s, a);
    if (access === "none") return [];
    const p: unknown[] = [s.tenantId, s.parkId, a.sub];
    let filter = ` AND $3::uuid IS NOT NULL${this.employeePredicate(access, "e", "$3")}`;
    if (q.employeeId) {
      p.push(q.employeeId);
      filter += ` AND e.id=$${p.length}`;
    }
    const rows = await this.db.query(
      `SELECT p.id,p.snapshot_no "snapshotNo",p.as_of_date "asOfDate",e.full_name "employeeName",e.employee_code "employeeCode",p.performance_source-'id' "performanceSource",p.feedback_source-'subjectId' "feedbackSource",p.created_at "createdAt" FROM hr_talent_profile_snapshot p JOIN hr_employee e ON(e.id,e.tenant_id,e.park_id)=(p.employee_id,p.tenant_id,p.park_id) WHERE p.tenant_id=$1 AND p.park_id=$2${filter} ORDER BY p.created_at DESC LIMIT 500`,
      p,
    );
    await this.auditRead(
      s,
      a,
      "hr.talent_profile",
      "hr_talent_profile_snapshot",
      "/hr/talent/profiles",
      rows.length,
      access === "managed_org_tree"
        ? "team"
        : access === "self"
          ? "self"
          : "park",
    );
    return rows;
  }

  async createSession(
    s: TenantParkScope,
    a: JwtPrincipal,
    d: CreateHrTalentReviewSessionDto,
  ) {
    this.assertScope(s, a);
    if (!has(a, HR_PERMISSIONS.HR_TALENT_REVIEW))
      throw new ForbiddenException("Talent review permission required");
    if (
      !d.employeeIds.length ||
      new Set(d.employeeIds).size !== d.employeeIds.length
    )
      throw new BadRequestException("Review employees must be unique");
    return this.db.transaction(async (m) => {
      const session = (
        await m.query(
          `INSERT INTO hr_talent_review_session(tenant_id,park_id,session_code,session_name,review_date,performance_definition,potential_definition,participant_snapshot,created_by)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)RETURNING id,status`,
          [
            s.tenantId,
            s.parkId,
            d.sessionCode,
            d.sessionName,
            d.reviewDate,
            json({ text: d.performanceDefinition }),
            json({ text: d.potentialDefinition }),
            json([{ userId: a.sub }]),
            a.sub,
          ],
        )
      )[0];
      for (const employeeId of d.employeeIds) {
        const employee = await this.requireEmployee(m, s, a, employeeId);
        const profile = (
          await m.query(
            `SELECT id,snapshot_no,as_of_date,source_digest FROM hr_talent_profile_snapshot WHERE tenant_id=$1 AND park_id=$2 AND employee_id=$3 AND as_of_date<=$4 ORDER BY snapshot_no DESC LIMIT 1`,
            [s.tenantId, s.parkId, employeeId, d.reviewDate],
          )
        )[0];
        if (!profile)
          throw new BadRequestException(
            `Employee ${String(employee.employeeCode)} has no frozen talent profile at the review date`,
          );
        await m.query(
          `INSERT INTO hr_talent_review_subject(tenant_id,park_id,session_id,employee_id,profile_snapshot_id,employee_snapshot,source_snapshot)VALUES($1,$2,$3,$4,$5,$6,$7)`,
          [
            s.tenantId,
            s.parkId,
            session.id,
            employeeId,
            profile.id,
            json(employee),
            json(profile),
          ],
        );
      }
      return session;
    });
  }

  async activateSession(
    s: TenantParkScope,
    a: JwtPrincipal,
    sessionId: string,
  ) {
    this.assertScope(s, a);
    if (!has(a, HR_PERMISSIONS.HR_TALENT_REVIEW))
      throw new ForbiddenException("Talent review permission required");
    return this.db.transaction(async (m) => {
      const rows = await m.query(
        `UPDATE hr_talent_review_session SET status='active',activated_at=now() WHERE id=$3 AND tenant_id=$1 AND park_id=$2 AND status='draft' RETURNING id,status`,
        [s.tenantId, s.parkId, sessionId],
      );
      if (rows.length !== 1)
        throw new ConflictException("Talent session is not draft");
      return rows[0];
    });
  }
  async closeSession(s: TenantParkScope, a: JwtPrincipal, sessionId: string) {
    this.assertScope(s, a);
    if (!has(a, HR_PERMISSIONS.HR_TALENT_REVIEW))
      throw new ForbiddenException("Talent review permission required");
    return this.db.transaction(async (m) => {
      const session = (
        await m.query(
          `SELECT id,status FROM hr_talent_review_session WHERE id=$3 AND tenant_id=$1 AND park_id=$2 FOR UPDATE`,
          [s.tenantId, s.parkId, sessionId],
        )
      )[0];
      if (!session || session.status !== "active")
        throw new ConflictException("Talent session is not active");
      const undecided = (
        await m.query(
          `SELECT count(*)::int count FROM hr_talent_review_subject x WHERE x.tenant_id=$1 AND x.park_id=$2 AND x.session_id=$3 AND NOT EXISTS(SELECT 1 FROM hr_talent_review_decision d WHERE d.tenant_id=x.tenant_id AND d.park_id=x.park_id AND d.subject_id=x.id)`,
          [s.tenantId, s.parkId, sessionId],
        )
      )[0]?.count;
      if (Number(undecided) > 0)
        throw new ConflictException(
          "Every talent subject requires a decision before closure",
        );
      return (
        await m.query(
          `UPDATE hr_talent_review_session SET status='closed',closed_at=now() WHERE id=$3 AND tenant_id=$1 AND park_id=$2 RETURNING id,status`,
          [s.tenantId, s.parkId, sessionId],
        )
      )[0];
    });
  }
  async sessions(s: TenantParkScope, a: JwtPrincipal, q: HrTalentQueryDto) {
    this.assertScope(s, a);
    const access = this.access(s, a);
    if (access === "none" || access === "self") return [];
    const p: unknown[] = [s.tenantId, s.parkId, a.sub];
    let where = " AND $3::uuid IS NOT NULL";
    if (access === "managed_org_tree")
      where += ` AND se.primary_org_id IN(${this.managedOrgSql("$3")})`;
    if (q.sessionId) {
      p.push(q.sessionId);
      where += ` AND x.id=$${p.length}`;
    }
    const rows = await this.db.query(
      `SELECT x.id,x.session_code "sessionCode",x.session_name "sessionName",x.review_date "reviewDate",x.status,count(su.id)::int "subjectCount" FROM hr_talent_review_session x LEFT JOIN hr_talent_review_subject su ON(su.session_id,su.tenant_id,su.park_id)=(x.id,x.tenant_id,x.park_id) LEFT JOIN hr_employee se ON(se.id,se.tenant_id,se.park_id)=(su.employee_id,su.tenant_id,su.park_id) WHERE x.tenant_id=$1 AND x.park_id=$2${where} GROUP BY x.id ORDER BY x.review_date DESC`,
      p,
    );
    await this.auditRead(
      s,
      a,
      "hr.talent_review",
      "hr_talent_review_session",
      "/hr/talent/sessions",
      rows.length,
      access === "managed_org_tree" ? "team" : "park",
    );
    return rows;
  }
  async subjects(s: TenantParkScope, a: JwtPrincipal, sessionId: string) {
    this.assertScope(s, a);
    const access = this.access(s, a);
    if (access === "none" || access === "self") return [];
    const p = [s.tenantId, s.parkId, sessionId, a.sub];
    const rows = await this.db.query(
      `SELECT x.id,e.full_name "employeeName",e.employee_code "employeeCode",p.as_of_date "profileAsOf",d.performance_band "performanceBand",d.potential_band "potentialBand",d.nine_box "nineBox",d.potential_score "potentialScore",d.reason FROM hr_talent_review_subject x JOIN hr_employee e ON(e.id,e.tenant_id,e.park_id)=(x.employee_id,x.tenant_id,x.park_id) JOIN hr_talent_profile_snapshot p ON(p.id,p.tenant_id,p.park_id)=(x.profile_snapshot_id,x.tenant_id,x.park_id) LEFT JOIN LATERAL(SELECT * FROM hr_talent_review_decision z WHERE z.tenant_id=x.tenant_id AND z.park_id=x.park_id AND z.subject_id=x.id ORDER BY z.decision_no DESC LIMIT 1)d ON true WHERE x.tenant_id=$1 AND x.park_id=$2 AND x.session_id=$3 AND $4::uuid IS NOT NULL${this.employeePredicate(access, "e", "$4")} ORDER BY e.full_name`,
      p,
    );
    await this.auditRead(
      s,
      a,
      "hr.talent_review_subject",
      "hr_talent_review_subject",
      "/hr/talent/sessions/:id/subjects",
      rows.length,
      access === "managed_org_tree" ? "team" : "park",
    );
    return rows;
  }
  async decide(
    s: TenantParkScope,
    a: JwtPrincipal,
    subjectId: string,
    d: DecideHrTalentSubjectDto,
  ) {
    this.assertScope(s, a);
    if (!has(a, HR_PERMISSIONS.HR_TALENT_REVIEW))
      throw new ForbiddenException("Talent review permission required");
    return this.db.transaction(async (m) => {
      const subject = (
        await m.query(
          `SELECT x.id,x.session_id,s.status FROM hr_talent_review_subject x JOIN hr_talent_review_session s ON(s.id,s.tenant_id,s.park_id)=(x.session_id,x.tenant_id,x.park_id) WHERE x.id=$3 AND x.tenant_id=$1 AND x.park_id=$2 FOR UPDATE OF x,s`,
          [s.tenantId, s.parkId, subjectId],
        )
      )[0];
      if (!subject)
        throw new NotFoundException("Talent review subject not found");
      if (subject.status !== "active")
        throw new ConflictException("Talent review session is not active");
      const previous = (
        await m.query(
          `SELECT id,decision_no FROM hr_talent_review_decision WHERE tenant_id=$1 AND park_id=$2 AND subject_id=$3 ORDER BY decision_no DESC LIMIT 1`,
          [s.tenantId, s.parkId, subjectId],
        )
      )[0];
      return (
        await m.query(
          `INSERT INTO hr_talent_review_decision(tenant_id,park_id,subject_id,decision_no,performance_band,potential_band,nine_box,potential_score,reason,evidence,supersedes_id,decided_by)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)RETURNING id,decision_no "decisionNo",nine_box "nineBox"`,
          [
            s.tenantId,
            s.parkId,
            subjectId,
            (previous?.decision_no ?? 0) + 1,
            d.performanceBand,
            d.potentialBand,
            `${d.performanceBand}_${d.potentialBand}`,
            d.potentialScore,
            d.reason,
            json(d.evidence ?? []),
            previous?.id ?? null,
            a.sub,
          ],
        )
      )[0];
    });
  }

  async createCriticalPosition(
    s: TenantParkScope,
    a: JwtPrincipal,
    d: CreateHrCriticalPositionDto,
  ) {
    this.assertScope(s, a);
    if (!has(a, HR_PERMISSIONS.HR_SUCCESSION_MANAGE))
      throw new ForbiddenException("Succession management permission required");
    return this.db.transaction(async (m) => {
      const row = (
        await m.query(
          `INSERT INTO hr_critical_position(tenant_id,park_id,position_id,criticality,risk_level,risk_reason,evidence,created_by)SELECT $1::varchar,$2::varchar,p.id,$4::varchar,$5::varchar,$6::varchar,$7::jsonb,$8::uuid FROM hr_position p WHERE p.id=$3::uuid AND p.tenant_id=$1::varchar AND p.park_id=$2::varchar AND p.is_deleted=false RETURNING id`,
          [
            s.tenantId,
            s.parkId,
            d.positionId,
            d.criticality,
            d.riskLevel,
            d.riskReason,
            json(d.evidence ?? []),
            a.sub,
          ],
        )
      )[0];
      if (!row) throw new NotFoundException("Position not found");
      return row;
    });
  }
  async createSuccessor(
    s: TenantParkScope,
    a: JwtPrincipal,
    d: CreateHrSuccessionCandidateDto,
  ) {
    this.assertScope(s, a);
    if (!has(a, HR_PERMISSIONS.HR_SUCCESSION_MANAGE))
      throw new ForbiddenException("Succession management permission required");
    return this.db.transaction(async (m) => {
      await this.requireEmployee(m, s, a, d.employeeId);
      const position = (
        await m.query(
          `SELECT id FROM hr_critical_position WHERE id=$3 AND tenant_id=$1 AND park_id=$2 AND status='active' FOR UPDATE`,
          [s.tenantId, s.parkId, d.criticalPositionId],
        )
      )[0];
      if (!position) throw new NotFoundException("Critical position not found");
      const profile = (
        await m.query(
          `SELECT id FROM hr_talent_profile_snapshot WHERE tenant_id=$1 AND park_id=$2 AND employee_id=$3 ORDER BY snapshot_no DESC LIMIT 1`,
          [s.tenantId, s.parkId, d.employeeId],
        )
      )[0];
      if (!profile)
        throw new BadRequestException("Frozen talent profile required");
      const previous = (
        await m.query(
          `SELECT id,version_no FROM hr_succession_candidate_version WHERE tenant_id=$1 AND park_id=$2 AND critical_position_id=$3 AND employee_id=$4 ORDER BY version_no DESC LIMIT 1`,
          [s.tenantId, s.parkId, d.criticalPositionId, d.employeeId],
        )
      )[0];
      return (
        await m.query(
          `INSERT INTO hr_succession_candidate_version(tenant_id,park_id,critical_position_id,employee_id,version_no,readiness,risk_level,risk_reason,evidence,profile_snapshot_id,supersedes_id,created_by)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)RETURNING id,version_no "versionNo"`,
          [
            s.tenantId,
            s.parkId,
            d.criticalPositionId,
            d.employeeId,
            (previous?.version_no ?? 0) + 1,
            d.readiness,
            d.riskLevel,
            d.riskReason,
            json(d.evidence ?? []),
            profile.id,
            previous?.id ?? null,
            a.sub,
          ],
        )
      )[0];
    });
  }
  async succession(s: TenantParkScope, a: JwtPrincipal) {
    this.assertScope(s, a);
    if (
      !has(a, HR_PERMISSIONS.HR_SUCCESSION_READ) &&
      !has(a, HR_PERMISSIONS.HR_SUCCESSION_MANAGE)
    )
      return [];
    const rows = await this.db.query(
      `SELECT cp.id "criticalPositionId",p.position_name "positionName",cp.criticality,cp.risk_level "positionRisk",e.full_name "candidateName",e.employee_code "employeeCode",v.readiness,v.risk_level "candidateRisk",v.risk_reason "riskReason",v.evidence,v.created_at "assessedAt" FROM hr_critical_position cp JOIN hr_position p ON(p.id,p.tenant_id,p.park_id)=(cp.position_id,cp.tenant_id,cp.park_id) LEFT JOIN LATERAL(SELECT DISTINCT ON(z.employee_id) z.* FROM hr_succession_candidate_version z WHERE z.tenant_id=cp.tenant_id AND z.park_id=cp.park_id AND z.critical_position_id=cp.id ORDER BY z.employee_id,z.version_no DESC) v ON true LEFT JOIN hr_employee e ON(e.id,e.tenant_id,e.park_id)=(v.employee_id,v.tenant_id,v.park_id) WHERE cp.tenant_id=$1 AND cp.park_id=$2 AND cp.status='active' ORDER BY p.position_name,e.full_name`,
      [s.tenantId, s.parkId],
    );
    await this.auditRead(
      s,
      a,
      "hr.succession",
      "hr_succession_candidate_version",
      "/hr/talent/succession",
      rows.length,
      "admin",
    );
    return rows;
  }

  async createPlan(
    s: TenantParkScope,
    a: JwtPrincipal,
    d: CreateHrDevelopmentPlanDto,
  ) {
    this.assertScope(s, a);
    if (!has(a, HR_PERMISSIONS.HR_DEVELOPMENT_MANAGE))
      throw new ForbiddenException(
        "Development management permission required",
      );
    if (d.endDate < d.startDate)
      throw new BadRequestException("Development plan dates are invalid");
    return this.db.transaction(async (m) => {
      await this.requireEmployee(m, s, a, d.employeeId);
      const profile = (
        await m.query(
          `SELECT id FROM hr_talent_profile_snapshot WHERE tenant_id=$1 AND park_id=$2 AND employee_id=$3 ORDER BY snapshot_no DESC LIMIT 1`,
          [s.tenantId, s.parkId, d.employeeId],
        )
      )[0];
      if (!profile)
        throw new BadRequestException("Frozen talent profile required");
      const plan = (
        await m.query(
          `INSERT INTO hr_development_plan(tenant_id,park_id,employee_id,profile_snapshot_id,plan_code,plan_name,development_goal,start_date,end_date,created_by)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)RETURNING id,status`,
          [
            s.tenantId,
            s.parkId,
            d.employeeId,
            profile.id,
            d.planCode,
            d.planName,
            d.developmentGoal,
            d.startDate,
            d.endDate,
            a.sub,
          ],
        )
      )[0];
      await m.query(
        `INSERT INTO hr_development_plan_history(tenant_id,park_id,plan_id,event_no,event_type,to_status,actor_user_id)VALUES($1,$2,$3,1,'created','draft',$4)`,
        [s.tenantId, s.parkId, plan.id, a.sub],
      );
      return plan;
    });
  }
  async transitionPlan(
    s: TenantParkScope,
    a: JwtPrincipal,
    planId: string,
    d: TransitionHrDevelopmentPlanDto,
  ) {
    this.assertScope(s, a);
    if (!has(a, HR_PERMISSIONS.HR_DEVELOPMENT_MANAGE))
      throw new ForbiddenException(
        "Development management permission required",
      );
    return this.db.transaction(async (m) => {
      const access = this.access(s, a);
      const plan = (
        await m.query(
          `SELECT p.id,p.status FROM hr_development_plan p JOIN hr_employee e ON(e.id,e.tenant_id,e.park_id)=(p.employee_id,p.tenant_id,p.park_id) WHERE p.id=$3 AND p.tenant_id=$1 AND p.park_id=$2 AND $4::uuid IS NOT NULL${this.employeePredicate(access, "e", "$4")} FOR UPDATE OF p`,
          [s.tenantId, s.parkId, planId, a.sub],
        )
      )[0];
      if (!plan) throw new NotFoundException("Development plan not found");
      const transition =
        d.action === "activate" && plan.status === "draft"
          ? ["draft", "active"]
          : d.action === "complete" && plan.status === "active"
            ? ["active", "completed"]
            : d.action === "cancel" &&
                ["draft", "active"].includes(String(plan.status))
              ? [String(plan.status), "cancelled"]
              : null;
      if (
        !transition ||
        (["complete", "cancel"].includes(d.action) && !d.reason?.trim())
      )
        throw new ConflictException("Development plan transition is invalid");
      if (d.action === "complete") {
        const open = (
          await m.query(
            `SELECT count(*)::int count FROM hr_development_action WHERE tenant_id=$1 AND park_id=$2 AND plan_id=$3 AND status NOT IN('completed','cancelled')`,
            [s.tenantId, s.parkId, planId],
          )
        )[0]?.count;
        if (Number(open) > 0)
          throw new ConflictException(
            "Complete all development actions before closing the plan",
          );
      }
      const result = (
        await m.query(
          `UPDATE hr_development_plan SET status=$4,submitted_at=CASE WHEN $4='active' THEN now() ELSE submitted_at END,completed_at=CASE WHEN $4='completed' THEN now() ELSE completed_at END WHERE id=$3 AND tenant_id=$1 AND park_id=$2 RETURNING id,status`,
          [s.tenantId, s.parkId, planId, transition[1]],
        )
      )[0];
      await m.query(
        `INSERT INTO hr_development_plan_history(tenant_id,park_id,plan_id,event_no,event_type,from_status,to_status,reason,actor_user_id)SELECT $1::varchar,$2::varchar,$3::uuid,COALESCE(max(event_no),0)+1,$4::varchar,$5::varchar,$6::varchar,$7::varchar,$8::uuid FROM hr_development_plan_history WHERE tenant_id=$1::varchar AND park_id=$2::varchar AND plan_id=$3::uuid`,
        [
          s.tenantId,
          s.parkId,
          planId,
          d.action === "activate"
            ? "activated"
            : d.action === "complete"
              ? "completed"
              : "cancelled",
          transition[0],
          transition[1],
          d.reason ?? null,
          a.sub,
        ],
      );
      return result;
    });
  }
  async addAction(
    s: TenantParkScope,
    a: JwtPrincipal,
    planId: string,
    d: CreateHrDevelopmentActionDto,
  ) {
    this.assertScope(s, a);
    if (!has(a, HR_PERMISSIONS.HR_DEVELOPMENT_MANAGE))
      throw new ForbiddenException(
        "Development management permission required",
      );
    return this.db.transaction(async (m) => {
      const plan = (
        await m.query(
          `SELECT p.id,p.status FROM hr_development_plan p JOIN hr_employee e ON(e.id,e.tenant_id,e.park_id)=(p.employee_id,p.tenant_id,p.park_id) WHERE p.id=$3 AND p.tenant_id=$1 AND p.park_id=$2${this.employeePredicate(this.access(s, a), "e", "$4")} FOR UPDATE OF p`,
          [s.tenantId, s.parkId, planId, a.sub],
        )
      )[0];
      if (!plan) throw new NotFoundException("Development plan not found");
      if (["completed", "cancelled"].includes(String(plan.status)))
        throw new ConflictException("Development plan is terminal");
      await this.requireEmployee(m, s, a, d.ownerEmployeeId);
      const action = (
        await m.query(
          `INSERT INTO hr_development_action(tenant_id,park_id,plan_id,action_no,action_name,owner_employee_id,due_date,created_by)SELECT $1::varchar,$2::varchar,$3::uuid,COALESCE(max(action_no),0)+1,$4::varchar,$5::uuid,$6::date,$7::uuid FROM hr_development_action WHERE tenant_id=$1::varchar AND park_id=$2::varchar AND plan_id=$3::uuid RETURNING id,status`,
          [
            s.tenantId,
            s.parkId,
            planId,
            d.actionName,
            d.ownerEmployeeId,
            d.dueDate,
            a.sub,
          ],
        )
      )[0];
      await m.query(
        `INSERT INTO hr_development_action_history(tenant_id,park_id,action_id,event_no,event_type,to_status,actor_user_id)VALUES($1,$2,$3,1,'created','pending',$4)`,
        [s.tenantId, s.parkId, action.id, a.sub],
      );
      await this.notifications.publishDevelopmentAction(
        s,
        a,
        { actionId: action.id, ownerEmployeeId: d.ownerEmployeeId },
        m,
      );
      return action;
    });
  }
  async plans(s: TenantParkScope, a: JwtPrincipal) {
    this.assertScope(s, a);
    const access = this.access(s, a);
    if (access === "none") return [];
    const scopeFilter =
      access === "self"
        ? " AND (e.user_id=$3 OR oe.user_id=$3)"
        : this.employeePredicate(access, "e", "$3");
    const actionVisibility =
      access === "self" ? " AND (e.user_id=$3 OR oe.user_id=$3)" : "";
    const canManage =
      has(a, HR_PERMISSIONS.HR_DEVELOPMENT_MANAGE) && access !== "self";
    const rows = await this.db.query(
      `SELECT p.id,p.plan_code "planCode",p.plan_name "planName",p.development_goal "developmentGoal",p.start_date "startDate",p.end_date "endDate",p.status,e.full_name "employeeName",COALESCE(jsonb_agg(jsonb_build_object('id',x.id,'actionName',x.action_name,'ownerName',oe.full_name,'dueDate',x.due_date,'status',x.status,'evidence',x.evidence,'canAct',($4::boolean OR oe.user_id=$3)) ORDER BY x.action_no) FILTER(WHERE x.id IS NOT NULL${actionVisibility}),'[]'::jsonb) actions FROM hr_development_plan p JOIN hr_employee e ON(e.id,e.tenant_id,e.park_id)=(p.employee_id,p.tenant_id,p.park_id) LEFT JOIN hr_development_action x ON(x.plan_id,x.tenant_id,x.park_id)=(p.id,p.tenant_id,p.park_id) LEFT JOIN hr_employee oe ON(oe.id,oe.tenant_id,oe.park_id)=(x.owner_employee_id,x.tenant_id,x.park_id) WHERE p.tenant_id=$1 AND p.park_id=$2 AND $3::uuid IS NOT NULL${scopeFilter} GROUP BY p.id,e.full_name ORDER BY p.end_date`,
      [s.tenantId, s.parkId, a.sub, canManage],
    );
    await this.auditRead(
      s,
      a,
      "hr.development",
      "hr_development_plan",
      "/hr/talent/development-plans",
      rows.length,
      access === "managed_org_tree"
        ? "team"
        : access === "self"
          ? "self"
          : "park",
    );
    return rows;
  }
  async transitionAction(
    s: TenantParkScope,
    a: JwtPrincipal,
    actionId: string,
    d: TransitionHrDevelopmentActionDto,
  ) {
    this.assertScope(s, a);
    const selfAction = has(a, HR_PERMISSIONS.HR_DEVELOPMENT_SELF_ACTION),
      manage = has(a, HR_PERMISSIONS.HR_DEVELOPMENT_MANAGE);
    if (!selfAction && !manage)
      throw new ForbiddenException("Development action permission required");
    return this.db.transaction(async (m) => {
      const access = this.access(s, a);
      const row = (
        await m.query(
          `SELECT x.*,oe.user_id "ownerUserId",p.employee_id "planEmployeeId" FROM hr_development_action x JOIN hr_development_plan p ON(p.id,p.tenant_id,p.park_id)=(x.plan_id,x.tenant_id,x.park_id) JOIN hr_employee pe ON(pe.id,pe.tenant_id,pe.park_id)=(p.employee_id,p.tenant_id,p.park_id) JOIN hr_employee oe ON(oe.id,oe.tenant_id,oe.park_id)=(x.owner_employee_id,x.tenant_id,x.park_id) WHERE x.id=$3 AND x.tenant_id=$1 AND x.park_id=$2 AND $4::uuid IS NOT NULL${manage ? this.employeePredicate(access, "pe", "$4") : ""} FOR UPDATE OF x,p`,
          [s.tenantId, s.parkId, actionId, a.sub],
        )
      )[0];
      if (!row) throw new NotFoundException("Development action not found");
      if (!manage && row.ownerUserId !== a.sub)
        throw new ForbiddenException(
          "Only the action owner may update this action",
        );
      const transitions: Record<string, [string[], string, string]> = {
        start: [["pending"], "in_progress", "started"],
        complete: [["pending", "in_progress"], "completed", "completed"],
        cancel: [["pending", "in_progress"], "cancelled", "cancelled"],
        add_evidence: [
          ["pending", "in_progress"],
          String(row.status),
          "evidence_added",
        ],
      };
      const transition = transitions[d.action];
      if (!transition || !transition[0].includes(String(row.status)))
        throw new ConflictException("Development action transition is invalid");
      if (
        (d.action === "complete" || d.action === "add_evidence") &&
        !(d.note?.trim() || (d.evidence?.length ?? 0) > 0)
      )
        throw new BadRequestException(
          "Completion note or evidence is required",
        );
      const evidence = [
        ...(Array.isArray(row.evidence) ? row.evidence : []),
        ...(d.evidence ?? []),
      ];
      await m.query(
        `UPDATE hr_development_action SET status=$4,completion_note=CASE WHEN $5::text IS NULL THEN completion_note ELSE $5 END,evidence=$6,completed_at=CASE WHEN $4='completed' THEN now() ELSE completed_at END WHERE id=$3 AND tenant_id=$1 AND park_id=$2`,
        [
          s.tenantId,
          s.parkId,
          actionId,
          transition[1],
          d.note ?? null,
          json(evidence),
        ],
      );
      await m.query(
        `INSERT INTO hr_development_action_history(tenant_id,park_id,action_id,event_no,event_type,from_status,to_status,note,evidence,actor_user_id)SELECT $1::varchar,$2::varchar,$3::uuid,COALESCE(max(event_no),0)+1,$4::varchar,$5::varchar,$6::varchar,$7::varchar,$8::jsonb,$9::uuid FROM hr_development_action_history WHERE tenant_id=$1::varchar AND park_id=$2::varchar AND action_id=$3::uuid`,
        [
          s.tenantId,
          s.parkId,
          actionId,
          transition[2],
          row.status,
          transition[1],
          d.note ?? null,
          json(d.evidence ?? []),
          a.sub,
        ],
      );
      return { id: actionId, status: transition[1] };
    });
  }
}
