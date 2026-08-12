import { PROPERTY_BUSINESS_PERMISSIONS } from "@jinhu/shared";
import { PropertyFoundationDetailClient } from "../../../../components/property/PropertyFoundationControlClient";
import { PropertyControlPlaneGuard } from "../../../../components/property/PropertyControlPlaneGuard";

export default async function PropertyOperationDetailPage({ params }: {
  params: Promise<{ unitId: string }>;
}) {
  const { unitId } = await params;
  return <PropertyControlPlaneGuard permissions={[
    PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_OPERATIONS_PAGE,
    PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_OPERATION_READ
  ]}><PropertyFoundationDetailClient id={unitId} surface="operations" /></PropertyControlPlaneGuard>;
}
