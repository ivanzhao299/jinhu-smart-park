import { Suspense } from "react";
import { EngineeringInspectionFormClient } from "../components/EngineeringInspectionFormClient";

export default function NewEngineeringInspectionPage() {
  return (
    <Suspense fallback={null}>
      <EngineeringInspectionFormClient />
    </Suspense>
  );
}
