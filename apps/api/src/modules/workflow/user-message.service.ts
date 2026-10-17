import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Not, type FindOptionsWhere, type Repository } from "typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { WorkflowMessageQueryDto } from "./dto/workflow-message-query.dto";
import { UserMessageEntity } from "./entities/user-message.entity";

/** Recipient-only message persistence shared by both deployment compositions. */
@Injectable()
export class UserMessageService {
  constructor(@InjectRepository(UserMessageEntity) private readonly userMessagesRepository: Repository<UserMessageEntity>) {}
  async listMessages(scope: TenantParkScope, actor: JwtPrincipal, query: WorkflowMessageQueryDto): Promise<PaginatedResult<UserMessageEntity>> {
    const where: FindOptionsWhere<UserMessageEntity> = {
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      recipientId: actor.sub,
      archivedAt: IsNull(),
      isDeleted: false
    };
    if (query.read_status === "read") {
      where.readAt = Not(IsNull());
    } else if (query.read_status === "unread") {
      where.readAt = IsNull();
    }
    if (query.category) {
      where.category = query.category;
    }
    const [items, total] = await this.userMessagesRepository.findAndCount({
      where,
      order: { createTime: "DESC" },
      skip: (query.page - 1) * query.page_size,
      take: query.page_size
    });
    return { items, total, page: query.page, page_size: query.page_size };
  }

  async markMessageRead(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<UserMessageEntity> {
    const entity = await this.userMessagesRepository.findOne({
      where: {
        id,
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        recipientId: actor.sub,
        isDeleted: false
      }
    });
    if (!entity) {
      throw new NotFoundException("Message not found");
    }
    if (!entity.readAt) {
      entity.readAt = new Date();
      entity.updateBy = actor.sub;
      await this.userMessagesRepository.save(entity);
    }
    return entity;
  }

  async markAllMessagesRead(scope: TenantParkScope, actor: JwtPrincipal): Promise<{ updated: number }> {
    const result = await this.userMessagesRepository.update(
      {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        recipientId: actor.sub,
        archivedAt: IsNull(),
        readAt: IsNull(),
        isDeleted: false
      },
      {
        readAt: new Date(),
        updateBy: actor.sub
      }
    );
    return { updated: result.affected ?? 0 };
  }

}
