"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { EngineeringInspectionFormClient } from "../../components/EngineeringInspectionFormClient";

export default function EditEngineeringInspectionPage() {
  const params = useParams<{ id: string }>();
  return (
    <Suspense fallback={null}>
      <EngineeringInspectionFormClient inspectionId={String(params.id ?? "")} />
    </Suspense>
  );
}
