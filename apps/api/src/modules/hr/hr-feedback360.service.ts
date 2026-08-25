/* eslint-disable @typescript-eslint/no-unused-expressions */
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
  CreateHrCompetencyModelDto,
  CreateHrFeedback360CycleDto,
  CreateHrFeedbackNominationDto,
  CreateHrFeedbackQuestionnaireDto,
  DecideHrFeedbackNominationDto,
  HrFeedback360QueryDto,
  SubmitHrFeedback360Dto,
} from "./dto/hr-feedback360.dto";
import { HrNotificationService } from "./hr-notification.service";
import { recordHrSensitiveRead } from "./hr-sensitive-read-audit";
type Row = Record<string, unknown>;
type Access = "park" | "managed_org_tree" | "self" | "none";
const has = (a: JwtPrincipal, p: string) =>
  Boolean(
    a.isSuper || a.permissions?.includes("*") || a.permissions?.includes(p),
  );
const text = (v: unknown) => typeof v === "string" ? v : "";
const num = (v: unknown) => Number(v);
const id = (v: unknown) => String(v);

@Injectable()
export class HrFeedback360Service {
  constructor(
    private readonly db: DataSource,
    private readonly audit: AuditService,
    private readonly notifications: HrNotificationService,
  ) {}
  private principalInScope(s: TenantParkScope, a: JwtPrincipal) {
    return a.tenantId === s.tenantId && a.parkId === s.parkId;
  }
  private assertActorScope(s: TenantParkScope, a: JwtPrincipal) {
    if (!this.principalInScope(s, a)) {
      throw new ForbiddenException("360 feedback scope is unavailable");
    }
  }
  private access(s: TenantParkScope, a: JwtPrincipal): Access {
    if (!this.principalInScope(s, a)) return "none";
    return has(a, HR_PERMISSIONS.HR_FEEDBACK_READ) ||
        has(a, HR_PERMISSIONS.HR_FEEDBACK_CYCLE_MANAGE) ||
        has(a, HR_PERMISSIONS.HR_FEEDBACK_RESULT_PUBLISH) ||
        has(a, HR_PERMISSIONS.HR_FEEDBACK_RESULT_READ)
      ? "park"
      : has(a, HR_PERMISSIONS.HR_FEEDBACK_TEAM_READ) ||
          has(a, HR_PERMISSIONS.HR_FEEDBACK_NOMINATION_REVIEW)
      ? "managed_org_tree"
      : has(a, HR_PERMISSIONS.HR_FEEDBACK_SELF_READ) ||
          has(a, HR_PERMISSIONS.HR_FEEDBACK_RESPOND) ||
          has(a, HR_PERMISSIONS.HR_FEEDBACK_NOMINATE)
      ? "self"
      : "none";
  }
  private managedOrgSql(p: string) {
    return `WITH RECURSIVE managed_org AS(SELECT id FROM sys_org WHERE tenant_id=$1 AND park_id=$2 AND leader_user_id::text=${p}::text AND is_deleted=false AND status='enabled' UNION ALL SELECT o.id FROM sys_org o JOIN managed_org x ON o.parent_id=x.id WHERE o.tenant_id=$1 AND o.park_id=$2 AND o.is_deleted=false AND o.status='enabled') SELECT id FROM managed_org`;
  }
  private async actorEmployee(
    m: DataSource | EntityManager,
    s: TenantParkScope,
    a: JwtPrincipal,
  ) {
    return (await m.query(
      `SELECT id,primary_org_id,manager_employee_id FROM hr_employee WHERE tenant_id=$1 AND park_id=$2 AND user_id=$3 AND is_deleted=false ORDER BY id LIMIT 1`,
      [s.tenantId, s.parkId, a.sub],
    ))[0] as Row | undefined;
  }
  private async assertSubjectAccess(
    m: DataSource | EntityManager,
    s: TenantParkScope,
    a: JwtPrincipal,
    subjectId: string,
    write = true,
  ) {
    const access = this.access(s, a);
    if (access === "none") {
      throw new ForbiddenException("360 feedback scope is unavailable");
    }
    let sql =
      `SELECT x.id,x.employee_id,e.primary_org_id,e.manager_employee_id,e.full_name,e.employee_code,e.user_id,x.status,x.cycle_id FROM hr_feedback360_subject x JOIN hr_employee e ON(e.id,e.tenant_id,e.park_id)=(x.employee_id,x.tenant_id,x.park_id) WHERE x.id=$3 AND x.tenant_id=$1 AND x.park_id=$2`;
    const p: unknown[] = [s.tenantId, s.parkId, subjectId];
    if (access === "managed_org_tree") {
      sql += ` AND e.primary_org_id IN(${this.managedOrgSql("$4")})`,
        p.push(a.sub);
    } else if (access === "self") sql += ` AND e.user_id=$4`, p.push(a.sub);
    const row = (await m.query(sql, p))[0] as Row | undefined;
    if (!row) {
      throw write
        ? new ForbiddenException("360 subject is outside the authorized scope")
        : new NotFoundException("360 subject not found");
    }
    return row;
  }
  async options(s: TenantParkScope, a: JwtPrincipal) {
    this.assertActorScope(s, a);
    if (
      ![
        HR_PERMISSIONS.HR_FEEDBACK_MODEL_MANAGE,
        HR_PERMISSIONS.HR_FEEDBACK_CYCLE_MANAGE,
        HR_PERMISSIONS.HR_FEEDBACK_NOMINATE,
        HR_PERMISSIONS.HR_FEEDBACK_NOMINATION_REVIEW,
        HR_PERMISSIONS.HR_FEEDBACK_RESULT_PUBLISH,
      ].some((p) => has(a, p))
    ) throw new ForbiddenException("360 options permission required");
    const access = this.access(s, a);
    let employeeSql =
      `SELECT id,full_name "fullName",employee_code "employeeCode",primary_org_id "orgId" FROM hr_employee WHERE tenant_id=$1 AND park_id=$2 AND is_deleted=false AND employment_status='active'`;
    const p: unknown[] = [s.tenantId, s.parkId];
    if (access === "managed_org_tree") {
      employeeSql += ` AND primary_org_id IN(${this.managedOrgSql("$3")})`,
        p.push(a.sub);
    } else if (access === "self") {
      employeeSql += ` AND id IN(
        SELECT candidate.id FROM hr_employee me
        JOIN hr_employee candidate ON candidate.tenant_id=me.tenant_id AND candidate.park_id=me.park_id
          AND candidate.is_deleted=false AND candidate.employment_status='active'
          AND (candidate.id=me.id OR candidate.id=me.manager_employee_id OR candidate.primary_org_id=me.primary_org_id OR candidate.manager_employee_id=me.id)
        WHERE me.tenant_id=$1 AND me.park_id=$2 AND me.user_id=$3 AND me.is_deleted=false
      )`, p.push(a.sub);
    } else if (access === "none") employeeSql += " AND false";
    employeeSql += " ORDER BY full_name,id LIMIT 500";
    const [employees, models, questionnaires, subjects] = await Promise.all([
      this.db.query(employeeSql, p),
      has(a, HR_PERMISSIONS.HR_FEEDBACK_CYCLE_MANAGE)
        ? this.db.query(
          `SELECT v.id,m.model_name "modelName",v.version_name "versionName" FROM hr_competency_model_version v JOIN hr_competency_model m ON(m.id,m.tenant_id,m.park_id)=(v.model_id,v.tenant_id,v.park_id) WHERE v.tenant_id=$1 AND v.park_id=$2 AND v.status='published' AND m.is_deleted=false ORDER BY m.model_name,v.version_no DESC`,
          [s.tenantId, s.parkId],
        )
        : [],
      has(a, HR_PERMISSIONS.HR_FEEDBACK_CYCLE_MANAGE)
        ? this.db.query(
          `SELECT v.id,q.questionnaire_name "questionnaireName",v.version_name "versionName",v.model_version_id "modelVersionId" FROM hr_feedback_questionnaire_version v JOIN hr_feedback_questionnaire q ON(q.id,q.tenant_id,q.park_id)=(v.questionnaire_id,v.tenant_id,v.park_id) WHERE v.tenant_id=$1 AND v.park_id=$2 AND v.status='published' AND q.is_deleted=false ORDER BY q.questionnaire_name,v.version_no DESC`,
          [s.tenantId, s.parkId],
        )
        : [],
      this.subjectOptions(s, a),
    ]);
    await recordHrSensitiveRead(this.audit, s, a, {
      resource: "hr.feedback360_options",
      action: "读取360业务选择项",
      bizType: "hr_feedback360_subject",
      bizId: null,
      path: "/hr/feedback360-v2/options",
      fieldGroups: ["feedback"],
      projection: access === "managed_org_tree"
        ? "team"
        : access === "self"
        ? "self"
        : "park",
      itemCount: employees.length + subjects.length,
    });
    return { employees, models, questionnaires, subjects };
  }
  private async subjectOptions(s: TenantParkScope, a: JwtPrincipal) {
    const access = this.access(s, a);
    if (access === "none") return [];
    let sql =
      `SELECT x.id,c.cycle_name "cycleName",e.full_name "subjectName",x.status FROM hr_feedback360_subject x JOIN hr_feedback360_cycle c ON(c.id,c.tenant_id,c.park_id)=(x.cycle_id,x.tenant_id,x.park_id) JOIN hr_employee e ON(e.id,e.tenant_id,e.park_id)=(x.employee_id,x.tenant_id,x.park_id) WHERE x.tenant_id=$1 AND x.park_id=$2`;
    const p: unknown[] = [s.tenantId, s.parkId];
    if (access === "managed_org_tree") {
      sql += ` AND e.primary_org_id IN(${this.managedOrgSql("$3")})`,
        p.push(a.sub);
    } else if (access === "self") sql += ` AND e.user_id=$3`, p.push(a.sub);
    return this.db.query(
      `${sql} ORDER BY c.create_time DESC,e.full_name LIMIT 500`,
      p,
    );
  }
  async models(s: TenantParkScope, a: JwtPrincipal) {
    if (!this.principalInScope(s, a)) return [];
    if (
      !has(a, HR_PERMISSIONS.HR_FEEDBACK_READ) &&
      !has(a, HR_PERMISSIONS.HR_FEEDBACK_MODEL_MANAGE)
    ) return [];
    const rows = await this.db.query(
      `SELECT m.id,m.model_code "modelCode",m.model_name "modelName",m.status,v.id "versionId",v.version_name "versionName",v.status "versionStatus",v.scale_min::text "scaleMin",v.scale_max::text "scaleMax",COALESCE((SELECT jsonb_agg(jsonb_build_object('code',d.dimension_code,'name',d.dimension_name,'weight',d.weight::text,'anchors',(SELECT COALESCE(jsonb_agg(jsonb_build_object('level',b.level_value::text,'text',b.anchor_text)ORDER BY b.sort_order,b.id),'[]')FROM hr_competency_behavior_anchor b WHERE(b.dimension_id,b.tenant_id,b.park_id)=(d.id,d.tenant_id,d.park_id)))ORDER BY d.sort_order,d.id)FROM hr_competency_dimension d WHERE(d.model_version_id,d.tenant_id,d.park_id)=(v.id,v.tenant_id,v.park_id)),'[]') dimensions FROM hr_competency_model m LEFT JOIN hr_competency_model_version v ON(v.model_id,v.tenant_id,v.park_id)=(m.id,m.tenant_id,m.park_id) AND v.version_no=m.current_version_no WHERE m.tenant_id=$1 AND m.park_id=$2 AND m.is_deleted=false ORDER BY m.model_name,m.id`,
      [s.tenantId, s.parkId],
    );
    await recordHrSensitiveRead(this.audit, s, a, {
      resource: "hr.feedback360_model",
      action: "读取360胜任力模型",
      bizType: "hr_competency_model",
      bizId: null,
      path: "/hr/feedback360-v2/models",
      fieldGroups: ["feedback"],
      projection: "park",
      itemCount: rows.length,
    });
    return rows;
  }
  async createModel(
    s: TenantParkScope,
    a: JwtPrincipal,
    d: CreateHrCompetencyModelDto,
  ) {
    this.assertActorScope(s, a);
    if (!has(a, HR_PERMISSIONS.HR_FEEDBACK_MODEL_MANAGE)) {
      throw new ForbiddenException(
        "Competency-model management permission required",
      );
    }
    if (d.scaleMax <= d.scaleMin) {
      throw new BadRequestException("Competency scale is invalid");
    }
    if (
      Math.abs(d.dimensions.reduce((n, x) => n + x.weight, 0) - 1) > .000001
    ) {
      throw new BadRequestException(
        "Competency dimension weights must total 100 percent",
      );
    }
    if (new Set(d.dimensions.map((x) => x.code)).size !== d.dimensions.length) {
      throw new BadRequestException(
        "Competency dimension codes must be unique",
      );
    }
    for (const x of d.dimensions) {
      if (
        new Set(x.anchors.map((y) => y.level)).size !== x.anchors.length ||
        x.anchors.some((y) => y.level < d.scaleMin || y.level > d.scaleMax)
      ) {
        throw new BadRequestException(
          "Behavior anchors must be unique and inside the scale",
        );
      }
    }
    return this.db.transaction(async (m) => {
      try {
        const root = (await m.query(
          `INSERT INTO hr_competency_model(tenant_id,park_id,model_code,model_name,create_by,update_by)VALUES($1,$2,$3,$4,$5,$5)RETURNING id`,
          [s.tenantId, s.parkId, d.modelCode, d.modelName, a.sub],
        ))[0] as Row;
        const version = (await m.query(
          `INSERT INTO hr_competency_model_version(tenant_id,park_id,model_id,version_no,version_name,scale_min,scale_max,create_by)VALUES($1,$2,$3,1,$4,$5,$6,$7)RETURNING id`,
          [
            s.tenantId,
            s.parkId,
            root.id,
            d.versionName,
            d.scaleMin,
            d.scaleMax,
            a.sub,
          ],
        ))[0] as Row;
        for (const [i, x] of d.dimensions.entries()) {
          const dim = (await m.query(
            `INSERT INTO hr_competency_dimension(tenant_id,park_id,model_version_id,dimension_code,dimension_name,description,weight,sort_order)VALUES($1,$2,$3,$4,$5,$6,$7,$8)RETURNING id`,
            [
              s.tenantId,
              s.parkId,
              version.id,
              x.code,
              x.name,
              x.description ?? null,
              x.weight,
              i,
            ],
          ))[0] as Row;
          for (const [j, b] of x.anchors.entries()) {
            await m.query(
              `INSERT INTO hr_competency_behavior_anchor(tenant_id,park_id,dimension_id,level_value,anchor_text,sort_order)VALUES($1,$2,$3,$4,$5,$6)`,
              [s.tenantId, s.parkId, dim.id, b.level, b.text, j],
            );
          }
        }
        return { id: root.id, versionId: version.id, status: "draft" };
      } catch (e) {
        if ((e as { code?: string }).code === "23505") {
          throw new ConflictException("Competency model code already exists");
        }
        throw e;
      }
    });
  }
  async publishModel(s: TenantParkScope, a: JwtPrincipal, versionId: string) {
    this.assertActorScope(s, a);
    if (!has(a, HR_PERMISSIONS.HR_FEEDBACK_MODEL_MANAGE)) {
      throw new ForbiddenException(
        "Competency-model management permission required",
      );
    }
    return this.db.transaction(async (m) => {
      const v = (await m.query(
        `SELECT v.*,m.id root_id FROM hr_competency_model_version v JOIN hr_competency_model m ON(m.id,m.tenant_id,m.park_id)=(v.model_id,v.tenant_id,v.park_id) WHERE v.id=$3 AND v.tenant_id=$1 AND v.park_id=$2 FOR UPDATE OF v,m`,
        [s.tenantId, s.parkId, versionId],
      ))[0] as Row | undefined;
      if (!v) throw new NotFoundException("Competency model version not found");
      if (v.status !== "draft") {
        throw new ConflictException("Competency model version is not draft");
      }
      const weight = (await m.query(
        `SELECT count(*)::int count,COALESCE(sum(weight),0)::text weight FROM hr_competency_dimension WHERE tenant_id=$1 AND park_id=$2 AND model_version_id=$3`,
        [s.tenantId, s.parkId, versionId],
      ))[0] as Row;
      if (num(weight.count) < 1 || text(weight.weight) !== "1.0000") {
        throw new BadRequestException(
          "Competency dimensions must total 100 percent",
        );
      }
      await m.query(
        `UPDATE hr_competency_model_version SET status='published',published_at=now() WHERE id=$1`,
        [versionId],
      );
      await m.query(
        `UPDATE hr_competency_model SET status='published',current_version_no=$2,update_by=$3,update_time=now() WHERE id=$1`,
        [v.root_id, v.version_no, a.sub],
      );
      return { id: versionId, status: "published" };
    });
  }
  async createQuestionnaire(
    s: TenantParkScope,
    a: JwtPrincipal,
    d: CreateHrFeedbackQuestionnaireDto,
  ) {
    this.assertActorScope(s, a);
    if (!has(a, HR_PERMISSIONS.HR_FEEDBACK_MODEL_MANAGE)) {
      throw new ForbiddenException(
        "Questionnaire management permission required",
      );
    }
    if (new Set(d.questions.map((x) => x.code)).size !== d.questions.length) {
      throw new BadRequestException("Question codes must be unique");
    }
    return this.db.transaction(async (m) => {
      const model = (await m.query(
        `SELECT id FROM hr_competency_model_version WHERE id=$3 AND tenant_id=$1 AND park_id=$2 AND status='published'`,
        [s.tenantId, s.parkId, d.modelVersionId],
      ))[0];
      if (!model) {
        throw new BadRequestException(
          "Published competency model version is required",
        );
      }
      const dims = await m.query(
        `SELECT id,dimension_code FROM hr_competency_dimension WHERE tenant_id=$1 AND park_id=$2 AND model_version_id=$3`,
        [s.tenantId, s.parkId, d.modelVersionId],
      ) as Row[];
      const byCode = new Map(
        dims.map((x) => [text(x.dimension_code), id(x.id)]),
      );
      if (d.questions.some((x) => !byCode.has(x.dimensionCode))) {
        throw new BadRequestException(
          "Question dimension is outside the model version",
        );
      }
      try {
        const root = (await m.query(
          `INSERT INTO hr_feedback_questionnaire(tenant_id,park_id,questionnaire_code,questionnaire_name,create_by,update_by)VALUES($1,$2,$3,$4,$5,$5)RETURNING id`,
          [
            s.tenantId,
            s.parkId,
            d.questionnaireCode,
            d.questionnaireName,
            a.sub,
          ],
        ))[0] as Row;
        const v = (await m.query(
          `INSERT INTO hr_feedback_questionnaire_version(tenant_id,park_id,questionnaire_id,model_version_id,version_no,version_name,create_by)VALUES($1,$2,$3,$4,1,$5,$6)RETURNING id`,
          [
            s.tenantId,
            s.parkId,
            root.id,
            d.modelVersionId,
            d.versionName,
            a.sub,
          ],
        ))[0] as Row;
        for (const [i, x] of d.questions.entries()) {
          await m.query(
            `INSERT INTO hr_feedback_question(tenant_id,park_id,questionnaire_version_id,dimension_id,question_code,question_text,question_type,required,sort_order)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [
              s.tenantId,
              s.parkId,
              v.id,
              byCode.get(x.dimensionCode),
              x.code,
              x.text,
              x.type ?? "rating",
              x.required ?? true,
              i,
            ],
          );
        }
        return { id: root.id, versionId: v.id, status: "draft" };
      } catch (e) {
        if ((e as { code?: string }).code === "23505") {
          throw new ConflictException("Questionnaire code already exists");
        }
        throw e;
      }
    });
  }
  async publishQuestionnaire(
    s: TenantParkScope,
    a: JwtPrincipal,
    versionId: string,
  ) {
    this.assertActorScope(s, a);
    if (!has(a, HR_PERMISSIONS.HR_FEEDBACK_MODEL_MANAGE)) {
      throw new ForbiddenException(
        "Questionnaire management permission required",
      );
    }
    return this.db.transaction(async (m) => {
      const v = (await m.query(
        `SELECT v.*,q.id root_id FROM hr_feedback_questionnaire_version v JOIN hr_feedback_questionnaire q ON(q.id,q.tenant_id,q.park_id)=(v.questionnaire_id,v.tenant_id,v.park_id) WHERE v.id=$3 AND v.tenant_id=$1 AND v.park_id=$2 FOR UPDATE OF v,q`,
        [s.tenantId, s.parkId, versionId],
      ))[0] as Row | undefined;
      if (!v) throw new NotFoundException("Questionnaire version not found");
      if (v.status !== "draft") {
        throw new ConflictException("Questionnaire version is not draft");
      }
      if (
        !num(
          (await m.query(
            `SELECT count(*) count FROM hr_feedback_question WHERE tenant_id=$1 AND park_id=$2 AND questionnaire_version_id=$3`,
            [s.tenantId, s.parkId, versionId],
          ))[0]?.count,
        )
      ) throw new BadRequestException("Questionnaire questions are required");
      await m.query(
        `UPDATE hr_feedback_questionnaire_version SET status='published',published_at=now() WHERE id=$1`,
        [versionId],
      );
      await m.query(
        `UPDATE hr_feedback_questionnaire SET status='published',current_version_no=$2,update_by=$3,update_time=now() WHERE id=$1`,
        [v.root_id, v.version_no, a.sub],
      );
      return { id: versionId, status: "published" };
    });
  }
  private async snapshots(
    m: DataSource | EntityManager,
    s: TenantParkScope,
    modelVersionId: string,
    questionnaireVersionId: string,
  ) {
    const model = (await m.query(
      `SELECT v.id,v.version_no,v.version_name,v.scale_min::text,v.scale_max::text,m.model_code,m.model_name FROM hr_competency_model_version v JOIN hr_competency_model m ON(m.id,m.tenant_id,m.park_id)=(v.model_id,v.tenant_id,v.park_id) WHERE v.id=$3 AND v.tenant_id=$1 AND v.park_id=$2 AND v.status='published'`,
      [s.tenantId, s.parkId, modelVersionId],
    ))[0] as Row | undefined;
    const qv = (await m.query(
      `SELECT v.id,v.version_no,v.version_name,v.model_version_id,q.questionnaire_code,q.questionnaire_name FROM hr_feedback_questionnaire_version v JOIN hr_feedback_questionnaire q ON(q.id,q.tenant_id,q.park_id)=(v.questionnaire_id,v.tenant_id,v.park_id) WHERE v.id=$3 AND v.tenant_id=$1 AND v.park_id=$2 AND v.status='published'`,
      [s.tenantId, s.parkId, questionnaireVersionId],
    ))[0] as Row | undefined;
    if (!model || !qv || qv.model_version_id !== modelVersionId) {
      throw new BadRequestException(
        "Published matching model and questionnaire versions are required",
      );
    }
    const dimensions = await m.query(
      `SELECT d.dimension_code code,d.dimension_name name,d.weight::text,COALESCE((SELECT jsonb_agg(jsonb_build_object('level',b.level_value::text,'text',b.anchor_text)ORDER BY b.sort_order,b.id)FROM hr_competency_behavior_anchor b WHERE(b.dimension_id,b.tenant_id,b.park_id)=(d.id,d.tenant_id,d.park_id)),'[]')anchors FROM hr_competency_dimension d WHERE d.tenant_id=$1 AND d.park_id=$2 AND d.model_version_id=$3 ORDER BY d.sort_order,d.id`,
      [s.tenantId, s.parkId, modelVersionId],
    );
    const questions = await m.query(
      `SELECT q.question_code code,q.question_text text,q.question_type type,q.required,d.dimension_code "dimensionCode" FROM hr_feedback_question q JOIN hr_competency_dimension d ON(d.id,d.tenant_id,d.park_id)=(q.dimension_id,q.tenant_id,q.park_id) WHERE q.tenant_id=$1 AND q.park_id=$2 AND q.questionnaire_version_id=$3 ORDER BY q.sort_order,q.id`,
      [s.tenantId, s.parkId, questionnaireVersionId],
    );
    return {
      model: {
        id: model.id,
        code: model.model_code,
        name: model.model_name,
        versionNo: num(model.version_no),
        versionName: model.version_name,
        scaleMin: model.scale_min,
        scaleMax: model.scale_max,
        dimensions,
      },
      questionnaire: {
        id: qv.id,
        code: qv.questionnaire_code,
        name: qv.questionnaire_name,
        versionNo: num(qv.version_no),
        versionName: qv.version_name,
        questions,
      },
    };
  }
  async createCycle(
    s: TenantParkScope,
    a: JwtPrincipal,
    d: CreateHrFeedback360CycleDto,
  ) {
    this.assertActorScope(s, a);
    if (!has(a, HR_PERMISSIONS.HR_FEEDBACK_CYCLE_MANAGE)) {
      throw new ForbiddenException("360 cycle management permission required");
    }
    if (d.responseEnd < d.nominationEnd) {
      throw new BadRequestException(
        "Response end must not precede nomination end",
      );
    }
    if (new Set(d.employeeIds).size !== d.employeeIds.length) {
      throw new BadRequestException("Cycle employees must be unique");
    }
    return this.db.transaction(async (m) => {
      const snap = await this.snapshots(
        m,
        s,
        d.modelVersionId,
        d.questionnaireVersionId,
      );
      const employees = await m.query(
        `SELECT id,employee_code,full_name,primary_org_id,position_id,manager_employee_id,user_id FROM hr_employee WHERE tenant_id=$1 AND park_id=$2 AND id=ANY($3::uuid[]) AND is_deleted=false AND employment_status='active' ORDER BY id FOR SHARE`,
        [s.tenantId, s.parkId, d.employeeIds],
      ) as Row[];
      if (employees.length !== d.employeeIds.length) {
        throw new BadRequestException(
          "Every cycle employee must be active in the current park",
        );
      }
      try {
        const c = (await m.query(
          `INSERT INTO hr_feedback360_cycle(tenant_id,park_id,cycle_code,cycle_name,model_version_id,questionnaire_version_id,model_snapshot,questionnaire_snapshot,minimum_anonymous_responses,nomination_end,response_end,create_by,update_by)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)RETURNING id,status`,
          [
            s.tenantId,
            s.parkId,
            d.cycleCode,
            d.cycleName,
            d.modelVersionId,
            d.questionnaireVersionId,
            snap.model,
            snap.questionnaire,
            d.minimumAnonymousResponses ?? 3,
            d.nominationEnd,
            d.responseEnd,
            a.sub,
          ],
        ))[0] as Row;
        for (const e of employees) {
          const subject = (await m.query(
            `INSERT INTO hr_feedback360_subject(tenant_id,park_id,cycle_id,employee_id,employee_snapshot,manager_employee_id)VALUES($1,$2,$3,$4,$5,$6)RETURNING id`,
            [s.tenantId, s.parkId, c.id, e.id, {
              employeeCode: e.employee_code,
              fullName: e.full_name,
              orgId: e.primary_org_id,
              positionId: e.position_id,
            }, e.manager_employee_id],
          ))[0] as Row;
          await this.action(
            m,
            s,
            id(subject.id),
            a,
            "subject_added",
            null,
            null,
            {},
          );
        }
        return { id: c.id, status: c.status, subjectCount: employees.length };
      } catch (e) {
        if ((e as { code?: string }).code === "23505") {
          throw new ConflictException("360 cycle code already exists");
        }
        throw e;
      }
    });
  }
  async activateCycle(s: TenantParkScope, a: JwtPrincipal, cycleId: string) {
    this.assertActorScope(s, a);
    if (!has(a, HR_PERMISSIONS.HR_FEEDBACK_CYCLE_MANAGE)) {
      throw new ForbiddenException("360 cycle management permission required");
    }
    return this.db.transaction(async (m) => {
      const c = (await m.query(
        `SELECT * FROM hr_feedback360_cycle WHERE id=$3 AND tenant_id=$1 AND park_id=$2 FOR UPDATE`,
        [s.tenantId, s.parkId, cycleId],
      ))[0] as Row | undefined;
      if (!c) throw new NotFoundException("360 cycle not found");
      if (c.status !== "draft") {
        throw new ConflictException("360 cycle is not draft");
      }
      await m.query(
        `UPDATE hr_feedback360_cycle SET status='nominating',published_at=now(),update_by=$4,update_time=now() WHERE id=$3 AND tenant_id=$1 AND park_id=$2`,
        [s.tenantId, s.parkId, cycleId, a.sub],
      );
      return { id: cycleId, status: "nominating" };
    });
  }
  async cycles(s: TenantParkScope, a: JwtPrincipal, q: HrFeedback360QueryDto) {
    const access = this.access(s, a);
    if (access === "none") return [];
    let sql =
      `SELECT c.id,c.cycle_code "cycleCode",c.cycle_name "cycleName",c.nomination_end "nominationEnd",c.response_end "responseEnd",c.minimum_anonymous_responses "minimumAnonymousResponses",c.status,count(x.id)::int "subjectCount" FROM hr_feedback360_cycle c JOIN hr_feedback360_subject x ON(x.cycle_id,x.tenant_id,x.park_id)=(c.id,c.tenant_id,c.park_id) JOIN hr_employee e ON(e.id,e.tenant_id,e.park_id)=(x.employee_id,x.tenant_id,x.park_id) WHERE c.tenant_id=$1 AND c.park_id=$2`;
    const p: unknown[] = [s.tenantId, s.parkId];
    if (q.cycle_id) sql += ` AND c.id=$${p.push(q.cycle_id)}`;
    if (access === "managed_org_tree") {
      sql += ` AND e.primary_org_id IN(${
        this.managedOrgSql(`$${p.push(a.sub)}`)
      })`;
    } else if (access === "self") sql += ` AND e.user_id=$${p.push(a.sub)}`;
    sql += ` GROUP BY c.id ORDER BY c.create_time DESC,c.id`;
    const rows = await this.db.query(sql, p);
    await recordHrSensitiveRead(this.audit, s, a, {
      resource: "hr.feedback360_cycle",
      action: "读取360评价周期",
      bizType: "hr_feedback360_cycle",
      bizId: q.cycle_id ?? null,
      path: "/hr/feedback360-v2/cycles",
      fieldGroups: ["feedback"],
      projection: access === "managed_org_tree" ? "team" : access,
      itemCount: rows.length,
    });
    return rows;
  }
  async nominate(
    s: TenantParkScope,
    a: JwtPrincipal,
    d: CreateHrFeedbackNominationDto,
  ) {
    this.assertActorScope(s, a);
    if (!has(a, HR_PERMISSIONS.HR_FEEDBACK_NOMINATE)) {
      throw new ForbiddenException("360 nomination permission required");
    }
    return this.db.transaction(async (m) => {
      const subject = await this.assertSubjectAccess(m, s, a, d.subjectId);
      await m.query(
        `SELECT id FROM hr_feedback360_subject WHERE id=$1 FOR UPDATE`,
        [d.subjectId],
      );
      if (!["nominating", "responding"].includes(text(subject.status))) {
        throw new ConflictException("360 subject does not accept nominations");
      }
      const access = this.access(s, a);
      let nomineeSql =
        `SELECT id,primary_org_id,manager_employee_id,user_id FROM hr_employee WHERE id=$3 AND tenant_id=$1 AND park_id=$2 AND is_deleted=false AND employment_status='active'`;
      const nomineeParams: unknown[] = [
        s.tenantId,
        s.parkId,
        d.nomineeEmployeeId,
      ];
      if (access === "managed_org_tree") {
        nomineeSql += ` AND primary_org_id IN(${this.managedOrgSql("$4")})`,
          nomineeParams.push(a.sub);
      }
      const nominee = (await m.query(nomineeSql, nomineeParams))[0] as
        | Row
        | undefined;
      if (!nominee) {
        throw new BadRequestException(
          "Nominee is unavailable in the authorized organization tree",
        );
      }
      const same = d.nomineeEmployeeId === subject.employee_id;
      if ((d.relationType === "self") !== same) {
        throw new BadRequestException(
          "Self relation must identify the subject exactly",
        );
      }
      if (
        d.relationType === "manager" &&
        d.nomineeEmployeeId !== subject.manager_employee_id
      ) {
        throw new BadRequestException(
          "Manager relation must identify the current manager",
        );
      }
      if (
        d.relationType === "subordinate" &&
        nominee.manager_employee_id !== subject.employee_id
      ) {
        throw new BadRequestException(
          "Subordinate relation must identify a direct subordinate",
        );
      }
      if (
        d.relationType === "peer" &&
        (!nominee.primary_org_id ||
          nominee.primary_org_id !== subject.primary_org_id)
      ) {
        throw new BadRequestException(
          "Peer relation requires the same organization",
        );
      }
      if (d.relationType === "collaborator") {
        throw new BadRequestException(
          "Collaborator relation requires an authoritative collaboration source that is not configured",
        );
      }
      try {
        const n = (await m.query(
          `INSERT INTO hr_feedback360_nomination(tenant_id,park_id,subject_id,nominee_employee_id,relation_type,nominated_by)VALUES($1,$2,$3,$4,$5,$6)RETURNING id,status`,
          [
            s.tenantId,
            s.parkId,
            d.subjectId,
            d.nomineeEmployeeId,
            d.relationType,
            a.sub,
          ],
        ))[0] as Row;
        await this.action(
          m,
          s,
          d.subjectId,
          a,
          "nominated",
          "nomination",
          id(n.id),
          { relationType: d.relationType },
        );
        return { id: n.id, status: n.status };
      } catch (e) {
        if ((e as { code?: string }).code === "23505") {
          throw new ConflictException("Reviewer has already been nominated");
        }
        throw e;
      }
    });
  }
  async pendingNominations(s: TenantParkScope, a: JwtPrincipal) {
    if (!has(a, HR_PERMISSIONS.HR_FEEDBACK_NOMINATION_REVIEW)) return [];
    const access = this.access(s, a);
    let sql =
      `SELECT n.id,x.id "subjectId",c.cycle_name "cycleName",se.full_name "subjectName",ne.full_name "nomineeName",n.relation_type "relationType",n.status,(n.nominated_by<>$3::uuid) "canDecide" FROM hr_feedback360_nomination n JOIN hr_feedback360_subject x ON(x.id,x.tenant_id,x.park_id)=(n.subject_id,n.tenant_id,n.park_id) JOIN hr_feedback360_cycle c ON(c.id,c.tenant_id,c.park_id)=(x.cycle_id,x.tenant_id,x.park_id) JOIN hr_employee se ON(se.id,se.tenant_id,se.park_id)=(x.employee_id,x.tenant_id,x.park_id) JOIN hr_employee ne ON(ne.id,ne.tenant_id,ne.park_id)=(n.nominee_employee_id,n.tenant_id,n.park_id) WHERE n.tenant_id=$1 AND n.park_id=$2 AND n.status='pending'`;
    const p: unknown[] = [s.tenantId, s.parkId, a.sub];
    if (access === "managed_org_tree") {
      sql += ` AND se.primary_org_id IN(${this.managedOrgSql("$3")})`;
    } else if (access !== "park") return [];
    const rows = await this.db.query(`${sql} ORDER BY n.nominated_at,n.id`, p);
    await recordHrSensitiveRead(this.audit, s, a, {
      resource: "hr.feedback360_nomination",
      action: "读取待审批360提名",
      bizType: "hr_feedback360_nomination",
      bizId: null,
      path: "/hr/feedback360-v2/nominations/pending",
      fieldGroups: ["feedback"],
      projection: access === "park" ? "park" : "team",
      itemCount: rows.length,
    });
    return rows;
  }
  async decideNomination(
    s: TenantParkScope,
    a: JwtPrincipal,
    nominationId: string,
    d: DecideHrFeedbackNominationDto,
  ) {
    this.assertActorScope(s, a);
    if (!has(a, HR_PERMISSIONS.HR_FEEDBACK_NOMINATION_REVIEW)) {
      throw new ForbiddenException("360 nomination-review permission required");
    }
    return this.db.transaction(async (m) => {
      const n = (await m.query(
        `SELECT n.*,x.employee_id,x.status subject_status,x.cycle_id,c.questionnaire_snapshot,e.user_id reviewer_user_id FROM hr_feedback360_nomination n JOIN hr_feedback360_subject x ON(x.id,x.tenant_id,x.park_id)=(n.subject_id,n.tenant_id,n.park_id) JOIN hr_feedback360_cycle c ON(c.id,c.tenant_id,c.park_id)=(x.cycle_id,x.tenant_id,x.park_id) JOIN hr_employee e ON(e.id,e.tenant_id,e.park_id)=(n.nominee_employee_id,n.tenant_id,n.park_id) WHERE n.id=$3 AND n.tenant_id=$1 AND n.park_id=$2 FOR UPDATE OF n,x,c`,
        [s.tenantId, s.parkId, nominationId],
      ))[0] as Row | undefined;
      if (!n) throw new NotFoundException("360 nomination not found");
      await this.assertSubjectAccess(m, s, a, id(n.subject_id));
      if (n.status !== "pending") {
        throw new ConflictException("360 nomination has already been decided");
      }
      if (n.nominated_by === a.sub) {
        throw new ForbiddenException(
          "A 360 nominator cannot decide their own nomination",
        );
      }
      if (!["nominating", "responding"].includes(text(n.subject_status))) {
        throw new ConflictException("360 subject is no longer open");
      }
      const status = d.decision === "approve" ? "approved" : "rejected";
      await m.query(
        `UPDATE hr_feedback360_nomination SET status=$4,decided_by=$5,decided_at=now(),decision_reason=$6 WHERE id=$3 AND tenant_id=$1 AND park_id=$2`,
        [s.tenantId, s.parkId, nominationId, status, a.sub, d.reason ?? null],
      );
      let assignmentId: string | null = null;
      if (status === "approved") {
        const x = (await m.query(
          `INSERT INTO hr_feedback360_assignment(tenant_id,park_id,subject_id,nomination_id,reviewer_employee_id,relation_type,questionnaire_snapshot)VALUES($1,$2,$3,$4,$5,$6,$7)RETURNING id`,
          [
            s.tenantId,
            s.parkId,
            n.subject_id,
            n.id,
            n.nominee_employee_id,
            n.relation_type,
            n.questionnaire_snapshot,
          ],
        ))[0] as Row;
        assignmentId = id(x.id);
        await m.query(
          `UPDATE hr_feedback360_subject SET status='responding' WHERE id=$1 AND status='nominating'`,
          [n.subject_id],
        );
        await m.query(
          `UPDATE hr_feedback360_cycle SET status='responding',update_by=$2,update_time=now() WHERE id=$1 AND status='nominating'`,
          [n.cycle_id, a.sub],
        );
        await this.action(
          m,
          s,
          id(n.subject_id),
          a,
          "assigned",
          "assignment",
          assignmentId,
          { relationType: n.relation_type },
        );
        if (n.reviewer_user_id) {
          await this.notifications.publishFeedback360Task(s, a, {
            assignmentId,
            reviewerUserId: id(n.reviewer_user_id),
          }, m);
        }
      } else {await this.action(
          m,
          s,
          id(n.subject_id),
          a,
          "nomination_rejected",
          "nomination",
          nominationId,
          {},
        );}
      return {
        id: nominationId,
        status,
        assignmentCreated: assignmentId !== null,
      };
    });
  }
  async myAssignments(s: TenantParkScope, a: JwtPrincipal) {
    if (!this.principalInScope(s, a)) return [];
    if (!has(a, HR_PERMISSIONS.HR_FEEDBACK_RESPOND)) return [];
    const rows = await this.db.query(
      `SELECT x.id,c.cycle_name "cycleName",s.employee_snapshot->>'fullName' "subjectName",x.relation_type "relationType",x.status,c.response_end "responseEnd",x.questionnaire_snapshot "questionnaire" FROM hr_feedback360_assignment x JOIN hr_feedback360_subject s ON(s.id,s.tenant_id,s.park_id)=(x.subject_id,x.tenant_id,x.park_id) JOIN hr_feedback360_cycle c ON(c.id,c.tenant_id,c.park_id)=(s.cycle_id,s.tenant_id,s.park_id) JOIN hr_employee e ON(e.id,e.tenant_id,e.park_id)=(x.reviewer_employee_id,x.tenant_id,x.park_id) WHERE x.tenant_id=$1 AND x.park_id=$2 AND e.user_id=$3 ORDER BY c.response_end,x.create_time`,
      [s.tenantId, s.parkId, a.sub],
    );
    await recordHrSensitiveRead(this.audit, s, a, {
      resource: "hr.feedback360_assignment",
      action: "读取本人360任务",
      bizType: "hr_feedback360_assignment",
      bizId: null,
      path: "/hr/feedback360-v2/assignments/me",
      fieldGroups: ["feedback"],
      projection: "self",
      itemCount: rows.length,
    });
    return rows;
  }
  async submit(
    s: TenantParkScope,
    a: JwtPrincipal,
    assignmentId: string,
    d: SubmitHrFeedback360Dto,
  ) {
    this.assertActorScope(s, a);
    if (!has(a, HR_PERMISSIONS.HR_FEEDBACK_RESPOND)) {
      throw new ForbiddenException("360 response permission required");
    }
    return this.db.transaction(async (m) => {
      const x = (await m.query(
        `SELECT x.*,s.employee_id subject_employee_id,s.status subject_status,c.response_end,e.id actor_employee_id FROM hr_feedback360_assignment x JOIN hr_feedback360_subject s ON(s.id,s.tenant_id,s.park_id)=(x.subject_id,x.tenant_id,x.park_id) JOIN hr_feedback360_cycle c ON(c.id,c.tenant_id,c.park_id)=(s.cycle_id,s.tenant_id,s.park_id) JOIN hr_employee e ON(e.id,e.tenant_id,e.park_id)=(x.reviewer_employee_id,x.tenant_id,x.park_id) WHERE x.id=$3 AND x.tenant_id=$1 AND x.park_id=$2 AND e.user_id=$4 FOR UPDATE OF x,s,c`,
        [s.tenantId, s.parkId, assignmentId, a.sub],
      ))[0] as Row | undefined;
      if (!x) throw new NotFoundException("360 assignment not found");
      if (x.status !== "pending") {
        throw new ConflictException("360 feedback has already been submitted");
      }
      if (x.subject_status !== "responding") {
        throw new ConflictException("360 subject is not collecting responses");
      }
      if (
        new Date(`${x.response_end as string}T23:59:59+08:00`).getTime() <
          Date.now()
      ) throw new ConflictException("360 response deadline has passed");
      if (
        (x.relation_type === "self") !==
          (x.reviewer_employee_id === x.subject_employee_id)
      ) throw new BadRequestException("360 self-review identity is invalid");
      const snapshot = x.questionnaire_snapshot as {
        questions?: Array<{ code: string; type: string; required: boolean }>;
      };
      const questions = snapshot.questions ?? [];
      const byCode = new Map(questions.map((q) => [q.code, q]));
      if (
        new Set(d.answers.map((y) => y.questionCode)).size !==
          d.answers.length || d.answers.some((y) => !byCode.has(y.questionCode))
      ) {
        throw new BadRequestException(
          "360 response contains an unknown or duplicate question",
        );
      }
      const normalized: Record<string, { score?: string; text?: string }> = {};
      for (const q of questions) {
        const answer = d.answers.find((y) => y.questionCode === q.code);
        if (q.required && !answer) {
          throw new BadRequestException(
            "Every required 360 question must be answered",
          );
        }
        if (!answer) continue;
        if (q.type === "rating") {
          if (answer.score === undefined || answer.text !== undefined) {
            throw new BadRequestException(
              "Rating question requires only a score",
            );
          }
          normalized[q.code] = { score: answer.score.toFixed(2) };
        } else {
          if (!answer.text || answer.score !== undefined) {
            throw new BadRequestException("Text question requires only text");
          }
          normalized[q.code] = { text: answer.text };
        }
      }
      const hash = createHash("sha256").update(JSON.stringify(normalized))
        .digest("hex");
      try {
        const response = (await m.query(
          `INSERT INTO hr_feedback360_response(tenant_id,park_id,assignment_id,answers,response_hash)VALUES($1,$2,$3,$4,$5)RETURNING id,submitted_at`,
          [s.tenantId, s.parkId, assignmentId, normalized, hash],
        ))[0] as Row;
        await this.action(
          m,
          s,
          id(x.subject_id),
          a,
          "submitted",
          "response",
          id(response.id),
          { relationType: x.relation_type },
        );
        return { status: "submitted", submittedAt: response.submitted_at };
      } catch (e) {
        if ((e as { code?: string }).code === "23505") {
          throw new ConflictException(
            "360 feedback has already been submitted",
          );
        }
        throw e;
      }
    });
  }
  async closeSubject(s: TenantParkScope, a: JwtPrincipal, subjectId: string) {
    this.assertActorScope(s, a);
    if (!has(a, HR_PERMISSIONS.HR_FEEDBACK_RESULT_PUBLISH)) {
      throw new ForbiddenException("360 result-publish permission required");
    }
    return this.db.transaction(async (m) => {
      await this.assertSubjectAccess(m, s, a, subjectId);
      const locked = (await m.query(
        `SELECT status FROM hr_feedback360_subject WHERE id=$3 AND tenant_id=$1 AND park_id=$2 FOR UPDATE`,
        [s.tenantId, s.parkId, subjectId],
      ))[0] as Row;
      if (locked.status !== "responding") {
        throw new ConflictException(
          "Only a responding 360 subject can be closed",
        );
      }
      await m.query(
        `UPDATE hr_feedback360_assignment SET status='expired' WHERE tenant_id=$1 AND park_id=$2 AND subject_id=$3 AND status='pending'`,
        [s.tenantId, s.parkId, subjectId],
      );
      await m.query(
        `UPDATE hr_feedback360_subject SET status='closed' WHERE id=$1`,
        [subjectId],
      );
      await this.action(m, s, subjectId, a, "closed", null, null, {});
      return { id: subjectId, status: "closed" };
    });
  }
  async publishResult(s: TenantParkScope, a: JwtPrincipal, subjectId: string) {
    this.assertActorScope(s, a);
    if (!has(a, HR_PERMISSIONS.HR_FEEDBACK_RESULT_PUBLISH)) {
      throw new ForbiddenException("360 result-publish permission required");
    }
    return this.db.transaction(async (m) => {
      await this.assertSubjectAccess(m, s, a, subjectId);
      const c = (await m.query(
        `SELECT c.*,x.employee_id,x.status subject_status FROM hr_feedback360_subject x JOIN hr_feedback360_cycle c ON(c.id,c.tenant_id,c.park_id)=(x.cycle_id,x.tenant_id,x.park_id) WHERE x.id=$3 AND x.tenant_id=$1 AND x.park_id=$2 FOR UPDATE OF x,c`,
        [s.tenantId, s.parkId, subjectId],
      ))[0] as Row;
      if (c.subject_status !== "closed") {
        throw new ConflictException(
          "360 subject must be closed before result publication",
        );
      }
      const anonymousCount = num((await m.query(
        `SELECT count(*)::int count FROM hr_feedback360_response r JOIN hr_feedback360_assignment a ON(a.id,a.tenant_id,a.park_id)=(r.assignment_id,r.tenant_id,r.park_id) WHERE a.subject_id=$3 AND a.tenant_id=$1 AND a.park_id=$2 AND (a.relation_type NOT IN('self','manager') OR (a.relation_type='manager' AND $4='anonymous'))`,
        [s.tenantId, s.parkId, subjectId, c.manager_result_policy],
      ))[0]?.count);
      if (
        anonymousCount > 0 &&
        anonymousCount < num(c.minimum_anonymous_responses)
      ) {
        throw new ForbiddenException(
          "The anonymous response group has not reached its publication threshold",
        );
      }
      const lowAnonymousDimensionCount = num((await m.query(
        `SELECT count(*)::int count FROM (
           SELECT q.item->>'dimensionCode'
             FROM hr_feedback360_response r
             JOIN hr_feedback360_assignment a ON(a.id,a.tenant_id,a.park_id)=(r.assignment_id,r.tenant_id,r.park_id)
             CROSS JOIN LATERAL jsonb_array_elements($4::jsonb->'questions') q(item)
            WHERE a.subject_id=$3 AND a.tenant_id=$1 AND a.park_id=$2
              AND (a.relation_type NOT IN('self','manager') OR (a.relation_type='manager' AND $5='anonymous'))
              AND q.item->>'type'='rating' AND r.answers->(q.item->>'code') ? 'score'
            GROUP BY q.item->>'dimensionCode'
           HAVING count(DISTINCT a.id)<$6
         ) low_dimension`,
        [
          s.tenantId,
          s.parkId,
          subjectId,
          c.questionnaire_snapshot,
          c.manager_result_policy,
          c.minimum_anonymous_responses,
        ],
      ))[0]?.count);
      if (lowAnonymousDimensionCount > 0) {
        throw new ForbiddenException(
          "An anonymous dimension has not reached its publication threshold",
        );
      }
      const insertedRows = await m.query(
        `WITH scored AS (
           SELECT q.item->>'dimensionCode' dimension_code,
                  CASE WHEN a.relation_type='self' THEN 'self'
                       WHEN a.relation_type='manager' AND $4='separate' THEN 'manager'
                       ELSE 'others' END relation_group,
                  a.id assignment_id,
                  (r.answers->(q.item->>'code')->>'score')::numeric score
             FROM hr_feedback360_response r
             JOIN hr_feedback360_assignment a ON(a.id,a.tenant_id,a.park_id)=(r.assignment_id,r.tenant_id,r.park_id)
             CROSS JOIN LATERAL jsonb_array_elements($5::jsonb->'questions') q(item)
            WHERE a.subject_id=$3 AND a.tenant_id=$1 AND a.park_id=$2
              AND q.item->>'type'='rating'
              AND r.answers->(q.item->>'code') ? 'score'
              AND NOT (a.relation_type='self' AND $6='excluded')
         ), grouped AS (
           SELECT dimension_code,relation_group,count(DISTINCT assignment_id)::int response_count,round(avg(score),2) average_score
             FROM scored GROUP BY dimension_code,relation_group
         )
         INSERT INTO hr_feedback360_dimension_result(tenant_id,park_id,subject_id,dimension_code,relation_group,response_count,minimum_required,average_score,published_at)
         SELECT $1,$2,$3,dimension_code,relation_group,response_count,
                CASE WHEN relation_group='others' THEN $7 ELSE 1 END,
                average_score,now()
           FROM grouped
          WHERE response_count>=CASE WHEN relation_group='others' THEN $7 ELSE 1 END
         RETURNING id`,
        [
          s.tenantId,
          s.parkId,
          subjectId,
          c.manager_result_policy,
          c.questionnaire_snapshot,
          c.self_result_policy,
          c.minimum_anonymous_responses,
        ],
      ) as Row[];
      const inserted = insertedRows.length;
      if (!inserted) {
        throw new ForbiddenException(
          "No 360 dimension group has reached its publication threshold",
        );
      }
      await m.query(
        `UPDATE hr_feedback360_subject SET status='published',published_at=now() WHERE id=$1`,
        [subjectId],
      );
      await this.action(m, s, subjectId, a, "result_published", null, null, {
        dimensionGroupCount: inserted,
      });
      const employee = (await m.query(
        `SELECT user_id FROM hr_employee WHERE id=$3 AND tenant_id=$1 AND park_id=$2`,
        [s.tenantId, s.parkId, c.employee_id],
      ))[0] as Row | undefined;
      if (employee?.user_id) {
        await this.notifications.publishFeedback360Result(s, a, {
          subjectId,
          subjectUserId: id(employee.user_id),
        }, m);
      }
      return {
        id: subjectId,
        status: "published",
        dimensionGroupCount: inserted,
      };
    });
  }
  async results(s: TenantParkScope, a: JwtPrincipal, q: HrFeedback360QueryDto) {
    const access = this.access(s, a);
    if (access === "none") return [];
    let sql =
      `WITH dimension_projection AS (
         SELECT tenant_id,park_id,subject_id,dimension_code,
                round(sum(average_score*response_count)/sum(response_count),2)::text average_score
           FROM hr_feedback360_dimension_result
          GROUP BY tenant_id,park_id,subject_id,dimension_code
       )
       SELECT c.cycle_name "cycleName",x.employee_snapshot->>'fullName' "subjectName",x.published_at "publishedAt",
              COALESCE(jsonb_agg(jsonb_build_object('dimensionCode',r.dimension_code,'averageScore',r.average_score) ORDER BY r.dimension_code) FILTER(WHERE r.dimension_code IS NOT NULL),'[]') dimensions
         FROM hr_feedback360_subject x
         JOIN hr_feedback360_cycle c ON(c.id,c.tenant_id,c.park_id)=(x.cycle_id,x.tenant_id,x.park_id)
         JOIN hr_employee e ON(e.id,e.tenant_id,e.park_id)=(x.employee_id,x.tenant_id,x.park_id)
         LEFT JOIN dimension_projection r ON(r.subject_id,r.tenant_id,r.park_id)=(x.id,x.tenant_id,x.park_id)
        WHERE x.tenant_id=$1 AND x.park_id=$2 AND x.status='published'`;
    const p: unknown[] = [s.tenantId, s.parkId];
    if (q.subject_id) sql += ` AND x.id=$${p.push(q.subject_id)}`;
    if (q.cycle_id) sql += ` AND x.cycle_id=$${p.push(q.cycle_id)}`;
    if (access === "managed_org_tree") {
      sql += ` AND e.primary_org_id IN(${
        this.managedOrgSql(`$${p.push(a.sub)}`)
      })`;
    } else if (access === "self") sql += ` AND e.user_id=$${p.push(a.sub)}`;
    sql += ` GROUP BY x.id,c.cycle_name ORDER BY x.published_at DESC,x.id`;
    const rows = await this.db.query(sql, p);
    await recordHrSensitiveRead(this.audit, s, a, {
      resource: "hr.feedback360_result",
      action: "读取360匿名聚合结果",
      bizType: "hr_feedback360_subject",
      bizId: q.subject_id ?? null,
      path: "/hr/feedback360-v2/results",
      fieldGroups: ["feedback"],
      projection: access === "managed_org_tree" ? "team" : access,
      itemCount: rows.length,
    });
    return rows;
  }
  private async action(
    m: EntityManager,
    s: TenantParkScope,
    subjectId: string,
    a: JwtPrincipal,
    type: string,
    referenceType: string | null,
    referenceId: string | null,
    detail: Record<string, unknown>,
  ) {
    await m.query(
      `INSERT INTO hr_feedback360_action(tenant_id,park_id,subject_id,action_no,action_type,actor_user_id,reference_type,reference_id,detail)SELECT $1::varchar,$2::varchar,$3::uuid,COALESCE(max(action_no),0)+1,$4::varchar,$5::uuid,$6::varchar,$7::uuid,$8::jsonb FROM hr_feedback360_action WHERE tenant_id=$1::varchar AND park_id=$2::varchar AND subject_id=$3::uuid`,
      [
        s.tenantId,
        s.parkId,
        subjectId,
        type,
        a.sub,
        referenceType,
        referenceId,
        detail,
      ],
    );
  }
}
