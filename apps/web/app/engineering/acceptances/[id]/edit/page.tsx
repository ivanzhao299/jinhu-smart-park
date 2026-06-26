"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { EngineeringAcceptanceFormClient } from "../../components/EngineeringAcceptanceFormClient";

export default function EditEngineeringAcceptancePage() {
  const params = useParams<{ id: string }>();
  return (
    <Suspense fallback={null}>
      <EngineeringAcceptanceFormClient acceptanceId={String(params.id ?? "")} />
    </Suspense>
  );
}
