import { SYSTEM_PERMISSIONS } from "@jinhu/shared";
import { PropertyApprovalListClient } from "../../../components/property/PropertyApprovalClient";
import { PropertyControlPlaneGuard } from "../../../components/property/PropertyControlPlaneGuard";

export default function PropertyApprovalListPage() {
  return <PropertyControlPlaneGuard permissions={[SYSTEM_PERMISSIONS.PROPERTY_APPROVAL_READ]}>
    <PropertyApprovalListClient />
  </PropertyControlPlaneGuard>;
}
