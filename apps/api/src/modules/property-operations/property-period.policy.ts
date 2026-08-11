import { BadRequestException, ConflictException } from "@nestjs/common";
import type { PropertyOccupancyDomain, PropertyOperatingMode } from "@jinhu/shared";

export interface NormalizedPropertyPeriod {
  startAt: Date;
  endAt: Date;
}

export interface PropertyOccupancyReplacementExpectation {
  sourceDomain: string;
  sourceType: string;
  sourceId: string;
  startAt: Date;
  endAt: Date;
  status: "held" | "active";
}

export function assertPropertyOccupancyReplaceable(
  current: {
    sourceDomain: string;
    sourceType: string;
    sourceId: string;
    startAt: Date;
    endAt: Date;
    status: string;
    holdExpiresAt: Date | null;
  },
  expected: PropertyOccupancyReplacementExpectation,
  now = new Date()
): void {
  if (
    current.sourceDomain !== expected.sourceDomain
    || current.sourceType !== expected.sourceType
    || current.sourceId !== expected.sourceId
    || current.status !== expected.status
    || current.startAt.getTime() !== expected.startAt.getTime()
    || current.endAt.getTime() !== expected.endAt.getTime()
  ) {
    throw new ConflictException("Property occupancy no longer matches the expected source lifecycle");
  }
  if (
    current.status === "held"
    && (!current.holdExpiresAt || current.holdExpiresAt.getTime() <= now.getTime())
  ) {
    throw new ConflictException("Expired occupancy holds cannot be rescheduled");
  }
}

export function normalizePropertyPeriod(start: string | Date, end: string | Date): NormalizedPropertyPeriod {
  const startAt = start instanceof Date ? start : new Date(start);
  const endAt = end instanceof Date ? end : new Date(end);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    throw new BadRequestException("start_at and end_at must be valid timestamps");
  }
  if (startAt.getTime() >= endAt.getTime()) {
    throw new BadRequestException("Property occupancy uses [start, end) and requires start_at < end_at");
  }
  return { startAt, endAt };
}

export function propertyPeriodsOverlap(left: NormalizedPropertyPeriod, right: NormalizedPropertyPeriod): boolean {
  return left.startAt.getTime() < right.endAt.getTime() && right.startAt.getTime() < left.endAt.getTime();
}

export function occupancyDomainMatchesMode(domain: PropertyOccupancyDomain, mode: PropertyOperatingMode): boolean {
  if (domain === "maintenance" || domain === "operations") return true;
  if (domain === "homestay") return mode === "short_stay";
  if (domain === "housing_rental" || domain === "commercial_leasing" || domain === "apartment") {
    return mode === "long_rent";
  }
  return false;
}
