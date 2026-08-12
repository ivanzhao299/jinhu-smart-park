import { DashboardLayout } from "../../components/layout/DashboardLayout";

interface ApartmentsLayoutProps {
  children: React.ReactNode;
}

export default function ApartmentsLayout({ children }: ApartmentsLayoutProps) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
