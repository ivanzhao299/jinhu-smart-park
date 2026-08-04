import { PROPERTY_BUSINESS_PERMISSIONS } from "@jinhu/shared";
import { PropertyControlPlaneDetailClient } from "../../../../components/property/PropertyControlPlaneClient";
import { PropertyControlPlaneGuard } from "../../../../components/property/PropertyControlPlaneGuard";

export default async function PropertyEventIncidentDetailPage({ params }: {
  params: Promise<{ dlqId: string }>;
}) {
  const { dlqId } = await params;
  return <PropertyControlPlaneGuard permissions={[
    PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_EVENT_DELIVERY_INCIDENTS_PAGE,
    PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_EVENT_READ_INCIDENT
  ]}><PropertyControlPlaneDetailClient id={dlqId} surface="event-incidents" /></PropertyControlPlaneGuard>;
}
