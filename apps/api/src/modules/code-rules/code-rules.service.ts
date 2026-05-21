import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, type EntityManager, type Repository } from "typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import type { PaginationQueryDto } from "../../shared/dto/pagination-query.dto";
import { CODE_RULE_ENTITY_TYPES, type CodeRuleEntityType, type CreateCodeRuleDto } from "./dto/create-code-rule.dto";
import type { UpdateCodeRuleDto } from "./dto/update-code-rule.dto";
import { CodeRuleEntity } from "./entities/code-rule.entity";

@Injectable()
export class CodeRulesService {
  constructor(
    @InjectRepository(CodeRuleEntity)
    private readonly codeRuleRepository: Repository<CodeRuleEntity>,
    private readonly dataSource: DataSource
  ) {}

  async list(scope: TenantParkScope, query: PaginationQueryDto): Promise<PaginatedResult<CodeRuleEntity>> {
    const builder = this.codeRuleRepository
      .createQueryBuilder("rule")
      .where("rule.tenantId = :tenantId", { tenantId: scope.tenantId })
      .andWhere("rule.parkId = :parkId", { parkId: scope.parkId })
      .andWhere("rule.isDeleted = false");

    if (query.status) {
      builder.andWhere("rule.status = :status", { status: query.status });
    }
    if (query.keyword) {
      builder.andWhere("(rule.ruleCode ILIKE :keyword OR rule.ruleName ILIKE :keyword OR rule.targetEntity ILIKE :keyword OR rule.entityType ILIKE :keyword)", {
        keyword: `%${query.keyword}%`
      });
    }

    const [items, total] = await builder
      .orderBy("rule.createTime", "DESC")
      .skip((query.page - 1) * query.page_size)
      .take(query.page_size)
      .getManyAndCount();
    return { items, total, page: query.page, page_size: query.page_size };
  }

  async create(scope: TenantParkScope, actorId: string, dto: CreateCodeRuleDto): Promise<CodeRuleEntity> {
    const entityType = this.resolveEntityType(dto.entityType ?? dto.targetEntity);
    const ruleCode = dto.ruleCode ?? `${entityType.toUpperCase()}_CODE`;
    await this.assertRuleCodeAvailable(scope, ruleCode);
    await this.assertEntityTypeAvailable(scope, entityType);
    const resetPolicy = dto.resetPolicy ?? dto.resetStrategy ?? "none";
    const sequenceLength = dto.sequenceLength ?? this.resolveSequenceLength(dto.pattern) ?? 6;
    const entity = this.codeRuleRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      entityType,
      ruleCode,
      ruleName: dto.ruleName ?? `${entityType} 编码规则`,
      targetModule: dto.targetModule ?? this.resolveTargetModule(entityType),
      targetEntity: dto.targetEntity ?? entityType,
      prefix: dto.prefix,
      pattern: dto.pattern ?? "{PREFIX}{SEQ:6}",
      datePattern: dto.datePattern ?? "yyyyMMdd",
      sequenceLength,
      currentSeq: 0,
      currentSequence: 0,
      resetPolicy,
      resetStrategy: resetPolicy,
      separator: dto.separator ?? "",
      sampleCode: null,
      exampleCode: null,
      status: dto.status ?? "enabled",
      remark: dto.remark ?? null,
      createBy: actorId,
      updateBy: actorId
    });
    entity.exampleCode = this.buildCode(entity, 1, new Date());
    entity.sampleCode = entity.exampleCode;
    return this.codeRuleRepository.save(entity);
  }

  async detail(scope: TenantParkScope, id: string): Promise<CodeRuleEntity> {
    const entity = await this.codeRuleRepository.findOne({
      where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    if (!entity) {
      throw new NotFoundException("Code rule not found");
    }
    return entity;
  }

  async update(scope: TenantParkScope, actorId: string, id: string, dto: UpdateCodeRuleDto): Promise<CodeRuleEntity> {
    const entity = await this.detail(scope, id);
    if (dto.ruleCode && dto.ruleCode !== entity.ruleCode) {
      await this.assertRuleCodeAvailable(scope, dto.ruleCode);
    }
    if (dto.entityType && dto.entityType !== entity.entityType) {
      await this.assertEntityTypeAvailable(scope, dto.entityType);
    }
    const entityType = dto.entityType ?? entity.entityType ?? this.resolveEntityType(dto.targetEntity ?? entity.targetEntity);
    const resetPolicy = dto.resetPolicy ?? dto.resetStrategy ?? entity.resetPolicy ?? entity.resetStrategy;
    Object.assign(entity, {
      entityType,
      ruleCode: dto.ruleCode ?? entity.ruleCode,
      ruleName: dto.ruleName ?? entity.ruleName,
      targetModule: dto.targetModule ?? entity.targetModule ?? this.resolveTargetModule(entityType),
      targetEntity: dto.targetEntity ?? entity.targetEntity ?? entityType,
      prefix: dto.prefix ?? entity.prefix,
      pattern: dto.pattern ?? entity.pattern,
      datePattern: dto.datePattern === undefined ? entity.datePattern : dto.datePattern,
      sequenceLength: dto.sequenceLength ?? entity.sequenceLength,
      resetPolicy,
      resetStrategy: resetPolicy,
      separator: dto.separator ?? entity.separator,
      status: dto.status ?? entity.status,
      remark: dto.remark === undefined ? entity.remark : dto.remark,
      updateBy: actorId
    });
    entity.exampleCode = this.buildCode(entity, this.currentSequence(entity) + 1, new Date());
    entity.sampleCode = entity.exampleCode;
    return this.codeRuleRepository.save(entity);
  }

  async softDelete(scope: TenantParkScope, actorId: string, id: string): Promise<{ id: string }> {
    const entity = await this.detail(scope, id);
    entity.isDeleted = true;
    entity.updateBy = actorId;
    await this.codeRuleRepository.save(entity);
    return { id };
  }

  async preview(scope: TenantParkScope, id: string): Promise<{ rule_code: string; sample_code: string }> {
    const entity = await this.detail(scope, id);
    return { rule_code: entity.ruleCode, sample_code: this.buildCode(entity, this.currentSequence(entity) + 1, new Date()) };
  }

  async generateNext(scope: TenantParkScope, actorId: string, ruleCode: string): Promise<{ rule_code: string; code: string; sequence: number }> {
    return this.dataSource.transaction((manager) => this.generateByRuleCodeInTransaction(manager, scope, actorId, ruleCode));
  }

  async previewNextCode(entityType: string, tenantId: string, parkId: string): Promise<{ entity_type: string; code: string; sequence: number }> {
    const normalizedEntityType = this.resolveEntityType(entityType);
    const entity = await this.codeRuleRepository.findOne({
      where: { tenantId, parkId, entityType: normalizedEntityType, isDeleted: false, status: "enabled" }
    });
    if (!entity) {
      throw new NotFoundException("Enabled code rule not found");
    }
    const now = new Date();
    const nextSequence = this.shouldReset(entity, now) ? 1 : this.currentSequence(entity) + 1;
    return { entity_type: normalizedEntityType, code: this.buildCode(entity, nextSequence, now), sequence: nextSequence };
  }

  async generateCode(entityType: string, tenantId: string, parkId: string, actorId: string | null = null): Promise<{ entity_type: string; code: string; sequence: number }> {
    const normalizedEntityType = this.resolveEntityType(entityType);
    return this.dataSource.transaction(async (manager) => {
      const entity = await this.findEnabledRuleForEntityType(manager, tenantId, parkId, normalizedEntityType);
      const now = new Date();
      const nextSequence = this.shouldReset(entity, now) ? 1 : this.currentSequence(entity) + 1;
      entity.currentSeq = nextSequence;
      entity.currentSequence = nextSequence;
      entity.nextResetTime = this.resolveNextResetTime(entity, now);
      entity.exampleCode = this.buildCode(entity, nextSequence + 1, now);
      entity.sampleCode = entity.exampleCode;
      entity.updateBy = actorId;
      await manager.getRepository(CodeRuleEntity).save(entity);
      return { entity_type: normalizedEntityType, code: this.buildCode(entity, nextSequence, now), sequence: nextSequence };
    });
  }

  async resetCodeRule(entityType: string, tenantId: string, parkId: string, actorId: string | null = null): Promise<{ entity_type: string; current_seq: number; next_code: string }> {
    const normalizedEntityType = this.resolveEntityType(entityType);
    return this.dataSource.transaction(async (manager) => {
      const entity = await this.findEnabledRuleForEntityType(manager, tenantId, parkId, normalizedEntityType);
      entity.currentSeq = 0;
      entity.currentSequence = 0;
      entity.nextResetTime = this.resolveNextResetTime(entity, new Date());
      entity.exampleCode = this.buildCode(entity, 1, new Date());
      entity.sampleCode = entity.exampleCode;
      entity.updateBy = actorId;
      await manager.getRepository(CodeRuleEntity).save(entity);
      return { entity_type: normalizedEntityType, current_seq: 0, next_code: entity.exampleCode };
    });
  }

  private async generateByRuleCodeInTransaction(
    manager: EntityManager,
    scope: TenantParkScope,
    actorId: string,
    ruleCode: string
  ): Promise<{ rule_code: string; code: string; sequence: number }> {
    const entity = await manager.getRepository(CodeRuleEntity).findOne({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, ruleCode, isDeleted: false, status: "enabled" },
      lock: { mode: "pessimistic_write" }
    });
    if (!entity) {
      throw new NotFoundException("Enabled code rule not found");
    }
    const now = new Date();
    const nextSequence = this.shouldReset(entity, now) ? 1 : this.currentSequence(entity) + 1;
    entity.currentSeq = nextSequence;
    entity.currentSequence = nextSequence;
    entity.nextResetTime = this.resolveNextResetTime(entity, now);
    entity.exampleCode = this.buildCode(entity, nextSequence + 1, now);
    entity.sampleCode = entity.exampleCode;
    entity.updateBy = actorId;
    await manager.getRepository(CodeRuleEntity).save(entity);
    return { rule_code: entity.ruleCode, code: this.buildCode(entity, nextSequence, now), sequence: nextSequence };
  }

  private async findEnabledRuleForEntityType(manager: EntityManager, tenantId: string, parkId: string, entityType: string): Promise<CodeRuleEntity> {
    const entity = await manager.getRepository(CodeRuleEntity).findOne({
      where: { tenantId, parkId, entityType, isDeleted: false, status: "enabled" },
      lock: { mode: "pessimistic_write" }
    });
    if (!entity) {
      throw new NotFoundException("Enabled code rule not found");
    }
    return entity;
  }

  private async assertRuleCodeAvailable(scope: TenantParkScope, ruleCode: string): Promise<void> {
    const exists = await this.codeRuleRepository.exists({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, ruleCode, isDeleted: false }
    });
    if (exists) {
      throw new ConflictException("Code rule already exists");
    }
  }

  private async assertEntityTypeAvailable(scope: TenantParkScope, entityType: string): Promise<void> {
    const exists = await this.codeRuleRepository.exists({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, entityType, isDeleted: false }
    });
    if (exists) {
      throw new ConflictException("Code rule entity type already exists");
    }
  }

  private shouldReset(entity: CodeRuleEntity, now: Date): boolean {
    const policy = entity.resetPolicy ?? entity.resetStrategy;
    return policy !== "none" && entity.nextResetTime !== null && entity.nextResetTime.getTime() <= now.getTime();
  }

  private resolveNextResetTime(entity: CodeRuleEntity, now: Date): Date | null {
    const policy = entity.resetPolicy ?? entity.resetStrategy;
    if (policy === "none") return null;
    const next = new Date(now);
    if (policy === "yearly") {
      next.setUTCFullYear(next.getUTCFullYear() + 1, 0, 1);
    } else if (policy === "monthly") {
      next.setUTCMonth(next.getUTCMonth() + 1, 1);
    } else {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    next.setUTCHours(0, 0, 0, 0);
    return next;
  }

  private buildCode(entity: Pick<CodeRuleEntity, "prefix" | "pattern" | "datePattern" | "separator" | "sequenceLength">, sequence: number, now: Date): string {
    if (entity.pattern) {
      return entity.pattern
        .replaceAll("{PREFIX}", entity.prefix)
        .replace(/\{DATE(?::([^}]+))?\}/gu, (_, pattern: string | undefined) => this.formatDate(now, pattern ?? entity.datePattern))
        .replace(/\{SEQ(?::(\d+))?\}/gu, (_, length: string | undefined) => String(sequence).padStart(Number(length ?? entity.sequenceLength), "0"));
    }
    const parts = [entity.prefix];
    const datePart = this.formatDate(now, entity.datePattern);
    if (datePart) parts.push(datePart);
    parts.push(String(sequence).padStart(entity.sequenceLength, "0"));
    return parts.filter(Boolean).join(entity.separator ?? "");
  }

  private formatDate(date: Date, pattern: string | null): string {
    if (!pattern) return "";
    const yyyy = String(date.getUTCFullYear());
    const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(date.getUTCDate()).padStart(2, "0");
    return pattern.replace("yyyy", yyyy).replace("MM", mm).replace("dd", dd);
  }

  private currentSequence(entity: CodeRuleEntity): number {
    return Math.max(entity.currentSeq ?? 0, entity.currentSequence ?? 0);
  }

  private resolveSequenceLength(pattern: string | undefined): number | null {
    const match = pattern?.match(/\{SEQ(?::(\d+))?\}/u);
    return match?.[1] ? Number(match[1]) : null;
  }

  private resolveEntityType(entityType: string | undefined): CodeRuleEntityType {
    if (entityType && (CODE_RULE_ENTITY_TYPES as readonly string[]).includes(entityType)) {
      return entityType as CodeRuleEntityType;
    }
    throw new NotFoundException("Supported code rule entity type not found");
  }

  private resolveTargetModule(entityType: string): string {
    if (["park", "building", "floor", "room", "unit", "zone", "asset"].includes(entityType)) return "asset";
    if (["device", "camera", "iot_point"].includes(entityType)) return "iot";
    if (["robot", "cleaning_robot", "inspection_robot"].includes(entityType)) return "robot";
    if (["workorder", "workorder_log"].includes(entityType)) return "workorder";
    if (
      [
        "safety_inspect_point",
        "safety_inspect_template",
        "safety_inspect_plan",
        "safety_inspect_task",
        "safety_hazard",
        "safety_hazard_log"
      ].includes(entityType)
    ) {
      return "safety";
    }
    if (entityType === "leasing_lead") return "leasing";
    if (["contract", "contract_change", "renewal_contract", "checkout", "refund"].includes(entityType)) return "leasing";
    if (["receivable", "payment", "invoice", "waiver"].includes(entityType)) return "leasing";
    if (entityType === "bill") return "finance";
    return "system";
  }
}
