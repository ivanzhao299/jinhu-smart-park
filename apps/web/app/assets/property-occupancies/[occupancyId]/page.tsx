import { PROPERTY_BUSINESS_PERMISSIONS } from "@jinhu/shared";
import { PropertyFoundationDetailClient } from "../../../../components/property/PropertyFoundationControlClient";
import { PropertyControlPlaneGuard } from "../../../../components/property/PropertyControlPlaneGuard";

export default async function PropertyOccupancyDetailPage({ params }: {
  params: Promise<{ occupancyId: string }>;
}) {
  const { occupancyId } = await params;
  return <PropertyControlPlaneGuard permissions={[
    PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_OCCUPANCIES_PAGE,
    PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_OCCUPANCY_READ
  ]}><PropertyFoundationDetailClient id={occupancyId} surface="occupancies" /></PropertyControlPlaneGuard>;
}
