import { Injectable } from "@nestjs/common";
import type { IotIngestResult } from "./iot-ingest.service";
import { IotIngestService } from "./iot-ingest.service";
import { MqttMessageParser } from "./mqtt-message-parser";

@Injectable()
export class MqttIngestService {
  constructor(
    private readonly parser: MqttMessageParser,
    private readonly ingestService: IotIngestService
  ) {}

  async ingest(topic: string, payload: Buffer | string): Promise<IotIngestResult> {
    const message = this.parser.parse(topic, payload);
    return this.ingestService.ingestTrusted({
      device_code: message.deviceCode,
      park_code: message.parkCode,
      reported_at: message.reportedAt,
      metrics: message.metrics,
      quality: message.quality,
      source_type: "mqtt",
      raw_payload: {
        mqtt_topic: message.topic,
        topic_metric: message.metric,
        ...message.rawPayload
      }
    });
  }
}
