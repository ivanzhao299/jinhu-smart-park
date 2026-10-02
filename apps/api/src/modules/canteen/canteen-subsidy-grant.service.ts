import { Injectable, Logger } from "@nestjs/common";
import { DataSource, EntityManager } from "typeorm";
import type { TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { CanteenSettingsService, type CanteenSettings } from "./canteen-settings.service";
import { CanteenNumberService } from "./canteen-number.service";
import { CanteenWalletEntity } from "./entities/canteen-wallet.entity";
import { CanteenSubsidyGrantEntity } from "./entities/canteen-subsidy-grant.entity";
import { CanteenWalletTxnEntity } from "./entities/canteen-wallet-txn.entity";
import { centsToYuan, yuanToCents } from "./canteen-money.util";
import { periodOf } from "./canteen-subsidy.util";

export interface IssuePeriodResult {
  period: string;
  eligible: number;
  granted: number;
  skippedAlreadyGranted: number;
  amount: string;
}

export interface RunExpireResult {
  period: string;
  walletsExpired: number;
  totalExpiredAmount: string;
  grantsExpired: number;
}

interface EligibleEmployee {
  user_id: string;
  display_name: string | null;
  username: string;
  mobile: string | null;
  employee_no: string;
  employment_type: string | null;
}

/**
 * 月度补贴发放 & 月末清零（冻结 §6.3）。
 *
 * - issuePeriod(period)：读 settings（补贴标准/发放日/适用人群），从 hr/users 找合格员工；
 *   为每个员工 upsert 钱包（一人一钱包），创建 grant(status=granted) + wallet_txn(type=grant)，
 *   增加 period_balance。uk(tenant,employee,period) 兜底，重复触发幂等。
 * - runExpire(period)：把当期待发放余额清零：grant→expired、wallet_txn(type=expire)、
 *   period_balance=0；不结转、不兑现、不找零；幂等。
 *
 * 员工/组织数据在 hr/users 模块（sys_user / hr_employee），跨模块为逻辑外键，此处用原生 SQL 读取。
 */
@Injectable()
export class CanteenSubsidyGrantService {
  private readonly logger = new Logger(CanteenSubsidyGrantService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly settings: CanteenSettingsService,
    private readonly numbers: CanteenNumberService
  ) {}

  /* --------------------------- 月度发放 --------------------------- */

  /**
   * 发放某账期补贴。period 缺省 = 当前账期。
   * 每个员工独立子事务，单员工失败/已发放不影响其他人；整体幂等。
   */
  async issuePeriod(
    scope: TenantParkScope,
    period?: string,
    actor?: JwtPrincipal
  ): Promise<IssuePeriodResult> {
    const targetPeriod = period ?? periodOf();
    const settings = await this.settings.getSettings(scope.tenantId, scope.parkId);
    const amount = settings.monthlyLunchSubsidy;

    const employees = await this.findEligibleEmployees(scope, settings);
    let granted = 0;
    let skipped = 0;

    for (const emp of employees) {
      try {
        const result = await this.dataSource.transaction((manager) =>
          this.grantOneEmployee(manager, scope, targetPeriod, emp, settings, amount, actor)
        );
        if (result === "granted") granted += 1;
        else skipped += 1;
      } catch (err) {
        // uk 冲突（并发重复发放）视为幂等跳过；其它错误记日志继续。
        const msg = (err as Error).message ?? String(err);
        if (/duplicate key|uq_canteen_subsidy_grants/i.test(msg)) {
          skipped += 1;
        } else {
          this.logger.warn(`grant ${emp.user_id}@${targetPeriod} failed: ${msg}`);
        }
      }
    }

    return {
      period: targetPeriod,
      eligible: employees.length,
      granted,
      skippedAlreadyGranted: skipped,
      amount
    };
  }

  /** 单个员工发放（在调用方事务内执行）。返回 granted|skipped。 */
  private async grantOneEmployee(
    manager: EntityManager,
    scope: TenantParkScope,
    period: string,
    emp: EligibleEmployee,
    settings: CanteenSettings,
    amount: string,
    actor?: JwtPrincipal
  ): Promise<"granted" | "skipped"> {
    // 幂等：已有本账期发放单则跳过。
    const existingGrant = await manager.findOne(CanteenSubsidyGrantEntity, {
      where: { tenantId: scope.tenantId, employeeUserId: emp.user_id, period, isDeleted: false }
    });
    if (existingGrant) return "skipped";

    // upsert 钱包（一人一钱包）。
    let wallet = await manager.findOne(CanteenWalletEntity, {
      where: { tenantId: scope.tenantId, employeeUserId: emp.user_id, isDeleted: false }
    });

    if (!wallet) {
      wallet = manager.create(CanteenWalletEntity, {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        employeeUserId: emp.user_id,
        employeeNo: emp.employee_no,
        period,
        periodGrant: amount,
        periodConsumed: "0.00",
        periodExpired: "0.00",
        periodBalance: amount,
        status: "active",
        createBy: actor?.sub ?? emp.user_id,
        updateBy: actor?.sub ?? emp.user_id
      });
    } else {
      wallet.parkId = wallet.parkId || scope.parkId;
      wallet.employeeNo = emp.employee_no;
      wallet.updateBy = actor?.sub ?? emp.user_id;
      if (wallet.period !== period) {
        // 跨账期：旧账期余额应已被月末清零；这里按新账期重置额度。
        wallet.period = period;
        wallet.periodGrant = amount;
        wallet.periodConsumed = "0.00";
        wallet.periodExpired = "0.00";
        wallet.periodBalance = amount;
        wallet.status = "active";
      }
      // 同账期重复进入（理论上被 grant uk 挡住）：不改额度。
    }
    const savedWallet = await manager.save(wallet);

    const grantNo = await this.numbers.grantNo(manager, scope.tenantId);
    const now = new Date();
    const grant = manager.create(CanteenSubsidyGrantEntity, {
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      grantNo,
      period,
      employeeUserId: emp.user_id,
      employeeNo: emp.employee_no,
      planAmount: amount,
      grantedAmount: amount,
      status: "granted",
      grantTime: now,
      expireTime: null,
      ruleSnapshot: { ...settings.eligibleRule, standard: amount, grantDay: settings.grantDay },
      createBy: actor?.sub ?? emp.user_id,
      updateBy: actor?.sub ?? emp.user_id
    });
    const savedGrant = await manager.save(grant);

    const txnNo = await this.numbers.walletTxnNo(manager, scope.tenantId);
    await manager.save(
      manager.create(CanteenWalletTxnEntity, {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        txnNo,
        walletId: savedWallet.id,
        grantId: savedGrant.id,
        period,
        employeeUserId: emp.user_id,
        type: "grant",
        amount,
        balanceAfter: savedWallet.periodBalance,
        orderId: null,
        mealRecordId: null,
        operatorUserId: actor?.sub ?? null,
        txnTime: now
      })
    );

    return "granted";
  }

  /** 从 hr/users 找合格员工（逻辑外键原生 SQL）。 */
  private async findEligibleEmployees(
    scope: TenantParkScope,
    settings: CanteenSettings
  ): Promise<EligibleEmployee[]> {
    const rows = (await this.dataSource.query(
      `SELECT u.id AS user_id,
              u.display_name,
              u.username,
              u.mobile,
              COALESCE(e.employee_code, u.username) AS employee_no,
              e.employment_type
         FROM sys_user u
         LEFT JOIN hr_employee e ON e.user_id = u.id AND e.is_deleted = false
        WHERE u.is_deleted = false
          AND u.tenant_id = $1 AND u.park_id = $2
          AND u.status = 'enabled' AND u.is_enabled = true`,
      [scope.tenantId, scope.parkId]
    )) as Array<EligibleEmployee>;

    // eligible_rule: { employee_type: "regular", status: "active" }。
    // status:active 已在 SQL（enabled+is_enabled）保证；
    // employee_type 仅在该员工有 hr_employee 记录时按 employment_type 过滤，无 HR 记录的账号视为合格。
    const ruleType = (settings.eligibleRule as { employee_type?: string }).employee_type;
    if (!ruleType) return rows;
    return rows.filter((r) => r.employment_type == null || r.employment_type === ruleType);
  }

  /* --------------------------- 查询 --------------------------- */

  /** 发放单列表（按 period/employee 过滤，分页）。 */
  async listGrants(
    scope: TenantParkScope,
    filter: { period?: string; employeeUserId?: string; status?: string },
    page = 1,
    pageSize = 20
  ) {
    const where: string[] = ["g.tenant_id = $1", "g.park_id = $2", "g.is_deleted = false"];
    const params: unknown[] = [scope.tenantId, scope.parkId];
    if (filter.period) {
      params.push(filter.period);
      where.push(`g.period = $${params.length}`);
    }
    if (filter.employeeUserId) {
      params.push(filter.employeeUserId);
      where.push(`g.employee_user_id = $${params.length}`);
    }
    if (filter.status) {
      params.push(filter.status);
      where.push(`g.status = $${params.length}`);
    }
    const whereSql = where.join(" AND ");
    const [rows, countRows] = await Promise.all([
      this.dataSource.query(
        `SELECT g.* FROM biz_canteen_subsidy_grants g WHERE ${whereSql}
          ORDER BY g.create_time DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, pageSize, (page - 1) * pageSize]
      ),
      this.dataSource.query(
        `SELECT count(*)::int AS c FROM biz_canteen_subsidy_grants g WHERE ${whereSql}`,
        params
      )
    ]);
    return { list: rows, total: (countRows[0] as { c: number }).c, page, pageSize };
  }

  /* --------------------------- 月末清零 --------------------------- */

  /**
   * 清零某账期末未用余额。period 缺省 = 当前账期。
   * 幂等：period_balance 已为 0 的钱包自动跳过。
   */
  async runExpire(
    scope: TenantParkScope,
    period?: string,
    actor?: JwtPrincipal
  ): Promise<RunExpireResult> {
    const targetPeriod = period ?? periodOf();
    const wallets = await this.dataSource.query(
      `SELECT id FROM biz_canteen_wallets
        WHERE tenant_id = $1 AND park_id = $2 AND period = $3 AND is_deleted = false`,
      [scope.tenantId, scope.parkId, targetPeriod]
    );

    let walletsExpired = 0;
    let grantsExpired = 0;
    let totalCents = 0;

    for (const row of wallets as Array<{ id: string }>) {
      try {
        const out = await this.dataSource.transaction((manager) =>
          this.expireOneWallet(manager, scope, targetPeriod, row.id, actor)
        );
        if (out.expiredCents > 0) {
          walletsExpired += 1;
          totalCents += out.expiredCents;
          grantsExpired += out.grantsMarked;
        }
      } catch (err) {
        this.logger.warn(`expire wallet ${row.id}@${targetPeriod} failed: ${(err as Error).message}`);
      }
    }

    return {
      period: targetPeriod,
      walletsExpired,
      totalExpiredAmount: centsToYuan(totalCents),
      grantsExpired
    };
  }

  private async expireOneWallet(
    manager: EntityManager,
    scope: TenantParkScope,
    period: string,
    walletId: string,
    actor?: JwtPrincipal
  ): Promise<{ expiredCents: number; grantsMarked: number }> {
    const wallet = await manager.findOne(CanteenWalletEntity, {
      where: { id: walletId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
      lock: { mode: "pessimistic_write" }
    });
    if (!wallet) return { expiredCents: 0, grantsMarked: 0 };

    const balanceCents = yuanToCents(wallet.periodBalance);
    if (balanceCents <= 0) return { expiredCents: 0, grantsMarked: 0 }; // 幂等：已清零

    const now = new Date();
    wallet.periodExpired = centsToYuan(yuanToCents(wallet.periodExpired) + balanceCents);
    wallet.periodBalance = "0.00";
    wallet.updateBy = actor?.sub ?? wallet.updateBy;
    await manager.save(wallet);

    const txnNo = await this.numbers.walletTxnNo(manager, scope.tenantId);
    await manager.save(
      manager.create(CanteenWalletTxnEntity, {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        txnNo,
        walletId: wallet.id,
        grantId: null,
        period,
        employeeUserId: wallet.employeeUserId,
        type: "expire",
        amount: centsToYuan(-balanceCents),
        balanceAfter: "0.00",
        orderId: null,
        mealRecordId: null,
        operatorUserId: actor?.sub ?? null,
        txnTime: now
      })
    );

    // 本账期发放单 → expired（未用部分）。
    const grants = await manager.find(CanteenSubsidyGrantEntity, {
      where: {
        tenantId: scope.tenantId,
        employeeUserId: wallet.employeeUserId,
        period,
        isDeleted: false
      }
    });
    let marked = 0;
    for (const g of grants) {
      if (g.status === "granted" || g.status === "partially_consumed") {
        g.status = "expired";
        g.expireTime = now;
        g.updateBy = actor?.sub ?? g.updateBy;
        await manager.save(g);
        marked += 1;
      }
    }

    return { expiredCents: balanceCents, grantsMarked: marked };
  }
}
