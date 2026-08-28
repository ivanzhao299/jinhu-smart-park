import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { HR_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { DataSource, EntityManager } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditService } from "../audit/audit.service";
import { PartySensitiveDataService } from "../property-operations/party-sensitive-data.service";
import { recordHrSensitiveRead } from "./hr-sensitive-read-audit";
import {
  CreateHrEmployeeRecordDto,
  CreateHrLifecycleChecklistDto,
  CreateHrLifecycleTemplateDto,
  CreateHrLifecycleTemplateVersionDto,
  HrLifecycleItemActionDto,
  HrLifecycleListDto,
  HrLegacyEmployeeMaterializationGapQueryDto,
} from "./dto/hr-lifecycle.dto";

type Access = "park" | "managed_org_tree" | "self" | "none";
@Injectable()
export class HrLifecycleService {
  constructor(
    private readonly db: DataSource,
    private readonly sensitive: PartySensitiveDataService,
    private readonly audit: AuditService,
  ) {}
  private has(a: JwtPrincipal, p: string) {
    return Boolean(
      a.isSuper || a.permissions.includes("*") || a.permissions.includes(p),
    );
  }
  async materializationGaps(s:TenantParkScope,a:JwtPrincipal,q:HrLegacyEmployeeMaterializationGapQueryDto){
    if(!this.has(a,HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_MANAGE))throw new NotFoundException("Materialization gaps not found");
    const values:unknown[]=[s.tenantId,s.parkId],where=["tenant_id=$1","park_id=$2"];
    if(q.source_table){values.push(q.source_table);where.push(`source_table=$${values.length}`);}
    const count=Number((await this.db.query(`SELECT count(*)::int total FROM hr_legacy_employee_materialization_gap WHERE ${where.join(" AND ")}`,values))[0]?.total??0);
    values.push(q.page_size,(q.page-1)*q.page_size);
    const items=await this.db.query(`SELECT source_table "sourceTable",source_identity_sha256 "sourceIdentitySha256",source_row_sha256 "sourceRowSha256",field_locator "fieldLocator",reason_code "reasonCode" FROM hr_legacy_employee_materialization_gap WHERE ${where.join(" AND ")} ORDER BY source_table,source_identity_sha256,field_locator LIMIT $${values.length-1} OFFSET $${values.length}`,values);
    await recordHrSensitiveRead(this.audit,s,a,{resource:"hr.legacy_employee_materialization_gap",action:"读取玉舟员工结构化缺口",bizType:"hr_legacy_employee_materialization_gap",bizId:null,path:"/hr/legacy-materialization/gaps",fieldGroups:[],projection:"admin",itemCount:items.length});
    return {items,total:count,page:q.page,page_size:q.page_size};
  }
  private scope(a: JwtPrincipal): Access {
    if (this.has(a, HR_PERMISSIONS.HR_LIFECYCLE_READ)) return "park";
    if (this.has(a, HR_PERMISSIONS.HR_LIFECYCLE_TEAM_READ))
      return "managed_org_tree";
    if (this.has(a, HR_PERMISSIONS.HR_LIFECYCLE_SELF_READ)) return "self";
    return "none";
  }
  private async selfEmployee(
    m: DataSource | EntityManager,
    s: TenantParkScope,
    a: JwtPrincipal,
  ) {
    const rows = await m.query(
      `SELECT id FROM hr_employee WHERE tenant_id=$1 AND park_id=$2 AND user_id=$3 AND is_deleted=false LIMIT 1`,
      [s.tenantId, s.parkId, a.sub],
    );
    return rows[0]?.id as string | undefined;
  }
  async createTemplate(
    s: TenantParkScope,
    a: JwtPrincipal,
    d: CreateHrLifecycleTemplateDto,
  ) {
    if (!this.has(a, HR_PERMISSIONS.HR_LIFECYCLE_TEMPLATE_MANAGE))
      throw new ForbiddenException();
    if (!d.items.length)
      throw new BadRequestException("Template requires at least one item");
    return this.db.transaction(async (m) => {
      const t = (
        await m.query(
          `INSERT INTO hr_lifecycle_checklist_template(tenant_id,park_id,template_code,template_name,checklist_type,create_by,update_by) VALUES($1,$2,$3,$4,$5,$6,$6) RETURNING id,template_code "code",template_name "name",checklist_type "type"`,
          [s.tenantId, s.parkId, d.code, d.name, d.type, a.sub],
        )
      )[0];
      const v = (
        await m.query(
          `INSERT INTO hr_lifecycle_checklist_template_version(tenant_id,park_id,template_id,version_no,status,published_at,create_by) VALUES($1,$2,$3,1,'published',now(),$4) RETURNING id,version_no "versionNo"`,
          [s.tenantId, s.parkId, t.id, a.sub],
        )
      )[0];
      for (const [i, x] of d.items.entries())
        await m.query(
          `INSERT INTO hr_lifecycle_checklist_template_item(tenant_id,park_id,template_version_id,item_code,item_name,category,sequence_no,default_due_days,required) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            s.tenantId,
            s.parkId,
            v.id,
            x.code,
            x.name,
            x.category,
            i + 1,
            x.defaultDueDays ?? null,
            x.required ?? true,
          ],
        );
      return {
        ...t,
        versionId: v.id,
        versionNo: v.versionNo,
        itemCount: d.items.length,
      };
    });
  }
  async publishTemplateVersion(
    s: TenantParkScope,
    a: JwtPrincipal,
    templateId: string,
    d: CreateHrLifecycleTemplateVersionDto,
  ) {
    if (!this.has(a, HR_PERMISSIONS.HR_LIFECYCLE_TEMPLATE_MANAGE))
      throw new ForbiddenException();
    if (!d.items.length)
      throw new BadRequestException("Template requires at least one item");
    return this.db.transaction(async (m) => {
      const template = (
        await m.query(
          `SELECT id FROM hr_lifecycle_checklist_template WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND is_deleted=false AND status='enabled' FOR UPDATE`,
          [s.tenantId, s.parkId, templateId],
        )
      )[0];
      if (!template) throw new NotFoundException("Template not found");
      const versionNo = Number(
        (
          await m.query(
            `SELECT COALESCE(MAX(version_no),0)+1 AS value FROM hr_lifecycle_checklist_template_version WHERE tenant_id=$1 AND park_id=$2 AND template_id=$3`,
            [s.tenantId, s.parkId, templateId],
          )
        )[0].value,
      );
      const version = (
        await m.query(
          `INSERT INTO hr_lifecycle_checklist_template_version(tenant_id,park_id,template_id,version_no,status,published_at,create_by) VALUES($1,$2,$3,$4,'published',now(),$5) RETURNING id`,
          [s.tenantId, s.parkId, templateId, versionNo, a.sub],
        )
      )[0];
      for (const [index, item] of d.items.entries())
        await m.query(
          `INSERT INTO hr_lifecycle_checklist_template_item(tenant_id,park_id,template_version_id,item_code,item_name,category,sequence_no,default_due_days,required) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            s.tenantId,
            s.parkId,
            version.id,
            item.code,
            item.name,
            item.category,
            index + 1,
            item.defaultDueDays ?? null,
            item.required ?? true,
          ],
        );
      return {
        templateId,
        versionId: version.id,
        versionNo,
        itemCount: d.items.length,
      };
    });
  }
  async listTemplates(s: TenantParkScope, a: JwtPrincipal) {
    if (
      !this.has(a, HR_PERMISSIONS.HR_LIFECYCLE_TEMPLATE_MANAGE) &&
      !this.has(a, HR_PERMISSIONS.HR_LIFECYCLE_READ)
    )
      throw new ForbiddenException();
    return this.db.query(
      `SELECT t.id,t.template_code "code",t.template_name "name",t.checklist_type "type",v.id "versionId",v.version_no "versionNo",COUNT(i.id)::int "itemCount"
       FROM hr_lifecycle_checklist_template t
       JOIN LATERAL (SELECT id,version_no FROM hr_lifecycle_checklist_template_version WHERE tenant_id=t.tenant_id AND park_id=t.park_id AND template_id=t.id AND status='published' ORDER BY version_no DESC LIMIT 1) v ON true
       LEFT JOIN hr_lifecycle_checklist_template_item i ON i.tenant_id=t.tenant_id AND i.park_id=t.park_id AND i.template_version_id=v.id
       WHERE t.tenant_id=$1 AND t.park_id=$2 AND t.is_deleted=false AND t.status='enabled'
       GROUP BY t.id,v.id,v.version_no ORDER BY t.checklist_type,t.template_name`,
      [s.tenantId, s.parkId],
    );
  }
  async list(s: TenantParkScope, a: JwtPrincipal, q: HrLifecycleListDto) {
    const access = this.scope(a);
    if (access === "none")
      return { items: [], page: q.page, pageSize: q.page_size, total: 0 };
    const params: unknown[] = [
        s.tenantId,
        s.parkId,
        q.page_size,
        (q.page - 1) * q.page_size,
      ],
      filters = [`c.tenant_id=$1`, `c.park_id=$2`, `c.is_deleted=false`];
    const actorParam = access === "park" ? null : (params.push(a.sub), params.length);
    if (q.type) {
      params.push(q.type);
      filters.push(`c.checklist_type=$${params.length}`);
    }
    if (q.status) {
      params.push(q.status);
      filters.push(`c.status=$${params.length}`);
    }
    if (q.employee_id) {
      params.push(q.employee_id);
      filters.push(`c.employee_id=$${params.length}`);
    }
    if (access === "self") filters.push(`e.user_id=$${actorParam}`);
    if (access === "managed_org_tree")
      filters.push(
        `(EXISTS(SELECT 1 FROM hr_lifecycle_checklist_item assigned WHERE assigned.tenant_id=c.tenant_id AND assigned.park_id=c.park_id AND assigned.checklist_id=c.id AND assigned.responsible_user_id=$${actorParam})
          OR e.manager_employee_id=(SELECT id FROM hr_employee WHERE tenant_id=$1 AND park_id=$2 AND user_id=$${actorParam} AND is_deleted=false LIMIT 1)
          OR e.primary_org_id IN (WITH RECURSIVE managed_org AS (
            SELECT id FROM sys_org WHERE tenant_id=$1 AND park_id=$2 AND leader_user_id=$${actorParam} AND is_deleted=false AND status='enabled'
            UNION ALL SELECT child.id FROM sys_org child JOIN managed_org parent ON child.parent_id=parent.id
            WHERE child.tenant_id=$1 AND child.park_id=$2 AND child.is_deleted=false AND child.status='enabled'
          ) SELECT id FROM managed_org))`,
      );
    const where = filters.join(" AND ");
    const rows = await this.db.query(
      `SELECT c.id,c.employee_id "employeeId",e.full_name "employeeName",c.checklist_type "type",c.status,c.due_date "dueDate",
              COUNT(i.id)::int "itemCount",COUNT(i.id) FILTER(WHERE i.status IN('completed','waived'))::int "doneCount",
              COUNT(i.id) FILTER(WHERE i.due_date<CURRENT_DATE AND i.status IN('pending','returned'))::int "overdueCount",
              COUNT(*) OVER()::int "totalCount"
       FROM hr_lifecycle_checklist c
       JOIN hr_employee e ON e.tenant_id=c.tenant_id AND e.park_id=c.park_id AND e.id=c.employee_id
       LEFT JOIN hr_lifecycle_checklist_item i ON i.tenant_id=c.tenant_id AND i.park_id=c.park_id AND i.checklist_id=c.id
       WHERE ${where}
       GROUP BY c.id,e.full_name
       ORDER BY c.due_date NULLS LAST,c.id LIMIT $3 OFFSET $4`,
      params,
    );
    const total = Number(rows[0]?.totalCount ?? 0);
    const result = {
      items: rows.map(
        ({ totalCount: _totalCount, ...row }: Record<string, unknown>) => row,
      ),
      page: q.page,
      pageSize: q.page_size,
      total,
    };
    await recordHrSensitiveRead(this.audit, s, a, {
      resource: "hr.lifecycle_checklist",
      action: "读取生命周期清单",
      bizType: "hr_lifecycle_checklist",
      bizId: null,
      path: "/hr/lifecycle/checklists",
      fieldGroups: ["employment_contract"],
      projection: access === "managed_org_tree" ? "team" : access,
      itemCount: result.items.length,
    });
    return result;
  }
  async detail(s: TenantParkScope, a: JwtPrincipal, id: string) {
    const access = this.scope(a);
    if (access === "none") throw new NotFoundException("Checklist not found");
    const rows = await this.db.query(
      `SELECT c.id,c.employee_id "employeeId",e.full_name "employeeName",e.user_id "employeeUserId",e.manager_employee_id "managerEmployeeId",c.checklist_type "type",c.status,c.due_date "dueDate",c.snapshot FROM hr_lifecycle_checklist c JOIN hr_employee e ON e.tenant_id=c.tenant_id AND e.park_id=c.park_id AND e.id=c.employee_id WHERE c.id=$1 AND c.tenant_id=$2 AND c.park_id=$3 AND c.is_deleted=false`,
      [id, s.tenantId, s.parkId],
    );
    const c = rows[0];
    if (!c) throw new NotFoundException("Checklist not found");
    const selfId = await this.selfEmployee(this.db, s, a);
    if (access === "self" && c.employeeUserId !== a.sub)
      throw new NotFoundException("Checklist not found");
    if (access === "managed_org_tree" && c.managerEmployeeId !== selfId) {
      const assignedOrManaged = await this.db.query(
        `WITH RECURSIVE managed_org AS (
           SELECT id FROM sys_org WHERE tenant_id=$1 AND park_id=$2 AND leader_user_id=$4 AND is_deleted=false AND status='enabled'
           UNION ALL SELECT child.id FROM sys_org child JOIN managed_org parent ON child.parent_id=parent.id
           WHERE child.tenant_id=$1 AND child.park_id=$2 AND child.is_deleted=false AND child.status='enabled'
         )
         SELECT 1 FROM hr_lifecycle_checklist target
         JOIN hr_employee employee ON employee.tenant_id=target.tenant_id AND employee.park_id=target.park_id AND employee.id=target.employee_id
         WHERE target.tenant_id=$1 AND target.park_id=$2 AND target.id=$3
           AND (employee.primary_org_id IN (SELECT id FROM managed_org) OR EXISTS(
             SELECT 1 FROM hr_lifecycle_checklist_item item WHERE item.tenant_id=target.tenant_id AND item.park_id=target.park_id AND item.checklist_id=target.id AND item.responsible_user_id=$4
           )) LIMIT 1`,
        [s.tenantId, s.parkId, id, a.sub],
      );
      if (!assignedOrManaged[0])
        throw new NotFoundException("Checklist not found");
    }
    const items = await this.db.query(
      `SELECT id,item_code "itemCode",item_name "itemName",category,sequence_no "sequenceNo",status,responsible_user_id "responsibleUserId",due_date "dueDate",required,completed_at "completedAt",CASE WHEN due_date<CURRENT_DATE AND status IN('pending','returned') THEN true ELSE false END overdue FROM hr_lifecycle_checklist_item WHERE tenant_id=$1 AND park_id=$2 AND checklist_id=$3 ORDER BY sequence_no`,
      [s.tenantId, s.parkId, id],
    );
    await recordHrSensitiveRead(this.audit, s, a, {
      resource: "hr.lifecycle_checklist",
      action: "读取生命周期清单详情",
      bizType: "hr_lifecycle_checklist",
      bizId: id,
      path: "/hr/lifecycle/checklists/:id",
      fieldGroups: ["employment_contract"],
      projection: access === "managed_org_tree" ? "team" : access,
      itemCount: items.length,
    });
    return {
      ...c,
      employeeUserId: undefined,
      managerEmployeeId: undefined,
      items,
    };
  }
  async createChecklist(
    s: TenantParkScope,
    a: JwtPrincipal,
    d: CreateHrLifecycleChecklistDto,
  ) {
    if (!this.has(a, HR_PERMISSIONS.HR_LIFECYCLE_ASSIGN))
      throw new ForbiddenException();
    return this.db.transaction(async (m) => {
      const e = (
        await m.query(
          `SELECT id FROM hr_employee WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND is_deleted=false FOR UPDATE`,
          [s.tenantId, s.parkId, d.employeeId],
        )
      )[0];
      if (!e) throw new NotFoundException("Employee not found");
      const v = (
        await m.query(
          `SELECT v.id,t.checklist_type,t.template_code,v.version_no FROM hr_lifecycle_checklist_template_version v JOIN hr_lifecycle_checklist_template t ON t.tenant_id=v.tenant_id AND t.park_id=v.park_id AND t.id=v.template_id WHERE v.tenant_id=$1 AND v.park_id=$2 AND v.id=$3 AND v.status='published' AND t.status='enabled' AND t.is_deleted=false FOR UPDATE OF v`,
          [s.tenantId, s.parkId, d.templateVersionId],
        )
      )[0];
      if (!v) throw new NotFoundException("Template version not found");
      const active = await m.query(
        `SELECT 1 FROM hr_lifecycle_checklist WHERE tenant_id=$1 AND park_id=$2 AND employee_id=$3 AND checklist_type=$4 AND status IN('open','in_progress') AND is_deleted=false LIMIT 1 FOR UPDATE`,
        [s.tenantId, s.parkId, d.employeeId, v.checklist_type],
      );
      if (active[0])
        throw new ConflictException("Employee already has an active checklist");
      if (v.checklist_type === "offboarding") {
        if (!d.employmentEventId)
          throw new BadRequestException(
            "Offboarding requires an employment event",
          );
        const ev = (
          await m.query(
          `SELECT id,event_type FROM hr_employment_event WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND employee_id=$4 AND event_type='depart' AND status='effective' AND is_historical_import=false AND after_snapshot->>'employmentStatus'='departed' AND is_deleted=false FOR SHARE`,
            [s.tenantId, s.parkId, d.employmentEventId, d.employeeId],
          )
        )[0];
        if (!ev)
          throw new BadRequestException(
            "Valid departure employment event required",
          );
      } else if (d.employmentEventId) {
        throw new BadRequestException(
          "Onboarding checklist cannot reference a departure event",
        );
      }
      const defs = await m.query(
        `SELECT item_code,item_name,category,sequence_no,default_due_days,required FROM hr_lifecycle_checklist_template_item WHERE tenant_id=$1 AND park_id=$2 AND template_version_id=$3 ORDER BY sequence_no`,
        [s.tenantId, s.parkId, v.id],
      );
      if (!defs.length)
        throw new ConflictException("Published template has no task items");
      const snapshot = {
        templateCode: v.template_code,
        versionNo: v.version_no,
        items: defs,
      };
      const c = (
        await m.query(
          `INSERT INTO hr_lifecycle_checklist(tenant_id,park_id,employee_id,checklist_type,template_version,template_version_id,employment_event_id,status,snapshot,due_date,create_by,update_by) VALUES($1,$2,$3,$4,$5,$6,$7,'open',$8,$9,$10,$10) RETURNING id`,
          [
            s.tenantId,
            s.parkId,
            d.employeeId,
            v.checklist_type,
            v.version_no,
            v.id,
            d.employmentEventId ?? null,
            JSON.stringify(snapshot),
            d.dueDate ?? null,
            a.sub,
          ],
        )
      )[0];
      for (const x of defs)
        await m.query(
          `INSERT INTO hr_lifecycle_checklist_item(tenant_id,park_id,checklist_id,item_code,item_name,category,sequence_no,due_date,required) VALUES($1,$2,$3,$4,$5,$6,$7,CASE WHEN $8::int IS NULL OR $9::date IS NULL THEN NULL ELSE $9::date+$8::int END,$10)`,
          [
            s.tenantId,
            s.parkId,
            c.id,
            x.item_code,
            x.item_name,
            x.category,
            x.sequence_no,
            x.default_due_days,
            d.dueDate ?? null,
            x.required,
          ],
        );
      return {
        id: c.id,
        type: v.checklist_type,
        status: "open",
        employeeId: d.employeeId,
      };
    });
  }
  async act(
    s: TenantParkScope,
    a: JwtPrincipal,
    checklistId: string,
    itemId: string,
    d: HrLifecycleItemActionDto,
  ) {
    return this.db.transaction(async (m) => {
      const rows = await m.query(
        `SELECT i.*,c.status checklist_status,c.employee_id,e.user_id employee_user_id,e.full_name employee_name FROM hr_lifecycle_checklist_item i JOIN hr_lifecycle_checklist c ON c.tenant_id=i.tenant_id AND c.park_id=i.park_id AND c.id=i.checklist_id JOIN hr_employee e ON e.tenant_id=c.tenant_id AND e.park_id=c.park_id AND e.id=c.employee_id WHERE i.tenant_id=$1 AND i.park_id=$2 AND i.id=$3 AND i.checklist_id=$4 AND c.is_deleted=false FOR UPDATE OF c,i`,
        [s.tenantId, s.parkId, itemId, checklistId],
      );
      const i = rows[0];
      if (!i) throw new NotFoundException("Checklist item not found");
      if (i.checklist_status === "cancelled")
        throw new ConflictException("Checklist is terminal");
      const selfAction =
        d.action === "complete" &&
        i.responsible_user_id === a.sub &&
        this.has(a, HR_PERMISSIONS.HR_LIFECYCLE_SELF_ACTION);
      const hrReview = this.has(a, HR_PERMISSIONS.HR_LIFECYCLE_REVIEW);
      const canAssign = this.has(a, HR_PERMISSIONS.HR_LIFECYCLE_ASSIGN);
      const authorized =
        selfAction ||
        (["waive", "return", "correct"].includes(d.action) && hrReview) ||
        (d.action === "reassign" && canAssign);
      if (!authorized)
        throw new ForbiddenException();
      if (d.action === "reassign" && !d.assigneeUserId)
        throw new BadRequestException("Assignee is required");
      if (["waive", "return", "correct"].includes(d.action) && !d.note)
        throw new BadRequestException("A note is required");
      const allowedFrom: Record<string, string[]> = {
        complete: ["pending", "returned"],
        waive: ["pending", "returned"],
        return: ["completed"],
        correct: ["completed", "waived"],
        reassign: ["pending", "returned"],
      };
      if (!allowedFrom[d.action]?.includes(i.status))
        throw new ConflictException("Action is unavailable for current item state");
      const transitions: Record<string, string> = {
        complete: "completed",
        waive: "waived",
        return: "returned",
        reassign: i.status,
        correct: "returned",
      };
      const next = transitions[d.action];
      if (!next) throw new BadRequestException();
      if (d.action === "reassign") {
        const assignee = await m.query(
          `SELECT 1 FROM sys_user WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND status='enabled' AND is_deleted=false LIMIT 1 FOR SHARE`,
          [s.tenantId, s.parkId, d.assigneeUserId],
        );
        if (!assignee[0]) throw new NotFoundException("Assignee not found");
      }
      const seq = (
        await m.query(
          `SELECT COALESCE(MAX(sequence_no),0)+1 n FROM hr_lifecycle_checklist_action WHERE tenant_id=$1 AND park_id=$2 AND item_id=$3`,
          [s.tenantId, s.parkId, itemId],
        )
      )[0].n;
      const assignee =
        d.action === "reassign" ? d.assigneeUserId : i.responsible_user_id;
      await m.query(
        `INSERT INTO hr_lifecycle_checklist_action(tenant_id,park_id,checklist_id,item_id,sequence_no,action,from_status,to_status,assignee_user_id,note,actor_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          s.tenantId,
          s.parkId,
          checklistId,
          itemId,
          seq,
          d.action,
          i.status,
          next,
          assignee ?? null,
          d.note ?? null,
          a.sub,
        ],
      );
      await m.query(
        `UPDATE hr_lifecycle_checklist_item SET status=$1::varchar,responsible_user_id=$2,completed_at=CASE WHEN $1::varchar IN('completed','waived') THEN now() ELSE NULL END,completed_by=CASE WHEN $1::varchar IN('completed','waived') THEN $3::uuid ELSE NULL END,update_time=now(),version=version+1 WHERE tenant_id=$4 AND park_id=$5 AND checklist_id=$6 AND id=$7`,
        [next, assignee ?? null, a.sub, s.tenantId, s.parkId, checklistId, itemId],
      );
      await m.query(
        `UPDATE hr_lifecycle_checklist SET status=CASE WHEN NOT EXISTS(SELECT 1 FROM hr_lifecycle_checklist_item x WHERE x.checklist_id=$1::uuid AND x.required AND x.id<>$2::uuid AND x.status NOT IN('completed','waived')) AND $3::varchar IN('completed','waived') THEN 'completed' ELSE 'in_progress' END,completed_at=CASE WHEN NOT EXISTS(SELECT 1 FROM hr_lifecycle_checklist_item x WHERE x.checklist_id=$1::uuid AND x.required AND x.id<>$2::uuid AND x.status NOT IN('completed','waived')) AND $3::varchar IN('completed','waived') THEN now() ELSE NULL END,update_by=$4,update_time=now(),version=version+1 WHERE id=$1::uuid`,
        [checklistId, itemId, next, a.sub],
      );
      const recipient = ["complete", "waive"].includes(d.action)
        ? i.employee_user_id
        : assignee;
      if (recipient && recipient !== a.sub)
        await m.query(
          `INSERT INTO biz_user_message(tenant_id,park_id,recipient_id,sender_id,category,priority,source_type,source_id,biz_type,biz_id,action,title,content,target_url,unique_key,payload,create_by,update_by) VALUES($1,$2,$3,$4,'workflow','normal','hr_lifecycle_checklist',$5,'hr_lifecycle_checklist_item',$6,$7,$8,$9,'/hr/lifecycle',$10,'{}',$4,$4) ON CONFLICT(tenant_id,park_id,recipient_id,unique_key) WHERE is_deleted=false DO NOTHING`,
          [
            s.tenantId,
            s.parkId,
            recipient,
            a.sub,
            checklistId,
            itemId,
            d.action,
            `人事任务：${i.item_name}`,
            `请在员工生命周期工作台查看任务状态`,
            `hr-lifecycle:${itemId}:${seq}:${d.action}`,
          ],
        );
      return { id: itemId, status: next, action: d.action };
    });
  }
  async sendOverdueReminders(s: TenantParkScope, a: JwtPrincipal) {
    if (
      !this.has(a, HR_PERMISSIONS.HR_LIFECYCLE_ASSIGN) &&
      !this.has(a, HR_PERMISSIONS.HR_LIFECYCLE_REVIEW)
    )
      throw new ForbiddenException();
    return this.db.transaction(async (m) => {
      const items = await m.query(
        `SELECT i.id,i.checklist_id,i.item_name,i.responsible_user_id,e.full_name employee_name
         FROM hr_lifecycle_checklist_item i
         JOIN hr_lifecycle_checklist c ON c.tenant_id=i.tenant_id AND c.park_id=i.park_id AND c.id=i.checklist_id
         JOIN hr_employee e ON e.tenant_id=c.tenant_id AND e.park_id=c.park_id AND e.id=c.employee_id
         WHERE i.tenant_id=$1 AND i.park_id=$2 AND i.due_date<(now() AT TIME ZONE 'Asia/Shanghai')::date AND i.status IN('pending','returned')
           AND i.responsible_user_id IS NOT NULL AND c.status IN('open','in_progress') AND c.is_deleted=false
         ORDER BY i.due_date,i.id FOR UPDATE OF i SKIP LOCKED`,
        [s.tenantId, s.parkId],
      );
      let created = 0;
      const reminderDay = String(
        (await m.query("SELECT (now() AT TIME ZONE 'Asia/Shanghai')::date day"))[0]
          .day,
      );
      for (const item of items) {
        const result = await m.query(
          `INSERT INTO biz_user_message(tenant_id,park_id,recipient_id,sender_id,category,priority,source_type,source_id,biz_type,biz_id,action,title,content,target_url,unique_key,payload,create_by,update_by)
           VALUES($1,$2,$3,$4,'workflow','high','hr_lifecycle_checklist',$5,'hr_lifecycle_checklist_item',$6,'overdue','人事任务逾期',$7,'/hr/lifecycle',$8,'{}',$4,$4)
           ON CONFLICT(tenant_id,park_id,recipient_id,unique_key) WHERE is_deleted=false DO NOTHING RETURNING id`,
          [s.tenantId,s.parkId,item.responsible_user_id,a.sub,item.checklist_id,item.id,`请在员工生命周期工作台查看逾期任务`,`hr-lifecycle-overdue:${item.id}:${reminderDay}`],
        );
        if (result[0]) created += 1;
      }
      return { examined: items.length, created };
    });
  }
  async listRecords(s: TenantParkScope, a: JwtPrincipal, employeeId: string) {
    const park = this.has(a, HR_PERMISSIONS.HR_EMPLOYEE_RECORD_READ),
      teamPermission = this.has(
        a,
        HR_PERMISSIONS.HR_EMPLOYEE_RECORD_TEAM_READ,
      ),
      selfPermission = this.has(
        a,
        HR_PERMISSIONS.HR_EMPLOYEE_RECORD_SELF_READ,
      );
    if (!park && !teamPermission && !selfPermission)
      throw new NotFoundException("Employee records not found");
    const employeeExists = await this.db.query(
      `SELECT 1 FROM hr_employee WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND is_deleted=false LIMIT 1`,
      [s.tenantId, s.parkId, employeeId],
    );
    if (!employeeExists[0])
      throw new NotFoundException("Employee records not found");
    const selfId =
        teamPermission || selfPermission
          ? await this.selfEmployee(this.db, s, a)
          : undefined,
      self =
        selfPermission && selfId === employeeId;
    const team =
      !park &&
      !self &&
      teamPermission &&
      Boolean(
        (
          await this.db.query(
            `WITH RECURSIVE managed_org AS (
               SELECT id FROM sys_org WHERE tenant_id=$1 AND park_id=$2 AND leader_user_id=$3 AND is_deleted=false AND status='enabled'
               UNION ALL
               SELECT child.id FROM sys_org child JOIN managed_org parent ON child.parent_id=parent.id
               WHERE child.tenant_id=$1 AND child.park_id=$2 AND child.is_deleted=false AND child.status='enabled'
             )
             SELECT 1 FROM hr_employee target
             WHERE target.tenant_id=$1 AND target.park_id=$2 AND target.id=$4 AND target.is_deleted=false
               AND (target.manager_employee_id=$5 OR target.primary_org_id IN (SELECT id FROM managed_org))
             LIMIT 1`,
            [s.tenantId, s.parkId, a.sub, employeeId, selfId ?? null],
          )
        )[0],
      );
    if (!park && !team && !self)
      throw new NotFoundException("Employee records not found");
    const familyAllowed =
      this.has(a, HR_PERMISSIONS.HR_EMPLOYEE_FAMILY_READ) || self;
    const credentialAllowed =
      this.has(a, HR_PERMISSIONS.HR_EMPLOYEE_CREDENTIAL_READ) || self;
    const familyFull = this.has(a, HR_PERMISSIONS.HR_EMPLOYEE_FAMILY_READ);
    const credentialFull = this.has(a, HR_PERMISSIONS.HR_EMPLOYEE_CREDENTIAL_READ);
    const recordFull = this.has(a, HR_PERMISSIONS.HR_EMPLOYEE_RECORD_READ);
    const [experiences, skills, family, credentials] = await Promise.all([
      this.db.query(
        `SELECT id,experience_type "type",organization_name "organizationName",title,start_date "startDate",end_date "endDate",summary FROM hr_employee_experience WHERE tenant_id=$1 AND park_id=$2 AND employee_id=$3 AND is_deleted=false ORDER BY start_date DESC`,
        [s.tenantId, s.parkId, employeeId],
      ),
      this.db.query(
        `SELECT id,skill_name "skillName",proficiency,acquired_date "acquiredDate",note${recordFull?',legacy_grade "legacyGrade"':''} FROM hr_employee_skill WHERE tenant_id=$1 AND park_id=$2 AND employee_id=$3 AND is_deleted=false ORDER BY skill_name`,
        [s.tenantId, s.parkId, employeeId],
      ),
      familyAllowed
        ? this.db.query(
            `SELECT id,relationship,full_name_masked "fullNameMasked",identity_masked "identityMasked",contact_masked "contactMasked",is_emergency_contact "isEmergencyContact",birth_date "birthDate",work_unit "workUnit",job_title "jobTitle",political_status "politicalStatus"${familyFull?',full_name_encrypted "fullNameEncrypted",contact_encrypted "contactEncrypted"':''} FROM hr_employee_family WHERE tenant_id=$1 AND park_id=$2 AND employee_id=$3 AND is_deleted=false ORDER BY create_time`,
            [s.tenantId, s.parkId, employeeId],
          )
        : Promise.resolve([]),
      credentialAllowed
        ? this.db.query(
            `SELECT id,credential_type "credentialType",credential_name "credentialName",number_masked "numberMasked",issuing_authority "issuingAuthority",acquired_date "acquiredDate",valid_to "validTo",note${credentialFull?',legacy_file_reference_sha256 "legacyFileReferenceSha256",number_encrypted "numberEncrypted"':''} FROM hr_employee_credential WHERE tenant_id=$1 AND park_id=$2 AND employee_id=$3 AND is_deleted=false ORDER BY valid_to NULLS LAST`,
            [s.tenantId, s.parkId, employeeId],
          )
        : Promise.resolve([]),
    ]);
    await recordHrSensitiveRead(this.audit, s, a, {
      resource: "hr.employee_record",
      action: "读取员工扩展档案",
      bizType: "hr_employee",
      bizId: employeeId,
      path: "/hr/employees/:id/records",
      fieldGroups: ["identity", "contact", "attachment"],
      projection: familyFull || credentialFull ? "full" : self ? "self" : team ? "team" : "masked",
      itemCount:
        experiences.length + skills.length + family.length + credentials.length,
    });
    return {
      employeeId,
      experiences,
      skills,
      family:family.map((row:Record<string,unknown>)=>{const {fullNameEncrypted,contactEncrypted,...safe}=row;return familyFull?{...safe,fullName:this.sensitive.decrypt(fullNameEncrypted as string|null),contact:this.sensitive.decrypt(contactEncrypted as string|null)}:safe;}),
      credentials:credentials.map((row:Record<string,unknown>)=>{const {numberEncrypted,...safe}=row;return credentialFull?{...safe,credentialNumber:this.sensitive.decrypt(numberEncrypted as string|null)}:safe;}),
      fieldAccess: { family: familyAllowed, credential: credentialAllowed },
    };
  }
  async createRecord(
    s: TenantParkScope,
    a: JwtPrincipal,
    employeeId: string,
    d: CreateHrEmployeeRecordDto,
  ) {
    if (!this.has(a, HR_PERMISSIONS.HR_EMPLOYEE_RECORD_MANAGE))
      throw new ForbiddenException();
    const exists = await this.db.query(
      `SELECT 1 FROM hr_employee WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND is_deleted=false`,
      [s.tenantId, s.parkId, employeeId],
    );
    if (!exists[0]) throw new NotFoundException("Employee not found");
    if (d.recordType === "family") {
      if (!d.relationship || !d.fullName)
        throw new BadRequestException("Relationship and name are required");
      const n = this.sensitive.identityProfile(d.fullName),
        id = d.identityNumber
          ? this.sensitive.identityProfile(d.identityNumber)
          : null,
        c = d.contact ? this.sensitive.identityProfile(d.contact) : null;
      const r = await this.db.query(
        `INSERT INTO hr_employee_family(tenant_id,park_id,employee_id,relationship,full_name_encrypted,full_name_masked,full_name_fingerprint,identity_encrypted,identity_masked,identity_fingerprint,contact_encrypted,contact_masked,contact_fingerprint,is_emergency_contact,birth_date,work_unit,job_title,political_status,create_by,update_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$19) RETURNING id`,
        [
          s.tenantId,
          s.parkId,
          employeeId,
          d.relationship,
          n.encrypted,
          n.masked,
          n.hash,
          id?.encrypted ?? null,
          id?.masked ?? null,
          id?.hash ?? null,
          c?.encrypted ?? null,
          c?.masked ?? null,
          c?.hash ?? null,
          d.isEmergencyContact ?? false,
          d.birthDate ?? null,
          d.workUnit ?? null,
          d.familyJobTitle ?? null,
          d.familyPoliticalStatus ?? null,
          a.sub,
        ],
      );
      return { id: r[0].id, recordType: d.recordType };
    }
    if (d.recordType === "skill") {
      if (!d.skillName) throw new BadRequestException("Skill name is required");
      const r = await this.db.query(
        `INSERT INTO hr_employee_skill(tenant_id,park_id,employee_id,skill_name,proficiency,acquired_date,note,create_by,update_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING id`,
        [
          s.tenantId,
          s.parkId,
          employeeId,
          d.skillName,
          d.proficiency ?? null,
          d.acquiredDate ?? null,
          d.note ?? null,
          a.sub,
        ],
      );
      return { id: r[0].id, recordType: d.recordType };
    }
    if (d.recordType === "credential") {
      if (!d.credentialType || !d.credentialName)
        throw new BadRequestException("Credential type and name are required");
      const n = d.credentialNumber
        ? this.sensitive.identityProfile(d.credentialNumber)
        : null;
      const r = await this.db.query(
        `INSERT INTO hr_employee_credential(tenant_id,park_id,employee_id,credential_type,credential_name,number_encrypted,number_masked,number_fingerprint,issuing_authority,acquired_date,valid_to,note,create_by,update_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13) RETURNING id`,
        [
          s.tenantId,
          s.parkId,
          employeeId,
          d.credentialType,
          d.credentialName,
          n?.encrypted ?? null,
          n?.masked ?? null,
          n?.hash ?? null,
          d.issuingAuthority ?? null,
          d.acquiredDate ?? null,
          d.validTo ?? null,
          d.note ?? null,
          a.sub,
        ],
      );
      return { id: r[0].id, recordType: d.recordType };
    }
    if (!d.organizationName || !d.startDate)
      throw new BadRequestException("Organization and start date are required");
    const r = await this.db.query(
      `INSERT INTO hr_employee_experience(tenant_id,park_id,employee_id,experience_type,organization_name,title,start_date,end_date,summary,create_by,update_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) RETURNING id`,
      [
        s.tenantId,
        s.parkId,
        employeeId,
        d.recordType,
        d.organizationName,
        d.title ?? null,
        d.startDate,
        d.endDate ?? null,
        d.summary ?? null,
        a.sub,
      ],
    );
    return { id: r[0].id, recordType: d.recordType };
  }
}
