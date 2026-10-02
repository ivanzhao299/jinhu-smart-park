import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import type { TenantParkScope } from "@jinhu/shared";
import { CanteenSettingEntity } from "./entities/canteen-setting.entity";
import { CanteenSubsidyGrantService } from "./canteen-subsidy-grant.service";
import { CanteenSettingsService } from "./canteen-settings.service";
import { lastDayOfPeriod, periodOf } from "./canteen-subsidy.util";

/**
 * 补贴月度定时任务：
 * - 每日 01:00 扫描各租户/园区设置；
 *   - 今天是 grant_day → issuePeriod(当前账期)（幂等，已发放自动跳过）；
 *   - expiry_mode=last_day 且今天是本月最后一天（expiry_time=23:59）→ runExpire(当前账期)。
 * 手动触发走 /subsidy/run-grant、/subsidy/run-expire。
 */
@Injectable()
export class CanteenSubsidyScheduler {
  private readonly logger = new Logger(CanteenSubsidyScheduler.name);

  constructor(
    @InjectRepository(CanteenSettingEntity)
    private readonly settingsRepo: Repository<CanteenSettingEntity>,
    private readonly grantService: CanteenSubsidyGrantService,
    private readonly settings: CanteenSettingsService
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async tick(): Promise<void> {
    const now = new Date();
    const todayDay = now.getDate();
    const period = periodOf(now);
    const lastDay = lastDayOfPeriod(period);

    const rows = await this.settingsRepo.find({ where: { isDeleted: false } });
    for (const row of rows) {
      const scope: TenantParkScope = { tenantId: row.tenantId, parkId: row.parkId };
      const cfg = await this.settings.getSettings(scope.tenantId, scope.parkId);
      try {
        if (todayDay === cfg.grantDay) {
          const r = await this.grantService.issuePeriod(scope, period);
          if (r.granted > 0) this.logger.log(`grant ${period} @${scope.tenantId}: +${r.granted}`);
        }
        if (cfg.expiryMode === "last_day" && todayDay === lastDay) {
          const e = await this.grantService.runExpire(scope, period);
          if (e.walletsExpired > 0) this.logger.log(`expire ${period} @${scope.tenantId}: ${e.totalExpiredAmount}`);
        }
      } catch (err) {
        this.logger.warn(`subsidy tick failed @${scope.tenantId}: ${(err as Error).message}`);
      }
    }
  }
}
