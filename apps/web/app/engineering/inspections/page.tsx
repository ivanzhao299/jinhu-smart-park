import { Suspense } from "react";
import { EngineeringInspectionsListClient } from "./components/EngineeringInspectionsListClient";

export default function EngineeringInspectionsPage() {
  return (
    <Suspense fallback={null}>
      <EngineeringInspectionsListClient />
    </Suspense>
  );
}
