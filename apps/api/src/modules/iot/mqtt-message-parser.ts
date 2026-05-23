import { BadRequestException, Injectable } from "@nestjs/common";
import type { IotMetricPayloadValue } from "./dto/iot-http-ingest.dto";

export interface ParsedMqttMessage {
  topic: string;
  parkCode: string;
  deviceCode: string;
  metric: string;
  reportedAt?: string;
  quality?: string;
  metrics: Record<string, IotMetricPayloadValue>;
  rawPayload: Record<string, unknown>;
}

@Injectable()
export class MqttMessageParser {
  parse(topic: string, payload: Buffer | string): ParsedMqttMessage {
    const topicParts = topic.split("/");
    if (
      topicParts.length !== 5 ||
      topicParts[0] !== "park" ||
      topicParts[2] !== "device" ||
      !topicParts[1] ||
      !topicParts[3] ||
      !topicParts[4]
    ) {
      throw new BadRequestException("MQTT topic must match park/{parkCode}/device/{deviceCode}/{metric}");
    }

    const parkCode = decodeURIComponent(topicParts[1]);
    const deviceCode = decodeURIComponent(topicParts[3]);
    const metric = decodeURIComponent(topicParts[4]);
    const parsedPayload = this.parsePayload(payload);
    const rawPayload = this.toRawPayload(parsedPayload);
    const reportedAt = this.pickString(rawPayload.reported_at);
    const quality = this.pickString(rawPayload.quality);
    const metrics = this.extractMetrics(metric, parsedPayload);

    if (Object.keys(metrics).length === 0) {
      throw new BadRequestException("MQTT payload metrics is required");
    }

    return {
      topic,
      parkCode,
      deviceCode,
      metric,
      reportedAt,
      quality,
      metrics,
      rawPayload
    };
  }

  private parsePayload(payload: Buffer | string): unknown {
    const text = Buffer.isBuffer(payload) ? payload.toString("utf8") : payload;
    const trimmed = text.trim();
    if (!trimmed) {
      throw new BadRequestException("MQTT payload is empty");
    }
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return this.parseScalar(trimmed);
    }
  }

  private extractMetrics(topicMetric: string, payload: unknown): Record<string, IotMetricPayloadValue> {
    if (isPlainRecord(payload)) {
      if (isPlainRecord(payload.metrics)) {
        const metrics: Record<string, IotMetricPayloadValue> = {};
        for (const [key, value] of Object.entries(payload.metrics)) {
          metrics[key] = this.toMetricPayloadValue(value);
        }
        return metrics;
      }
      if ("value" in payload) {
        return { [topicMetric]: this.toMetricPayloadValue(payload.value) };
      }
      throw new BadRequestException("MQTT payload metrics is required");
    }
    return { [topicMetric]: this.toMetricPayloadValue(payload) };
  }

  private parseScalar(value: string): IotMetricPayloadValue {
    if (value === "true") return true;
    if (value === "false") return false;
    if (value === "null") return null;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
    return value;
  }

  private toMetricPayloadValue(value: unknown): IotMetricPayloadValue {
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return value;
    }
    if (isPlainRecord(value)) {
      return value;
    }
    return JSON.stringify(value);
  }

  private toRawPayload(value: unknown): Record<string, unknown> {
    if (isPlainRecord(value)) {
      return value;
    }
    return { value };
  }

  private pickString(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
