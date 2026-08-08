import assert from "node:assert/strict";
import test from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import {
  CreateIdentityDraftDto,
  DecideIdentityDto,
  IdentitySubmissionListQueryDto,
  UpdateIdentityDraftDto
} from "./identity-submission.dto";

const uuid = "00000000-0000-4000-8000-000000000001";

test("identity create supersede tuple is either absent or complete", async () => {
  const absent = plainToInstance(CreateIdentityDraftDto, {
    clientKey: "create-1",
    partyId: uuid,
    expectedIdentityVersion: 0
  });
  assert.deepEqual(await validate(absent), []);

  const partial = plainToInstance(CreateIdentityDraftDto, {
    clientKey: "create-2",
    partyId: uuid,
    expectedIdentityVersion: 1,
    supersedesSubmissionId: uuid
  });
  assert.ok((await validate(partial)).length > 0);
});

test("identity update retains ordered unique evidence and exact document pair", async () => {
  const valid = plainToInstance(UpdateIdentityDraftDto, {
    clientKey: "update-1",
    expectedVersion: 1,
    documentType: "id_card",
    identityNumber: "11010519491231002X",
    pendingFileIds: [uuid]
  });
  assert.deepEqual(await validate(valid), []);

  const duplicate = plainToInstance(UpdateIdentityDraftDto, {
    clientKey: "update-2",
    expectedVersion: 1,
    documentType: "passport",
    identityNumber: "A1234567",
    pendingFileIds: [uuid, uuid]
  });
  assert.ok((await validate(duplicate)).some((error) => error.property === "pendingFileIds"));
});

test("identity rejected decision requires a non-empty reason", async () => {
  const rejected = plainToInstance(DecideIdentityDto, {
    clientKey: "decision-1",
    expectedVersion: 3,
    expectedAssignmentVersion: 1,
    decision: "rejected"
  });
  assert.ok((await validate(rejected)).some((error) => error.property === "reason"));
});

test("identity list applies exact paging defaults and rejects aliases", async () => {
  const query = plainToInstance(IdentitySubmissionListQueryDto, {});
  assert.deepEqual(await validate(query), []);
  assert.equal(query.page, 1);
  assert.equal(query.pageSize, 20);
  assert.equal(query.assignment, "any");
  assert.equal(query.order, "desc");
});
