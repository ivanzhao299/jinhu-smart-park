import { DashboardLayout } from "../../components/layout/DashboardLayout";

interface WorkflowLayoutProps {
  children: React.ReactNode;
}

export default function WorkflowLayout({ children }: WorkflowLayoutProps) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
