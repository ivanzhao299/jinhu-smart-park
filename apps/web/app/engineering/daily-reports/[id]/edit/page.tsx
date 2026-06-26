"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { EngineeringDailyReportFormClient } from "../../components/EngineeringDailyReportFormClient";

export default function EditEngineeringDailyReportPage() {
  const params = useParams<{ id: string }>();
  return (
    <Suspense fallback={null}>
      <EngineeringDailyReportFormClient reportId={String(params.id ?? "")} />
    </Suspense>
  );
}
