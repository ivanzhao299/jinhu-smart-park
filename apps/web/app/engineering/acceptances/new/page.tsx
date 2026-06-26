import { Suspense } from "react";
import { EngineeringAcceptanceFormClient } from "../components/EngineeringAcceptanceFormClient";

export default function NewEngineeringAcceptancePage() {
  return (
    <Suspense fallback={null}>
      <EngineeringAcceptanceFormClient />
    </Suspense>
  );
}
