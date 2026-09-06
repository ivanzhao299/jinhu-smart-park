import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const webRoot = resolve(process.cwd());
const homestay = readFileSync(resolve(webRoot, "app/homestay/_components/HomestayDetailClient.tsx"), "utf8");
const leasing = readFileSync(resolve(webRoot, "app/leasing/checkouts/page.tsx"), "utf8");
const dialog = readFileSync(resolve(webRoot, "features/property-shared/dialog/ConsequenceDialog.tsx"), "utf8");
const dialogCss = readFileSync(resolve(webRoot, "features/property-shared/dialog/ConsequenceDialog.module.css"), "utf8");

test("homestay check-in and check-out share the consequence dialog", () => {
  assert.match(homestay, /pendingStayAction/);
  assert.match(homestay, /<ConsequenceDialog/);
  assert.match(homestay, /办理入住/);
  assert.match(homestay, /办理退房/);
  assert.doesNotMatch(homestay, /window\.(?:confirm|prompt)/);
});

test("leasing settlement confirmation and effective checkout share the consequence dialog", () => {
  assert.match(leasing, /kind: "confirm-settlement" \| "effective"/);
  assert.match(leasing, /performConfirmSettlement/);
  assert.match(leasing, /performEffectiveCheckout/);
  assert.match(leasing, /<ConsequenceDialog/);
  assert.doesNotMatch(leasing, /确认结算后[\s\S]{0,120}window\.confirm/);
  assert.doesNotMatch(leasing, /window\.prompt\("请输入实际退租日期"/);
  assert.doesNotMatch(leasing, /window\.prompt\("请输入生效意见"/);
  assert.doesNotMatch(leasing, /退租生效后将终止合同[\s\S]{0,120}window\.confirm/);
});

test("shared consequence dialog remains phone-width bounded and touch friendly", () => {
  assert.match(dialog, /styles\.dialog/);
  assert.match(dialogCss, /max-inline-size: calc\(100vw - 2rem\)/);
  assert.match(dialogCss, /max-block-size: calc\(100dvh - 2rem\)/);
  assert.match(dialogCss, /min-block-size: 44px/);
});
