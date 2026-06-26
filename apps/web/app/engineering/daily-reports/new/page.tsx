import { Suspense } from "react";
import { EngineeringDailyReportFormClient } from "../components/EngineeringDailyReportFormClient";

export default function NewEngineeringDailyReportPage() {
  return (
    <Suspense fallback={null}>
      <EngineeringDailyReportFormClient />
    </Suspense>
  );
}
