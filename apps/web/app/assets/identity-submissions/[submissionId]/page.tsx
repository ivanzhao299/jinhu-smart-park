import { PROPERTY_BUSINESS_PERMISSIONS } from "@jinhu/shared";
import { PropertyControlPlaneDetailClient } from "../../../../components/property/PropertyControlPlaneClient";
import { PropertyControlPlaneGuard } from "../../../../components/property/PropertyControlPlaneGuard";

export default async function IdentitySubmissionDetailPage({ params }: {
  params: Promise<{ submissionId: string }>;
}) {
  const { submissionId } = await params;
  return <PropertyControlPlaneGuard permissions={[
    PROPERTY_BUSINESS_PERMISSIONS.IDENTITY_SUBMISSIONS_PAGE,
    PROPERTY_BUSINESS_PERMISSIONS.PARTY_READ
  ]}><PropertyControlPlaneDetailClient id={submissionId} surface="identity" /></PropertyControlPlaneGuard>;
}
