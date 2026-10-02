import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CanteenOutletEntity } from "./entities/canteen-outlet.entity";
import { CanteenCategoryEntity } from "./entities/canteen-category.entity";
import { CanteenDishEntity } from "./entities/canteen-dish.entity";
import { CanteenQrCodeEntity } from "./entities/canteen-qr-code.entity";
import { CanteenCashierSessionEntity } from "./entities/canteen-cashier-session.entity";
import { CanteenOrderEntity } from "./entities/canteen-order.entity";
import { CanteenOrderItemEntity } from "./entities/canteen-order-item.entity";
import { CanteenPaymentEntity } from "./entities/canteen-payment.entity";
import { CanteenWalletEntity } from "./entities/canteen-wallet.entity";
import { CanteenSubsidyGrantEntity } from "./entities/canteen-subsidy-grant.entity";
import { CanteenWalletTxnEntity } from "./entities/canteen-wallet-txn.entity";
import { CanteenMealRecordEntity } from "./entities/canteen-meal-record.entity";
import { CanteenRefundEntity } from "./entities/canteen-refund.entity";
import { CanteenSettlementEntity } from "./entities/canteen-settlement.entity";
import { CanteenSettlementItemEntity } from "./entities/canteen-settlement-item.entity";
import { CanteenStatusLogEntity } from "./entities/canteen-status-log.entity";
import { CanteenSettingEntity } from "./entities/canteen-setting.entity";
import { CanteenController } from "./canteen.controller";
import { CanteenService } from "./canteen.service";
import { CanteenSettingsService } from "./canteen-settings.service";
import { CanteenCommandService } from "./command/canteen-command.service";
import { CanteenQueryService } from "./query/canteen-query.service";
import { CanteenPaymentProviderAdapter } from "./adapter/canteen-payment-provider.adapter";
import { CanteenArchiveController } from "./canteen-archive.controller";
import { CanteenPosController } from "./canteen-pos.controller";
import { CanteenOrderController } from "./canteen-order.controller";
import { CanteenPaymentController } from "./canteen-payment.controller";
import { CanteenArchiveService } from "./canteen-archive.service";
import { CanteenCheckoutService } from "./canteen-checkout.service";
import { CanteenPaymentAppService } from "./canteen-payment-app.service";
import { CanteenSessionService } from "./canteen-session.service";
import { CanteenOrderQueryService } from "./canteen-order-query.service";
import { CanteenWebhookService } from "./canteen-webhook.service";
import { CanteenNumberService } from "./canteen-number.service";
import { CanteenPaymentRegistry } from "./payment/canteen-payment-registry";
import { CanteenTimeoutScheduler } from "./canteen-timeout.scheduler";
import { CanteenSubsidyService } from "./canteen-subsidy.service";
import { CanteenSubsidyGrantService } from "./canteen-subsidy-grant.service";
import { CanteenSubsidyScheduler } from "./canteen-subsidy.scheduler";
import { CanteenWalletController } from "./canteen-wallet.controller";
import { CanteenSubsidyController } from "./canteen-subsidy.controller";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CanteenOutletEntity,
      CanteenCategoryEntity,
      CanteenDishEntity,
      CanteenQrCodeEntity,
      CanteenCashierSessionEntity,
      CanteenOrderEntity,
      CanteenOrderItemEntity,
      CanteenPaymentEntity,
      CanteenWalletEntity,
      CanteenSubsidyGrantEntity,
      CanteenWalletTxnEntity,
      CanteenMealRecordEntity,
      CanteenRefundEntity,
      CanteenSettlementEntity,
      CanteenSettlementItemEntity,
      CanteenStatusLogEntity,
      CanteenSettingEntity
    ])
  ],
  controllers: [
    CanteenController,
    CanteenArchiveController,
    CanteenPosController,
    CanteenOrderController,
    CanteenPaymentController,
    CanteenWalletController,
    CanteenSubsidyController
  ],
  providers: [
    CanteenService,
    CanteenSettingsService,
    CanteenCommandService,
    CanteenQueryService,
    CanteenPaymentProviderAdapter,
    // M1
    CanteenArchiveService,
    CanteenCheckoutService,
    CanteenPaymentAppService,
    CanteenSessionService,
    CanteenOrderQueryService,
    CanteenWebhookService,
    CanteenNumberService,
    CanteenPaymentRegistry,
    CanteenTimeoutScheduler,
    // M2
    CanteenSubsidyService,
    CanteenSubsidyGrantService,
    CanteenSubsidyScheduler
  ],
  exports: [CanteenService, CanteenSettingsService, CanteenSubsidyGrantService]
})
export class CanteenModule {}
