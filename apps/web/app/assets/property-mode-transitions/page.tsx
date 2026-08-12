import { PROPERTY_BUSINESS_PERMISSIONS } from "@jinhu/shared";
import { PropertyFoundationListClient } from "../../../components/property/PropertyFoundationControlClient";
import { PropertyControlPlaneGuard } from "../../../components/property/PropertyControlPlaneGuard";

export default function PropertyModeTransitionsPage() {
  return <PropertyControlPlaneGuard permissions={[
    PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_MODE_TRANSITIONS_PAGE,
    PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_APPROVAL_READ
  ]}><PropertyFoundationListClient surface="mode-transitions" /></PropertyControlPlaneGuard>;
}
