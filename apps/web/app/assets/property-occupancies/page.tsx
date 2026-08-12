import { PROPERTY_BUSINESS_PERMISSIONS } from "@jinhu/shared";
import { PropertyFoundationListClient } from "../../../components/property/PropertyFoundationControlClient";
import { PropertyControlPlaneGuard } from "../../../components/property/PropertyControlPlaneGuard";

export default function PropertyOccupanciesPage() {
  return <PropertyControlPlaneGuard permissions={[
    PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_OCCUPANCIES_PAGE,
    PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_OCCUPANCY_READ
  ]}><PropertyFoundationListClient surface="occupancies" /></PropertyControlPlaneGuard>;
}
