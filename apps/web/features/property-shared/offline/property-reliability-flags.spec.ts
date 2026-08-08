import assert from "node:assert/strict";
import test from "node:test";
import {
  propertyOfflineDraftsV1Enabled,
  propertyReliabilityFlagEnabled,
  propertyReliabilityPublicEnv,
  propertyUploadQueueV1Enabled
} from "./property-reliability-flags";

test("property reliability flags fail closed for unset, off, and invalid values", () => {
  for (const value of [undefined, "", "false", "off", "1", true]) {
    assert.equal(propertyReliabilityFlagEnabled(value), false);
  }
});

test("property reliability flags accept only trimmed case-insensitive true", () => {
  assert.equal(propertyReliabilityFlagEnabled("true"), true);
  assert.equal(propertyReliabilityFlagEnabled(" TRUE "), true);
});

test("server-only flags map to browser-readable booleans without exposing raw values", () => {
  assert.deepEqual(propertyReliabilityPublicEnv({}), {
    NEXT_PUBLIC_PROPERTY_OFFLINE_DRAFTS_V1: "false",
    NEXT_PUBLIC_PROPERTY_UPLOAD_QUEUE_V1: "false"
  });
  assert.deepEqual(propertyReliabilityPublicEnv({
    PROPERTY_OFFLINE_DRAFTS_V1: " TRUE ",
    PROPERTY_UPLOAD_QUEUE_V1: "unexpected-value"
  }), {
    NEXT_PUBLIC_PROPERTY_OFFLINE_DRAFTS_V1: "true",
    NEXT_PUBLIC_PROPERTY_UPLOAD_QUEUE_V1: "false"
  });
});

test("browser flag readers preserve strict off, unset, and true behavior", () => {
  const previousDrafts = process.env.NEXT_PUBLIC_PROPERTY_OFFLINE_DRAFTS_V1;
  const previousQueue = process.env.NEXT_PUBLIC_PROPERTY_UPLOAD_QUEUE_V1;
  try {
    delete process.env.NEXT_PUBLIC_PROPERTY_OFFLINE_DRAFTS_V1;
    process.env.NEXT_PUBLIC_PROPERTY_UPLOAD_QUEUE_V1 = "off";
    assert.equal(propertyOfflineDraftsV1Enabled(), false);
    assert.equal(propertyUploadQueueV1Enabled(), false);

    process.env.NEXT_PUBLIC_PROPERTY_OFFLINE_DRAFTS_V1 = "true";
    process.env.NEXT_PUBLIC_PROPERTY_UPLOAD_QUEUE_V1 = " TRUE ";
    assert.equal(propertyOfflineDraftsV1Enabled(), true);
    assert.equal(propertyUploadQueueV1Enabled(), true);
  } finally {
    if (previousDrafts === undefined) delete process.env.NEXT_PUBLIC_PROPERTY_OFFLINE_DRAFTS_V1;
    else process.env.NEXT_PUBLIC_PROPERTY_OFFLINE_DRAFTS_V1 = previousDrafts;
    if (previousQueue === undefined) delete process.env.NEXT_PUBLIC_PROPERTY_UPLOAD_QUEUE_V1;
    else process.env.NEXT_PUBLIC_PROPERTY_UPLOAD_QUEUE_V1 = previousQueue;
  }
});
