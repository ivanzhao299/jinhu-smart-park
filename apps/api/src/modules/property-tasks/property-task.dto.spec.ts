import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import {
  PropertyTaskBlockDto,
  PropertyTaskRebuildDto
} from "./dto/property-task.dto";
import { CanonicalUuidPipe } from "./property-task.validation";

const mutationBase = {
  clientKey: "fixture-key",
  expectedAssignmentVersion: 1,
  expectedSourceVersion: 1,
  businessOccurrenceKey: "fixture-occurrence",
  reason: "fixture reason"
};

describe("C4 property task DTO canonical boundary", () => {
  it("accepts only real canonical UTC millisecond timestamps", async () => {
    const valid = plainToInstance(PropertyTaskBlockDto, {
      ...mutationBase,
      blockedUntil: "2026-08-01T01:02:03.004Z"
    });
    assert.equal((await validate(valid)).length, 0);

    for (const blockedUntil of [
      "2026-02-30T01:02:03.004Z",
      "2026-08-01T01:02:03Z",
      "2026-08-01T01:02:03.004+00:00",
      "2026-08-01t01:02:03.004Z",
      "2026-08-01T01:02:03.004z"
    ]) {
      const value = plainToInstance(PropertyTaskBlockDto, {
        ...mutationBase,
        blockedUntil
      });
      assert.notEqual((await validate(value)).length, 0, blockedUntil);
    }
  });

  it("accepts lowercase UUID v1-v5 and rejects uppercase or unsigned versions", async () => {
    const valid = [
      "11111111-1111-1111-8111-111111111111",
      "22222222-2222-2222-8222-222222222222",
      "33333333-3333-3333-8333-333333333333",
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "55555555-5555-5555-8555-555555555555"
    ];
    for (const sourceId of valid) {
      const value = plainToInstance(PropertyTaskRebuildDto, {
        clientKey: "fixture-rebuild",
        sourceType: "test_fixture_source",
        sourceId,
        expectedProjectionVersion: 0,
        reason: "fixture rebuild"
      });
      assert.equal((await validate(value)).length, 0, sourceId);
    }
    for (const sourceId of [valid[3]!.toUpperCase(),
      "66666666-6666-6666-8666-666666666666"]) {
      const value = plainToInstance(PropertyTaskRebuildDto, {
        clientKey: "fixture-rebuild",
        sourceType: "test_fixture_source",
        sourceId,
        expectedProjectionVersion: 0,
        reason: "fixture rebuild"
      });
      assert.notEqual((await validate(value)).length, 0, sourceId);
    }
  });

  it("enforces lowercase UUID v1-v5 at the route pipe boundary", () => {
    const pipe = new CanonicalUuidPipe();
    for (const value of [
      "aaaaaaaa-aaaa-1aaa-8aaa-aaaaaaaaaaaa",
      "aaaaaaaa-aaaa-2aaa-8aaa-aaaaaaaaaaaa",
      "aaaaaaaa-aaaa-3aaa-8aaa-aaaaaaaaaaaa",
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "aaaaaaaa-aaaa-5aaa-8aaa-aaaaaaaaaaaa"
    ]) assert.equal(pipe.transform(value), value);
    for (const value of [
      "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
      "aaaaaaaa-aaaa-6aaa-8aaa-aaaaaaaaaaaa",
      "not-a-uuid",
      42
    ]) assert.throws(() => pipe.transform(value));
  });

  it("rejects numeric-string coercion, trimmed aliases, and oversized UTF-8 occurrence keys", async () => {
    const candidates = [
      ["assignment numeric string", { ...mutationBase, expectedAssignmentVersion: "1" }],
      ["source numeric string", { ...mutationBase, expectedSourceVersion: "1" }],
      ["clientKey trim alias", { ...mutationBase, clientKey: " fixture-key " }],
      ["blank occurrence", { ...mutationBase, businessOccurrenceKey: "   " }],
      ["oversized UTF-8 occurrence",
        { ...mutationBase, businessOccurrenceKey: "界".repeat(86) }]
    ] as const;
    const accepted: string[] = [];
    for (const [label, candidate] of candidates) {
      const value = plainToInstance(PropertyTaskBlockDto, {
        ...candidate,
        blockedUntil: null
      });
      if ((await validate(value)).length === 0) accepted.push(label);
    }

    const rebuild = plainToInstance(PropertyTaskRebuildDto, {
      clientKey: "fixture-rebuild",
      sourceType: " test_fixture_source ",
      sourceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      expectedProjectionVersion: 0,
      reason: "fixture rebuild"
    });
    if ((await validate(rebuild)).length === 0) accepted.push("sourceType trim alias");
    assert.deepEqual(accepted, []);
  });
});
