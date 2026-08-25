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
import { recordHrSensitiveRead } from "./hr-sensitive-read-audit";
import {
  CreateHrRewardCaseDto,
  CreateHrRewardCategoryDto,
  HrRewardCorrectionDto,
  HrRewardLinkDto,
  HrRewardListDto,
  HrRewardReviewDto,
  UpdateHrRewardDraftDto,
  VersionHrRewardCategoryDto,
} from "./dto/hr-rewards.dto";
type Access = "park" | "managed_org_tree" | "self" | "none";
@Injectable()
export class HrRewardsService {
  constructor(
    private readonly db: DataSource,
    private readonly audit: AuditService,
  ) {}
  private has(a: JwtPrincipal, p: string) {
    return Boolean(
      a.isSuper || a.permissions.includes("*") || a.permissions.includes(p),
    );
  }
  private access(a: JwtPrincipal): Access {
    if (this.has(a, HR_PERMISSIONS.HR_REWARD_READ)) return "park";
    if (this.has(a, HR_PERMISSIONS.HR_REWARD_TEAM_READ))
      return "managed_org_tree";
    if (this.has(a, HR_PERMISSIONS.HR_REWARD_SELF_READ)) return "self";
    return "none";
  }
  private require(a: JwtPrincipal, p: string) {
    if (!this.has(a, p)) throw new ForbiddenException();
  }
  async categories(s: TenantParkScope, a: JwtPrincipal) {
    if (this.access(a) === "none") return [];
    return this.db.query(
      `SELECT c.id,c.category_code "code",v.version_no "versionNo",v.kind,v.name,v.impact_level "impactLevel",c.status FROM hr_reward_discipline_category c JOIN hr_reward_discipline_category_version v ON v.tenant_id=c.tenant_id AND v.park_id=c.park_id AND v.category_id=c.id AND v.version_no=c.current_version_no WHERE c.tenant_id=$1 AND c.park_id=$2 AND c.is_deleted=false ORDER BY v.kind,v.name,c.id`,
      [s.tenantId, s.parkId],
    );
  }
  async options(s: TenantParkScope, a: JwtPrincipal) {
    this.require(a, HR_PERMISSIONS.HR_REWARD_MANAGE);
    const [categories, employees] = await Promise.all([
      this.categories(s, a),
      this.db.query(
        `SELECT id,employee_code "employeeCode",full_name "fullName" FROM hr_employee WHERE tenant_id=$1 AND park_id=$2 AND is_deleted=false AND employment_status IN('preboarding','probation','active','suspended') ORDER BY full_name,id LIMIT 500`,
        [s.tenantId, s.parkId],
      ),
    ]);
    return { categories, employees };
  }
  async createCategory(
    s: TenantParkScope,
    a: JwtPrincipal,
    d: CreateHrRewardCategoryDto,
  ) {
    this.require(a, HR_PERMISSIONS.HR_REWARD_MANAGE);
    return this.db.transaction(async (m) => {
      try {
        const c = (
            await m.query(
              `INSERT INTO hr_reward_discipline_category(tenant_id,park_id,category_code,create_by,update_by) VALUES($1,$2,$3,$4,$4) RETURNING id,category_code "code",status`,
              [s.tenantId, s.parkId, d.code, a.sub],
            )
          )[0],
          v = (
            await m.query(
              `INSERT INTO hr_reward_discipline_category_version(tenant_id,park_id,category_id,version_no,kind,name,impact_level,description,create_by) VALUES($1,$2,$3,1,$4,$5,$6,$7,$8) RETURNING id,version_no "versionNo",kind,name,impact_level "impactLevel"`,
              [
                s.tenantId,
                s.parkId,
                c.id,
                d.kind,
                d.name,
                d.impactLevel,
                d.description ?? null,
                a.sub,
              ],
            )
          )[0];
        return { ...c, ...v, id: c.id, versionId: v.id };
      } catch (e) {
        if ((e as { code?: string }).code === "23505")
          throw new ConflictException("Reward category code already exists");
        throw e;
      }
    });
  }
  async versionCategory(
    s: TenantParkScope,
    a: JwtPrincipal,
    id: string,
    d: VersionHrRewardCategoryDto,
  ) {
    this.require(a, HR_PERMISSIONS.HR_REWARD_MANAGE);
    return this.db.transaction(async (m) => {
      const c = (
        await m.query(
          `SELECT id,current_version_no FROM hr_reward_discipline_category WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND status='enabled' AND is_deleted=false FOR UPDATE`,
          [s.tenantId, s.parkId, id],
        )
      )[0];
      if (!c) throw new NotFoundException("Reward category not found");
      const no = Number(c.current_version_no) + 1,
        v = (
          await m.query(
            `INSERT INTO hr_reward_discipline_category_version(tenant_id,park_id,category_id,version_no,kind,name,impact_level,description,create_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,version_no "versionNo",kind,name,impact_level "impactLevel"`,
            [
              s.tenantId,
              s.parkId,
              id,
              no,
              d.kind,
              d.name,
              d.impactLevel,
              d.description ?? null,
              a.sub,
            ],
          )
        )[0];
      await m.query(
        `UPDATE hr_reward_discipline_category SET current_version_no=$4,update_by=$5,update_time=now(),version=version+1 WHERE tenant_id=$1 AND park_id=$2 AND id=$3`,
        [s.tenantId, s.parkId, id, no, a.sub],
      );
      return v;
    });
  }
  private async assertEvidence(
    m: EntityManager,
    s: TenantParkScope,
    id: string,
    ids: string[],
  ) {
    if (new Set(ids).size !== ids.length)
      throw new BadRequestException("Duplicate evidence file");
    if (!ids.length) return;
    const rows = await m.query(
      `SELECT id FROM sys_file WHERE tenant_id=$1 AND park_id=$2 AND id=ANY($3::uuid[]) AND biz_type='hr_reward_evidence' AND biz_id=$4 AND status=1 AND is_deleted=false FOR SHARE`,
      [s.tenantId, s.parkId, ids, id],
    );
    if (rows.length !== ids.length)
      throw new BadRequestException("Reward evidence file is invalid");
  }
  private amountPair(amount?: string, currency?: string) {
    if ((amount === undefined) !== (currency === undefined))
      throw new BadRequestException(
        "Amount and currency must be supplied together",
      );
    return [amount ?? null, currency ?? null];
  }
  private requireCreateSensitiveFields(
    a: JwtPrincipal,
    d: Pick<CreateHrRewardCaseDto, "detailedReason" | "amountSuggestion" | "evidenceFileIds">,
  ) {
    if (d.detailedReason !== undefined)
      this.require(a, HR_PERMISSIONS.HR_REWARD_REASON_READ);
    if (d.amountSuggestion !== undefined)
      this.require(a, HR_PERMISSIONS.HR_REWARD_AMOUNT_READ);
    if (d.evidenceFileIds.length) {
      this.require(a, HR_PERMISSIONS.HR_REWARD_DOCUMENT_MANAGE);
      throw new BadRequestException(
        "Create the draft before uploading reward evidence",
      );
    }
  }
  async createCase(
    s: TenantParkScope,
    a: JwtPrincipal,
    d: CreateHrRewardCaseDto,
  ) {
    this.require(a, HR_PERMISSIONS.HR_REWARD_MANAGE);
    this.requireCreateSensitiveFields(a, d);
    const [amount, currency] = this.amountPair(d.amountSuggestion, d.currency);
    return this.db.transaction(async (m) => {
      const employee = (
        await m.query(
          `SELECT id FROM hr_employee WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND is_deleted=false FOR SHARE`,
          [s.tenantId, s.parkId, d.employeeId],
        )
      )[0];
      if (!employee) throw new NotFoundException("Employee not found");
      const category = (
        await m.query(
          `SELECT c.id,v.id version_id FROM hr_reward_discipline_category c JOIN hr_reward_discipline_category_version v ON v.tenant_id=c.tenant_id AND v.park_id=c.park_id AND v.category_id=c.id AND v.version_no=c.current_version_no WHERE c.tenant_id=$1 AND c.park_id=$2 AND c.id=$3 AND c.status='enabled' AND c.is_deleted=false FOR SHARE OF c,v`,
          [s.tenantId, s.parkId, d.categoryId],
        )
      )[0];
      if (!category) throw new NotFoundException("Reward category not found");
      try {
        const row = (
          await m.query(
            `INSERT INTO hr_reward_discipline_case(tenant_id,park_id,case_code,employee_id,category_id,category_version_id,occurred_on,fact_summary,detailed_reason,impact_level,amount_suggestion,currency,evidence_snapshot,create_by,update_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14) RETURNING id,case_code "code",status`,
            [
              s.tenantId,
              s.parkId,
              d.code,
              d.employeeId,
              d.categoryId,
              category.version_id,
              d.occurredOn,
              d.factSummary,
              d.detailedReason ?? null,
              d.impactLevel,
              amount,
              currency,
              JSON.stringify(d.evidenceFileIds),
              a.sub,
            ],
          )
        )[0];
        await this.assertEvidence(m, s, row.id, d.evidenceFileIds);
        return row;
      } catch (e) {
        if ((e as { code?: string }).code === "23505")
          throw new ConflictException("Reward case code already exists");
        throw e;
      }
    });
  }
  async updateDraft(
    s: TenantParkScope,
    a: JwtPrincipal,
    id: string,
    d: UpdateHrRewardDraftDto,
  ) {
    this.require(a, HR_PERMISSIONS.HR_REWARD_MANAGE);
    return this.db.transaction(async (m) => {
      const c = await this.lock(m, s, id);
      if (!["draft", "returned"].includes(c.status))
        throw new ConflictException(
          "Only draft or returned cases can be corrected",
        );
      const detailedReason =
          d.detailedReason === undefined
            ? c.detailed_reason
            : d.detailedReason || null,
        [amount, currency] =
          d.amountSuggestion === undefined && d.currency === undefined
            ? [
                c.amount_suggestion === null
                  ? null
                  : String(c.amount_suggestion),
                c.currency,
              ]
            : this.amountPair(d.amountSuggestion, d.currency),
        evidenceFileIds = d.evidenceFileIds ?? c.evidence_snapshot;
      if (detailedReason !== c.detailed_reason)
        this.require(a, HR_PERMISSIONS.HR_REWARD_REASON_READ);
      if (
        amount !==
          (c.amount_suggestion === null ? null : String(c.amount_suggestion)) ||
        currency !== c.currency
      )
        this.require(a, HR_PERMISSIONS.HR_REWARD_AMOUNT_READ);
      if (
        JSON.stringify(evidenceFileIds) !== JSON.stringify(c.evidence_snapshot)
      )
        this.require(a, HR_PERMISSIONS.HR_REWARD_DOCUMENT_MANAGE);
      await this.assertEvidence(m, s, id, evidenceFileIds);
      await m.query(
        `UPDATE hr_reward_discipline_case SET occurred_on=$4,fact_summary=$5,detailed_reason=$6,impact_level=$7,amount_suggestion=$8,currency=$9,evidence_snapshot=$10,update_by=$11,update_time=now(),version=version+1 WHERE tenant_id=$1 AND park_id=$2 AND id=$3`,
        [
          s.tenantId,
          s.parkId,
          id,
          d.occurredOn,
          d.factSummary,
          detailedReason,
          d.impactLevel,
          amount,
          currency,
          JSON.stringify(evidenceFileIds),
          a.sub,
        ],
      );
      return { id, status: c.status };
    });
  }
  private async lock(m: EntityManager, s: TenantParkScope, id: string) {
    const c = (
      await m.query(
        `SELECT c.*,e.user_id,e.primary_org_id,v.kind,v.name category_name,v.description category_description FROM hr_reward_discipline_case c JOIN hr_employee e ON e.tenant_id=c.tenant_id AND e.park_id=c.park_id AND e.id=c.employee_id JOIN hr_reward_discipline_category_version v ON v.tenant_id=c.tenant_id AND v.park_id=c.park_id AND v.id=c.category_version_id WHERE c.tenant_id=$1 AND c.park_id=$2 AND c.id=$3 AND c.is_deleted=false FOR UPDATE OF c`,
        [s.tenantId, s.parkId, id],
      )
    )[0];
    if (!c) throw new NotFoundException("Reward case not found");
    return c;
  }
  private async inManagedTree(
    m: DataSource | EntityManager,
    s: TenantParkScope,
    a: JwtPrincipal,
    orgId: string,
  ) {
    return Boolean(
      (
        await m.query(
          `WITH RECURSIVE managed_org AS(SELECT id FROM sys_org WHERE tenant_id=$1 AND park_id=$2 AND leader_user_id=$3 AND status='enabled' AND is_deleted=false UNION ALL SELECT c.id FROM sys_org c JOIN managed_org p ON c.parent_id=p.id WHERE c.tenant_id=$1 AND c.park_id=$2 AND c.status='enabled' AND c.is_deleted=false) SELECT 1 FROM managed_org WHERE id=$4 LIMIT 1`,
          [s.tenantId, s.parkId, a.sub, orgId],
        )
      )[0],
    );
  }
  private async message(
    m: EntityManager,
    s: TenantParkScope,
    a: JwtPrincipal,
    c: { id: string; user_id: string | null },
    action: string,
    recipient: string | null,
    title: string,
  ) {
    if (!recipient || recipient === a.sub) return;
    const key = `hr-reward:${action}:${c.id}:${recipient}`;
    await m.query(
      `INSERT INTO biz_user_message(tenant_id,park_id,recipient_id,sender_id,category,priority,source_type,source_id,biz_type,biz_id,action,title,content,target_url,unique_key,payload,create_by,update_by) VALUES($1,$2,$3,$4,'hr','normal','hr_reward_case',$5,'hr_reward_case',$5,$6,$7,'请进入奖惩管理查看待办。','/hr/rewards',$8,'{}',$4,$4) ON CONFLICT(tenant_id,park_id,recipient_id,unique_key) WHERE is_deleted=false DO NOTHING`,
      [s.tenantId, s.parkId, recipient, a.sub, c.id, action, title, key],
    );
  }
  async act(
    s: TenantParkScope,
    a: JwtPrincipal,
    id: string,
    action: string,
    d: HrRewardReviewDto,
  ) {
    return this.db.transaction(async (m) => {
      const c = await this.lock(m, s, id);
      const review = ["approve", "return"].includes(action);
      if (review) {
        this.require(a, HR_PERMISSIONS.HR_REWARD_REVIEW);
        if (c.create_by === a.sub || c.user_id === a.sub)
          throw new ForbiddenException("Self review is not allowed");
        if (
          !this.has(a, HR_PERMISSIONS.HR_REWARD_READ) &&
          (!this.has(a, HR_PERMISSIONS.HR_REWARD_TEAM_READ) ||
            !(await this.inManagedTree(m, s, a, c.primary_org_id)))
        )
          throw new ForbiddenException();
      } else this.require(a, HR_PERMISSIONS.HR_REWARD_MANAGE);
      const allowed: Record<string, string[]> = {
        submit: ["draft"],
        resubmit: ["returned"],
        withdraw: ["submitted"],
        approve: ["submitted"],
        return: ["submitted"],
      };
      if (!allowed[action]?.includes(c.status))
        throw new ConflictException(
          "Reward case action is not valid for current state",
        );
      const next =
        action === "submit" || action === "resubmit"
          ? "submitted"
          : action === "approve"
            ? "approved"
            : action === "return"
              ? "returned"
              : "withdrawn";
      let snapshot = c.category_snapshot;
      let evidenceSnapshot = JSON.stringify(c.evidence_snapshot);
      if (next === "submitted") {
        snapshot = JSON.stringify({
          kind: c.kind,
          name: c.category_name,
          impactLevel: c.impact_level,
          description: c.category_description,
          categoryVersionId: c.category_version_id,
        });
        evidenceSnapshot = JSON.stringify(
          (
            await m.query(
              `SELECT f.id
               FROM sys_file f
               WHERE f.tenant_id=$1 AND f.park_id=$2
                 AND f.biz_type='hr_reward_evidence' AND f.biz_id=$3
                 AND f.status=1 AND f.is_deleted=false
               ORDER BY f.id FOR SHARE`,
              [s.tenantId, s.parkId, id],
            )
          ).map((file: { id: string }) => file.id),
        );
      }
      await m.query(
        `UPDATE hr_reward_discipline_case SET status=$4::varchar,category_snapshot=CASE WHEN $4::varchar='submitted' THEN $5::jsonb ELSE category_snapshot END,evidence_snapshot=CASE WHEN $4::varchar='submitted' THEN $6::jsonb ELSE evidence_snapshot END,submitted_at=CASE WHEN $4::varchar='submitted' THEN COALESCE(submitted_at,now()) ELSE submitted_at END,approved_at=CASE WHEN $4::varchar='approved' THEN now() ELSE approved_at END,returned_at=CASE WHEN $4::varchar='returned' THEN now() ELSE returned_at END,withdrawn_at=CASE WHEN $4::varchar='withdrawn' THEN now() ELSE withdrawn_at END,reviewer_user_id=CASE WHEN $4::varchar IN('approved','returned') THEN $7::uuid ELSE reviewer_user_id END,update_by=$7::uuid,update_time=now(),version=version+1 WHERE tenant_id=$1 AND park_id=$2 AND id=$3`,
        [s.tenantId, s.parkId, id, next, snapshot, evidenceSnapshot, a.sub],
      );
      await m.query(
        `INSERT INTO hr_reward_discipline_action(tenant_id,park_id,case_id,action,from_status,to_status,note,actor_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          s.tenantId,
          s.parkId,
          id,
          action,
          c.status,
          next,
          d.note ?? null,
          a.sub,
        ],
      );
      if (next === "submitted") {
        const reviewers = await m.query(
          `WITH RECURSIVE employee_org AS(
             SELECT id,parent_id,leader_user_id FROM sys_org
             WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND status='enabled' AND is_deleted=false
             UNION ALL
             SELECT parent.id,parent.parent_id,parent.leader_user_id
             FROM sys_org parent JOIN employee_org child ON child.parent_id=parent.id
             WHERE parent.tenant_id=$1 AND parent.park_id=$2 AND parent.status='enabled' AND parent.is_deleted=false
           ), effective_permission AS(
             SELECT DISTINCT ur.user_id,p.code
             FROM rel_user_role ur
             JOIN sys_role r ON r.tenant_id=ur.tenant_id AND r.id=ur.role_id
               AND r.status='enabled' AND r.is_deleted=false
             JOIN rel_role_perm rp ON rp.tenant_id=ur.tenant_id AND rp.park_id=ur.park_id
               AND rp.role_id=r.id AND rp.is_deleted=false
             JOIN sys_permission p ON p.tenant_id=rp.tenant_id AND p.id=rp.permission_id
               AND p.status='enabled' AND p.is_enabled=true AND p.is_deleted=false
             WHERE ur.tenant_id=$1 AND ur.park_id=$2 AND ur.is_deleted=false
           )
           SELECT DISTINCT u.id
           FROM sys_user u
           JOIN effective_permission review ON review.user_id=u.id AND review.code=$4
           WHERE u.tenant_id=$1 AND u.park_id=$2 AND u.status='enabled' AND u.is_deleted=false
             AND (
               EXISTS(SELECT 1 FROM effective_permission park_read WHERE park_read.user_id=u.id AND park_read.code=$5)
               OR (
                 EXISTS(SELECT 1 FROM effective_permission team_read WHERE team_read.user_id=u.id AND team_read.code=$6)
                 AND EXISTS(SELECT 1 FROM employee_org org WHERE org.leader_user_id=u.id)
               )
             )`,
          [
            s.tenantId,
            s.parkId,
            c.primary_org_id,
            HR_PERMISSIONS.HR_REWARD_REVIEW,
            HR_PERMISSIONS.HR_REWARD_READ,
            HR_PERMISSIONS.HR_REWARD_TEAM_READ,
          ],
        );
        for (const r of reviewers)
          await this.message(m, s, a, c, action, r.id, "奖惩事项待审核");
      } else
        await this.message(
          m,
          s,
          a,
          c,
          action,
          c.user_id,
          next === "approved"
            ? "奖惩事项已批准"
            : next === "returned"
              ? "奖惩事项已退回"
              : "奖惩事项已撤回",
        );
      return { id, status: next };
    });
  }
  async correct(
    s: TenantParkScope,
    a: JwtPrincipal,
    id: string,
    d: HrRewardCorrectionDto,
  ) {
    return this.db.transaction(async (m) => {
      const c = await this.lock(m, s, id);
      if (c.status !== "approved")
        throw new ConflictException(
          "Only approved cases accept append-only correction or appeal",
        );
      if (d.type === "appeal") {
        if (
          !this.has(a, HR_PERMISSIONS.HR_REWARD_SELF_READ) ||
          c.user_id !== a.sub
        )
          throw new ForbiddenException();
      } else this.require(a, HR_PERMISSIONS.HR_REWARD_MANAGE);
      const no = Number(
          (
            await m.query(
              `SELECT COALESCE(MAX(sequence_no),0)+1 value FROM hr_reward_discipline_correction WHERE tenant_id=$1 AND park_id=$2 AND case_id=$3`,
              [s.tenantId, s.parkId, id],
            )
          )[0].value,
        ),
        row = (
          await m.query(
            `INSERT INTO hr_reward_discipline_correction(tenant_id,park_id,case_id,sequence_no,correction_type,summary,reason,create_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,sequence_no "sequenceNo"`,
            [s.tenantId, s.parkId, id, no, d.type, d.summary, d.reason, a.sub],
          )
        )[0];
      await m.query(
        `INSERT INTO hr_reward_discipline_action(tenant_id,park_id,case_id,action,from_status,to_status,note,actor_user_id) VALUES($1,$2,$3,$4,'approved','approved','append-only',$5)`,
        [
          s.tenantId,
          s.parkId,
          id,
          d.type === "appeal" ? "appeal" : "correct",
          a.sub,
        ],
      );
      return row;
    });
  }
  async link(
    s: TenantParkScope,
    a: JwtPrincipal,
    id: string,
    d: HrRewardLinkDto,
  ) {
    const permission =
      d.targetType === "payroll_input"
        ? HR_PERMISSIONS.HR_REWARD_LINK_PAYROLL
        : HR_PERMISSIONS.HR_REWARD_LINK_PERFORMANCE;
    this.require(a, permission);
    this.require(a, HR_PERMISSIONS.HR_REWARD_READ);
    return this.db.transaction(async (m) => {
      const c = await this.lock(m, s, id);
      if (c.status !== "approved")
        throw new ConflictException("Only approved cases can be linked");
      let valid = false;
      if (d.targetType === "payroll_input")
        valid = Boolean(
          (
            await m.query(
              `SELECT 1
               FROM hr_attendance_payroll_input_item i
               JOIN hr_attendance_payroll_input_batch b
                 ON b.tenant_id=i.tenant_id AND b.park_id=i.park_id AND b.id=i.batch_id
               WHERE i.tenant_id=$1 AND i.park_id=$2 AND i.id=$3
                 AND i.employee_id=$5 AND i.version=$4 AND i.is_deleted=false
                 AND b.status='effective' AND b.is_deleted=false
               FOR SHARE OF i,b`,
              [s.tenantId, s.parkId, d.targetId, d.targetVersion, c.employee_id],
            )
          )[0],
        );
      else
        valid = Boolean(
          (
            await m.query(
              `SELECT 1 FROM hr_performance_plan
               WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND employee_id=$5
                 AND version=$4 AND status IN('draft','self_review','manager_review','calibrating')
                 AND is_deleted=false FOR SHARE`,
              [s.tenantId, s.parkId, d.targetId, d.targetVersion, c.employee_id],
            )
          )[0],
        );
      if (!valid)
        throw new BadRequestException("Link target is unavailable or stale");
      try {
        return (
          await m.query(
            `INSERT INTO hr_reward_discipline_link(tenant_id,park_id,case_id,target_type,target_id,target_version,create_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,target_type "targetType",target_version "targetVersion",status`,
            [
              s.tenantId,
              s.parkId,
              id,
              d.targetType,
              d.targetId,
              d.targetVersion,
              a.sub,
            ],
          )
        )[0];
      } catch (e) {
        if ((e as { code?: string }).code === "23505")
          throw new ConflictException("Reward link already exists");
        throw e;
      }
    });
  }
  async list(s: TenantParkScope, a: JwtPrincipal, q: HrRewardListDto) {
    const access = this.access(a);
    if (access === "none")
      return { items: [], page: q.page, pageSize: q.page_size, total: 0 };
    const amount =
        this.has(a, HR_PERMISSIONS.HR_REWARD_AMOUNT_READ) && access === "park",
      params: unknown[] = [
        s.tenantId,
        s.parkId,
        q.page_size,
        (q.page - 1) * q.page_size,
        a.sub,
      ],
      where = [
        `c.tenant_id=$1`,
        `c.park_id=$2`,
        `c.is_deleted=false`,
        `$5::uuid IS NOT NULL`,
      ];
    if (q.status) {
      params.push(q.status);
      where.push(`c.status=$${params.length}`);
    }
    if (access === "self") where.push(`e.user_id=$5 AND c.status='approved'`);
    if (access === "managed_org_tree")
      where.push(
        `e.primary_org_id IN(WITH RECURSIVE managed_org AS(SELECT id FROM sys_org WHERE tenant_id=$1 AND park_id=$2 AND leader_user_id=$5 AND status='enabled' AND is_deleted=false UNION ALL SELECT o.id FROM sys_org o JOIN managed_org p ON o.parent_id=p.id WHERE o.tenant_id=$1 AND o.park_id=$2 AND o.status='enabled' AND o.is_deleted=false) SELECT id FROM managed_org)`,
      );
    const rows = await this.db.query(
      `SELECT c.id,c.case_code "code",c.status,c.occurred_on "occurredOn",e.full_name "employeeName",COALESCE(c.category_snapshot->>'kind',v.kind) kind,COALESCE(c.category_snapshot->>'name',v.name) "categoryName",c.impact_level "impactLevel",c.fact_summary "summary",${amount ? `c.amount_suggestion::text "amountSuggestion",c.currency,` : ``}COUNT(*) OVER()::int "totalCount" FROM hr_reward_discipline_case c JOIN hr_employee e ON e.tenant_id=c.tenant_id AND e.park_id=c.park_id AND e.id=c.employee_id JOIN hr_reward_discipline_category_version v ON v.tenant_id=c.tenant_id AND v.park_id=c.park_id AND v.id=c.category_version_id WHERE ${where.join(" AND ")} ORDER BY c.occurred_on DESC,c.id LIMIT $3 OFFSET $4`,
      params,
    );
    const total = Number(rows[0]?.totalCount ?? 0),
      items = rows.map(
        ({ totalCount: _t, ...x }: Record<string, unknown>) => x,
      );
    await recordHrSensitiveRead(this.audit, s, a, {
      resource: "hr.reward_case",
      action: "读取奖惩列表",
      bizType: "hr_reward_case",
      bizId: null,
      path: "/hr/rewards/cases",
      fieldGroups: amount ? ["financial"] : [],
      projection: access === "managed_org_tree" ? "team" : access,
      itemCount: items.length,
    });
    return { items, page: q.page, pageSize: q.page_size, total };
  }
  async detail(s: TenantParkScope, a: JwtPrincipal, id: string) {
    const access = this.access(a);
    if (access === "none") throw new NotFoundException("Reward case not found");
    const c = (
      await this.db.query(
        `SELECT c.*,e.full_name,e.user_id,e.primary_org_id,v.kind current_kind,v.name current_category_name FROM hr_reward_discipline_case c JOIN hr_employee e ON e.tenant_id=c.tenant_id AND e.park_id=c.park_id AND e.id=c.employee_id JOIN hr_reward_discipline_category_version v ON v.tenant_id=c.tenant_id AND v.park_id=c.park_id AND v.id=c.category_version_id WHERE c.tenant_id=$1 AND c.park_id=$2 AND c.id=$3 AND c.is_deleted=false`,
        [s.tenantId, s.parkId, id],
      )
    )[0];
    if (!c) throw new NotFoundException("Reward case not found");
    if (access === "self" && (c.user_id !== a.sub || c.status !== "approved"))
      throw new NotFoundException("Reward case not found");
    if (
      access === "managed_org_tree" &&
      !(await this.inManagedTree(this.db, s, a, c.primary_org_id))
    )
      throw new NotFoundException("Reward case not found");
    const amount =
        access === "park" && this.has(a, HR_PERMISSIONS.HR_REWARD_AMOUNT_READ),
      reason =
        access === "park" && this.has(a, HR_PERMISSIONS.HR_REWARD_REASON_READ),
      docs =
        access === "park" &&
        this.has(a, HR_PERMISSIONS.HR_REWARD_DOCUMENT_READ);
    await recordHrSensitiveRead(this.audit, s, a, {
      resource: "hr.reward_case",
      action: "读取奖惩详情",
      bizType: "hr_reward_case",
      bizId: id,
      path: "/hr/rewards/cases/:id",
      fieldGroups: [
        ...(reason ? ["reward_reason" as const] : []),
        ...(amount ? ["financial" as const] : []),
        ...(docs ? ["attachment" as const] : []),
      ],
      projection: access === "managed_org_tree" ? "team" : access,
      itemCount: 1,
    });
    const safe = {
      id: c.id,
      code: c.case_code,
      status: c.status,
      occurredOn: c.occurred_on,
      employeeName: c.full_name,
      kind: c.category_snapshot?.kind ?? c.current_kind,
      categoryName: c.category_snapshot?.name ?? c.current_category_name,
      impactLevel: c.impact_level,
      summary: c.fact_summary,
    };
    if (access !== "park") return safe;
    const corrections = reason
      ? await this.db.query(
          `SELECT sequence_no "sequenceNo",correction_type "type",summary,create_time "createdAt" FROM hr_reward_discipline_correction WHERE tenant_id=$1 AND park_id=$2 AND case_id=$3 ORDER BY sequence_no`,
          [s.tenantId, s.parkId, id],
        )
      : undefined;
    return {
      ...safe,
      ...(reason ? { detailedReason: c.detailed_reason } : {}),
      ...(amount
        ? {
            amountSuggestion:
              c.amount_suggestion === null ? null : String(c.amount_suggestion),
            currency: c.currency,
          }
        : {}),
      ...(docs ? { evidenceFileIds: c.evidence_snapshot } : {}),
      ...(reason ? { corrections } : {}),
    };
  }
}
