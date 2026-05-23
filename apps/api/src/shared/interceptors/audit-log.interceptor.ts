import type { CallHandler, ExecutionContext, NestInterceptor } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { ClsService } from "nestjs-cls";
import { catchError, tap, throwError, type Observable } from "rxjs";
import { AUDIT_LOG_KEY, type AuditLogOptions } from "../../modules/audit/decorators/audit-log.decorator";
import { AuditService } from "../../modules/audit/audit.service";
import type { JwtPrincipal } from "../types/jwt-principal";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(
    private readonly auditService: AuditService,
    private readonly cls: ClsService,
    private readonly reflector: Reflector
  ) {}

  intercept(context: ExecutionContext, next: CallHandler<unknown>): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request & { user?: JwtPrincipal }>();
    if (!WRITE_METHODS.has(request.method) || !request.user) {
      return next.handle();
    }

    const user = request.user;
    const auditOptions = this.reflector.getAllAndOverride<AuditLogOptions>(AUDIT_LOG_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    const body = this.sanitize(this.asRecord(request.body));
    const params = this.asRecord(request.params);
    const bizIdParam = auditOptions?.bizIdParam ?? "id";
    const baseLog = {
      tenantId: user.tenantId,
      parkId: user.parkId,
      userId: user.sub,
      username: user.username,
      realName: user.realName ?? null,
      roleCodes: user.roles,
      module: auditOptions?.module ?? context.getClass().name,
      resource: auditOptions?.resource ?? request.route?.path?.toString() ?? request.path,
      action: auditOptions?.action ?? context.getHandler().name,
      bizType: auditOptions?.bizType ?? (typeof body.biz_type === "string" ? body.biz_type : null),
      bizId: typeof params[bizIdParam] === "string" ? params[bizIdParam] : typeof body.biz_id === "string" ? body.biz_id : null,
      beforeJson: null,
      afterJson: auditOptions?.captureBody === false ? null : body,
      clientIp: request.ip ?? null,
      clientUa: typeof request.headers["user-agent"] === "string" ? request.headers["user-agent"] : null,
      method: request.method,
      path: request.originalUrl,
      requestId: this.cls.getId() ?? null,
      idempotencyKey:
        typeof request.headers["x-idempotency-key"] === "string" ? request.headers["x-idempotency-key"] : null
    };

    return next.handle().pipe(
      tap(() => {
        void this.auditService.recordOperation({ ...baseLog, success: true }).catch(() => undefined);
      }),
      catchError((error: Error) => {
        void this.auditService
          .recordOperation({ ...baseLog, success: false, errorMsg: error.message })
          .catch(() => undefined);
        return throwError(() => error);
      })
    );
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (typeof value === "object" && value !== null && !Buffer.isBuffer(value)) {
      return value as Record<string, unknown>;
    }
    return {};
  }

  private sanitize(value: Record<string, unknown>): Record<string, unknown> {
    const maskedKeys = new Set([
      "password",
      "oldPassword",
      "newPassword",
      "token",
      "accessToken",
      "access_token",
      "accessKey",
      "access_key",
      "secret",
      "secretEncrypted",
      "secret_encrypted",
      "deviceSecret",
      "device_secret",
      "deviceSecretHash",
      "device_secret_hash",
      "endpointUrl",
      "endpoint_url",
      "contactMobile",
      "contact_mobile",
      "mobile",
      "legalPersonId",
      "legal_person_id",
      "demandPrice",
      "demand_price",
      "quotePrice",
      "quote_price",
      "propertyFeePrice",
      "property_fee_price",
      "rentUnitPrice",
      "rent_unit_price",
      "rentAmountPerMonth",
      "rent_amount_per_month",
      "rentPerMonth",
      "rent_per_month",
      "totalAmount",
      "total_amount",
      "depositAmount",
      "deposit_amount",
      "propertyFeeUnitPrice",
      "property_fee_unit_price",
      "beforeSnapshot",
      "before_snapshot",
      "afterSnapshot",
      "after_snapshot",
      "financeImpact",
      "finance_impact",
      "contractPdfFileId",
      "contract_pdf_file_id",
      "scanPdfFileId",
      "scan_pdf_file_id",
      "amount",
      "amountDue",
      "amount_due",
      "amountPaid",
      "amount_paid",
      "amountWaived",
      "amount_waived",
      "amountRemain",
      "amount_remain",
      "lateFee",
      "late_fee",
      "unpaidAmount",
      "unpaid_amount",
      "lateFeeAmount",
      "late_fee_amount",
      "deductionAmount",
      "deduction_amount",
      "additionalChargeAmount",
      "additional_charge_amount",
      "refundAmount",
      "refund_amount",
      "amountDueFromTenant",
      "amount_due_from_tenant",
      "payAmount",
      "pay_amount",
      "unappliedAmount",
      "unapplied_amount",
      "bankSerial",
      "bank_serial",
      "receiverBankAccount",
      "receiver_bank_account",
      "receiptFileId",
      "receipt_file_id",
      "buyerTaxNo",
      "buyer_tax_no",
      "waiverAmount",
      "waiver_amount",
      "invoiceAmount",
      "invoice_amount",
      "reporterMobile",
      "reporter_mobile",
      "description",
      "imageFileIds",
      "image_file_ids",
      "videoFileIds",
      "video_file_ids",
      "evaluation",
      "resolveNote",
      "resolve_note",
      "attachmentFileIds",
      "attachment_file_ids",
      "content",
      "gpsLng",
      "gps_lng",
      "gpsLat",
      "gps_lat",
      "statusPayload",
      "status_payload",
      "triggerPayload",
      "trigger_payload",
      "rawPayload",
      "raw_payload"
    ]);
    return this.sanitizeRecord(value, maskedKeys);
  }

  private sanitizeRecord(value: Record<string, unknown>, maskedKeys: Set<string>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [key, this.sanitizeValue(key, entryValue, maskedKeys)])
    );
  }

  private sanitizeValue(key: string, value: unknown, maskedKeys: Set<string>): unknown {
    if (maskedKeys.has(key)) return "***";
    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeValue("", item, maskedKeys));
    }
    if (typeof value === "object" && value !== null && !Buffer.isBuffer(value)) {
      return this.sanitizeRecord(value as Record<string, unknown>, maskedKeys);
    }
    return value;
  }
}
