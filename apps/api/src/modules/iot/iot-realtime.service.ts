import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type WebSocket from "ws";
import type { Repository } from "typeorm";
import type { IotAlertView } from "./iot-alerts.service";
import { IotAlertEntity } from "./entities/iot-alert.entity";
import { IotDeviceEntity } from "./entities/iot-device.entity";

const WEB_SOCKET_OPEN = 1;

export type IotRealtimeEventName =
  | "device.latest"
  | "device.status"
  | "alert.created"
  | "alert.updated"
  | "iot.device.online"
  | "iot.device.offline"
  | "iot.alert.created"
  | "iot.alert.updated"
  | "iot.metric.updated";

export interface IotRealtimeMetricPayload {
  key: string;
  metric_code: string;
  point_id: string;
  value_type: string;
  value_number: string | null;
  value_text: string | null;
  value_bool: boolean | null;
  value_json: unknown | null;
}

export interface IotRealtimeDeviceLatestPayload {
  device_id: string;
  device_code: string;
  report_time: string;
  accepted_count: number;
  alert_count: number;
  quality: string;
  metrics: IotRealtimeMetricPayload[];
}

interface IotRealtimeClient {
  socket: WebSocket;
  principal: JwtPrincipal;
  subscriptions: Set<string>;
  alive: boolean;
}

interface IotRealtimeEnvelope {
  type: "event";
  event: IotRealtimeEventName;
  tenant_id: string;
  park_id: string;
  device_id?: string;
  alert_id?: string;
  data: Record<string, unknown>;
  server_time: string;
}

type AlertLike =
  | IotAlertEntity
  | IotAlertView
  | {
      id: string;
      tenantId: string;
      parkId: string;
      alertCode: string;
      deviceId: string;
      deviceCode: string;
      deviceName: string;
      metricCode: string;
      alertLevel: string;
      alertTitle: string;
      alertContent: string | null;
      triggerValue: string | null;
      status: string;
      workOrderId: string | null;
      lastTriggerTime: Date | string;
    };

@Injectable()
export class IotRealtimeService {
  private readonly logger = new Logger(IotRealtimeService.name);
  private readonly clients = new Map<WebSocket, IotRealtimeClient>();

  constructor(
    @InjectRepository(IotDeviceEntity)
    private readonly deviceRepository: Repository<IotDeviceEntity>
  ) {}

  registerClient(socket: WebSocket, principal: JwtPrincipal): void {
    this.clients.set(socket, {
      socket,
      principal,
      subscriptions: new Set<string>(),
      alive: true
    });
    this.send(socket, {
      type: "welcome",
      tenant_id: principal.tenantId,
      park_id: principal.parkId,
      server_time: new Date().toISOString()
    });
  }

  unregisterClient(socket: WebSocket): void {
    this.clients.delete(socket);
  }

  markAlive(socket: WebSocket): void {
    const client = this.clients.get(socket);
    if (client) {
      client.alive = true;
    }
  }

  pingClients(): void {
    for (const client of this.clients.values()) {
      if (!client.alive) {
        client.socket.terminate();
        this.clients.delete(client.socket);
        continue;
      }
      client.alive = false;
      try {
        client.socket.ping();
      } catch (error) {
        this.logger.warn(`IoT realtime heartbeat failed: ${error instanceof Error ? error.message : String(error)}`);
        client.socket.terminate();
        this.clients.delete(client.socket);
      }
    }
  }

  async subscribe(socket: WebSocket, topic: string): Promise<void> {
    const client = this.clients.get(socket);
    if (!client) return;
    const normalizedTopic = topic.trim();
    await this.assertTopicAllowed(client.principal, normalizedTopic);
    client.subscriptions.add(normalizedTopic);
    this.send(socket, { type: "subscribed", topic: normalizedTopic, server_time: new Date().toISOString() });
  }

  unsubscribe(socket: WebSocket, topic: string): void {
    const client = this.clients.get(socket);
    if (!client) return;
    const normalizedTopic = topic.trim();
    client.subscriptions.delete(normalizedTopic);
    this.send(socket, { type: "unsubscribed", topic: normalizedTopic, server_time: new Date().toISOString() });
  }

  publishDeviceLatest(input: {
    tenantId: string;
    parkId: string;
    deviceId: string;
    deviceCode: string;
    reportTime: string;
    acceptedCount: number;
    alertCount: number;
    quality: string;
    metrics: IotRealtimeMetricPayload[];
  }): void {
    this.publish({
      type: "event",
      event: "device.latest",
      tenant_id: input.tenantId,
      park_id: input.parkId,
      device_id: input.deviceId,
      data: {
        device_id: input.deviceId,
        device_code: input.deviceCode,
        report_time: input.reportTime,
        accepted_count: input.acceptedCount,
        alert_count: input.alertCount,
        quality: input.quality,
        metrics: input.metrics
      },
      server_time: new Date().toISOString()
    });
  }

  publishDeviceStatus(input: { tenantId: string; parkId: string; deviceId: string; deviceCode: string; onlineStatus: string; lastDataTime: string }): void {
    const payload = {
      type: "event" as const,
      tenant_id: input.tenantId,
      park_id: input.parkId,
      device_id: input.deviceId,
      data: {
        device_id: input.deviceId,
        device_code: input.deviceCode,
        online_status: input.onlineStatus,
        last_data_time: input.lastDataTime
      },
      server_time: new Date().toISOString()
    };
    this.publish({
      ...payload,
      type: "event",
      event: "device.status",
    });
    this.publish({
      ...payload,
      event: input.onlineStatus === "online" ? "iot.device.online" : "iot.device.offline"
    });
  }

  publishMetricUpdated(input: {
    tenantId: string;
    parkId: string;
    deviceId: string;
    deviceCode: string;
    reportTime: string;
    metrics: IotRealtimeMetricPayload[];
  }): void {
    this.publish({
      type: "event",
      event: "iot.metric.updated",
      tenant_id: input.tenantId,
      park_id: input.parkId,
      device_id: input.deviceId,
      data: {
        device_id: input.deviceId,
        device_code: input.deviceCode,
        report_time: input.reportTime,
        metrics: input.metrics
      },
      server_time: new Date().toISOString()
    });
  }

  publishAlertCreated(alert: AlertLike): void {
    this.publishAlert("alert.created", alert);
  }

  publishAlertUpdated(alert: AlertLike): void {
    this.publishAlert("alert.updated", alert);
  }

  private publishAlert(event: "alert.created" | "alert.updated", alert: AlertLike): void {
    const payload = this.toAlertPayload(alert);
    const envelope = {
      type: "event",
      tenant_id: payload.tenant_id,
      park_id: payload.park_id,
      device_id: payload.device_id,
      alert_id: payload.id,
      data: payload,
      server_time: new Date().toISOString()
    } as const;
    this.publish({ ...envelope, event });
    this.publish({ ...envelope, event: event === "alert.created" ? "iot.alert.created" : "iot.alert.updated" });
  }

  private publish(envelope: IotRealtimeEnvelope): void {
    for (const client of this.clients.values()) {
      if (client.principal.tenantId !== envelope.tenant_id || client.principal.parkId !== envelope.park_id) {
        continue;
      }
      if (!this.matchesSubscription(client.subscriptions, envelope)) {
        continue;
      }
      this.send(client.socket, envelope);
    }
  }

  private matchesSubscription(subscriptions: Set<string>, envelope: IotRealtimeEnvelope): boolean {
    if (subscriptions.has(`iot:park:${envelope.park_id}`)) return true;
    if (envelope.device_id && subscriptions.has(`iot:device:${envelope.device_id}`)) return true;
    if (envelope.event.includes("alert") && subscriptions.has(`iot:alerts:${envelope.park_id}`)) return true;
    return false;
  }

  private async assertTopicAllowed(principal: JwtPrincipal, topic: string): Promise<void> {
    const parkMatch = /^iot:park:([0-9a-fA-F-]+)$/.exec(topic);
    if (parkMatch) {
      if (parkMatch[1] !== principal.parkId) throw new Error("Cannot subscribe to another park");
      return;
    }
    const alertsMatch = /^iot:alerts:([0-9a-fA-F-]+)$/.exec(topic);
    if (alertsMatch) {
      if (alertsMatch[1] !== principal.parkId) throw new Error("Cannot subscribe to another park alerts");
      return;
    }
    const deviceMatch = /^iot:device:([0-9a-fA-F-]+)$/.exec(topic);
    if (deviceMatch) {
      const deviceId = deviceMatch[1]!;
      const exists = await this.deviceRepository.exists({
        where: {
          id: deviceId,
          tenantId: principal.tenantId,
          parkId: principal.parkId,
          isDeleted: false
        }
      });
      if (!exists) throw new Error("Cannot subscribe to another tenant device");
      return;
    }
    throw new Error("Unsupported IoT realtime topic");
  }

  private toAlertPayload(alert: AlertLike): Record<string, unknown> & { id: string; tenant_id: string; park_id: string; device_id: string } {
    return {
      id: alert.id,
      tenant_id: alert.tenantId,
      park_id: alert.parkId,
      alert_code: alert.alertCode,
      device_id: alert.deviceId,
      device_code: alert.deviceCode,
      device_name: alert.deviceName,
      metric_code: alert.metricCode,
      alert_level: alert.alertLevel,
      alert_title: alert.alertTitle,
      alert_content: alert.alertContent,
      trigger_value: alert.triggerValue,
      status: alert.status,
      work_order_id: alert.workOrderId,
      last_trigger_time: formatDate(alert.lastTriggerTime)
    };
  }

  private send(socket: WebSocket, payload: unknown): void {
    if (socket.readyState !== WEB_SOCKET_OPEN) return;
    socket.send(JSON.stringify(payload));
  }
}

function formatDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}
