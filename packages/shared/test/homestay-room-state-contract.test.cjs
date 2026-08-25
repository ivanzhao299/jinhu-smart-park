const assert = require("node:assert/strict");
const test = require("node:test");

const { HOMESTAY_ROOM_STATES } = require("../dist/index.js");

test("homestay room state contract distinguishes reservation holds from occupied stays", () => {
  assert.deepEqual(HOMESTAY_ROOM_STATES, [
    "available",
    "reserved",
    "held",
    "occupied",
    "turnover",
    "out_of_service",
    "mode_unavailable"
  ]);
  assert.equal(new Set(HOMESTAY_ROOM_STATES).size, HOMESTAY_ROOM_STATES.length);
});
