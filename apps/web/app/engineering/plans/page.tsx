import { Suspense } from "react";
import { EngineeringPlansListClient } from "./components/EngineeringPlansListClient";

export default function EngineeringPlansPage() {
  return (
    <Suspense fallback={null}>
      <EngineeringPlansListClient />
    </Suspense>
  );
}
