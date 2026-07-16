import { DashboardLayout } from "../../components/layout/DashboardLayout";

interface AiLayoutProps {
  children: React.ReactNode;
}

export default function AiLayout({ children }: AiLayoutProps) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
