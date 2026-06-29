import { DashboardLayout } from "../../components/layout/DashboardLayout";

interface EngineeringLayoutProps {
  children: React.ReactNode;
}

export default function EngineeringLayout({ children }: EngineeringLayoutProps) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
