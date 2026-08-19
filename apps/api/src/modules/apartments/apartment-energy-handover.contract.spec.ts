import "reflect-metadata";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { HandoverDto } from "./dto/apartment.dto";

const service = readFileSync(resolve(process.cwd(), "src/modules/apartments/apartments.service.ts"), "utf8");
const controller = readFileSync(resolve(process.cwd(), "src/modules/apartments/apartments.controller.ts"), "utf8");
const migration = readFileSync(resolve(process.cwd(), "../../database/migrations/000217_apartment_handover_energy_readings.sql"), "utf8");

test("handover meter readings validate explicit meter identity and decimal strings", async () => {
  const dto = plainToInstance(HandoverDto, { items: [{}], keys: [{}], meter_readings: [{ meter_id: "not-a-uuid", reading_value: "-1" }] });
  assert.ok((await validate(dto)).length >= 1);
  const valid = plainToInstance(HandoverDto, { items: [{}], keys: [{}], meter_readings: [{ meter_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", reading_value: "123.4567" }] });
  assert.equal((await validate(valid)).length, 0);
});

test("handover uses the operating unit meter chain and one atomic transaction", () => {
  assert.match(controller, /stays\/:id\/handover-meters/u);
  assert.match(service, /m\.room_id=r\.unit_id/u);
  assert.match(service, /FOR UPDATE OF s,r/u);
  assert.match(service, /energy_meter[\s\S]*FOR UPDATE/u);
  assert.match(service, /INSERT INTO energy_reading/u);
  assert.match(service, /confirmation_status[\s\S]*'CONFIRMED'/u);
  assert.match(service, /UPDATE energy_meter SET current_reading/u);
  assert.match(service, /交接必须完整登记该房号全部启用水电表读数/u);
  assert.doesNotMatch(service, /Number\(value\)<Number\(meter\.current_reading\)/u);
});

test("energy reading source identity is complete and replay-safe", () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS source_domain/u);
  assert.match(migration, /uk_energy_reading_source/u);
  assert.match(migration, /source_id IS NOT NULL/u);
  assert.match(migration, /ck_energy_reading_source_complete/u);
  assert.match(service, /'apartment'[\s\S]*\$8[\s\S]*\$9/u);
});
