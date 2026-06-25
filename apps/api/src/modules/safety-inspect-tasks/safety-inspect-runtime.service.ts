import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { TenantParkScope } from "@jinhu/shared";
import { DataSource, Repository } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { SafetyInspectPlanEntity } from "../safety-inspect-plans/entities/safety-inspect-plan.entity";
import { SafetyActionLogEntity } from "./entities/safety-action-log.entity";
import { SafetyInspectTaskEntity } from "./entities/safety-inspect-task.entity";
import { SafetyInspectTasksService } from "./safety-inspect-tasks.service";

const SYSTEM_OPERATOR_ID = "00000000-0000-0000-0000-000000000000";
const TASK_STATUS_PENDING = "10";
const TASK_STATUS_IN_PROGRESS = "20";
const TASK_STATUS_OVERDUE = "40";
const DEFAULT_LOOKAHEAD_DAYS = 1;
const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_DUE_HOURS = 24;

export interface InspectRuntimeScanResult {
  dry_run: boolean;
  due_plan_count: number;
  generated_count: number;
  skipped_count: number;
  overdue_marked_count: number;
  errors: Array<{ plan_id?: string; message: string }>;
}

@Injectable()
export class SafetyInspectRuntimeService {
  private readonly logger = new Logger(SafetyInspectRuntimeService.name);

  constructor(
    @InjectRepository(SafetyInspectPlanEntity)
    private readonly plansRepository: Repository<SafetyInspectPlanEntity>,
    @InjectRepository(SafetyInspectTaskEntity)
    private readonly tasksRepository: Repository<SafetyInspectTaskEntity>,
    @InjectRepository(SafetyActionLogEntity)
    private readonly actionLogsRepository: Repository<SafetyActionLogEntity>,
    private readonly dataSource: DataSource,
    private readonly tasksService: SafetyInspectTasksService
  ) {}

  async runOnce(options: { dryRun?: boolean } = {}): Promise<InspectRuntimeScanResult> {
    const dryRun = options.dryRun ?? process.env.SAFETY_INSPECT_SCHEDULER_DRY_RUN === "true";
    const [generationResult, overdueMarkedCount] = await Promise.all([
      this.generateDueTasks(dryRun),
      this.markOverdueTasks(dryRun)
    ]);
    return {
      dry_run: dryRun,
      due_plan_count: generationResult.due_plan_count,
      generated_count: generationResult.generated_count,
      skipped_count: generationResult.skipped_count,
      overdue_marked_count: overdueMarkedCount,
      errors: generationResult.errors
    };
  }

  private async generateDueTasks(dryRun: boolean): Promise<Omit<InspectRuntimeScanResult, "dry_run" | "overdue_marked_count">> {
    const lookaheadDays = this.readPositiveNumber("SAFETY_INSPECT_GENERATE_LOOKAHEAD_DAYS", DEFAULT_LOOKAHEAD_DAYS);
    const batchSize = this.readPositiveNumber("SAFETY_INSPECT_SCHEDULER_BATCH_SIZE", DEFAULT_BATCH_SIZE);
    const horizon = new Date(Date.now() + lookaheadDays * 24 * 60 * 60 * 1000);
    const plans = await this.plansRepository
      .createQueryBuilder("plan")
      .where("plan.status = :status", { status: "enabled" })
      .andWhere("plan.is_deleted = false")
      .andWhere("plan.next_generate_time IS NOT NULL")
      .andWhere("plan.next_generate_time <= :horizon", { horizon })
      .orderBy("plan.next_generate_time", "ASC")
      .take(batchSize)
      .getMany();
    let generatedCount = 0;
    let skippedCount = 0;
    const errors: Array<{ plan_id?: string; message: string }> = [];

    for (const plan of plans) {
      if (!plan.nextGenerateTime) {
        continue;
      }
      if (this.isPastEndDate(plan, plan.nextGenerateTime)) {
        skippedCount += 1;
        await this.writeRuntimeLog({ tenantId: plan.tenantId, parkId: plan.parkId }, null, "skip_plan_end_date", {
          plan_id: plan.id,
          plan_code: plan.planCode,
          next_generate_time: plan.nextGenerateTime.toISOString()
        });
        continue;
      }
      const lockKey = `safety-inspect-plan:${plan.tenantId}:${plan.parkId}:${plan.id}`;
      const locked = await this.tryAdvisoryLock(lockKey);
      if (!locked) {
        skippedCount += 1;
        continue;
      }
      try {
        const scope = { tenantId: plan.tenantId, parkId: plan.parkId };
        const actor = this.systemActor(plan.tenantId, plan.parkId);
        if (dryRun) {
          skippedCount += plan.pointIds.length;
          await this.writeRuntimeLog(scope, actor, "dry_run_generate_tasks", {
            plan_id: plan.id,
            plan_code: plan.planCode,
            point_count: plan.pointIds.length,
            plan_time: plan.nextGenerateTime.toISOString()
          });
          continue;
        }
        const planTime = plan.nextGenerateTime;
        const dueTime = new Date(planTime.getTime() + DEFAULT_DUE_HOURS * 60 * 60 * 1000);
        const result = await this.tasksService.generateFromPlan(scope, actor, plan.id, {
          plan_time: planTime.toISOString(),
          due_time: dueTime.toISOString()
        });
        generatedCount += result.generated_count;
        skippedCount += result.skipped_count;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ plan_id: plan.id, message });
        this.logger.warn(`Safety inspection plan generation failed for ${plan.id}: ${message}`);
        await this.writeRuntimeLog({ tenantId: plan.tenantId, parkId: plan.parkId }, null, "generate_failed", {
          plan_id: plan.id,
          plan_code: plan.planCode,
          error: message
        });
      } finally {
        await this.releaseAdvisoryLock(lockKey);
      }
    }

    return { due_plan_count: plans.length, generated_count: generatedCount, skipped_count: skippedCount, errors };
  }

  private async markOverdueTasks(dryRun: boolean): Promise<number> {
    const batchSize = this.readPositiveNumber("SAFETY_INSPECT_SCHEDULER_BATCH_SIZE", DEFAULT_BATCH_SIZE);
    const now = new Date();
    const tasks = await this.tasksRepository
      .createQueryBuilder("task")
      .where("task.is_deleted = false")
      .andWhere("task.status IN (:...statuses)", { statuses: [TASK_STATUS_PENDING, TASK_STATUS_IN_PROGRESS] })
      .andWhere("task.due_time < :now", { now })
      .orderBy("task.due_time", "ASC")
      .take(batchSize)
      .getMany();
    if (dryRun) {
      for (const task of tasks) {
        await this.writeRuntimeLog({ tenantId: task.tenantId, parkId: task.parkId }, null, "dry_run_mark_overdue", {
          task_id: task.id,
          task_code: task.taskCode,
          due_time: task.dueTime.toISOString()
        });
      }
      return tasks.length;
    }
    for (const task of tasks) {
      const beforeStatus = task.status;
      task.status = TASK_STATUS_OVERDUE;
      task.updateBy = SYSTEM_OPERATOR_ID;
      await this.tasksRepository.manager.transaction(async (manager) => {
        await manager.getRepository(SafetyInspectTaskEntity).save(task);
        await manager.getRepository(SafetyActionLogEntity).save(
          manager.getRepository(SafetyActionLogEntity).create({
            tenantId: task.tenantId,
            parkId: task.parkId,
            bizType: "safety_inspect_task",
            bizId: task.id,
            action: "mark_overdue",
            beforeStatus,
            afterStatus: TASK_STATUS_OVERDUE,
            operatorId: SYSTEM_OPERATOR_ID,
            operatorName: "系统",
            content: "巡检 runtime 标记任务逾期",
            opTime: new Date(),
            payload: { task_code: task.taskCode, due_time: task.dueTime.toISOString() },
            createBy: SYSTEM_OPERATOR_ID,
            updateBy: SYSTEM_OPERATOR_ID
          })
        );
      });
    }
    return tasks.length;
  }

  private async writeRuntimeLog(
    scope: TenantParkScope,
    actor: JwtPrincipal | null,
    action: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    await this.actionLogsRepository.save(
      this.actionLogsRepository.create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        bizType: "safety_inspect_runtime",
        bizId: null,
        action,
        operatorId: actor?.sub ?? SYSTEM_OPERATOR_ID,
        operatorName: actor?.realName ?? "系统",
        content: "巡检 runtime 执行记录",
        opTime: new Date(),
        payload,
        createBy: actor?.sub ?? SYSTEM_OPERATOR_ID,
        updateBy: actor?.sub ?? SYSTEM_OPERATOR_ID
      })
    );
  }

  private async tryAdvisoryLock(key: string): Promise<boolean> {
    const rows = await this.dataSource.query("SELECT pg_try_advisory_lock(hashtext($1)) AS locked", [key]) as Array<{ locked: boolean }>;
    return Boolean(rows[0]?.locked);
  }

  private async releaseAdvisoryLock(key: string): Promise<void> {
    await this.dataSource.query("SELECT pg_advisory_unlock(hashtext($1))", [key]);
  }

  private isPastEndDate(plan: SafetyInspectPlanEntity, planTime: Date): boolean {
    if (!plan.endDate) {
      return false;
    }
    const endDate = new Date(`${plan.endDate}T23:59:59.999Z`);
    return planTime.getTime() > endDate.getTime();
  }

  private readPositiveNumber(key: string, fallback: number): number {
    const value = Number(process.env[key] ?? fallback);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  private systemActor(tenantId: string, parkId: string): JwtPrincipal {
    return {
      sub: SYSTEM_OPERATOR_ID,
      username: "system",
      realName: "系统",
      tenantId,
      parkId,
      roles: ["SYSTEM"],
      permissions: ["*"],
      dataScope: "all",
      isSuper: true
    };
  }
}
