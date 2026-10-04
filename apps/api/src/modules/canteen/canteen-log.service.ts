import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import type { TenantParkScope } from "@jinhu/shared";
import { CanteenStatusLogEntity } from "./entities/canteen-status-log.entity";

/**
 * M4 操作审计日志全局查询。
 * - status_logs 无 outlet_id 列；可查维度：entity_type / entity_id / action / operator_name + op_time 日期有界。
 * - 走 (tenant,park,entity_type,entity_id,op_time) 索引，分页。
 */
@Injectable()
export class CanteenLogService {
  constructor(
    @InjectRepository(CanteenStatusLogEntity) private readonly repo: Repository<CanteenStatusLogEntity>
  ) {}

  async list(
    scope: TenantParkScope,
    q: {
      entity_type?: string;
      entity_id?: string;
      action?: string;
      operator_name?: string;
      start_date?: string;
      end_date?: string;
      page: number;
      page_size: number;
    }
  ) {
    const qb = this.repo
      .createQueryBuilder("l")
      .where("l.tenant_id = :t AND l.park_id = :p AND l.is_deleted = false", { t: scope.tenantId, p: scope.parkId });
    if (q.entity_type) qb.andWhere("l.entity_type = :et", { et: q.entity_type });
    if (q.entity_id) qb.andWhere("l.entity_id = :eid", { eid: q.entity_id });
    if (q.action) qb.andWhere("l.action = :act", { act: q.action });
    if (q.operator_name) qb.andWhere("l.operator_name ILIKE :on", { on: `%${q.operator_name}%` });
    if (q.start_date) qb.andWhere("l.op_time >= :sd", { sd: `${q.start_date}T00:00:00Z` });
    if (q.end_date) qb.andWhere("l.op_time <= :ed", { ed: `${q.end_date}T23:59:59Z` });
    qb.orderBy("l.op_time", "DESC").skip((q.page - 1) * q.page_size).take(q.page_size);
    const [list, total] = await qb.getManyAndCount();
    return { list, total, page: q.page, pageSize: q.page_size };
  }
}
