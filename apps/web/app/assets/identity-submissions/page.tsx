import { PROPERTY_BUSINESS_PERMISSIONS } from "@jinhu/shared";
import { PropertyControlPlaneListClient } from "../../../components/property/PropertyControlPlaneClient";
import { PropertyControlPlaneGuard } from "../../../components/property/PropertyControlPlaneGuard";

export default function IdentitySubmissionListPage() {
  return <PropertyControlPlaneGuard permissions={[
    PROPERTY_BUSINESS_PERMISSIONS.IDENTITY_SUBMISSIONS_PAGE,
    PROPERTY_BUSINESS_PERMISSIONS.PARTY_READ
  ]}><PropertyControlPlaneListClient surface="identity" /></PropertyControlPlaneGuard>;
}
