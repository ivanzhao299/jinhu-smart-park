import assert from "node:assert/strict";
import test from "node:test";
import {
  createReturnHref,
  decodeReturnContext,
  encodeReturnContext,
  resolveReturnHref,
  resolveSameOriginReturnHref,
  type ReturnContextPolicy
} from "./return-context";

const policy: ReturnContextPolicy = {
  origin: "https://park.example.test",
  fallbackHref: "/homestay/bookings",
  routes: {
    bookingList: {
      pathTemplate: "/homestay/bookings",
      allowedQueryKeys: ["page", "sort", "status"]
    },
    bookingDetail: {
      pathTemplate: "/homestay/bookings/:entityId",
      allowedQueryKeys: ["tab"]
    }
  }
};

test("structured return context encodes entity identity and allowlisted query", () => {
  const href = createReturnHref({
    route: "bookingDetail",
    entityId: "room/一号",
    query: { tab: "finance", ignored: "secret" },
    scrollAnchor: "booking-row-1"
  }, policy);

  assert.equal(
    href,
    "/homestay/bookings/room%2F%E4%B8%80%E5%8F%B7?tab=finance#booking-row-1"
  );
});

test("invalid route, missing identity, and unsafe anchor use safe behavior", () => {
  assert.equal(createReturnHref({ route: "unknown" }, policy), policy.fallbackHref);
  assert.equal(createReturnHref({ route: "bookingDetail" }, policy), policy.fallbackHref);
  assert.equal(
    createReturnHref({
      route: "bookingList",
      scrollAnchor: "bad anchor",
      query: { page: ["2", "3"] }
    }, policy),
    "/homestay/bookings?page=2&page=3"
  );
});

test("return context round trips and malformed payload falls back", () => {
  const context = { route: "bookingList", query: { status: "reserved" } } as const;
  const encoded = encodeReturnContext(context);

  assert.deepEqual(decodeReturnContext(encoded), context);
  assert.equal(resolveReturnHref(encoded, policy), "/homestay/bookings?status=reserved");
  assert.equal(resolveReturnHref("%broken", policy), policy.fallbackHref);
});

test("same-origin candidate requires an allowlisted route and query", () => {
  assert.equal(
    resolveSameOriginReturnHref(
      "https://park.example.test/homestay/bookings?page=2#booking-row",
      policy
    ),
    "/homestay/bookings?page=2#booking-row"
  );
  assert.equal(
    resolveSameOriginReturnHref("https://evil.example/homestay/bookings", policy),
    policy.fallbackHref
  );
  assert.equal(
    resolveSameOriginReturnHref("/homestay/bookings?token=hidden", policy),
    policy.fallbackHref
  );
  assert.equal(
    resolveSameOriginReturnHref("/homestay/bookings#unsafe anchor", policy),
    policy.fallbackHref
  );
  assert.equal(
    resolveSameOriginReturnHref("/homestay/finance", policy),
    policy.fallbackHref
  );
});
