import { SYSTEM_PERMISSIONS } from "@jinhu/shared";
import { PropertyApprovalDetailClient } from "../../../../components/property/PropertyApprovalClient";
import { PropertyControlPlaneGuard } from "../../../../components/property/PropertyControlPlaneGuard";

export default async function PropertyApprovalDetailPage({ params }: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = await params;
  return <PropertyControlPlaneGuard permissions={[SYSTEM_PERMISSIONS.PROPERTY_APPROVAL_READ]}>
    <PropertyApprovalDetailClient requestId={requestId} />
  </PropertyControlPlaneGuard>;
}
