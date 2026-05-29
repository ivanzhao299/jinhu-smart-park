import { DashboardLayout } from "../../components/layout/DashboardLayout";

interface IotLayoutProps {
  children: React.ReactNode;
}

export default function IotLayout({ children }: IotLayoutProps) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
