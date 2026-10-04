import { DashboardLayout } from "../../../components/layout/DashboardLayout";

interface CanteenConsoleLayoutProps {
  children: React.ReactNode;
}

export default function CanteenConsoleLayout({ children }: CanteenConsoleLayoutProps) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
