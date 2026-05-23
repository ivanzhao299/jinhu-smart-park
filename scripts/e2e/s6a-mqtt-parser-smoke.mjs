import { createRequire } from "node:module";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const { MqttMessageParser } = require("../../apps/api/dist/modules/iot/mqtt-message-parser");

const parser = new MqttMessageParser();

const single = parser.parse(
  "park/JH/device/EQ-000001/power",
  Buffer.from(JSON.stringify({ value: 12.5, reported_at: "2026-05-22T10:00:00+08:00", quality: "good" }))
);
assert.equal(single.parkCode, "JH");
assert.equal(single.deviceCode, "EQ-000001");
assert.equal(single.metric, "power");
assert.deepEqual(single.metrics, { power: 12.5 });
assert.equal(single.reportedAt, "2026-05-22T10:00:00+08:00");
assert.equal(single.quality, "good");

const batch = parser.parse(
  "park/JH/device/EQ-000001/batch",
  Buffer.from(JSON.stringify({ reported_at: "2026-05-22T10:00:00+08:00", metrics: { power: 12.5, online: true } }))
);
assert.deepEqual(batch.metrics, { power: 12.5, online: true });

assert.throws(() => parser.parse("bad/topic", "{}"), /MQTT topic must match/);
assert.throws(() => parser.parse("park/JH/device/EQ-000001/power", "{}"), /metrics is required/);

console.log("S6-A MQTT parser smoke passed");
