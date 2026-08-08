import { PROPERTY_BUSINESS_PERMISSIONS } from "@jinhu/shared";
import { PropertyControlPlaneListClient } from "../../../components/property/PropertyControlPlaneClient";
import { PropertyControlPlaneGuard } from "../../../components/property/PropertyControlPlaneGuard";

export default function PropertyEventIncidentListPage() {
  return <PropertyControlPlaneGuard permissions={[
    PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_EVENT_DELIVERY_INCIDENTS_PAGE,
    PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_EVENT_READ_INCIDENT
  ]}><PropertyControlPlaneListClient surface="event-incidents" /></PropertyControlPlaneGuard>;
}
