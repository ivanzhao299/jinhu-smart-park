import { DashboardLayout } from "../../components/layout/DashboardLayout";

interface WorkordersLayoutProps {
  children: React.ReactNode;
}

export default function WorkordersLayout({ children }: WorkordersLayoutProps) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
