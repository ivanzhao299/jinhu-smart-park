import { Suspense } from "react";
import { EngineeringDailyReportsListClient } from "./components/EngineeringDailyReportsListClient";

export default function EngineeringDailyReportsPage() {
  return (
    <Suspense fallback={null}>
      <EngineeringDailyReportsListClient />
    </Suspense>
  );
}
