import { DashboardLayout } from "../../components/layout/DashboardLayout";

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
