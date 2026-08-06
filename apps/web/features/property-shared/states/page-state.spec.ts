import assert from "node:assert/strict";
import test from "node:test";
import {
  type PageState,
  type PageStateKind,
  pageStateAnnouncement
} from "./page-state";

const allStates: readonly PageState[] = [
  { kind: "initial-loading" },
  { kind: "initial-failure", message: "timeout" },
  { kind: "empty-initial" },
  { kind: "empty-filtered" },
  { kind: "empty-scope" },
  { kind: "ready" },
  { kind: "forbidden-full" },
  { kind: "forbidden-partial" },
  { kind: "refresh-failure", message: "timeout" },
  { kind: "offline-stale" },
  { kind: "conflict", message: "version changed" },
  { kind: "submitting" },
  { kind: "success", message: "saved" }
];

test("page state contract contains every required distinct state", () => {
  const actual = new Set<PageStateKind>(allStates.map((state) => state.kind));
  assert.deepEqual(actual, new Set<PageStateKind>([
    "initial-loading",
    "initial-failure",
    "empty-initial",
    "empty-filtered",
    "empty-scope",
    "ready",
    "forbidden-full",
    "forbidden-partial",
    "refresh-failure",
    "offline-stale",
    "conflict",
    "submitting",
    "success"
  ]));
});

test("three empty states and stale states have distinct announcements", () => {
  const messages = [
    pageStateAnnouncement({ kind: "empty-initial" }),
    pageStateAnnouncement({ kind: "empty-filtered" }),
    pageStateAnnouncement({ kind: "empty-scope" })
  ];
  assert.equal(new Set(messages).size, 3);
  assert.match(
    pageStateAnnouncement({ kind: "refresh-failure", message: "network" }),
    /最近一次成功加载/
  );
  assert.match(pageStateAnnouncement({ kind: "offline-stale" }), /缓存/);
});
