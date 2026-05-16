import { DashboardLayout } from "../../components/layout/DashboardLayout";

interface LeasingLayoutProps {
  children: React.ReactNode;
}

export default function LeasingLayout({ children }: LeasingLayoutProps) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
