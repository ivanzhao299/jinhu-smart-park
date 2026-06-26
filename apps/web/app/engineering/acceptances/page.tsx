import { Suspense } from "react";
import { EngineeringAcceptancesListClient } from "./components/EngineeringAcceptancesListClient";

export default function EngineeringAcceptancesPage() {
  return (
    <Suspense fallback={null}>
      <EngineeringAcceptancesListClient />
    </Suspense>
  );
}
