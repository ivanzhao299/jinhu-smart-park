import { DashboardLayout } from "../../components/layout/DashboardLayout";
import { HousingRouteBoundary } from "./_components/HousingRouteBoundary";

export default function HousingLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardLayout>
      <HousingRouteBoundary>{children}</HousingRouteBoundary>
    </DashboardLayout>
  );
}
