import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { TenantParkScope } from "@jinhu/shared";
import type { Repository } from "typeorm";
import { UserOrgEntity } from "../orgs/entities/user-org.entity";
import { UserEntity } from "../users/entities/user.entity";
import { WorkOrderEntity } from "../work-orders/entities/work-order.entity";
import type { WorkforceCandidate } from "./domain/ai-work-plan.types";

const ACTIVE_WORK_ORDER_STATUSES = ["20", "30", "40", "45", "91"];

@Injectable()
export class WorkforceDirectoryService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(UserOrgEntity)
    private readonly userOrgRepository: Repository<UserOrgEntity>,
    @InjectRepository(WorkOrderEntity)
    private readonly workOrdersRepository: Repository<WorkOrderEntity>
  ) {}

  async list(scope: TenantParkScope): Promise<WorkforceCandidate[]> {
    const users = await this.usersRepository.find({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        isDeleted: false,
        isEnabled: true,
        status: "enabled"
      },
      relations: { roleLinks: { role: true } },
      order: { displayName: "ASC" }
    });
    const [orgLinks, workloadRows] = await Promise.all([
      this.userOrgRepository.find({
        where: { tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
        relations: { org: true, post: true },
        order: { isPrimary: "DESC", createTime: "ASC" }
      }),
      this.workOrdersRepository
        .createQueryBuilder("workOrder")
        .select("workOrder.assignee_id", "assigneeId")
        .addSelect("COUNT(*)", "count")
        .where("workOrder.tenant_id = :tenantId", { tenantId: scope.tenantId })
        .andWhere("workOrder.park_id = :parkId", { parkId: scope.parkId })
        .andWhere("workOrder.is_deleted = false")
        .andWhere("workOrder.assignee_id IS NOT NULL")
        .andWhere("workOrder.status IN (:...statuses)", { statuses: ACTIVE_WORK_ORDER_STATUSES })
        .groupBy("workOrder.assignee_id")
        .getRawMany<{ assigneeId: string; count: string }>()
    ]);
    const primaryOrg = new Map<string, UserOrgEntity>();
    for (const link of orgLinks) {
      const current = primaryOrg.get(link.userId);
      if (!current || link.isPrimary) primaryOrg.set(link.userId, link);
    }
    const workloads = new Map(workloadRows.map((row) => [row.assigneeId, Number(row.count)]));
    return users.map((user) => {
      const orgLink = primaryOrg.get(user.id);
      const activeRoles = user.roleLinks.filter((link) => !link.isDeleted && !link.role.isDeleted && link.role.isEnabled && link.role.status === "enabled");
      return {
        userId: user.id,
        username: user.username,
        displayName: user.displayName || user.username,
        orgId: orgLink?.orgId ?? null,
        orgName: orgLink?.org?.orgName ?? null,
        postName: orgLink?.post?.postName ?? null,
        roleCodes: activeRoles.map((link) => link.role.code),
        roleNames: activeRoles.map((link) => link.role.name),
        activeWorkload: workloads.get(user.id) ?? 0
      };
    });
  }

  async get(scope: TenantParkScope, userId: string): Promise<WorkforceCandidate> {
    const user = (await this.list(scope)).find((candidate) => candidate.userId === userId);
    if (!user) throw new NotFoundException("责任人不属于当前园区或账号未启用");
    return user;
  }
}
