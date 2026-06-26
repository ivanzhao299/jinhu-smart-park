import { Suspense } from "react";
import { EngineeringPlanFormClient } from "../components/EngineeringPlanFormClient";

export default function NewEngineeringPlanPage() {
  return (
    <Suspense fallback={null}>
      <EngineeringPlanFormClient />
    </Suspense>
  );
}
