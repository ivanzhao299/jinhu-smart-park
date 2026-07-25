import { BadRequestException } from "@nestjs/common";
import type { PropertyOccupancyDomain, PropertyOperatingMode } from "@jinhu/shared";

export interface NormalizedPropertyPeriod {
  startAt: Date;
  endAt: Date;
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
  if (domain === "housing_rental" || domain === "commercial_leasing") return mode === "long_rent";
  return false;
}
