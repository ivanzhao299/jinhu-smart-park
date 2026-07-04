import { DashboardLayout } from "../../components/layout/DashboardLayout";

interface OperationsLayoutProps {
  children: React.ReactNode;
}

export default function OperationsLayout({ children }: OperationsLayoutProps) {
  return <DashboardLayout forceTerminalMode>{children}</DashboardLayout>;
}
