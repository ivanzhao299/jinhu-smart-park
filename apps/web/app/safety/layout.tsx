import { DashboardLayout } from "../../components/layout/DashboardLayout";

interface SafetyLayoutProps {
  children: React.ReactNode;
}

export default function SafetyLayout({ children }: SafetyLayoutProps) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
