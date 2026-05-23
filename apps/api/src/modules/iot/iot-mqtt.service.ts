import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import mqtt, { type IClientOptions, type MqttClient } from "mqtt";
import { MqttIngestService } from "./mqtt-ingest.service";

const DEFAULT_SUBSCRIBE_TOPIC = "park/+/device/+/+";

export interface IotMqttStatus {
  configured: boolean;
  connected: boolean;
  subscribed: boolean;
  broker_url: string | null;
  subscribe_topic: string;
  client_id: string | null;
  last_error: string | null;
  last_connect_time: string | null;
  last_disconnect_time: string | null;
  last_subscribe_time: string | null;
  last_message_time: string | null;
}

@Injectable()
export class IotMqttService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IotMqttService.name);
  private client: MqttClient | null = null;
  private readonly status: IotMqttStatus = {
    configured: false,
    connected: false,
    subscribed: false,
    broker_url: null,
    subscribe_topic: DEFAULT_SUBSCRIBE_TOPIC,
    client_id: null,
    last_error: null,
    last_connect_time: null,
    last_disconnect_time: null,
    last_subscribe_time: null,
    last_message_time: null
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly mqttIngestService: MqttIngestService
  ) {}

  onModuleInit(): void {
    this.start();
  }

  onModuleDestroy(): void {
    if (this.client) {
      this.client.end(true);
      this.client = null;
    }
  }

  getStatus(): IotMqttStatus {
    return { ...this.status };
  }

  private start(): void {
    const brokerUrl = this.configService.get<string>("MQTT_BROKER_URL")?.trim();
    if (!brokerUrl) {
      this.status.configured = false;
      this.status.last_error = "MQTT_BROKER_URL is not configured";
      this.logger.warn("MQTT_BROKER_URL is not configured; MQTT ingest adapter is disabled.");
      return;
    }

    this.status.configured = true;
    this.status.broker_url = redactBrokerUrl(brokerUrl);
    const clientId = `jinhu-api-${process.pid}`;
    this.status.client_id = clientId;
    const options: IClientOptions = {
      clientId,
      username: this.configService.get<string>("MQTT_USERNAME") || undefined,
      password: this.configService.get<string>("MQTT_PASSWORD") || undefined,
      reconnectPeriod: 5000,
      connectTimeout: 5000
    };

    try {
      this.client = mqtt.connect(brokerUrl, options);
      this.bindClientEvents(this.client);
    } catch (error) {
      this.status.last_error = error instanceof Error ? error.message : String(error);
      this.logger.warn(`MQTT adapter failed to initialize: ${this.status.last_error}`);
    }
  }

  private bindClientEvents(client: MqttClient): void {
    client.on("connect", () => {
      this.status.connected = true;
      this.status.last_error = null;
      this.status.last_connect_time = new Date().toISOString();
      client.subscribe(DEFAULT_SUBSCRIBE_TOPIC, (error) => {
        if (error) {
          this.status.subscribed = false;
          this.status.last_error = error.message;
          this.logger.warn(`MQTT subscribe failed: ${error.message}`);
          return;
        }
        this.status.subscribed = true;
        this.status.last_subscribe_time = new Date().toISOString();
        this.logger.log(`MQTT subscribed ${DEFAULT_SUBSCRIBE_TOPIC}`);
      });
    });

    client.on("message", (topic, payload) => {
      void this.handleMessage(topic, payload);
    });

    client.on("close", () => {
      this.status.connected = false;
      this.status.subscribed = false;
      this.status.last_disconnect_time = new Date().toISOString();
    });

    client.on("offline", () => {
      this.status.connected = false;
      this.status.subscribed = false;
    });

    client.on("error", (error) => {
      this.status.last_error = error.message;
      this.logger.warn(`MQTT connection warning: ${error.message}`);
    });
  }

  private async handleMessage(topic: string, payload: Buffer): Promise<void> {
    this.status.last_message_time = new Date().toISOString();
    try {
      const result = await this.mqttIngestService.ingest(topic, payload);
      this.logger.log(`MQTT accepted ${result.accepted_count} metrics from ${result.device_code}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.status.last_error = message;
      this.logger.warn(`MQTT message rejected: ${message}`);
    }
  }
}

function redactBrokerUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.username) url.username = "***";
    if (url.password) url.password = "***";
    return url.toString();
  } catch {
    return value.replace(/\/\/([^:@/]+):([^@/]+)@/, "//***:***@");
  }
}
