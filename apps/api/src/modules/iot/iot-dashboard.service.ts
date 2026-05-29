import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { type Repository, type SelectQueryBuilder } from "typeorm";
import type { TenantParkScope } from "@jinhu/shared";
import { DataScopeService } from "../data-scopes/data-scope.service";
import { FieldPolicyService } from "../field-policies/field-policy.service";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { IotAlertEntity } from "./entities/iot-alert.entity";
import { IotDeviceDataEntity } from "./entities/iot-device-data.entity";
import { IotDeviceHeartbeatEntity } from "./entities/iot-device-heartbeat.entity";
import { IotDeviceEntity } from "./entities/iot-device.entity";

const ACTIVE_ALERT_STATUSES = ["active", "10"];
const SEVERE_ALERT_LEVELS = ["major", "critical", "30", "40"];
const IOT_MODULE = "iot";
const DEVICE_ENTITY = "iot_device";
const ALERT_ENTITY = "iot_alert";

export interface IotDashboardSummary {
  total_devices: number;
  online_devices: number;
  offline_devices: number;
  fault_devices: number;
  today_report_count: number;
  active_alert_count: number;
  severe_alert_count: number;
}

export interface IotDashboardDeviceTypeBucket {
  device_type: string;
  count: number;
}

export interface IotDashboardRecentAlert {
  id: string;
  alert_code: string;
  alert_title: string;
  alert_level: string;
  status: string;
  device_id: string;
  device_code: string;
  device_name: string;
  metric_code: string;
  trigger_value: string | null;
  last_trigger_time: Date;
}

export interface IotDashboardRecentDevice {
  id: string;
  device_code: string;
  device_name: string;
  device_type: string;
  online_status: string;
  status: string;
  location: string | null;
  last_data_time: Date | null;
}

export interface IotDashboardView {
  summary: IotDashboardSummary;
  by_device_type: IotDashboardDeviceTypeBucket[];
  recent_alerts: IotDashboardRecentAlert[];
  recent_devices: IotDashboardRecentDevice[];
}

export interface IotLinkedDeviceRow {
  id: string;
  device_code: string;
  device_name: string;
  device_type: string;
  online_status: string;
  status: string;
  location: string | null;
  last_data_time: Date | null;
}

export interface IotLinkedAlertRow {
  id: string;
  alert_code: string;
  alert_title: string;
  alert_level: string;
  status: string;
  device_id: string;
  device_code: string;
  device_name: string;
  metric_code: string;
  trigger_value: string | null;
  last_trigger_time: Date;
}

export interface IotUnitDevicesNode {
  summary: {
    device_count: number;
    online_count: number;
    offline_count: number;
    active_alert_count: number;
  };
  recent_devices: IotLinkedDeviceRow[];
  recent_alerts: IotLinkedAlertRow[];
}

export interface IotTenant360DevicesNode {
  available: true;
  summary: {
    device_count: number;
    online_count: number;
    active_alert_count: number;
  };
  recent_devices: IotLinkedDeviceRow[];
  recent_alerts: IotLinkedAlertRow[];
}

interface DeviceLinkFilter {
  unitId?: string;
  parkTenantId?: string;
}

@Injectable()
export class IotDashboardService {
  constructor(
    @InjectRepository(IotDeviceEntity)
    private readonly deviceRepository: Repository<IotDeviceEntity>,
    @InjectRepository(IotDeviceDataEntity)
    private readonly deviceDataRepository: Repository<IotDeviceDataEntity>,
    @InjectRepository(IotDeviceHeartbeatEntity)
    private readonly heartbeatRepository: Repository<IotDeviceHeartbeatEntity>,
    @InjectRepository(IotAlertEntity)
    private readonly alertRepository: Repository<IotAlertEntity>,
    private readonly dataScopeService: DataScopeService,
    private readonly fieldPolicyService: FieldPolicyService
  ) {}

  async dashboard(scope: TenantParkScope, actor?: JwtPrincipal): Promise<IotDashboardView> {
    const [
      totalDevices,
      onlineDevices,
      offlineDevices,
      faultDevices,
      todayReportCount,
      activeAlertCount,
      severeAlertCount,
      byDeviceType,
      recentAlerts,
      recentDevices
    ] = await Promise.all([
      this.countDevices(scope, actor),
      this.countDevices(scope, actor, (builder) => builder.andWhere("device.online_status = :online", { online: "online" })),
      this.countDevices(scope, actor, (builder) => builder.andWhere("device.online_status = :offline", { offline: "offline" })),
      this.countDevices(scope, actor, (builder) =>
        builder.andWhere("(device.online_status = :fault OR device.status = :fault)", { fault: "fault" })
      ),
      this.countTodayReports(scope, actor),
      this.countAlerts(scope, actor, (builder) => builder.andWhere("alert.status IN (:...activeStatuses)", { activeStatuses: ACTIVE_ALERT_STATUSES })),
      this.countAlerts(scope, actor, (builder) =>
        builder
          .andWhere("alert.status IN (:...activeStatuses)", { activeStatuses: ACTIVE_ALERT_STATUSES })
          .andWhere("alert.alert_level IN (:...severeLevels)", { severeLevels: SEVERE_ALERT_LEVELS })
      ),
      this.deviceTypeDistribution(scope, actor),
      this.recentAlerts(scope, actor),
      this.recentDevices(scope, actor)
    ]);

    return {
      summary: {
        total_devices: totalDevices,
        online_devices: onlineDevices,
        offline_devices: offlineDevices,
        fault_devices: faultDevices,
        today_report_count: todayReportCount,
        active_alert_count: activeAlertCount,
        severe_alert_count: severeAlertCount
      },
      by_device_type: byDeviceType,
      recent_alerts: recentAlerts,
      recent_devices: recentDevices
    };
  }

  async overview(scope: TenantParkScope, actor?: JwtPrincipal): Promise<IotDashboardView> {
    return this.dashboard(scope, actor);
  }

  async deviceStatus(scope: TenantParkScope, actor?: JwtPrincipal): Promise<{
    total_count: number;
    online_count: number;
    offline_count: number;
    fault_count: number;
    disabled_count: number;
    online_rate: number;
    by_status: Array<{ status: string; count: number }>;
  }> {
    const builder = await this.scopedDeviceBuilder(scope, actor);
    const rows = await builder
      .select("COALESCE(device.online_status, device.status, 'unknown')", "status")
      .addSelect("COUNT(*)", "count")
      .groupBy("COALESCE(device.online_status, device.status, 'unknown')")
      .getRawMany<{ status: string; count: string }>();
    const byStatus = rows.map((row) => ({ status: row.status, count: Number(row.count) }));
    const countOf = (status: string) => byStatus.find((item) => item.status === status)?.count ?? 0;
    const total = byStatus.reduce((sum, item) => sum + item.count, 0);
    const online = countOf("online");
    return {
      total_count: total,
      online_count: online,
      offline_count: countOf("offline"),
      fault_count: countOf("fault"),
      disabled_count: countOf("disabled"),
      online_rate: total === 0 ? 0 : Number((online / total).toFixed(4)),
      by_status: byStatus
    };
  }

  async alertTrends(scope: TenantParkScope, actor?: JwtPrincipal): Promise<Array<{ date: string; count: number; active_count: number }>> {
    const start = new Date();
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    const builder = await this.scopedAlertBuilder(scope, actor);
    const rows = await builder
      .select("to_char(alert.last_trigger_time, 'YYYY-MM-DD')", "date")
      .addSelect("COUNT(*)", "count")
      .addSelect("SUM(CASE WHEN alert.status IN (:...activeStatuses) THEN 1 ELSE 0 END)", "active_count")
      .andWhere("alert.last_trigger_time >= :start", { start })
      .setParameter("activeStatuses", ACTIVE_ALERT_STATUSES)
      .groupBy("to_char(alert.last_trigger_time, 'YYYY-MM-DD')")
      .orderBy("date", "ASC")
      .getRawMany<{ date: string; count: string; active_count: string | null }>();
    return rows.map((row) => ({
      date: row.date,
      count: Number(row.count),
      active_count: Number(row.active_count ?? 0)
    }));
  }

  async realtimeEvents(scope: TenantParkScope, actor?: JwtPrincipal): Promise<{
    recent_alerts: IotDashboardRecentAlert[];
    recent_devices: IotDashboardRecentDevice[];
    recent_heartbeats: Array<{ device_id: string; device_code: string | null; status: string; heartbeat_time: Date; latency_ms: number | null }>;
    recent_metrics: Array<{ device_id: string; device_code: string; metric_code: string; value: string | number | boolean | unknown | null; reported_at: Date }>;
  }> {
    const [recentAlerts, recentDevices, heartbeats, metrics] = await Promise.all([
      this.recentAlerts(scope, actor),
      this.recentDevices(scope, actor),
      this.recentHeartbeats(scope, actor),
      this.recentMetrics(scope, actor)
    ]);
    return {
      recent_alerts: recentAlerts,
      recent_devices: recentDevices,
      recent_heartbeats: heartbeats,
      recent_metrics: metrics
    };
  }

  async unitDevices(scope: TenantParkScope, actor: JwtPrincipal, unitId: string): Promise<IotUnitDevicesNode> {
    const filter = { unitId };
    const [deviceCount, onlineCount, offlineCount, activeAlertCount, devicesRaw, alertsRaw] = await Promise.all([
      this.countLinkedDevices(scope, actor, filter),
      this.countLinkedDevices(scope, actor, filter, (builder) => builder.andWhere("device.online_status = :onlineStatus", { onlineStatus: "online" })),
      this.countLinkedDevices(scope, actor, filter, (builder) => builder.andWhere("device.online_status = :offlineStatus", { offlineStatus: "offline" })),
      this.countLinkedActiveAlerts(scope, actor, filter),
      this.recentLinkedDevices(scope, actor, filter),
      this.recentLinkedAlerts(scope, actor, filter)
    ]);
    const [recentDevices, recentAlerts] = await Promise.all([
      this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, IOT_MODULE, DEVICE_ENTITY, devicesRaw),
      this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, IOT_MODULE, ALERT_ENTITY, alertsRaw)
    ]);
    return {
      summary: {
        device_count: deviceCount,
        online_count: onlineCount,
        offline_count: offlineCount,
        active_alert_count: activeAlertCount
      },
      recent_devices: recentDevices,
      recent_alerts: recentAlerts
    };
  }

  async tenant360Devices(scope: TenantParkScope, actor: JwtPrincipal, parkTenantId: string): Promise<IotTenant360DevicesNode> {
    const filter = { parkTenantId };
    const [deviceCount, onlineCount, activeAlertCount, devicesRaw, alertsRaw] = await Promise.all([
      this.countLinkedDevices(scope, actor, filter),
      this.countLinkedDevices(scope, actor, filter, (builder) => builder.andWhere("device.online_status = :onlineStatus", { onlineStatus: "online" })),
      this.countLinkedActiveAlerts(scope, actor, filter),
      this.recentLinkedDevices(scope, actor, filter),
      this.recentLinkedAlerts(scope, actor, filter)
    ]);
    const [recentDevices, recentAlerts] = await Promise.all([
      this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, IOT_MODULE, DEVICE_ENTITY, devicesRaw),
      this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, IOT_MODULE, ALERT_ENTITY, alertsRaw)
    ]);
    return {
      available: true,
      summary: {
        device_count: deviceCount,
        online_count: onlineCount,
        active_alert_count: activeAlertCount
      },
      recent_devices: recentDevices,
      recent_alerts: recentAlerts
    };
  }

  private async countDevices(
    scope: TenantParkScope,
    actor?: JwtPrincipal,
    refine?: (builder: SelectQueryBuilder<IotDeviceEntity>) => void
  ): Promise<number> {
    const builder = await this.scopedDeviceBuilder(scope, actor);
    refine?.(builder);
    return builder.getCount();
  }

  private async countAlerts(
    scope: TenantParkScope,
    actor?: JwtPrincipal,
    refine?: (builder: SelectQueryBuilder<IotAlertEntity>) => void
  ): Promise<number> {
    const builder = await this.scopedAlertBuilder(scope, actor);
    refine?.(builder);
    return builder.getCount();
  }

  private async countTodayReports(scope: TenantParkScope, actor?: JwtPrincipal): Promise<number> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const builder = this.deviceDataRepository
      .createQueryBuilder("data")
      .innerJoin(IotDeviceEntity, "device", "device.id = data.device_id AND device.tenant_id = data.tenant_id AND device.park_id = data.park_id")
      .where("data.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("data.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("data.is_deleted = false")
      .andWhere("device.is_deleted = false")
      .andWhere("data.reported_at >= :todayStart", { todayStart });
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "park", "device");
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "device", "device", { device: "id" });
    return builder.getCount();
  }

  private async deviceTypeDistribution(scope: TenantParkScope, actor?: JwtPrincipal): Promise<IotDashboardDeviceTypeBucket[]> {
    const builder = await this.scopedDeviceBuilder(scope, actor);
    const rows = await builder
      .select("device.device_type", "device_type")
      .addSelect("COUNT(*)", "count")
      .groupBy("device.device_type")
      .orderBy("count", "DESC")
      .getRawMany<{ device_type: string; count: string }>();
    return rows.map((row) => ({ device_type: row.device_type, count: Number(row.count) }));
  }

  private async recentAlerts(scope: TenantParkScope, actor?: JwtPrincipal): Promise<IotDashboardRecentAlert[]> {
    const builder = await this.scopedAlertBuilder(scope, actor);
    const rows = await builder.orderBy("alert.last_trigger_time", "DESC").addOrderBy("alert.create_time", "DESC").take(8).getMany();
    return rows.map((row) => ({
      id: row.id,
      alert_code: row.alertCode,
      alert_title: row.alertTitle,
      alert_level: row.alertLevel,
      status: row.status,
      device_id: row.deviceId,
      device_code: row.deviceCode,
      device_name: row.deviceName,
      metric_code: row.metricCode,
      trigger_value: row.triggerValue,
      last_trigger_time: row.lastTriggerTime
    }));
  }

  private async recentDevices(scope: TenantParkScope, actor?: JwtPrincipal): Promise<IotDashboardRecentDevice[]> {
    const builder = await this.scopedDeviceBuilder(scope, actor);
    const rows = await builder.orderBy("device.last_data_time", "DESC", "NULLS LAST").addOrderBy("device.update_time", "DESC").take(8).getMany();
    return rows.map((row) => ({
      id: row.id,
      device_code: row.deviceCode,
      device_name: row.deviceName,
      device_type: row.deviceType,
      online_status: row.onlineStatus,
      status: row.status,
      location: row.location,
      last_data_time: row.lastDataTime ?? row.lastReportTime
    }));
  }

  private async recentHeartbeats(
    scope: TenantParkScope,
    actor?: JwtPrincipal
  ): Promise<Array<{ device_id: string; device_code: string | null; status: string; heartbeat_time: Date; latency_ms: number | null }>> {
    const builder = this.heartbeatRepository
      .createQueryBuilder("heartbeat")
      .innerJoin(IotDeviceEntity, "device", "device.id = heartbeat.device_id AND device.tenant_id = heartbeat.tenant_id AND device.park_id = heartbeat.park_id")
      .where("heartbeat.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("heartbeat.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("heartbeat.is_deleted = false")
      .andWhere("device.is_deleted = false");
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "park", "device");
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "device", "device", { device: "id" });
    const rows = await builder.orderBy("heartbeat.heartbeatTime", "DESC").addOrderBy("heartbeat.createTime", "DESC").take(10).getMany();
    return rows.map((row) => ({
      device_id: row.deviceId,
      device_code: row.deviceCode,
      status: row.status,
      heartbeat_time: row.heartbeatTime,
      latency_ms: row.latencyMs
    }));
  }

  private async recentMetrics(
    scope: TenantParkScope,
    actor?: JwtPrincipal
  ): Promise<Array<{ device_id: string; device_code: string; metric_code: string; value: string | number | boolean | unknown | null; reported_at: Date }>> {
    const builder = this.deviceDataRepository
      .createQueryBuilder("data")
      .innerJoin(IotDeviceEntity, "device", "device.id = data.device_id AND device.tenant_id = data.tenant_id AND device.park_id = data.park_id")
      .where("data.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("data.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("data.is_deleted = false")
      .andWhere("device.is_deleted = false");
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "park", "device");
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "device", "device", { device: "id" });
    const rows = await builder.orderBy("data.reportedAt", "DESC").addOrderBy("data.createTime", "DESC").take(10).getMany();
    return rows.map((row) => ({
      device_id: row.deviceId,
      device_code: row.deviceCode,
      metric_code: row.metricCode,
      value: this.resolveDataValue(row),
      reported_at: row.reportedAt
    }));
  }

  private async countLinkedDevices(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    filter: DeviceLinkFilter,
    refine?: (builder: SelectQueryBuilder<IotDeviceEntity>) => void
  ): Promise<number> {
    const builder = await this.scopedDeviceBuilder(scope, actor);
    this.applyDeviceLinkFilter(builder, "device", filter);
    refine?.(builder);
    return builder.getCount();
  }

  private async countLinkedActiveAlerts(scope: TenantParkScope, actor: JwtPrincipal, filter: DeviceLinkFilter): Promise<number> {
    const builder = await this.linkedAlertBuilder(scope, actor, filter);
    return builder.andWhere("alert.status IN (:...activeStatuses)", { activeStatuses: ACTIVE_ALERT_STATUSES }).getCount();
  }

  private async recentLinkedDevices(scope: TenantParkScope, actor: JwtPrincipal, filter: DeviceLinkFilter): Promise<IotLinkedDeviceRow[]> {
    const builder = await this.scopedDeviceBuilder(scope, actor);
    this.applyDeviceLinkFilter(builder, "device", filter);
    const rows = await builder.orderBy("device.last_data_time", "DESC", "NULLS LAST").addOrderBy("device.update_time", "DESC").take(8).getMany();
    return rows.map((row) => this.toLinkedDevice(row));
  }

  private async recentLinkedAlerts(scope: TenantParkScope, actor: JwtPrincipal, filter: DeviceLinkFilter): Promise<IotLinkedAlertRow[]> {
    const builder = await this.linkedAlertBuilder(scope, actor, filter);
    const rows = await builder
      .andWhere("alert.status IN (:...activeStatuses)", { activeStatuses: ACTIVE_ALERT_STATUSES })
      .orderBy("alert.lastTriggerTime", "DESC")
      .addOrderBy("alert.createTime", "DESC")
      .take(8)
      .getMany();
    return rows.map((row) => this.toLinkedAlert(row));
  }

  private async linkedAlertBuilder(scope: TenantParkScope, actor: JwtPrincipal, filter: DeviceLinkFilter): Promise<SelectQueryBuilder<IotAlertEntity>> {
    const builder = await this.scopedAlertBuilder(scope, actor);
    builder.innerJoin(
      IotDeviceEntity,
      "device",
      "device.id = alert.device_id AND device.tenant_id = alert.tenant_id AND device.park_id = alert.park_id AND device.is_deleted = false"
    );
    this.applyDeviceLinkFilter(builder, "device", filter);
    return builder;
  }

  private applyDeviceLinkFilter(
    builder: SelectQueryBuilder<IotDeviceEntity> | SelectQueryBuilder<IotAlertEntity>,
    alias: string,
    filter: DeviceLinkFilter
  ): void {
    if (filter.unitId) {
      builder.andWhere(`${alias}.unit_id = :iotUnitId`, { iotUnitId: filter.unitId });
    }
    if (filter.parkTenantId) {
      builder.andWhere(`${alias}.park_tenant_id = :iotParkTenantId`, { iotParkTenantId: filter.parkTenantId });
    }
  }

  private toLinkedDevice(row: IotDeviceEntity): IotLinkedDeviceRow {
    return {
      id: row.id,
      device_code: row.deviceCode,
      device_name: row.deviceName,
      device_type: row.deviceType,
      online_status: row.onlineStatus,
      status: row.status,
      location: row.location,
      last_data_time: row.lastDataTime ?? row.lastReportTime
    };
  }

  private toLinkedAlert(row: IotAlertEntity): IotLinkedAlertRow {
    return {
      id: row.id,
      alert_code: row.alertCode,
      alert_title: row.alertTitle,
      alert_level: row.alertLevel,
      status: row.status,
      device_id: row.deviceId,
      device_code: row.deviceCode,
      device_name: row.deviceName,
      metric_code: row.metricCode,
      trigger_value: row.triggerValue,
      last_trigger_time: row.lastTriggerTime
    };
  }

  private async scopedDeviceBuilder(scope: TenantParkScope, actor?: JwtPrincipal): Promise<SelectQueryBuilder<IotDeviceEntity>> {
    const builder = this.deviceRepository
      .createQueryBuilder("device")
      .where("device.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("device.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("device.is_deleted = false");
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "park", "device");
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "device", "device", { device: "id" });
    return builder;
  }

  private async scopedAlertBuilder(scope: TenantParkScope, actor?: JwtPrincipal): Promise<SelectQueryBuilder<IotAlertEntity>> {
    const builder = this.alertRepository
      .createQueryBuilder("alert")
      .where("alert.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("alert.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("alert.is_deleted = false");
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "park", "alert");
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "device", "alert");
    return builder;
  }

  private resolveDataValue(row: IotDeviceDataEntity): string | number | boolean | unknown | null {
    if (row.valueType === "number" && row.valueNumber !== null) return Number(row.valueNumber);
    if (row.valueType === "boolean") return row.valueBool;
    if (row.valueType === "json") return row.valueJson;
    return row.valueText ?? row.valueNumber ?? row.valueBool ?? row.valueJson ?? null;
  }
}
