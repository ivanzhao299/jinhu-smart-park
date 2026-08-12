import { PROPERTY_BUSINESS_PERMISSIONS } from "@jinhu/shared";
import { PropertyFoundationListClient } from "../../../components/property/PropertyFoundationControlClient";
import { PropertyControlPlaneGuard } from "../../../components/property/PropertyControlPlaneGuard";

export default function PropertyOperationsPage() {
  return <PropertyControlPlaneGuard permissions={[
    PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_OPERATIONS_PAGE,
    PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_OPERATION_READ
  ]}><PropertyFoundationListClient surface="operations" /></PropertyControlPlaneGuard>;
}
