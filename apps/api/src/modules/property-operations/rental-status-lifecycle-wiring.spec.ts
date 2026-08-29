import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const read = (relative: string) => readFileSync(resolve(
  process.cwd(), "src/modules/property-operations", relative), "utf8");

test("housing activation and terminal checkout use the shared transaction projection", () => {
  const activation = read("../housing/housing-lease-command.service.ts");
  const checkout = read("../housing/housing-lease-approval-executor.service.ts");
  assert.match(activation, /activateInTransaction[\s\S]*rentalStatusProjection\.project\(\{[\s\S]*manager,[\s\S]*action: "occupy"/);
  assert.match(activation, /if \(lease\.status === "active"\) return lease;[\s\S]*rentalStatusProjection\.project/);
  assert.match(checkout, /toStatus === "terminated"[\s\S]*rentalStatusProjection\.project\(\{[\s\S]*manager: input\.manager[\s\S]*action: "release"/);
  assert.match(checkout, /rental_status_projection\)[\s\S]*JSON\.stringify\(rentalStatusProjection\)/);
  assert.match(checkout, /rentalStatusProjection === null \? null : JSON\.stringify\(rentalStatusProjection\)/);
});

test("homestay check-in and check-out project and retain the disposition in action audit", () => {
  const stay = read("../homestay/homestay-stay-command.service.ts");
  assert.match(stay, /async checkIn[\s\S]*rentalStatusProjection\.project\(\{[\s\S]*action: "occupy"[\s\S]*rental_status_projection: rentalStatus/);
  assert.match(stay, /if \(booking\.status === "checked_in"\) return booking;[\s\S]*rentalStatusProjection\.project/);
  assert.match(stay, /async checkOut[\s\S]*rentalStatusProjection\.project\(\{[\s\S]*action: "release"[\s\S]*rental_status_projection: rentalStatus/);
});

test("homestay no-show and confirmed cancellation release and audit the projection", () => {
  const booking = read("../homestay/homestay-booking-command.service.ts");
  const cancellation = read("../homestay/homestay-cancellation-executor.service.ts");
  assert.match(booking, /async markNoShow[\s\S]*rentalStatusProjection\.project\(\{[\s\S]*action: "release"[\s\S]*rental_status_projection: rentalStatus/);
  assert.match(cancellation, /booking\.status === "confirmed"[\s\S]*rentalStatusProjection\.project\(\{[\s\S]*action: "release"[\s\S]*rental_status_projection: state\.rentalStatusProjection/);
});

test("property operations exports the required shared projection provider", () => {
  const moduleSource = read("./property-operations.module.ts");
  assert.match(moduleSource, /providers:[\s\S]*RentalStatusProjectionService/);
  assert.match(moduleSource, /exports:[\s\S]*RentalStatusProjectionService/);
});
