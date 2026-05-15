import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Repository } from "typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import type { PaginationQueryDto } from "../../shared/dto/pagination-query.dto";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { TenantEntity } from "./entities/tenant.entity";

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(TenantEntity)
    private readonly tenantRepository: Repository<TenantEntity>
  ) {}

  async current(scope: TenantParkScope): Promise<TenantEntity> {
    const tenant =
      (await this.tenantRepository
        .createQueryBuilder("tenant")
        .where("tenant.tenantId = :tenantId", { tenantId: scope.tenantId })
        .andWhere("tenant.isDeleted = false")
        .getOne()) ??
      (await this.tenantRepository
        .createQueryBuilder("tenant")
        .where("tenant.tenantCode = :tenantCode", { tenantCode: "JH_DEFAULT" })
        .andWhere("tenant.isDeleted = false")
        .getOne());
    if (!tenant) {
      throw new NotFoundException("Tenant not found");
    }
    return tenant;
  }

  async list(actor: JwtPrincipal, query: PaginationQueryDto): Promise<PaginatedResult<TenantEntity>> {
    this.assertSuper(actor);
    const builder = this.tenantRepository.createQueryBuilder("tenant").where("tenant.isDeleted = false");
    if (query.status) {
      builder.andWhere("tenant.status = :status", { status: this.toStatusNumber(query.status) });
    }
    if (query.keyword) {
      builder.andWhere("(tenant.tenantCode ILIKE :keyword OR tenant.tenantName ILIKE :keyword)", {
        keyword: `%${query.keyword}%`
      });
    }
    const [items, total] = await builder
      .orderBy("tenant.createTime", "DESC")
      .skip((query.page - 1) * query.page_size)
      .take(query.page_size)
      .getManyAndCount();
    return { items, total, page: query.page, page_size: query.page_size };
  }

  async detail(actor: JwtPrincipal, id: string): Promise<TenantEntity> {
    this.assertSuper(actor);
    const tenant = await this.tenantRepository
      .createQueryBuilder("tenant")
      .where("tenant.id = :id", { id })
      .andWhere("tenant.isDeleted = false")
      .getOne();
    if (!tenant) {
      throw new NotFoundException("Tenant not found");
    }
    return tenant;
  }

  private assertSuper(actor: JwtPrincipal): void {
    if (!actor.isSuper && !actor.permissions.includes("*")) {
      throw new ForbiddenException("Only super administrator can access tenant list");
    }
  }

  private toStatusNumber(status: string): number {
    if (status === "enabled") return 1;
    if (status === "expired") return 2;
    if (status === "disabled") return 0;
    return Number(status);
  }
}
