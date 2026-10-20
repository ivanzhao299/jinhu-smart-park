import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { HR_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { createHash } from "node:crypto";
import { DataSource, IsNull, Not, type EntityManager, type Repository } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { IDENTITY_SCOPE_PORT, type IdentityScopePort, activeUserStorageScopePredicate } from "../../runtime/identity-scope.port";
import { AuditService } from "../audit/audit.service";
import type { WorkflowMessageQueryDto } from "../workflow/dto/workflow-message-query.dto";
import { UserMessageEntity } from "../workflow/entities/user-message.entity";
import { HR_MANAGED_EMPLOYEE_IDS_SQL } from "./hr-access-policy";
import { HrNotificationService } from "./hr-notification.service";
import { buildHrSensitiveReadAuditInput } from "./hr-sensitive-read-audit";
import type { HrEmployeeReminderActionDto, HrEmployeeReminderGenerateDto, HrEmployeeReminderQueryDto } from "./dto/hr-employee-reminder.dto";

type Access = "park" | "team" | "self" | "none";
type Kind = HrEmployeeReminderGenerateDto["kind"];
type RecipientKind = HrEmployeeReminderGenerateDto["recipients"][number];
type Source = {
  employee_id: string; employee_user_id: string | null; manager_user_id: string | null;
  source_date: string | null; source_version: number; is_deleted?: boolean; employment_status?: string;
};
type Candidate = Source & { source_date: string; kind: Kind; due_date: string };
type ReminderRow = {
  id: string; employee_id: string; employee_code: string; employee_name: string; reminder_kind: Kind;
  window_days: number; due_date: string; status: string; recipient_user_id: string; recipient_kinds: RecipientKind[];
  source_date: string; source_version: number; leap_day_policy: string; cancel_reason?: string | null;
};
const READ_COLUMNS = `r.*,r.due_date::text due_date,r.source_date::text source_date,
 e.employee_code,e.full_name employee_name`;
const EMPLOYEE_JOIN = `JOIN hr_employee e ON (e.tenant_id,e.park_id,e.id)=(r.tenant_id,r.park_id,r.employee_id)`;

@Injectable()
export class HrEmployeeReminderService {
  constructor(
    private readonly db: DataSource,
    private readonly audit: AuditService,
    private readonly notifications: HrNotificationService,
    @InjectRepository(UserMessageEntity) private readonly messages: Repository<UserMessageEntity>,
    @Optional() @Inject(IDENTITY_SCOPE_PORT) private readonly identityScope?: IdentityScopePort
  ) {}

  private has(actor: JwtPrincipal, permission: string) {
    return Boolean(actor.isSuper || actor.permissions.includes("*") || actor.permissions.includes(permission));
  }
  private access(actor: JwtPrincipal): Access {
    if (this.has(actor, HR_PERMISSIONS.HR_EMPLOYEE_REMINDER_MANAGE) || this.has(actor, HR_PERMISSIONS.HR_EMPLOYEE_REMINDER_PARK_READ)) return "park";
    if (this.has(actor, HR_PERMISSIONS.HR_EMPLOYEE_REMINDER_TEAM_READ)) return "team";
    if (this.has(actor, HR_PERMISSIONS.HR_EMPLOYEE_REMINDER_SELF_READ)) return "self";
    return "none";
  }
  private require(actor: JwtPrincipal, permission: string) {
    if (!this.has(actor, permission)) throw new ForbiddenException("Employee date reminder permission is required");
  }
  private today() {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const field = (type: string) => parts.find(item => item.type === type)?.value ?? "";
    return `${field("year")}-${field("month")}-${field("day")}`;
  }
  private validDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return Number(value.slice(0, 4)) >= 1 && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  private async managedIds(manager: EntityManager, scope: TenantParkScope, userId: string) {
    const employee = (await manager.query(`SELECT id FROM hr_employee WHERE tenant_id=$1 AND park_id=$2
      AND user_id=$3 AND is_deleted=false AND employment_status IN('active','probation')`, [scope.tenantId, scope.parkId, userId]))[0] as { id?: string } | undefined;
    if (!employee?.id) return [];
    return (await manager.query(HR_MANAGED_EMPLOYEE_IDS_SQL, [scope.tenantId, scope.parkId, userId, employee.id]) as Array<{ id: string }>).map(row => row.id);
  }
  private async scopeSql(manager: EntityManager, scope: TenantParkScope, actor: JwtPrincipal, access: Access, values: unknown[]) {
    if (access === "park") return "TRUE";
    if (access === "self") {
      values.push(actor.sub);
      return `r.recipient_user_id=$${values.length} AND EXISTS(SELECT 1 FROM hr_employee bound_employee
        WHERE (bound_employee.tenant_id,bound_employee.park_id,bound_employee.id)=(r.tenant_id,r.park_id,r.employee_id)
        AND bound_employee.user_id=$${values.length})`;
    }
    if (access === "team") {
      values.push(await this.managedIds(manager, scope, actor.sub));
      const index = values.length;
      values.push(actor.sub);
      return `r.employee_id=ANY($${index}::uuid[]) AND r.recipient_user_id=$${values.length}`;
    }
    return "FALSE";
  }
  private occurrence(source: string, year: number, policy: HrEmployeeReminderGenerateDto["leapDayPolicy"]) {
    const monthDay = source.slice(5);
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    if (monthDay === "02-29" && !leapYear) return policy === "skip" ? null : `${year}-${policy === "feb_28" ? "02-28" : "03-01"}`;
    return `${year}-${monthDay}`;
  }
  private addDays(date: string, days: number) {
    const value = new Date(`${date}T00:00:00Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
  }
  private async sources(manager: EntityManager, scope: TenantParkScope, kind: Kind, activeOnly = true) {
    return manager.query(`SELECT e.id employee_id,e.user_id employee_user_id,leader.user_id manager_user_id,
      ${kind === "birthday" ? "p.date_of_birth" : "e.hire_date"}::text source_date,
      ${kind === "birthday" ? "p.version" : "e.version"} source_version,e.is_deleted,e.employment_status
      FROM hr_employee e LEFT JOIN hr_employee_profile p ON p.employee_id=e.id AND p.tenant_id=e.tenant_id
        AND p.park_id=e.park_id AND p.is_deleted=false
      LEFT JOIN hr_employee leader ON leader.id=e.manager_employee_id AND leader.tenant_id=e.tenant_id
        AND leader.park_id=e.park_id AND leader.is_deleted=false AND leader.employment_status IN('active','probation')
      WHERE e.tenant_id=$1 AND e.park_id=$2 ${activeOnly ? "AND e.is_deleted=false AND e.employment_status IN('active','probation')" : ""}`,
    [scope.tenantId, scope.parkId]) as Promise<Source[]>;
  }
  private async candidates(manager: EntityManager, scope: TenantParkScope, input: HrEmployeeReminderGenerateDto) {
    const date = input.businessDate ?? this.today();
    if (!this.validDate(date)) throw new ConflictException("businessDate must be a calendar date");
    const rows = await this.sources(manager, scope, input.kind);
    const end = this.addDays(date, input.windowDays), year = Number(date.slice(0, 4)), result: Candidate[] = [];
    for (const row of rows) {
      if (!row.source_date || (input.kind === "birthday" && row.source_date > date)) continue;
      for (const occurrenceYear of [year, year + 1]) {
        const dueDate = this.occurrence(row.source_date, occurrenceYear, input.leapDayPolicy);
        if (!dueDate || dueDate < date || dueDate > end) continue;
        if (input.kind === "hire_anniversary" && Number(row.source_date.slice(0, 4)) >= occurrenceYear) continue;
        result.push({ ...row, source_date: row.source_date, kind: input.kind, due_date: dueDate });
      }
    }
    return result;
  }

  async preview(scope: TenantParkScope, actor: JwtPrincipal, input: HrEmployeeReminderGenerateDto) {
    this.require(actor, HR_PERMISSIONS.HR_EMPLOYEE_REMINDER_RUN);
    return this.db.transaction(async manager => {
      const matched = await this.candidates(manager, scope, input);
      const missing = await this.db.query(`SELECT count(*)::int n FROM hr_employee e LEFT JOIN hr_employee_profile p
        ON p.employee_id=e.id AND p.tenant_id=e.tenant_id AND p.park_id=e.park_id AND p.is_deleted=false
        WHERE e.tenant_id=$1 AND e.park_id=$2 AND e.is_deleted=false AND e.employment_status IN('active','probation')
        AND ${input.kind === "birthday" ? "p.date_of_birth IS NULL" : "e.hire_date IS NULL"}`, [scope.tenantId, scope.parkId]);
      let noRecipient = 0;
      for (const row of matched) if (!(await this.recipients(manager, scope, row, input.recipients)).length) noRecipient++;
      return { businessDate: input.businessDate ?? this.today(), matched: matched.length, missingDate: Number(missing[0]?.n ?? 0), noRecipient, leapDayPolicy: input.leapDayPolicy };
    });
  }

  private messageProjection(row: UserMessageEntity) {
    return { id: row.id, sourceId: row.sourceId, title: row.title, content: row.content, targetUrl: row.targetUrl, readAt: row.readAt, createTime: row.createTime };
  }
  async messagesForActor(scope: TenantParkScope, actor: JwtPrincipal, query: WorkflowMessageQueryDto) {
    if (this.access(actor) === "none") throw new ForbiddenException("Employee date reminder permission is required");
    const where = { tenantId: scope.tenantId, parkId: scope.parkId, recipientId: actor.sub, sourceType: "hr_employee_date_reminder", isDeleted: false, archivedAt: IsNull(),
      ...(query.read_status === "read" ? { readAt: Not(IsNull()) } : query.read_status === "unread" ? { readAt: IsNull() } : {}) };
    const [items, total] = await this.messages.findAndCount({ where, order: { createTime: "DESC", id: "DESC" }, skip: (query.page - 1) * query.page_size, take: query.page_size });
    return { items: items.map(row => this.messageProjection(row)), total, page: query.page, page_size: query.page_size };
  }
  async markMessageRead(scope: TenantParkScope, actor: JwtPrincipal, id: string) {
    if (this.access(actor) === "none") throw new ForbiddenException("Employee date reminder permission is required");
    const row = await this.messages.findOne({ where: { id, tenantId: scope.tenantId, parkId: scope.parkId, recipientId: actor.sub, sourceType: "hr_employee_date_reminder", isDeleted: false, archivedAt: IsNull() } });
    if (!row) throw new NotFoundException("Message not found");
    if (!row.readAt) {
      row.readAt = new Date(); row.updateBy = actor.sub;
      await this.messages.save(row);
    }
    return this.messageProjection(row);
  }
  // Lock source rows before checking dates and committing reminders; the separate
  // employee/profile writers already lock these same rows when applying edits.
  private async lockSources(manager: EntityManager, scope: TenantParkScope) {
    await manager.query("SELECT id FROM hr_employee WHERE tenant_id=$1 AND park_id=$2 ORDER BY id FOR SHARE", [scope.tenantId, scope.parkId]);
    await manager.query("SELECT id FROM hr_employee_profile WHERE tenant_id=$1 AND park_id=$2 ORDER BY id FOR SHARE", [scope.tenantId, scope.parkId]);
  }
  async generate(scope: TenantParkScope, actor: JwtPrincipal, input: HrEmployeeReminderGenerateDto) {
    this.require(actor, HR_PERMISSIONS.HR_EMPLOYEE_REMINDER_RUN);
    return this.db.transaction(async manager => {
      await this.lockSources(manager, scope);
      const candidates = await this.candidates(manager, scope, input);
      let created = 0, skippedNoRecipient = 0;
      for (const candidate of candidates) {
        const recipients = await this.recipients(manager, scope, candidate, input.recipients);
        if (!recipients.length) { skippedNoRecipient++; continue; }
        for (const recipient of recipients) {
          const key = createHash("sha256").update([scope.tenantId, scope.parkId, candidate.employee_id, candidate.kind, candidate.due_date, recipient.id].join("|")).digest("hex");
          const rows = await manager.query(`INSERT INTO hr_employee_date_reminder
            (tenant_id,park_id,employee_id,reminder_kind,window_days,due_date,recipient_user_id,source_date,source_version,leap_day_policy,dedupe_key,recipient_kinds,create_by,update_by)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)
            ON CONFLICT(tenant_id,park_id,dedupe_key) DO NOTHING RETURNING id`,
          [scope.tenantId, scope.parkId, candidate.employee_id, candidate.kind, input.windowDays, candidate.due_date, recipient.id, candidate.source_date, candidate.source_version, input.leapDayPolicy, key, recipient.kinds, actor.sub]) as Array<{ id: string }>;
          if (!rows[0]?.id) continue;
          created++;
          await this.notifications.publishEmployeeDateReminder(scope, actor, { reminderId: rows[0].id, recipientUserId: recipient.id, kind: candidate.kind, dueDate: candidate.due_date }, manager);
        }
      }
      await this.auditRequired(manager, scope, actor, "生成员工重要日期提醒", null, "park", created, true);
      return { created, matched: candidates.length, skippedNoRecipient };
    });
  }

  private async capableUsers(manager: EntityManager, scope: TenantParkScope, permissions: string[], userId?: string) {
    return manager.query(`SELECT DISTINCT u.id FROM sys_user u
      JOIN rel_user_role ur ON ur.user_id=u.id AND ur.tenant_id=u.tenant_id AND ur.park_id=$2 AND ur.is_deleted=false
      JOIN sys_role role ON role.id=ur.role_id AND role.tenant_id=ur.tenant_id AND (role.role_scope='tenant' OR role.park_id=$2)
        AND role.is_deleted=false AND role.is_enabled=true AND role.status='enabled'
      JOIN rel_role_perm rp ON rp.role_id=role.id AND rp.tenant_id=role.tenant_id AND rp.park_id=$2 AND rp.is_deleted=false
      JOIN sys_permission p ON p.id=rp.permission_id AND p.tenant_id=rp.tenant_id
        AND p.is_deleted=false AND p.is_enabled=true AND p.status='enabled'
      WHERE u.tenant_id=$1 AND ${activeUserStorageScopePredicate(this.identityScope, "u", 2)}
        AND u.is_enabled=true AND u.status='enabled' AND u.is_deleted=false AND p.code=ANY($3::text[])
        ${userId ? "AND u.id=$4" : ""}`, [scope.tenantId, scope.parkId, [...permissions, "*"], ...(userId ? [userId] : [])]) as Promise<Array<{ id: string }>>;
  }
  private async recipients(manager: EntityManager, scope: TenantParkScope, source: Source, requested: RecipientKind[]) {
    const result = new Map<string, RecipientKind[]>();
    const add = (id: string, kind: RecipientKind) => { if (id) result.set(id, [...(result.get(id) ?? []), kind]); };
    if (requested.includes("employee") && source.employee_user_id) {
      const users = await this.capableUsers(manager, scope, [HR_PERMISSIONS.HR_EMPLOYEE_REMINDER_SELF_READ], source.employee_user_id);
      if (users.some(row => row.id === source.employee_user_id)) add(source.employee_user_id, "employee");
    }
    if (requested.includes("manager") && source.manager_user_id) {
      const users = await this.capableUsers(manager, scope, [HR_PERMISSIONS.HR_EMPLOYEE_REMINDER_TEAM_READ], source.manager_user_id);
      if (users.some(row => row.id === source.manager_user_id) && (await this.managedIds(manager, scope, source.manager_user_id)).includes(source.employee_id)) add(source.manager_user_id, "manager");
    }
    if (requested.includes("hr")) {
      for (const row of await this.capableUsers(manager, scope, [HR_PERMISSIONS.HR_EMPLOYEE_REMINDER_PARK_READ, HR_PERMISSIONS.HR_EMPLOYEE_REMINDER_MANAGE])) add(row.id, "hr");
    }
    return [...result].map(([id, kinds]) => ({ id, kinds }));
  }

  private async invalidate(manager: EntityManager, scope: TenantParkScope, actor: JwtPrincipal, access: Access) {
    // Deterministic row locks serialize read-triggered cancellations with actions.
    // Self/team reads may invalidate only their own recipient history.
    const rows = await manager.query(`SELECT r.*,r.source_date::text source_date FROM hr_employee_date_reminder r WHERE r.tenant_id=$1 AND r.park_id=$2
      AND r.status IN('open','read','acknowledged') AND ($3::boolean OR r.recipient_user_id=$4) ORDER BY r.id FOR UPDATE`,
    [scope.tenantId, scope.parkId, access === "park", actor.sub]) as ReminderRow[];
    if (!rows.length) return;
    await this.lockSources(manager, scope);
    const sources = new Map<Kind, Map<string, Source>>();
    for (const kind of new Set(rows.map(row => row.reminder_kind))) sources.set(kind, new Map((await this.sources(manager, scope, kind, false)).map(row => [row.employee_id, row])));
    for (const row of rows) {
      const source = sources.get(row.reminder_kind)?.get(row.employee_id);
      const date = typeof row.source_date === "string" ? row.source_date : new Date(row.source_date).toISOString().slice(0, 10);
      const validSource = source && !source.is_deleted && ["active", "probation"].includes(source.employment_status ?? "") && source.source_date === date;
      const recipients = validSource ? await this.recipients(manager, scope, source, row.recipient_kinds) : [];
      if (recipients.some(recipient => recipient.id === row.recipient_user_id)) continue;
      await manager.query(`UPDATE hr_employee_date_reminder SET status='cancelled',cancelled_at=now(),
        cancel_reason='SOURCE_OR_SCOPE_CHANGED',update_by=$2,update_time=now(),version=version+1 WHERE id=$1`, [row.id, actor.sub]);
      await this.appendAction(manager, scope, actor, row.id, "cancel");
      await this.auditRequired(manager, scope, actor, "失效员工重要日期提醒", row.id, access, 1, true);
    }
  }
  private project(row: ReminderRow) {
    return { id: row.id, employeeId: row.employee_id, employeeCode: row.employee_code, employeeName: row.employee_name, kind: row.reminder_kind,
      windowDays: Number(row.window_days), dueDate: row.due_date, status: row.status, leapDayPolicy: row.leap_day_policy, cancelReason: row.cancel_reason ?? null };
  }
  async list(scope: TenantParkScope, actor: JwtPrincipal, query: HrEmployeeReminderQueryDto) {
    const access = this.access(actor);
    if (access === "none") return { items: [], total: 0, page: query.page, page_size: query.page_size };
    return this.db.transaction(async manager => {
      await this.invalidate(manager, scope, actor, access);
      const values: unknown[] = [scope.tenantId, scope.parkId], where = ["r.tenant_id=$1", "r.park_id=$2", await this.scopeSql(manager, scope, actor, access, values)];
      if (query.status) { values.push(query.status); where.push(`r.status=$${values.length}`); }
      if (query.kind) { values.push(query.kind); where.push(`r.reminder_kind=$${values.length}`); }
      if (query.window_days !== undefined) { values.push(query.window_days); where.push(`r.window_days=$${values.length}`); }
      const total = Number((await manager.query(`SELECT count(*)::int n FROM hr_employee_date_reminder r WHERE ${where.join(" AND ")}`, values))[0]?.n ?? 0);
      values.push(query.page_size, (query.page - 1) * query.page_size);
      const rows = await manager.query(`SELECT ${READ_COLUMNS} FROM hr_employee_date_reminder r ${EMPLOYEE_JOIN}
        WHERE ${where.join(" AND ")} ORDER BY r.due_date,r.id LIMIT $${values.length - 1} OFFSET $${values.length}`, values) as ReminderRow[];
      await this.auditRequired(manager, scope, actor, "读取员工重要日期提醒", null, access, rows.length);
      return { items: rows.map(row => this.project(row)), total, page: query.page, page_size: query.page_size };
    });
  }
  async detail(scope: TenantParkScope, actor: JwtPrincipal, id: string) {
    const access = this.access(actor);
    if (access === "none") throw new NotFoundException("Employee date reminder not found");
    return this.db.transaction(async manager => {
      await this.invalidate(manager, scope, actor, access);
      const values: unknown[] = [scope.tenantId, scope.parkId, id], predicate = await this.scopeSql(manager, scope, actor, access, values);
      const row = (await manager.query(`SELECT ${READ_COLUMNS} FROM hr_employee_date_reminder r ${EMPLOYEE_JOIN}
        WHERE r.tenant_id=$1 AND r.park_id=$2 AND r.id=$3 AND ${predicate}`, values))[0] as ReminderRow | undefined;
      if (!row) throw new NotFoundException("Employee date reminder not found");
      const actions = await manager.query(`SELECT sequence_no sequence,action,actor_user_id "actorUserId",occurred_at "occurredAt"
        FROM hr_employee_date_reminder_action WHERE tenant_id=$1 AND park_id=$2 AND reminder_id=$3 ORDER BY sequence_no`, [scope.tenantId, scope.parkId, id]);
      await this.auditRequired(manager, scope, actor, "读取员工重要日期提醒详情", id, access, 1);
      return { ...this.project(row), actions };
    });
  }
  private async appendAction(manager: EntityManager, scope: TenantParkScope, actor: JwtPrincipal, id: string, action: HrEmployeeReminderActionDto["action"], comment?: string) {
    await manager.query(`INSERT INTO hr_employee_date_reminder_action(tenant_id,park_id,reminder_id,sequence_no,action,actor_user_id,comment_digest)
      SELECT $1::varchar(64),$2::varchar(64),$3::uuid,COALESCE(max(sequence_no),0)+1,$4::varchar(32),$5::uuid,$6::char(64) FROM hr_employee_date_reminder_action
      WHERE tenant_id=$1 AND park_id=$2 AND reminder_id=$3`, [scope.tenantId, scope.parkId, id, action, actor.sub, comment ? createHash("sha256").update(comment).digest("hex") : null]);
  }
  async action(scope: TenantParkScope, actor: JwtPrincipal, id: string, input: HrEmployeeReminderActionDto) {
    const manage = input.action === "resolve" || input.action === "cancel";
    this.require(actor, manage ? HR_PERMISSIONS.HR_EMPLOYEE_REMINDER_MANAGE : HR_PERMISSIONS.HR_EMPLOYEE_REMINDER_ACK);
    const access = this.access(actor);
    if (access === "none") throw new NotFoundException("Employee date reminder not found");
    const result = await this.db.transaction(async manager => {
      await this.invalidate(manager, scope, actor, manage ? "park" : access);
      const values: unknown[] = [scope.tenantId, scope.parkId, id], predicate = await this.scopeSql(manager, scope, actor, manage ? "park" : access, values);
      const row = (await manager.query(`SELECT r.* FROM hr_employee_date_reminder r WHERE r.tenant_id=$1 AND r.park_id=$2 AND r.id=$3 AND ${predicate} FOR UPDATE`, values))[0] as ReminderRow | undefined;
      if (!row) throw new NotFoundException("Employee date reminder not found");
      const allowed: Record<string, string[]> = { read: ["open"], acknowledge: ["open", "read"], resolve: ["acknowledged"], cancel: ["open", "read", "acknowledged"] };
      if (!allowed[input.action]!.includes(row.status)) return null;
      const status = { read: "read", acknowledge: "acknowledged", resolve: "resolved", cancel: "cancelled" }[input.action];
      await manager.query(`UPDATE hr_employee_date_reminder SET status=$1::varchar(32),read_at=CASE WHEN $1::varchar(32) IN('read','acknowledged') THEN COALESCE(read_at,now()) ELSE read_at END,
        acknowledged_at=CASE WHEN $1='acknowledged' THEN now() ELSE acknowledged_at END,resolved_at=CASE WHEN $1='resolved' THEN now() ELSE resolved_at END,
        cancelled_at=CASE WHEN $1='cancelled' THEN now() ELSE cancelled_at END,cancel_reason=CASE WHEN $1='cancelled' THEN 'MANUAL_CANCELLED' ELSE cancel_reason END,
        update_by=$2,update_time=now(),version=version+1 WHERE id=$3`, [status, actor.sub, id]);
      await this.appendAction(manager, scope, actor, id, input.action, input.comment);
      await this.auditRequired(manager, scope, actor, "办理员工重要日期提醒", id, manage ? "park" : access, 1, true);
      return { id, status };
    });
    if (!result) throw new ConflictException("Employee date reminder action is not allowed from current status");
    return result;
  }
  private auditRequired(manager: EntityManager, scope: TenantParkScope, actor: JwtPrincipal, action: string, bizId: string | null, projection: Access, itemCount: number, write = false) {
    const input = buildHrSensitiveReadAuditInput(scope, actor, { resource: "hr.employee_reminder", action, bizType: "hr_employee_date_reminder", bizId,
      path: "/hr/employee-reminders", fieldGroups: ["identity"], projection: projection === "team" ? "team" : projection === "park" ? "park" : "self", itemCount });
    if (write) input.method = "POST";
    return this.audit.recordOperationRequired(input, manager);
  }
}
