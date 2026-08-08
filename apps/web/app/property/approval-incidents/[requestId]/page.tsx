import { PROPERTY_BUSINESS_PERMISSIONS } from "@jinhu/shared";
import { PropertyControlPlaneDetailClient } from "../../../../components/property/PropertyControlPlaneClient";
import { PropertyControlPlaneGuard } from "../../../../components/property/PropertyControlPlaneGuard";

export default async function PropertyApprovalIncidentDetailPage({ params }: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = await params;
  return <PropertyControlPlaneGuard permissions={[
    PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_APPROVAL_INCIDENTS_PAGE,
    PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_APPROVAL_READ_INCIDENT
  ]}><PropertyControlPlaneDetailClient id={requestId} surface="approval-incidents" /></PropertyControlPlaneGuard>;
}
