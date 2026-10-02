import {
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { TenantParkScope } from "@jinhu/shared";
import type { Repository } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { CanteenCategoryEntity } from "./entities/canteen-category.entity";
import { CanteenDishEntity } from "./entities/canteen-dish.entity";
import { CanteenOutletEntity } from "./entities/canteen-outlet.entity";
import {
  CreateCategoryDto,
  CreateDishDto,
  CreateOutletDto,
  DishShelfDto,
  DishStockDto,
  UpdateCategoryDto,
  UpdateDishDto,
  UpdateOutletDto
} from "./dto/canteen.dto";

/**
 * 基础档案 CRUD：outlets / categories / dishes。
 * 全部查询带 tenant_id/park_id/is_deleted；写操作由控制器层幂等拦截器 + 权限守卫兜底。
 */
@Injectable()
export class CanteenArchiveService {
  constructor(
    @InjectRepository(CanteenOutletEntity)
    private readonly outletRepo: Repository<CanteenOutletEntity>,
    @InjectRepository(CanteenCategoryEntity)
    private readonly categoryRepo: Repository<CanteenCategoryEntity>,
    @InjectRepository(CanteenDishEntity)
    private readonly dishRepo: Repository<CanteenDishEntity>
  ) {}

  /* ----------------------------- Outlets ----------------------------- */

  async listOutlets(scope: TenantParkScope) {
    return this.outletRepo.find({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
      order: { createTime: "DESC" }
    });
  }

  async getOutlet(scope: TenantParkScope, id: string) {
    const outlet = await this.outletRepo.findOne({
      where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    if (!outlet) throw new NotFoundException("outlet not found");
    return outlet;
  }

  async createOutlet(scope: TenantParkScope, actor: JwtPrincipal, dto: CreateOutletDto) {
    // outlet_no 由后端生成（O + yyyyMMdd + seq），避免前端传号。
    const day = new Date();
    const ymd = `${day.getFullYear()}${String(day.getMonth() + 1).padStart(2, "0")}${String(day.getDate()).padStart(2, "0")}`;
    const count = await this.outletRepo.count({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    const outlet = this.outletRepo.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      outletNo: `O${ymd}${String(count + 1).padStart(4, "0")}`,
      name: dto.name,
      outletType: dto.outlet_type,
      contractorId: dto.contractor_id,
      location: dto.location ?? null,
      businessHours: dto.business_hours ?? null,
      managerUserId: dto.manager_user_id ?? null,
      status: "open",
      createBy: actor.sub,
      updateBy: actor.sub
    });
    return this.outletRepo.save(outlet);
  }

  async updateOutlet(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: UpdateOutletDto) {
    const outlet = await this.getOutlet(scope, id);
    this.outletRepo.merge(outlet, {
      name: dto.name ?? outlet.name,
      outletType: dto.outlet_type ?? outlet.outletType,
      contractorId: dto.contractor_id ?? outlet.contractorId,
      location: dto.location ?? outlet.location,
      businessHours: dto.business_hours ?? outlet.businessHours,
      managerUserId: dto.manager_user_id ?? outlet.managerUserId,
      updateBy: actor.sub
    });
    return this.outletRepo.save(outlet);
  }

  async changeOutletStatus(scope: TenantParkScope, actor: JwtPrincipal, id: string, status: string) {
    const outlet = await this.getOutlet(scope, id);
    outlet.status = status;
    outlet.updateBy = actor.sub;
    return this.outletRepo.save(outlet);
  }

  /* ----------------------------- Categories ----------------------------- */

  async listCategories(scope: TenantParkScope, outletId: string) {
    return this.categoryRepo.find({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, outletId, isDeleted: false },
      order: { sortOrder: "ASC", createTime: "ASC" }
    });
  }

  async createCategory(scope: TenantParkScope, actor: JwtPrincipal, outletId: string, dto: CreateCategoryDto) {
    await this.getOutlet(scope, outletId);
    const category = this.categoryRepo.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      outletId,
      name: dto.name,
      sortOrder: dto.sort_order ?? 0,
      status: dto.status ?? "on",
      createBy: actor.sub,
      updateBy: actor.sub
    });
    return this.categoryRepo.save(category);
  }

  async updateCategory(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: UpdateCategoryDto) {
    const category = await this.categoryRepo.findOne({
      where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    if (!category) throw new NotFoundException("category not found");
    this.categoryRepo.merge(category, {
      name: dto.name ?? category.name,
      sortOrder: dto.sort_order ?? category.sortOrder,
      status: dto.status ?? category.status,
      updateBy: actor.sub
    });
    return this.categoryRepo.save(category);
  }

  async deleteCategory(scope: TenantParkScope, id: string) {
    const category = await this.categoryRepo.findOne({
      where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    if (!category) throw new NotFoundException("category not found");
    // 软删；若该品类下仍有在架餐品则拒绝。
    const dishCount = await this.dishRepo.count({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, categoryId: id, isDeleted: false }
    });
    if (dishCount > 0) {
      throw new ConflictException("category has dishes, cannot delete");
    }
    category.isDeleted = true;
    await this.categoryRepo.save(category);
    return { id, deleted: true };
  }

  /* ----------------------------- Dishes ----------------------------- */

  async listDishes(scope: TenantParkScope, outletId: string, filter: { categoryId?: string; status?: string }) {
    await this.getOutlet(scope, outletId);
    return this.dishRepo.find({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        outletId,
        isDeleted: false,
        ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
        ...(filter.status ? { status: filter.status } : {})
      },
      order: { createTime: "DESC" }
    });
  }

  async getDish(scope: TenantParkScope, id: string) {
    const dish = await this.dishRepo.findOne({
      where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    if (!dish) throw new NotFoundException("dish not found");
    return dish;
  }

  async createDish(scope: TenantParkScope, actor: JwtPrincipal, dto: CreateDishDto) {
    await this.getOutlet(scope, dto.outlet_id);
    const category = await this.categoryRepo.findOne({
      where: { id: dto.category_id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    if (!category) throw new NotFoundException("category not found");
    const count = await this.dishRepo.count({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, outletId: dto.outlet_id, isDeleted: false }
    });
    const dish = this.dishRepo.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      outletId: dto.outlet_id,
      categoryId: dto.category_id,
      dishNo: `D${String(count + 1).padStart(4, "0")}`,
      name: dto.name,
      price: Number(dto.price).toFixed(2),
      imageFileId: dto.image_file_id ?? null,
      unit: dto.unit ?? "份",
      barcode: dto.barcode ?? null,
      dailyStock: dto.daily_stock ?? null,
      soldCount: 0,
      needBooking: dto.need_booking ?? false,
      status: "off_shelf",
      shelfTime: null,
      unshelfTime: null,
      createBy: actor.sub,
      updateBy: actor.sub
    });
    return this.dishRepo.save(dish);
  }

  async updateDish(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: UpdateDishDto) {
    const dish = await this.getDish(scope, id);
    this.dishRepo.merge(dish, {
      categoryId: dto.category_id ?? dish.categoryId,
      name: dto.name ?? dish.name,
      price: dto.price !== undefined ? Number(dto.price).toFixed(2) : dish.price,
      imageFileId: dto.image_file_id ?? dish.imageFileId,
      unit: dto.unit ?? dish.unit,
      barcode: dto.barcode ?? dish.barcode,
      dailyStock: dto.daily_stock ?? dish.dailyStock,
      needBooking: dto.need_booking ?? dish.needBooking,
      updateBy: actor.sub
    });
    return this.dishRepo.save(dish);
  }

  async changeDishShelf(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: DishShelfDto) {
    const dish = await this.getDish(scope, id);
    dish.status = dto.status;
    const now = new Date();
    dish.shelfTime = dto.status === "on_shelf" ? now : dish.shelfTime;
    dish.unshelfTime = dto.status === "off_shelf" ? now : dish.unshelfTime;
    dish.updateBy = actor.sub;
    return this.dishRepo.save(dish);
  }

  async adjustDishStock(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: DishStockDto) {
    const dish = await this.getDish(scope, id);
    if (dto.daily_stock !== undefined) dish.dailyStock = dto.daily_stock;
    if (dto.sold_count !== undefined) dish.soldCount = dto.sold_count;
    dish.updateBy = actor.sub;
    return this.dishRepo.save(dish);
  }
}
