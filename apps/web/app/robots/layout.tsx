import { DashboardLayout } from "../../components/layout/DashboardLayout";

interface RobotsLayoutProps {
  children: React.ReactNode;
}

export default function RobotsLayout({ children }: RobotsLayoutProps) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
