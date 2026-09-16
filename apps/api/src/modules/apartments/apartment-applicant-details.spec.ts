import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { ConfigService } from "@nestjs/config";
import type { DataSource } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { PartySensitiveDataService } from "../../shared/security/party-sensitive-data.service";
import { ApartmentsService } from "./apartments.service";
import { CreateApartmentApplicationDto } from "./dto/apartment.dto";

const fields = { gender: "female", identity_number: "11010119900101001x", native_place: "测试省市", home_address: "测试地址", health_status: "需无障碍住宿", emergency_contact_relationship: "朋友" };
const base = { applicant_name: "合成申请人", applicant_type: "internal_employee", emergency_contact_name: "合成联系人", emergency_contact_mobile: "13800000000", household_size: 1, policy_accepted: true, requested_room_type: "employee", requested_start_date: "2026-10-01", reason: "合成测试" };
const sensitive = () => new PartySensitiveDataService(new ConfigService({ PARTY_DATA_ENCRYPTION_KEY: "test-only-apartment-key-12345678901234567890" }));

test("applicant DTO normalizes identity and validates new fields without breaking old clients", async () => {
  for (const values of [base, { ...base, ...fields }]) assert.equal((await validate(plainToInstance(CreateApartmentApplicationDto, values))).length, 0);
  assert.equal(plainToInstance(CreateApartmentApplicationDto, fields).identity_number, fields.identity_number.toUpperCase());
  for (const bad of [{ gender: "invalid" }, { identity_number: "abc" }, { native_place: "a".repeat(201) }, { home_address: "a".repeat(501) }, { health_status: "a".repeat(501) }, { emergency_contact_relationship: "a".repeat(101) }]) {
    assert.ok((await validate(plainToInstance(CreateApartmentApplicationDto, { ...base, ...fields, ...bad }))).length > 0);
  }
});

test("application transaction persists details and versioned ciphertext, returning only masked identity", async () => {
  const crypto = sensitive();
  const calls: { sql: string; params: unknown[] }[] = [];
  const manager = { query: async (sql: string, params: unknown[]) => {
    calls.push({ sql, params });
    return sql.includes("application_identity") ? [] : [{ id: "synthetic-application", identity_number_masked: params[11] }];
  } };
  let transactions = 0;
  const ds = { transaction: async (fn: (m: typeof manager) => Promise<unknown>) => { transactions++; return fn(manager); } } as unknown as DataSource;
  const dto = plainToInstance(CreateApartmentApplicationDto, { ...base, ...fields });
  const response = await new ApartmentsService(ds, crypto).createApplication({ tenantId: "test-tenant", parkId: "test-park" }, { sub: "synthetic-actor" } as JwtPrincipal, dto);
  assert.equal(transactions, 1);
  assert.equal(calls.length, 2);
  assert.ok(calls[0] && calls[1]);
  assert.deepEqual(calls[0].params.slice(23, 28), [fields.gender, fields.native_place, fields.home_address, fields.health_status, fields.emergency_contact_relationship]);
  assert.equal(calls[0].params.includes(dto.identity_number), false);
  assert.equal(crypto.decrypt(String(calls[1].params[1]), String(calls[1].params[2])), dto.identity_number);
  assert.equal(JSON.stringify(response).includes(dto.identity_number!), false);
  assert.equal(response.identity_number_masked, crypto.mask(dto.identity_number!));
});

test("identity storage failure rejects the enclosing application transaction", async () => {
  const manager = { query: async (sql: string) => { if (sql.includes("application_identity")) throw new Error("synthetic storage failure"); return [{ id: "synthetic" }]; } };
  const ds = { transaction: async (fn: (m: typeof manager) => Promise<unknown>) => fn(manager) } as unknown as DataSource;
  await assert.rejects(new ApartmentsService(ds, sensitive()).createApplication({ tenantId: "t", parkId: "p" }, { sub: "actor" } as JwtPrincipal, plainToInstance(CreateApartmentApplicationDto, { ...base, ...fields })), /synthetic storage failure/);
});
