import assert from "node:assert/strict";
import test from "node:test";
import { ConfigService } from "@nestjs/config";
import { PartySensitiveDataService } from "../property-operations/party-sensitive-data.service";
import { PartyDataKeyRotationService } from "./party-data-key-rotation.service";

const scope = { tenantId: "tenant-1", parkId: "park-1" };
const actor = {
  sub: "00000000-0000-4000-8000-000000000010",
  username: "security-operator",
  tenantId: scope.tenantId,
  parkId: scope.parkId,
  roles: ["SECURITY_OPERATOR"],
  permissions: []
};

test("party data rotation rewrites old ciphertext and commits required audit in the same manager", async () => {
  const oldKey = "old-party-key-123456789012345678901234";
  const oldService = new PartySensitiveDataService(new ConfigService({ PARTY_DATA_ENCRYPTION_KEY: oldKey }));
  const serviceCrypto = new PartySensitiveDataService(new ConfigService({
    PARTY_DATA_ENCRYPTION_KEY: oldKey,
    PARTY_DATA_ENCRYPTION_ACTIVE_KEY_ID: "party-data-v2",
    PARTY_DATA_ENCRYPTION_KEYRING: JSON.stringify({
      "party-data-v2": "new-party-key-123456789012345678901234"
    })
  }));
  const oldCiphertext = oldService.encrypt("identity-value");
  const statements: Array<{ sql: string; params: unknown[] }> = [];
  const manager = {
    query: async (sql: string, params: unknown[]) => {
      statements.push({ sql, params });
      if (sql.includes("FROM public.biz_party_data_key_rotation_receipt")) return [];
      if (sql.includes("FROM public.biz_party_identity_submission submission")) {
        return [{ id: "draft-1", draft_encryption_key_id: "party-data-v1",
          encrypted_payload: oldCiphertext, encryption_key_id: "party-data-v1" }];
      }
      if (sql.includes("FROM public.biz_party\n")) {
        return [{ id: "00000000-0000-4000-8000-000000000020", encrypted_payload: oldCiphertext,
          encryption_key_id: "party-data-v1" }];
      }
      if (sql.includes("FROM public.biz_party_identity_snapshot")) {
        return [{ id: "00000000-0000-4000-8000-000000000030", encrypted_payload: oldCiphertext,
          encryption_key_id: "party-data-v1" }];
      }
      if (sql.includes("UPDATE public.biz_party_identity_submission")) return [{ id: "draft-1" }];
      if (sql.includes("INSERT INTO public.biz_party_data_key_rotation_receipt")) {
        return [{ id: "00000000-0000-4000-8000-000000000040" }];
      }
      return [];
    }
  };
  let auditManager: unknown;
  let auditInput: Record<string, unknown> | undefined;
  const rotation = new PartyDataKeyRotationService(
    { transaction: async <T>(work: (value: typeof manager) => Promise<T>) => work(manager) } as never,
    serviceCrypto,
    { recordOperationRequired: async (input: Record<string, unknown>, receivedManager: unknown) => {
      auditInput = input;
      auditManager = receivedManager;
    } } as never
  );

  const result = await rotation.rotate(scope, actor, "rotation-1");
  assert.deepEqual(result, {
    receiptId: "00000000-0000-4000-8000-000000000040",
    activeKeyId: "party-data-v2",
    partyCount: 1,
    snapshotCount: 1,
    draftCount: 1,
    replayed: false
  });
  assert.equal(auditManager, manager);
  assert.deepEqual(auditInput?.afterJson, {
    fromKeyIds: ["party-data-v1"], activeKeyId: "party-data-v2",
    partyCount: 1, snapshotCount: 1, draftCount: 1
  });
  const rewrites = statements.filter((row) => row.sql.includes("SET identity_number_encrypted")
    || row.sql.includes("SET encrypted_payload"));
  assert.equal(rewrites.length, 2);
  for (const rewrite of rewrites) {
    const ciphertext = String(rewrite.params[3]);
    assert.equal(ciphertext.includes("identity-value"), false);
    assert.equal(serviceCrypto.decrypt(ciphertext, "party-data-v2"), "identity-value");
  }
  assert.match(statements[0]?.sql ?? "", /pg_advisory_xact_lock/u);
});

test("party data rotation rejects inconsistent draft metadata before rewriting ciphertext", async () => {
  const queries: string[] = [];
  const manager = { query: async (sql: string) => {
    queries.push(sql);
    if (sql.includes("FROM public.biz_party_data_key_rotation_receipt")) return [];
    if (sql.includes("FROM public.biz_party_identity_submission submission")) return [{
      id: "draft-1",
      draft_encryption_key_id: "party-data-v1",
      encrypted_payload: "enc:v1:invalid",
      encryption_key_id: "party-data-v2"
    }];
    return [];
  } };
  const rotation = new PartyDataKeyRotationService(
    { transaction: async <T>(work: (value: typeof manager) => Promise<T>) => work(manager) } as never,
    { activeKeyId: () => "party-data-v2" } as never,
    { recordOperationRequired: async () => assert.fail("invalid inventory must not audit success") } as never
  );
  await assert.rejects(rotation.rotate(scope, actor, "rotation-invalid"), /metadata is inconsistent/u);
  assert.equal(queries.some((sql) => sql.includes("SET identity_number_encrypted")), false);
});

test("party data rotation replays a receipt without touching ciphertext or audit", async () => {
  let queryCount = 0;
  const manager = { query: async (sql: string) => {
    queryCount += 1;
    if (sql.includes("FROM public.biz_party_data_key_rotation_receipt")) return [{
      id: "00000000-0000-4000-8000-000000000040",
      active_key_id: "party-data-v2",
      party_count: 2,
      snapshot_count: 3,
      draft_count: 4
    }];
    return [];
  } };
  const rotation = new PartyDataKeyRotationService(
    { transaction: async <T>(work: (value: typeof manager) => Promise<T>) => work(manager) } as never,
    { activeKeyId: () => "party-data-v2" } as never,
    { recordOperationRequired: async () => assert.fail("replay must not write audit") } as never
  );
  const result = await rotation.rotate(scope, actor, "rotation-1");
  assert.equal(result.replayed, true);
  assert.equal(queryCount, 2);
});
