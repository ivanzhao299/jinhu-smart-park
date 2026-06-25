import { DashboardLayout } from "../../components/layout/DashboardLayout";

interface TenantLayoutProps {
  children: React.ReactNode;
}

export default function TenantLayout({ children }: TenantLayoutProps) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
