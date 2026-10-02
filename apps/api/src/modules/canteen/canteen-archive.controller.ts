import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseInterceptors
} from "@nestjs/common";
import { CANTEEN_PERMISSIONS } from "@jinhu/shared";
import type { TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { IdempotencyInterceptor } from "../../shared/interceptors/idempotency.interceptor";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import {
  CreateCategoryDto,
  CreateDishDto,
  CreateOutletDto,
  DishShelfDto,
  DishStockDto,
  OutletStatusDto,
  UpdateCategoryDto,
  UpdateDishDto,
  UpdateOutletDto
} from "./dto/canteen.dto";
import { CanteenArchiveService } from "./canteen-archive.service";

@Controller("canteen")
export class CanteenArchiveController {
  constructor(private readonly archive: CanteenArchiveService) {}

  /* ---------------- Outlets ---------------- */

  @Get("outlets")
  @RequirePermissions(CANTEEN_PERMISSIONS.OUTLET_VIEW)
  listOutlets(@CurrentScope() scope: TenantParkScope) {
    return this.archive.listOutlets(scope);
  }

  @Get("outlets/:id")
  @RequirePermissions(CANTEEN_PERMISSIONS.OUTLET_VIEW)
  getOutlet(
    @CurrentScope() scope: TenantParkScope,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string
  ) {
    return this.archive.getOutlet(scope, id);
  }

  @Post("outlets")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(CANTEEN_PERMISSIONS.OUTLET_CREATE)
  createOutlet(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Body() dto: CreateOutletDto
  ) {
    return this.archive.createOutlet(scope, actor, dto);
  }

  @Put("outlets/:id")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(CANTEEN_PERMISSIONS.OUTLET_UPDATE)
  updateOutlet(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() dto: UpdateOutletDto
  ) {
    return this.archive.updateOutlet(scope, actor, id, dto);
  }

  @Patch("outlets/:id/status")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(CANTEEN_PERMISSIONS.OUTLET_STATUS)
  changeOutletStatus(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() dto: OutletStatusDto
  ) {
    return this.archive.changeOutletStatus(scope, actor, id, dto.status);
  }

  /* ---------------- Categories ---------------- */

  @Get("outlets/:outletId/categories")
  @RequirePermissions(CANTEEN_PERMISSIONS.CATEGORY_VIEW)
  listCategories(
    @CurrentScope() scope: TenantParkScope,
    @Param("outletId", new ParseUUIDPipe({ version: "4" })) outletId: string
  ) {
    return this.archive.listCategories(scope, outletId);
  }

  @Post("outlets/:outletId/categories")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(CANTEEN_PERMISSIONS.CATEGORY_CREATE)
  createCategory(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("outletId", new ParseUUIDPipe({ version: "4" })) outletId: string,
    @Body() dto: CreateCategoryDto
  ) {
    return this.archive.createCategory(scope, actor, outletId, dto);
  }

  @Put("categories/:id")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(CANTEEN_PERMISSIONS.CATEGORY_UPDATE)
  updateCategory(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() dto: UpdateCategoryDto
  ) {
    return this.archive.updateCategory(scope, actor, id, dto);
  }

  @Delete("categories/:id")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(CANTEEN_PERMISSIONS.CATEGORY_DELETE)
  deleteCategory(
    @CurrentScope() scope: TenantParkScope,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string
  ) {
    return this.archive.deleteCategory(scope, id);
  }

  /* ---------------- Dishes ---------------- */

  @Get("outlets/:outletId/dishes")
  @RequirePermissions(CANTEEN_PERMISSIONS.DISH_VIEW)
  listDishes(
    @CurrentScope() scope: TenantParkScope,
    @Param("outletId", new ParseUUIDPipe({ version: "4" })) outletId: string,
    @Query("category_id") categoryId?: string,
    @Query("status") status?: string
  ) {
    return this.archive.listDishes(scope, outletId, { categoryId, status });
  }

  @Get("dishes/:id")
  @RequirePermissions(CANTEEN_PERMISSIONS.DISH_VIEW)
  getDish(
    @CurrentScope() scope: TenantParkScope,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string
  ) {
    return this.archive.getDish(scope, id);
  }

  @Post("dishes")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(CANTEEN_PERMISSIONS.DISH_CREATE)
  createDish(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Body() dto: CreateDishDto
  ) {
    return this.archive.createDish(scope, actor, dto);
  }

  @Put("dishes/:id")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(CANTEEN_PERMISSIONS.DISH_UPDATE)
  updateDish(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() dto: UpdateDishDto
  ) {
    return this.archive.updateDish(scope, actor, id, dto);
  }

  @Patch("dishes/:id/shelf")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(CANTEEN_PERMISSIONS.DISH_SHELF)
  changeShelf(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() dto: DishShelfDto
  ) {
    return this.archive.changeDishShelf(scope, actor, id, dto);
  }

  @Patch("dishes/:id/stock")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(CANTEEN_PERMISSIONS.DISH_STOCK)
  adjustStock(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() dto: DishStockDto
  ) {
    return this.archive.adjustDishStock(scope, actor, id, dto);
  }
}
