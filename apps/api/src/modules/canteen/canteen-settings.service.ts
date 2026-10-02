import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CanteenSettingEntity } from "./entities/canteen-setting.entity";

/**
 * 园区餐厅可配置设置（tenant/park 维度单行）。
 * 读取时若库中无记录，返回 DEFAULT_CANTEEN_SETTINGS 兜底；upsert 用于写回。
 */
export interface CanteenSettings {
  monthlyLunchSubsidy: string;
  grantDay: number;
  expiryMode: "last_day" | "fixed_day";
  expiryDay: number | null;
  expiryTime: string;
  eligibleRule: Record<string, unknown>;
  fundsCompanyAccount: boolean;
  settlementDay: number;
  managementFeeEnabled: boolean;
  managementFeeRule: Record<string, unknown> | null;
}

export const DEFAULT_CANTEEN_SETTINGS: CanteenSettings = {
  monthlyLunchSubsidy: "300.00",
  grantDay: 1,
  expiryMode: "last_day",
  expiryDay: null,
  expiryTime: "23:59",
  eligibleRule: { employee_type: "regular", status: "active" },
  fundsCompanyAccount: true,
  settlementDay: 1,
  managementFeeEnabled: false,
  managementFeeRule: null
};

@Injectable()
export class CanteenSettingsService {
  constructor(
    @InjectRepository(CanteenSettingEntity)
    private readonly settingsRepo: Repository<CanteenSettingEntity>
  ) {}

  /** 读取设置；库中无记录时返回默认值兜底（不落库）。 */
  async getSettings(tenantId: string, parkId: string): Promise<CanteenSettings> {
    const row = await this.settingsRepo.findOne({
      where: { tenantId, parkId, isDeleted: false }
    });
    if (!row) {
      return { ...DEFAULT_CANTEEN_SETTINGS };
    }
    return {
      monthlyLunchSubsidy: row.monthlyLunchSubsidy,
      grantDay: row.grantDay,
      expiryMode: row.expiryMode as CanteenSettings["expiryMode"],
      expiryDay: row.expiryDay,
      expiryTime: row.expiryTime,
      eligibleRule: row.eligibleRule ?? { ...DEFAULT_CANTEEN_SETTINGS.eligibleRule },
      fundsCompanyAccount: row.fundsCompanyAccount,
      settlementDay: row.settlementDay,
      managementFeeEnabled: row.managementFeeEnabled,
      managementFeeRule: row.managementFeeRule
    };
  }

  /** upsert：存在则更新，不存在则插入。 */
  async upsertSettings(
    tenantId: string,
    parkId: string,
    patch: Partial<CanteenSettings>
  ): Promise<CanteenSettings> {
    const existing = await this.settingsRepo.findOne({
      where: { tenantId, parkId, isDeleted: false }
    });

    const merged: CanteenSettings = {
      ...(existing
        ? {
            monthlyLunchSubsidy: existing.monthlyLunchSubsidy,
            grantDay: existing.grantDay,
            expiryMode: existing.expiryMode as CanteenSettings["expiryMode"],
            expiryDay: existing.expiryDay,
            expiryTime: existing.expiryTime,
            eligibleRule: existing.eligibleRule,
            fundsCompanyAccount: existing.fundsCompanyAccount,
            settlementDay: existing.settlementDay,
            managementFeeEnabled: existing.managementFeeEnabled,
            managementFeeRule: existing.managementFeeRule
          }
        : DEFAULT_CANTEEN_SETTINGS),
      ...patch
    };

    if (existing) {
      this.settingsRepo.merge(existing, {
        monthlyLunchSubsidy: merged.monthlyLunchSubsidy,
        grantDay: merged.grantDay,
        expiryMode: merged.expiryMode,
        expiryDay: merged.expiryDay,
        expiryTime: merged.expiryTime,
        eligibleRule: merged.eligibleRule,
        fundsCompanyAccount: merged.fundsCompanyAccount,
        settlementDay: merged.settlementDay,
        managementFeeEnabled: merged.managementFeeEnabled,
        managementFeeRule: merged.managementFeeRule
      });
      await this.settingsRepo.save(existing);
    } else {
      await this.settingsRepo.save(
        this.settingsRepo.create({
          tenantId,
          parkId,
          monthlyLunchSubsidy: merged.monthlyLunchSubsidy,
          grantDay: merged.grantDay,
          expiryMode: merged.expiryMode,
          expiryDay: merged.expiryDay,
          expiryTime: merged.expiryTime,
          eligibleRule: merged.eligibleRule,
          fundsCompanyAccount: merged.fundsCompanyAccount,
          settlementDay: merged.settlementDay,
          managementFeeEnabled: merged.managementFeeEnabled,
          managementFeeRule: merged.managementFeeRule
        })
      );
    }

    return merged;
  }
}
