import { DashboardLayout } from "../../components/layout/DashboardLayout";

interface AssetsLayoutProps {
  children: React.ReactNode;
}

export default function AssetsLayout({ children }: AssetsLayoutProps) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
