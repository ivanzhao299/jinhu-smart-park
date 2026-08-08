import { DashboardLayout } from "../../components/layout/DashboardLayout";
import { HomestayRouteGuard } from "./_components/HomestayRouteGuard";

export default function HomestayLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout><HomestayRouteGuard>{children}</HomestayRouteGuard></DashboardLayout>;
}
