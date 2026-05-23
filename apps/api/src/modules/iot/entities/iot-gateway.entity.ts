import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("biz_iot_gateway")
@Index("idx_biz_iot_gateway_entity_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("uk_biz_iot_gateway_entity_code", ["tenantId", "parkId", "gatewayCode"], { unique: true, where: "is_deleted = false" })
export class IotGatewayEntity extends AuditableEntity {
  @Column({ name: "code", type: "varchar", length: 64, nullable: true })
  code!: string | null;

  @Column({ name: "gateway_code", type: "varchar", length: 64 })
  gatewayCode!: string;

  @Column({ name: "gateway_name", type: "varchar", length: 200 })
  gatewayName!: string;

  @Column({ name: "gateway_type", type: "varchar", length: 64 })
  gatewayType!: string;

  @Column({ name: "protocol_type", type: "varchar", length: 64 })
  protocolType!: string;

  @Column({ name: "vendor_name", type: "varchar", length: 120, nullable: true })
  vendorName!: string | null;

  @Column({ name: "endpoint_url", type: "varchar", length: 300, nullable: true })
  endpointUrl!: string | null;

  @Column({ name: "mqtt_client_id", type: "varchar", length: 128, nullable: true })
  mqttClientId!: string | null;

  @Column({ name: "access_key", type: "varchar", length: 128, nullable: true })
  accessKey!: string | null;

  @Column({ name: "secret_encrypted", type: "varchar", length: 256, nullable: true })
  secretEncrypted!: string | null;

  @Column({ name: "status", type: "varchar", length: 32, default: "enabled" })
  status!: string;

  @Column({ name: "last_online_time", type: "timestamptz", nullable: true })
  lastOnlineTime!: Date | null;

  @Column({ name: "last_offline_time", type: "timestamptz", nullable: true })
  lastOfflineTime!: Date | null;
}
