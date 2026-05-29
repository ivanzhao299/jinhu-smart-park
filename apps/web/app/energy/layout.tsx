import { DashboardLayout } from "../../components/layout/DashboardLayout";

interface EnergyLayoutProps {
  children: React.ReactNode;
}

export default function EnergyLayout({ children }: EnergyLayoutProps) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
