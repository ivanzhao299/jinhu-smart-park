import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Repository } from "typeorm";
import { ILike } from "typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import type { PaginationQueryDto } from "../../shared/dto/pagination-query.dto";
import { PermissionEntity } from "./entities/permission.entity";

export interface PermissionTreeNode {
  resource: string;
  permissions: PermissionEntity[];
}

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(PermissionEntity)
    private readonly permissionsRepository: Repository<PermissionEntity>
  ) {}

  async list(scope: TenantParkScope, query: PaginationQueryDto): Promise<PaginatedResult<PermissionEntity>> {
    const statusWhere =
      query.status === "enabled" ? { isEnabled: true } : query.status === "disabled" ? { isEnabled: false } : {};
    const [items, total] = await this.permissionsRepository.findAndCount({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        isDeleted: false,
        ...statusWhere,
        ...(query.keyword ? { name: ILike(`%${query.keyword}%`) } : {})
      },
      order: { resource: "ASC", action: "ASC" },
      skip: (query.page - 1) * query.page_size,
      take: query.page_size
    });
    return { items, total, page: query.page, page_size: query.page_size };
  }

  listByScope(scope: TenantParkScope): Promise<PermissionEntity[]> {
    return this.permissionsRepository.find({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        isDeleted: false
      }
    });
  }

  async tree(scope: TenantParkScope): Promise<PermissionTreeNode[]> {
    const permissions = await this.permissionsRepository.find({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        isDeleted: false,
        isEnabled: true
      },
      order: { resource: "ASC", action: "ASC" }
    });
    const grouped = new Map<string, PermissionEntity[]>();
    for (const permission of permissions) {
      const current = grouped.get(permission.resource) ?? [];
      current.push(permission);
      grouped.set(permission.resource, current);
    }
    return Array.from(grouped.entries()).map(([resource, items]) => ({ resource, permissions: items }));
  }
}
