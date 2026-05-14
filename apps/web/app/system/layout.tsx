import { DashboardLayout } from "../../components/layout/DashboardLayout";

interface SystemLayoutProps {
  children: React.ReactNode;
}

export default function SystemLayout({ children }: SystemLayoutProps) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
