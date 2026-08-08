import assert from "node:assert/strict";
import test from "node:test";
import { URLSearchParams } from "node:url";
import {
  encodeReturnContext,
  resolveReturnHref
} from "../../../features/property-shared/detail/return-context.ts";
import {
  PARTY_RETURN_POLICY,
  partyDetailFailureState
} from "./party-detail-logic.ts";

test("Party detail preserves cached content only for offline failures", () => {
  assert.deepEqual(partyDetailFailureState({
    cached: true, message: "offline", offline: true
  }), { kind: "ready", stale: true });
  assert.deepEqual(partyDetailFailureState({
    cached: true, message: "conflict", offline: false, status: 409
  }), { kind: "conflict", message: "conflict" });
  assert.deepEqual(partyDetailFailureState({
    cached: true, message: "forbidden", offline: true, status: 403
  }), { kind: "forbidden" });
  assert.deepEqual(partyDetailFailureState({
    cached: true, message: "missing", offline: true, status: 404
  }), { kind: "not-found" });
});

test("Party return context round-trips percent text and sorting", () => {
  const encoded = encodeReturnContext({
    route: "parties",
    query: {
      keyword: "50% off",
      sort: "verificationStatus",
      order: "desc"
    },
    scrollAnchor: "party-list"
  });
  const outer = new URLSearchParams({ returnTo: encoded }).toString();
  assert.match(outer, /%2525/);
  const received = new URLSearchParams(outer).get("returnTo");
  assert.equal(received, encoded);
  assert.equal(
    resolveReturnHref(received, PARTY_RETURN_POLICY),
    "/assets/parties?keyword=50%25+off&sort=verificationStatus&order=desc#party-list"
  );
});
