import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("iot_protocol_config")
@Index("idx_iot_protocol_config_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("uk_iot_protocol_config_name", ["tenantId", "parkId", "protocolType", "configName"], {
  unique: true,
  where: "is_deleted = false"
})
export class IotProtocolConfigEntity extends AuditableEntity {
  @Column({ name: "protocol_type", type: "varchar", length: 64 })
  protocolType!: string;

  @Column({ name: "config_name", type: "varchar", length: 200 })
  configName!: string;

  @Column({ name: "config_json", type: "jsonb", default: {} })
  configJson!: Record<string, unknown>;

  @Column({ name: "status", type: "varchar", length: 32, default: "enabled" })
  status!: string;
}
