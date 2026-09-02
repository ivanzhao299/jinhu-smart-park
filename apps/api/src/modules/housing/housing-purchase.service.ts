import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  PROPERTY_APPROVAL_COMMAND_PORT,
  PROPERTY_APPROVAL_PORT_CONTRACT_VERSION,
  SYSTEM_PERMISSIONS,
  type HousingPurchaseDetailResponse,
  type HousingPurchaseListItem as HousingPurchaseListResponseItem,
  type HousingPurchaseResponse,
  type PaginatedResult,
  type PropertyApprovalCommandPort,
  type PropertyWorkbenchFileRef,
  type TenantParkScope
} from "@jinhu/shared";
import { randomUUID } from "node:crypto";
import { DataSource, In, type EntityManager, type Repository } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { assertPropertyHighRiskActionApprovalRequired } from "../../shared/property-workbench/property-high-risk-stopship";
import { typeormQueryRows } from "../../shared/property-workbench/typeorm-query-rows";
import { FileEntity } from "../files/entities/file.entity";
import { PropertyUnitAccessService } from "../property-operations/property-unit-access.service";
import type {
  CreateHousingPurchaseDto,
  HousingPurchaseActionDto,
  HousingPurchaseQueryDto,
  TransferHousingPurchaseDto
} from "./dto/housing.dto";
import {
  HousingPurchaseEntity,
  HousingPurchaseItemEntity,
  HousingReceivableEntity
} from "./entities/housing.entities";
import { parseHousingCalendarDate } from "./housing-billing.policy";
import {
  addHousingMoneyAmounts,
  assertHousingPurchaseTransferLeaseStatus,
  calculateHousingPurchaseAmounts,
  formatHousingMoney
} from "./housing-finance.policy";
import { HousingTransactionSupportService } from "./housing-transaction-support.service";

@Injectable()
export class HousingPurchaseService {
  constructor(
    @InjectRepository(HousingPurchaseEntity)
    private readonly purchasesRepository: Repository<HousingPurchaseEntity>,
    private readonly unitAccessService: PropertyUnitAccessService,
    private readonly dataSource: DataSource,
    private readonly txSupport: HousingTransactionSupportService,
    @Optional()
    @Inject(PROPERTY_APPROVAL_COMMAND_PORT)
    private readonly approvalCommands?: PropertyApprovalCommandPort
  ) {}

  async listPurchases(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: HousingPurchaseQueryDto
  ): Promise<PaginatedResult<HousingPurchaseListResponseItem>> {
    const builder = this.purchasesRepository.createQueryBuilder("purchase")
      .where("purchase.tenant_id=:tenantId", { tenantId: scope.tenantId })
      .andWhere("purchase.park_id=:parkId", { parkId: scope.parkId })
      .andWhere("purchase.is_deleted=false");
    const unitIds = await this.unitAccessService.allowedUnitIds(scope, actor);
    if (unitIds !== null) {
      if (!unitIds.length) return { items: [], total: 0, page: query.page, page_size: query.page_size };
      builder.andWhere("purchase.unit_id IN (:...unitIds)", { unitIds });
    }
    if (query.unit_id) builder.andWhere("purchase.unit_id=:unitId", { unitId: query.unit_id });
    if (query.approval_status) builder.andWhere("purchase.approval_status=:status", { status: query.approval_status });
    const purchaseSortColumns = {
      purchaseDate: "purchase.purchase_date",
      status: "purchase.approval_status",
      code: "purchase.purchase_code"
    } as const;
    const [items, total] = await builder
      .orderBy(
        purchaseSortColumns[query.sort ?? "purchaseDate"],
        this.sortDirection(query.order, "DESC")
      )
      .addOrderBy("purchase.id", "ASC")
      .skip((query.page - 1) * query.page_size)
      .take(query.page_size)
      .getManyAndCount();
    const relations = await this.loadPurchaseListRelations(scope, actor, items);
    return {
      items: items.map((item) => ({
        ...this.toPurchaseResponse(item, actor),
        ...relations.unitDisplay.get(item.unitId ?? ""),
        transferredItemCount: relations.transferredCounts.get(item.id) ?? 0,
        ...(relations.includeEvidence ? {
          receiptFiles: (relations.receiptFiles.get(item.id) ?? [])
            .map((file) => this.toFileRef(file))
        } : {})
      })),
      total,
      page: query.page,
      page_size: query.page_size
    };
  }

  private async loadPurchaseListRelations(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    items: HousingPurchaseEntity[]
  ) {
    if (!items.length) {
      return {
        transferredCounts: new Map<string, number>(),
        receiptFiles: new Map<string, FileEntity[]>(),
        includeEvidence: false,
        unitDisplay: new Map<string, { unitCode: string | null; unitName: string | null }>()
      };
    }
    const ids = items.map((item) => item.id);
    const includeEvidence = this.hasPermission(actor, SYSTEM_PERMISSIONS.FILE_READ)
      && this.hasPermission(actor, SYSTEM_PERMISSIONS.HOUSING_PURCHASE_READ);
    const [transferredRows, files, unitDisplay] = await Promise.all([
      this.loadPurchaseTransferredCounts(scope, ids),
      includeEvidence ? this.dataSource.getRepository(FileEntity).find({
        where: {
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          bizType: "housing_purchase",
          bizId: In(ids),
          status: 1,
          isDeleted: false
        },
        order: { createTime: "DESC" }
      }) : [],
      this.loadPurchaseUnitDisplay(scope, items)
    ]);
    const receiptFiles = new Map<string, FileEntity[]>();
    for (const file of files) {
      if (!file.bizId) continue;
      receiptFiles.set(file.bizId, [...(receiptFiles.get(file.bizId) ?? []), file]);
    }
    return {
      transferredCounts: new Map(transferredRows.map((row) =>
        [row.purchaseId, Number(row.transferredItemCount)])),
      receiptFiles,
      includeEvidence,
      unitDisplay
    };
  }

  private loadPurchaseTransferredCounts(scope: TenantParkScope, ids: string[]) {
    return this.dataSource.query(
      `SELECT item.purchase_id AS "purchaseId", COUNT(*)::int AS "transferredItemCount"
       FROM biz_housing_purchase_item item
       WHERE item.tenant_id = $1 AND item.park_id = $2
         AND item.purchase_id = ANY($3::uuid[])
         AND item.transferred_receivable_id IS NOT NULL AND item.is_deleted = false
       GROUP BY item.purchase_id`,
      [scope.tenantId, scope.parkId, ids]
    ) as Promise<Array<{ purchaseId: string; transferredItemCount: number }>>;
  }

  async getPurchase(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    purchaseId: string
  ): Promise<HousingPurchaseDetailResponse> {
    const purchase = await this.purchasesRepository.findOne({
      where: { id: purchaseId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    if (!purchase) throw new NotFoundException("Housing purchase not found");
    await this.assertPurchaseAccess(scope, actor, purchase.unitId);
    const includeEvidence = this.hasPermission(actor, SYSTEM_PERMISSIONS.HOUSING_PURCHASE_READ)
      && this.hasPermission(actor, SYSTEM_PERMISSIONS.FILE_READ);
    const [items, receiptFiles, unitDisplay] = await Promise.all([
      this.dataSource.getRepository(HousingPurchaseItemEntity).find({
        where: {
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          purchaseId,
          isDeleted: false
        }
      }),
      includeEvidence
        ? this.dataSource.getRepository(FileEntity).find({
            where: {
              tenantId: scope.tenantId,
              parkId: scope.parkId,
              bizType: "housing_purchase",
              bizId: purchaseId,
              status: 1,
              isDeleted: false
            },
            order: { createTime: "DESC" }
          })
        : Promise.resolve([]),
      this.loadPurchaseUnitDisplay(scope, [purchase])
    ]);
    return {
      purchase: {
        ...this.toPurchaseResponse(purchase, actor),
        ...unitDisplay.get(purchase.unitId ?? "")
      },
      items: items.map((item) => ({
        id: item.id,
        itemName: item.itemName,
        quantity: String(item.quantity),
        unit: item.unit,
        transferredReceivableId: item.transferredReceivableId,
        ...(this.hasPermission(actor, SYSTEM_PERMISSIONS.HOUSING_PURCHASE_READ) ? {
          unitPrice: formatHousingMoney(item.unitPrice),
          amount: formatHousingMoney(item.amount)
        } : {})
      })),
      ...(includeEvidence
        ? { receiptFiles: receiptFiles.map((file) => this.toFileRef(file)) }
        : {})
    };
  }

  async createPurchase(scope: TenantParkScope, actor: JwtPrincipal, dto: CreateHousingPurchaseDto) {
    if (!dto.items.length) throw new BadRequestException("At least one purchase item is required");
    parseHousingCalendarDate(dto.purchase_date);
    await this.assertPurchaseAccess(scope, actor, dto.unit_id ?? null);
    try {
      return await this.dataSource.transaction(async (manager) => {
      const receiptFiles = await this.mustTxSupport().assertFiles(
        manager,
        scope,
        dto.receipt_file_ids ?? [],
        { bizType: "housing_purchase" }
      );
      if (receiptFiles.some((file) => file.bizId !== null)) {
        throw new ConflictException("Purchase receipt file is already associated with another record");
      }
      if (receiptFiles.some((file) => file.createBy !== actor.sub)) {
        throw new ForbiddenException("Purchase receipt file belongs to another uploader");
      }
      const purchaseAmounts = calculateHousingPurchaseAmounts(dto.items.map((item) => ({
        quantity: item.quantity,
        unitPrice: item.unit_price
      })));
      const repository = manager.getRepository(HousingPurchaseEntity);
      const purchase = await repository.save(repository.create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        purchaseCode: dto.purchase_code ?? this.mustTxSupport().generateCode("HP"),
        unitId: dto.unit_id ?? null,
        vendorName: dto.vendor_name,
        purchaseDate: dto.purchase_date.slice(0, 10),
        costCategory: dto.cost_category,
        totalAmount: purchaseAmounts.totalAmount,
        approvalStatus: "draft",
        paymentStatus: "unpaid",
        receiptFileIds: dto.receipt_file_ids ?? [],
        createBy: actor.sub,
        updateBy: actor.sub,
        remark: dto.remark ?? null
      }));
      const itemRepository = manager.getRepository(HousingPurchaseItemEntity);
      await itemRepository.save(dto.items.map((item, index) => itemRepository.create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        purchaseId: purchase.id,
        itemName: item.item_name,
        quantity: item.quantity,
        unit: item.unit ?? null,
        unitPrice: item.unit_price,
        amount: purchaseAmounts.lineAmounts[index]!,
        transferredReceivableId: null,
        createBy: actor.sub,
        updateBy: actor.sub
      })));
      for (const file of receiptFiles) {
        file.bizId = purchase.id;
        file.updateBy = actor.sub;
      }
      if (receiptFiles.length) await manager.getRepository(FileEntity).save(receiptFiles);
        return purchase;
      });
    } catch (error) {
      if (this.mustTxSupport().isUniqueViolation(error)) {
        throw new ConflictException("Purchase code already exists in current tenant and park");
      }
      throw error;
    }
  }

  async purchaseAction(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    purchaseId: string,
    dto: HousingPurchaseActionDto,
    clientKey = ""
  ) {
    if (!this.approvalCommands) {
      assertPropertyHighRiskActionApprovalRequired("housing.purchases.lifecycle");
      throw new ConflictException("Property approval runtime is unavailable");
    }
    return this.dataSource.transaction((manager) =>
      this.submitLifecycle(manager, scope, actor, purchaseId, dto, clientKey));
  }

  private async submitLifecycle(manager: EntityManager, scope: TenantParkScope, actor: JwtPrincipal,
    purchaseId: string, dto: HousingPurchaseActionDto, clientKey: string) {
      const repository = manager.getRepository(HousingPurchaseEntity);
      const purchase = await repository.findOne({
        where: { id: purchaseId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
        lock: { mode: "pessimistic_write" }
      });
      if (!purchase) throw new NotFoundException("Housing purchase not found");
      await this.assertPurchaseAccess(scope, actor, purchase.unitId);
      const state = await this.resolveLifecycleState(manager, scope, purchase, dto);
      return this.approvalCommands!.createPendingRequest(
        { transactionContext: manager },
        { contractVersion: PROPERTY_APPROVAL_PORT_CONTRACT_VERSION, scope,
          actionId: "housing.purchases.lifecycle.request", sourceType: "housing-purchase",
          sourceId: purchase.id, sourceExpectedVersion: purchase.version,
          requesterId: actor.sub, submitterId: actor.sub, actorId: actor.sub, clientKey,
          businessIntentKey: `housing-purchase-lifecycle:${purchase.id}:${purchase.version}:${state.transition}`,
          canonicalPayload: { purchaseId: purchase.id, ...state,
            reason: dto.reason, actorName: actor.realName?.trim() || actor.username },
          payloadSchemaVersion: 1, amount: null, currency: null }
      );
  }

  private async resolveLifecycleState(manager: EntityManager, scope: TenantParkScope,
    purchase: HousingPurchaseEntity, dto: HousingPurchaseActionDto) {
      const beforeApprovalStatus = purchase.approvalStatus;
      const beforePaymentStatus = purchase.paymentStatus;
      let afterApprovalStatus = beforeApprovalStatus;
      let afterPaymentStatus = beforePaymentStatus;
      let transition: string = dto.action;
      switch (dto.action) {
        case "approve":
          if (purchase.approvalStatus !== "draft") throw new ConflictException("Only draft purchase can be approved");
          afterApprovalStatus = "approved";
          break;
        case "reject":
          if (purchase.approvalStatus !== "draft") throw new ConflictException("Only draft purchase can be rejected");
          afterApprovalStatus = "rejected";
          break;
        case "pay":
          if (purchase.approvalStatus !== "approved" || purchase.paymentStatus !== "unpaid") {
            throw new ConflictException("Only approved unpaid purchase can be paid");
          }
          afterPaymentStatus = "paid";
          break;
        case "refund":
          if (purchase.paymentStatus !== "paid") throw new ConflictException("Only paid purchase can be refunded");
          if (await this.hasTransferredPurchaseItems(manager, scope, purchase.id)) {
            throw new ConflictException("Transferred purchase items must be reversed before refunding the purchase");
          }
          afterPaymentStatus = "refunded";
          break;
        case "void":
          if (purchase.paymentStatus !== "unpaid") {
            throw new ConflictException("Paid or refunded purchase cannot be voided");
          }
          if (!["draft", "approved", "rejected"].includes(purchase.approvalStatus)) {
            throw new ConflictException("Terminal purchase cannot be voided again");
          }
          if (await this.hasTransferredPurchaseItems(manager, scope, purchase.id)) {
            throw new ConflictException("Transferred purchase items must be reversed before voiding the purchase");
          }
          transition = `void-${purchase.approvalStatus}`;
          afterApprovalStatus = "void";
          break;
        default:
          throw new BadRequestException("Unsupported purchase action");
      }
      return { transition, beforeApprovalStatus, afterApprovalStatus, beforePaymentStatus, afterPaymentStatus };
  }

  async transferPurchase(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    purchaseId: string,
    dto: TransferHousingPurchaseDto,
    clientKey = ""
  ) {
    if (!this.approvalCommands) {
      assertPropertyHighRiskActionApprovalRequired("housing.purchases.transfer");
      throw new ConflictException("Property approval runtime is unavailable");
    }
    parseHousingCalendarDate(dto.due_date);
    return this.dataSource.transaction((manager) =>
      this.submitTransfer(manager, scope, actor, purchaseId, dto, clientKey));
  }

  private async submitTransfer(manager: EntityManager, scope: TenantParkScope, actor: JwtPrincipal,
    purchaseId: string, dto: TransferHousingPurchaseDto, clientKey: string) {
    const source = await this.lockTransferSource(manager, scope, actor, purchaseId, dto);
    const target = await this.lockTransferTarget(manager, scope, source.purchase, source.lease, dto);
    return this.createTransferRequest(manager, scope, actor, dto, clientKey, source, target);
  }

  private async lockTransferSource(manager: EntityManager, scope: TenantParkScope, actor: JwtPrincipal,
    purchaseId: string, dto: TransferHousingPurchaseDto) {
      const purchase = await manager.getRepository(HousingPurchaseEntity).findOne({
        where: { id: purchaseId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
        lock: { mode: "pessimistic_write" }
      });
      if (!purchase) throw new NotFoundException("Housing purchase not found");
      await this.assertPurchaseAccess(scope, actor, purchase.unitId);
      if (purchase.approvalStatus !== "approved") throw new ConflictException("Only approved purchase can be transferred");
      if (purchase.paymentStatus === "refunded") throw new ConflictException("Refunded purchase cannot be transferred");
      const lease = await this.mustTxSupport().lockLease(manager, scope, dto.lease_id);
      await this.unitAccessService.assertAccess(scope, actor, lease.unitId);
      assertHousingPurchaseTransferLeaseStatus(lease.status);
      if (purchase.unitId && purchase.unitId !== lease.unitId) {
        throw new ConflictException("Purchase unit and lease unit do not match");
      }
      const itemsRepository = manager.getRepository(HousingPurchaseItemEntity);
      const items = await itemsRepository.createQueryBuilder("item")
        .setLock("pessimistic_write")
        .where("item.tenant_id=:tenantId", { tenantId: scope.tenantId })
        .andWhere("item.park_id=:parkId", { parkId: scope.parkId })
        .andWhere("item.purchase_id=:purchaseId", { purchaseId })
        .andWhere("item.id IN (:...itemIds)", { itemIds: dto.item_ids })
        .andWhere("item.is_deleted=false")
        .orderBy("item.id", "ASC")
        .getMany();
      if (items.length !== new Set(dto.item_ids).size) throw new NotFoundException("One or more purchase items were not found");
      if (items.some((item) => item.transferredReceivableId)) {
        throw new ConflictException("One or more purchase items have already been transferred");
      }
      return { purchase, lease, items, amount: addHousingMoneyAmounts(items.map((item) => item.amount)) };
  }

  private async lockTransferTarget(manager: EntityManager, scope: TenantParkScope,
    purchase: HousingPurchaseEntity, lease: { id: string; version: number; currency: string },
    dto: TransferHousingPurchaseDto) {
      await this.mustTxSupport().lockBusinessKey(
        manager,
        this.mustTxSupport().receivableBusinessKey(scope, lease.id, {
          sourceType: "purchase_transfer",
          sourceId: purchase.id,
          chargeType: "purchase_recharge",
          periodStart: purchase.purchaseDate,
          periodEnd: this.mustTxSupport().addDays(purchase.purchaseDate, 1)
        })
      );
      const targetRows = typeormQueryRows<{
        id: string; version: number; leaseId: string; periodStart: string; periodEnd: string;
        dueDate: string; amount: string; paidAmount: string; waivedAmount: string;
        status: HousingReceivableEntity["status"]; currency: string; isDeleted: boolean;
      }>(await manager.query(
        `SELECT id::text AS id,version,lease_id::text AS "leaseId",period_start::text AS "periodStart",
                period_end::text AS "periodEnd",due_date::text AS "dueDate",amount::text AS amount,
                paid_amount::text AS "paidAmount",waived_amount::text AS "waivedAmount",
                status,currency,is_deleted AS "isDeleted"
           FROM biz_housing_receivable
          WHERE tenant_id=$1 AND park_id=$2 AND source_type='purchase_transfer'
            AND source_id=$3 AND charge_type='purchase_recharge' ORDER BY id FOR UPDATE`,
        [scope.tenantId, scope.parkId, purchase.id]
      ));
      if (targetRows.length > 1 || targetRows.some((row) => row.isDeleted || row.status === "void")) {
        throw new ConflictException("Purchase transfer receivable history conflicts with approval submission");
      }
      const existingTarget = targetRows[0];
      if (existingTarget && existingTarget.leaseId !== lease.id) {
        throw new ConflictException("Purchase transfer receivable belongs to another lease");
      }
      const targetReceivable = existingTarget ?? {
        id: randomUUID(), version: 0, leaseId: lease.id,
        periodStart: purchase.purchaseDate,
        periodEnd: this.mustTxSupport().addDays(purchase.purchaseDate, 1),
        dueDate: dto.due_date.slice(0, 10), amount: "0.00", paidAmount: "0.00",
        waivedAmount: "0.00", status: "unpaid" as const, currency: purchase.currency,
        isDeleted: false
      };
      if (targetReceivable.currency !== purchase.currency || lease.currency !== purchase.currency) {
        throw new ConflictException("Purchase transfer currency differs from target lease");
      }
      return { existingTarget, targetReceivable };
  }

  private createTransferRequest(manager: EntityManager, scope: TenantParkScope, actor: JwtPrincipal,
    dto: TransferHousingPurchaseDto, clientKey: string,
    source: Awaited<ReturnType<HousingPurchaseService["lockTransferSource"]>>,
    target: Awaited<ReturnType<HousingPurchaseService["lockTransferTarget"]>>) {
      const { purchase, lease, items, amount } = source;
      const { existingTarget, targetReceivable } = target;
      const frozenItems = [...items]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((item) => ({
          purchaseItemId: item.id,
          expectedVersion: item.version,
          amount: formatHousingMoney(item.amount),
          currency: purchase.currency,
          transferredReceivableId: null
        }));
      return this.approvalCommands!.createPendingRequest(
        { transactionContext: manager },
        {
          contractVersion: PROPERTY_APPROVAL_PORT_CONTRACT_VERSION,
          scope,
          actionId: "housing.purchases.transfer.request",
          sourceType: "housing-purchase",
          sourceId: purchase.id,
          sourceExpectedVersion: purchase.version,
          requesterId: actor.sub,
          submitterId: actor.sub,
          actorId: actor.sub,
          clientKey,
          businessIntentKey: `housing-purchase-transfer:${purchase.id}:${purchase.version}:${targetReceivable.id}`,
          canonicalPayload: {
            purchaseId: purchase.id,
            leaseId: lease.id,
            leaseExpectedVersion: lease.version,
            targetReceivableId: targetReceivable.id,
            targetReceivableMode: existingTarget ? "existing" : "new",
            targetReceivableExpectedVersion: existingTarget?.version ?? null,
            targetReceivableOriginalAmount: formatHousingMoney(targetReceivable.amount),
            targetReceivableOriginalPaidAmount: formatHousingMoney(targetReceivable.paidAmount),
            targetReceivableOriginalWaivedAmount: formatHousingMoney(targetReceivable.waivedAmount),
            targetReceivableOriginalStatus: existingTarget?.status ?? "absent",
            targetReceivablePeriodStart: targetReceivable.periodStart,
            targetReceivablePeriodEnd: targetReceivable.periodEnd,
            targetReceivableDueDate: targetReceivable.dueDate,
            targetReceivableSourceType: "purchase_transfer",
            targetReceivableSourceId: purchase.id,
            targetReceivableChargeType: "purchase_recharge",
            aggregateDeltaAmount: amount,
            currency: purchase.currency,
            reason: dto.reason,
            actorName: actor.realName?.trim() || actor.username,
            items: frozenItems
          },
          payloadSchemaVersion: 1,
          amount,
          currency: purchase.currency
        }
      );
  }
  private toPurchaseResponse(
    purchase: HousingPurchaseEntity,
    actor: JwtPrincipal
  ): HousingPurchaseResponse {
    return {
      id: purchase.id,
      purchaseCode: purchase.purchaseCode,
      unitId: purchase.unitId,
      unitCode: null,
      unitName: null,
      vendorName: purchase.vendorName,
      purchaseDate: purchase.purchaseDate,
      costCategory: purchase.costCategory,
      approvalStatus: purchase.approvalStatus,
      paymentStatus: purchase.paymentStatus,
      ...(this.hasPermission(actor, SYSTEM_PERMISSIONS.HOUSING_PURCHASE_READ) ? {
        totalAmount: formatHousingMoney(purchase.totalAmount)
      } : {})
    };
  }

  private async loadPurchaseUnitDisplay(
    scope: TenantParkScope,
    purchases: HousingPurchaseEntity[]
  ): Promise<Map<string, { unitCode: string | null; unitName: string | null }>> {
    const unitIds = [...new Set(purchases.flatMap((purchase) =>
      purchase.unitId ? [purchase.unitId] : []))];
    if (!unitIds.length) return new Map();
    const rows = await this.dataSource.query(
      `SELECT unit.id, unit.unit_code AS "unitCode", unit.unit_name AS "unitName"
       FROM biz_unit unit
       WHERE unit.tenant_id = $1 AND unit.park_id = $2
         AND unit.id = ANY($3::uuid[]) AND unit.is_deleted = false`,
      [scope.tenantId, scope.parkId, unitIds]
    ) as Array<{ id: string; unitCode: string | null; unitName: string | null }>;
    return new Map(rows.map((row) => [row.id, {
      unitCode: row.unitCode,
      unitName: row.unitName
    }]));
  }

  private toFileRef(file: FileEntity): PropertyWorkbenchFileRef {
    return {
      id: file.id,
      originalName: file.originalName,
      mimeType: file.mimeType,
      fileSize: file.fileSize
    };
  }

  private async assertPurchaseAccess(scope: TenantParkScope, actor: JwtPrincipal, unitId: string | null) {
    if (unitId) {
      await this.unitAccessService.assertAccess(scope, actor, unitId);
      return;
    }
    const allowedUnitIds = await this.unitAccessService.allowedUnitIds(scope, actor);
    if (allowedUnitIds !== null) {
      throw new ForbiddenException("Project-wide purchase cost requires unrestricted park data scope");
    }
  }
  private hasTransferredPurchaseItems(
    manager: EntityManager,
    scope: TenantParkScope,
    purchaseId: string
  ): Promise<boolean> {
    return manager.getRepository(HousingPurchaseItemEntity)
      .createQueryBuilder("item")
      .where("item.tenant_id=:tenantId", { tenantId: scope.tenantId })
      .andWhere("item.park_id=:parkId", { parkId: scope.parkId })
      .andWhere("item.purchase_id=:purchaseId", { purchaseId })
      .andWhere("item.is_deleted=false")
      .andWhere("item.transferred_receivable_id IS NOT NULL")
      .getExists();
  }
  private sortDirection(
    order: "asc" | "desc" | undefined,
    fallback: "ASC" | "DESC"
  ): "ASC" | "DESC" {
    return order ? (order === "asc" ? "ASC" : "DESC") : fallback;
  }

  private hasPermission(actor: JwtPrincipal, permission: string) {
    return Boolean(actor.isSuper || actor.permissions.includes("*") || actor.permissions.includes(permission));
  }

  private mustTxSupport() {
    return this.txSupport;
  }
}
