import { PROPERTY_BUSINESS_PERMISSIONS } from "@jinhu/shared";
import { PropertyControlPlaneDetailClient } from "../../../../components/property/PropertyControlPlaneClient";
import { PropertyControlPlaneGuard } from "../../../../components/property/PropertyControlPlaneGuard";

export default async function PropertyNotificationDetailPage({ params }: {
  params: Promise<{ notificationId: string }>;
}) {
  const { notificationId } = await params;
  return <PropertyControlPlaneGuard permissions={[
    PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_NOTIFICATIONS_PAGE,
    PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_NOTIFICATION_READ
  ]}><PropertyControlPlaneDetailClient id={notificationId} surface="notifications" /></PropertyControlPlaneGuard>;
}
