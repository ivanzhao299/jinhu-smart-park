import { Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateNested
} from "class-validator";

/* ----------------------------- Outlets ----------------------------- */

export class CreateOutletDto {
  @IsString() @MinLength(1) name!: string;
  @IsIn(["dine_in", "stall", "堂食", "档口"]) outlet_type!: string;
  @IsString() contractor_id!: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() business_hours?: string;
  @IsOptional() @IsUUID() manager_user_id?: string;
}

export class UpdateOutletDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsIn(["dine_in", "stall", "堂食", "档口"]) outlet_type?: string;
  @IsOptional() @IsString() contractor_id?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() business_hours?: string;
  @IsOptional() @IsUUID() manager_user_id?: string;
}

export class OutletStatusDto {
  @IsIn(["open", "suspended", "closed"]) status!: string;
}

/* ----------------------------- Categories ----------------------------- */

export class CreateCategoryDto {
  @IsOptional() @IsUUID() outlet_id?: string;
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsInt() sort_order?: number;
  @IsOptional() @IsIn(["on", "off"]) status?: string;
}

export class UpdateCategoryDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsInt() sort_order?: number;
  @IsOptional() @IsIn(["on", "off"]) status?: string;
}

/* ----------------------------- Dishes ----------------------------- */

export class CreateDishDto {
  @IsUUID() outlet_id!: string;
  @IsUUID() category_id!: string;
  @IsString() @MinLength(1) name!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) price!: number;
  @IsOptional() @IsUUID() image_file_id?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsString() barcode?: string;
  @IsOptional() @IsInt() @Min(0) daily_stock?: number;
  @IsOptional() need_booking?: boolean;
}

export class UpdateDishDto {
  @IsOptional() @IsUUID() category_id?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) price?: number;
  @IsOptional() @IsUUID() image_file_id?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsString() barcode?: string;
  @IsOptional() @IsInt() @Min(0) daily_stock?: number;
  @IsOptional() need_booking?: boolean;
}

export class DishShelfDto {
  @IsIn(["on_shelf", "off_shelf"]) status!: string;
}

export class DishStockDto {
  @IsOptional() @IsInt() @Min(0) daily_stock?: number;
  @IsOptional() @IsInt() @Min(0) sold_count?: number;
}

/* ----------------------------- POS checkout ----------------------------- */

export class CheckoutItemDto {
  @IsUUID() dish_id!: string;
  @IsInt() @Min(1) qty!: number;
}

export class CheckoutQrDto {
  @IsUUID() outlet_id!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => CheckoutItemDto)
  items!: CheckoutItemDto[];
  @IsOptional() @IsIn(["qr_pay"]) channel?: string;
}

/* ----------------------------- Cashier sessions ----------------------------- */

export class OpenSessionDto {
  @IsUUID() outlet_id!: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) opening_float?: number;
}

export class CloseSessionDto {
  @IsOptional() @IsString() remark?: string;
}

/* ----------------------------- Order query ----------------------------- */

export class OrderQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page_size?: number = 20;
  @IsOptional() @IsUUID() outlet_id?: string;
  @IsOptional() @IsString() business_date?: string;
  @IsOptional() @IsIn(["pending", "paid", "completed", "cancelled", "refunded", "partial_refunded"])
  status?: string;
  @IsOptional() @IsIn(["qr_pay", "subsidy", "mixed"]) channel?: string;
  @IsOptional() @IsString() contractor_id?: string;
}

/* ----------------------------- Session list ----------------------------- */

export class SessionListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page_size?: number = 20;
  @IsOptional() @IsUUID() outlet_id?: string;
  // YYYY-MM-DD：按开班自然日过滤 open_time。
  @IsOptional() @IsString() business_date?: string;
  @IsOptional() @IsIn(["open", "closed"]) status?: string;
}

/* ----------------------------- M2 补贴钱包 ----------------------------- */

export class CheckoutSubsidyDto {
  @IsUUID() outlet_id!: string;
  @IsString() employee_code!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => CheckoutItemDto)
  items!: CheckoutItemDto[];
  // subsidy=纯虚拟结账(足额)；mixed=余额不足时餐补扣满+差额扫码。
  @IsOptional() @IsIn(["subsidy", "mixed"]) channel?: string = "subsidy";
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) subsidy_apply_amount?: number;
}

export class LookupEmployeeDto {
  @IsString() employee_code!: string;
}

export class RunPeriodDto {
  // 缺省 = 当前账期 YYYY-MM。
  @IsOptional() @IsString() period?: string;
}

export class WalletTxnQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page_size?: number = 20;
}

/* ----------------------------- M3 结算 ----------------------------- */

export class GenerateSettlementDto {
  @IsUUID() outlet_id!: string;
  // YYYY-MMA.
  @IsString() @MinLength(7) period!: string;
}

export class SettlementListQueryDto {
  @IsOptional() @IsUUID() outlet_id?: string;
  @IsOptional() @IsString() period?: string;
  @IsOptional() @IsString() contractor_id?: string;
  @IsOptional() @IsIn(["draft", "submitted", "reconciling", "approved", "settled", "disputed"])
  status?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page_size?: number = 20;
}

export class DisputeSettlementDto {
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) diff_amount?: number;
  @IsOptional() @IsString() diff_reason?: string;
}

export class SettleSettlementDto {
  @IsOptional() @IsUUID() settle_evidence_file_id?: string;
  @IsOptional() @IsString() remark?: string;
}

/* ----------------------------- M3 报表 ----------------------------- */

export class ReportQueryDto {
  // 日期有界：必填起止，限 31 天窗口。
  @IsString() start_date!: string;
  @IsString() end_date!: string;
  @IsOptional() @IsUUID() outlet_id?: string;
  @IsOptional() @IsString() meal_period?: string;
  @IsOptional() @IsString() category_id?: string;
}

/* ----------------------------- M4 退款 ----------------------------- */

export class CreateRefundDto {
  @IsUUID() order_id!: string;
  @IsString() reason!: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) amount?: number;
}
