import { Suspense } from "react";
import { EngineeringRectificationsListClient } from "./components/EngineeringRectificationsListClient";

export default function EngineeringRectificationsPage() {
  return (
    <Suspense fallback={null}>
      <EngineeringRectificationsListClient />
    </Suspense>
  );
}
