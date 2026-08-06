import { PROPERTY_BUSINESS_PERMISSIONS } from "@jinhu/shared";
import { PropertyControlPlaneListClient } from "../../../components/property/PropertyControlPlaneClient";
import { PropertyControlPlaneGuard } from "../../../components/property/PropertyControlPlaneGuard";

export default function PropertyNotificationListPage() {
  return <PropertyControlPlaneGuard permissions={[
    PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_NOTIFICATIONS_PAGE,
    PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_NOTIFICATION_READ
  ]}><PropertyControlPlaneListClient surface="notifications" /></PropertyControlPlaneGuard>;
}
