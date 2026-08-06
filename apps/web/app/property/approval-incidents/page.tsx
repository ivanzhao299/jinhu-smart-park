import { PROPERTY_BUSINESS_PERMISSIONS } from "@jinhu/shared";
import { PropertyControlPlaneListClient } from "../../../components/property/PropertyControlPlaneClient";
import { PropertyControlPlaneGuard } from "../../../components/property/PropertyControlPlaneGuard";

export default function PropertyApprovalIncidentListPage() {
  return <PropertyControlPlaneGuard permissions={[
    PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_APPROVAL_INCIDENTS_PAGE,
    PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_APPROVAL_READ_INCIDENT
  ]}><PropertyControlPlaneListClient surface="approval-incidents" /></PropertyControlPlaneGuard>;
}
