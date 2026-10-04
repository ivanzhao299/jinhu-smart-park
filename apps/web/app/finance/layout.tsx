import { DashboardLayout } from "../../components/layout/DashboardLayout";

interface FinanceLayoutProps {
  children: React.ReactNode;
}

export default function FinanceLayout({ children }: FinanceLayoutProps) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
