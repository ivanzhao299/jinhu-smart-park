import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { type Repository } from "typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import { FieldPolicyService } from "../field-policies/field-policy.service";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { SceneExecutionLogQueryDto, TriggerSceneDto } from "./dto/scene.dto";
import { SceneExecutionLogEntity } from "./entities/scene-execution-log.entity";
import type { SceneInstanceEntity } from "./entities/scene-instance.entity";
import { IotRuleEngineService, type IotRuleExecutionLogView, type IotRuleTriggerPayload } from "./iot-rule-engine.service";
import { SceneInstancesService } from "./scene-instances.service";
import { UnifiedActionExecutorService } from "./unified-action-executor.service";

const SCENE_LOG_ENTITY = "scene_execution_log";

export interface SceneExecutionLogView {
  id: string;
  tenantId: string;
  parkId: string;
  sceneInstanceId: string;
  triggerType: string;
  triggerPayload: Record<string, unknown>;
  executionStatus: string;
  actionResultJson: Array<Record<string, unknown>>;
  errorMessage: string | null;
  executedBy: string | null;
  executedAt: Date;
  createTime: Date;
}

@Injectable()
export class SceneExecutionService {
  constructor(
    @InjectRepository(SceneExecutionLogEntity)
    private readonly logRepository: Repository<SceneExecutionLogEntity>,
    private readonly sceneInstancesService: SceneInstancesService,
    private readonly ruleEngineService: IotRuleEngineService,
    private readonly unifiedActionExecutor: UnifiedActionExecutorService,
    private readonly fieldPolicyService: FieldPolicyService
  ) {}

  async trigger(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: TriggerSceneDto): Promise<SceneExecutionLogView> {
    const scene = await this.sceneInstancesService.findInstance(scope, id, actor);
    if (scene.status !== "ENABLED") throw new BadRequestException("场景未启用，不能触发");
    return this.executeScene(scope, scene, actor, {
      triggerType: dto.trigger_type ?? "MANUAL",
      payload: {
        ...(scene.triggerConfigJson ?? {}),
        ...(dto.trigger_payload ?? {}),
        scene_instance_id: scene.id,
        scene_name: scene.sceneName,
        manual_trigger: true,
        trigger_reason: dto.reason ?? null,
        trigger_time: new Date().toISOString()
      },
      runLinkedRule: true
    });
  }

  async triggerAutomationsForRuleLogs(
    scope: TenantParkScope,
    ruleLogs: IotRuleExecutionLogView[],
    triggerType: "METRIC" | "STATUS" | "ALERT",
    triggerPayload: IotRuleTriggerPayload,
    actor?: JwtPrincipal
  ): Promise<SceneExecutionLogView[]> {
    const sceneLogs: SceneExecutionLogView[] = [];
    for (const ruleLog of ruleLogs) {
      if (ruleLog.executionStatus !== "SUCCESS") continue;
      const scenes = await this.sceneInstancesService.findEnabledAutomationsForRule(scope, ruleLog.ruleId);
      for (const scene of scenes) {
        const sceneLog = await this.executeScene(scope, scene, actor, {
          triggerType,
          payload: {
            ...(scene.triggerConfigJson ?? {}),
            ...triggerPayload,
            scene_instance_id: scene.id,
            scene_name: scene.sceneName,
            auto_trigger: true,
            linked_rule_id: ruleLog.ruleId,
            linked_rule_log_id: ruleLog.id,
            trigger_time: new Date().toISOString()
          },
          runLinkedRule: false,
          linkedRuleLog: ruleLog
        });
        sceneLogs.push(sceneLog);
      }
    }
    return sceneLogs;
  }

  private async executeScene(
    scope: TenantParkScope,
    scene: SceneInstanceEntity,
    actor: JwtPrincipal | undefined,
    options: {
      triggerType: string;
      payload: Record<string, unknown>;
      runLinkedRule: boolean;
      linkedRuleLog?: IotRuleExecutionLogView;
    }
  ): Promise<SceneExecutionLogView> {
    const payload = this.redactPayload({
      ...options.payload,
      scene_instance_id: scene.id,
      scene_name: scene.sceneName
    });
    const actionResults: Array<Record<string, unknown>> = [];
    let errorMessage: string | null = null;

    if (options.linkedRuleLog) {
      actionResults.push({
        type: "LINKED_RULE",
        status: options.linkedRuleLog.executionStatus,
        rule_log_id: options.linkedRuleLog.id,
        error_message: options.linkedRuleLog.errorMessage
      });
    } else if (options.runLinkedRule && scene.linkedRuleId && actor) {
      const ruleLog = await this.ruleEngineService.test(scope, actor, scene.linkedRuleId, { trigger_payload: payload });
      actionResults.push({
        type: "LINKED_RULE",
        status: ruleLog.executionStatus,
        rule_log_id: ruleLog.id,
        error_message: ruleLog.errorMessage
      });
    }

    for (const action of scene.actionConfigJson ?? []) {
      const unifiedResult = await this.unifiedActionExecutor.executeAction(
        {
          source_type: "IOT_SCENE",
          source_id: scene.id,
          tenant_id: scope.tenantId,
          park_id: scope.parkId,
          actor_user_id: actor?.sub ?? null,
          action_type: this.readActionType(action),
          action_payload: action,
          context_payload: payload
        },
        actor
      );
      actionResults.push(this.unifiedActionExecutor.toLegacyActionResult(unifiedResult));
    }

    const executionStatus = this.unifiedActionExecutor.resolveAggregateStatus(actionResults);
    if (executionStatus === "FAILED") errorMessage = "场景动作全部执行失败或配置无有效动作";
    if (executionStatus === "PARTIAL_SUCCESS") errorMessage = "场景部分动作执行失败，请查看动作结果";

    const log = this.logRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      sceneInstanceId: scene.id,
      triggerType: options.triggerType,
      triggerPayload: payload,
      executionStatus,
      actionResultJson: actionResults,
      errorMessage,
      executedBy: actor?.sub ?? null,
      executedAt: new Date(),
      createBy: actor?.sub ?? null,
      updateBy: actor?.sub ?? null
    });
    const saved = await this.logRepository.save(log);
    await this.sceneInstancesService.touchTriggered(scene, actor);
    return this.toSecuredView(scope, actor, saved);
  }

  async logs(
    scope: TenantParkScope,
    actor: JwtPrincipal | undefined,
    instanceId: string,
    query: SceneExecutionLogQueryDto
  ): Promise<PaginatedResult<SceneExecutionLogView>> {
    await this.sceneInstancesService.findInstance(scope, instanceId, actor);
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 50;
    const builder = this.logRepository
      .createQueryBuilder("log")
      .where("log.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("log.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("log.scene_instance_id = :instanceId", { instanceId })
      .andWhere("log.is_deleted = false");
    if (query.execution_status) builder.andWhere("log.execution_status = :status", { status: query.execution_status });
    if (query.trigger_type) builder.andWhere("log.trigger_type = :triggerType", { triggerType: query.trigger_type });
    const sort = query.sort;
    const [field, direction] = sort?.startsWith("-") ? [sort.slice(1), "DESC"] : [sort ?? "executed_at", sort ? "ASC" : "DESC"];
    const sortMap: Record<string, string> = {
      executed_at: "log.executedAt",
      trigger_type: "log.triggerType",
      execution_status: "log.executionStatus",
      create_time: "log.createTime"
    };
    builder.orderBy(sortMap[field] ?? "log.executedAt", direction as "ASC" | "DESC").addOrderBy("log.createTime", "DESC");
    const [items, total] = await builder.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    const views = items.map((item) => this.toView(item));
    const securedItems = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "iot", SCENE_LOG_ENTITY, views);
    return { items: securedItems, total, page, page_size: pageSize };
  }

  private async toSecuredView(scope: TenantParkScope, actor: JwtPrincipal | undefined, entity: SceneExecutionLogEntity): Promise<SceneExecutionLogView> {
    const view = this.toView(entity);
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "iot", SCENE_LOG_ENTITY, view);
  }

  private toView(entity: SceneExecutionLogEntity): SceneExecutionLogView {
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      parkId: entity.parkId,
      sceneInstanceId: entity.sceneInstanceId,
      triggerType: entity.triggerType,
      triggerPayload: entity.triggerPayload ?? {},
      executionStatus: entity.executionStatus,
      actionResultJson: entity.actionResultJson ?? [],
      errorMessage: entity.errorMessage,
      executedBy: entity.executedBy,
      executedAt: entity.executedAt,
      createTime: entity.createTime
    };
  }

  private readActionType(action: Record<string, unknown>): string {
    const value = action.type ?? action.action_type ?? action.actionType;
    return typeof value === "string" ? value.trim().toUpperCase() : "";
  }

  private redactPayload(payload: Record<string, unknown>): Record<string, unknown> {
    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload)) {
      if (/password|secret|token|key/i.test(key)) {
        redacted[key] = "***";
      } else {
        redacted[key] = value;
      }
    }
    return redacted;
  }
}
