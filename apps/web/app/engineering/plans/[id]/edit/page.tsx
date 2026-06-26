"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { EngineeringPlanFormClient } from "../../components/EngineeringPlanFormClient";

export default function EditEngineeringPlanPage() {
  const params = useParams<{ id: string }>();
  return (
    <Suspense fallback={null}>
      <EngineeringPlanFormClient planId={String(params.id ?? "")} />
    </Suspense>
  );
}
