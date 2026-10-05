import assert from "node:assert/strict";
import test from "node:test";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { HrTrainingCorrectionDto, HrTrainingParticipantResultDto } from "./dto/hr-training.dto";

test("completion and correction note DTOs preserve exact text and explicit clearing", () => {
  for (const memo of [null, "", "  独立备注\n原样  "]) {
    const completion = plainToInstance(HrTrainingParticipantResultDto, { completedHours: "8", memo });
    const correction = plainToInstance(HrTrainingCorrectionDto, { expectedRevision: 0, reason: "核对备注", correctedMemo: memo });
    assert.equal(validateSync(completion).length, 0);
    assert.equal(validateSync(correction).length, 0);
    assert.equal(completion.memo, memo);
    assert.equal(correction.correctedMemo, memo);
  }
  assert.equal(plainToInstance(HrTrainingCorrectionDto, { expectedRevision: 0, reason: "核对" }).correctedMemo, undefined);
});

test("note DTOs reject malformed text without treating it as an omitted field", () => {
  for (const memo of [42, {}, "x".repeat(2001), "bad\0note", "bad\ud800"]) {
    assert.ok(validateSync(plainToInstance(HrTrainingParticipantResultDto, { completedHours: "8", memo })).length);
    assert.ok(validateSync(plainToInstance(HrTrainingCorrectionDto, { expectedRevision: 0, reason: "核对", correctedMemo: memo })).length);
  }
});
