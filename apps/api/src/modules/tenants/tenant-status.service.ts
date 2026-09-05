import { Injectable, UnauthorizedException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Repository } from "typeorm";
import { TenantEntity } from "./entities/tenant.entity";

/** Shared authentication gate; no tenant-management or park-business dependencies. */
@Injectable()
export class TenantStatusService {
  constructor(
    @InjectRepository(TenantEntity)
    private readonly tenantRepository: Repository<TenantEntity>
  ) {}

  async assertTenantActive(tenantId: string): Promise<TenantEntity> {
    const tenant = await this.tenantRepository.findOne({ where: { tenantId, isDeleted: false } });
    if (!tenant) {
      throw new UnauthorizedException("账号所属租户不存在，请联系管理员");
    }
    if (tenant.status === 0) {
      throw new UnauthorizedException("账号所属租户已停用，请联系管理员");
    }
    if (tenant.status === 2 || (tenant.expireTime && tenant.expireTime.getTime() <= Date.now())) {
      throw new UnauthorizedException("账号所属租户已过期，请联系管理员续费");
    }
    return tenant;
  }
}
