"use client";

import { useParams } from "next/navigation";
import { EngineeringProjectFormClient } from "../../components/EngineeringProjectFormClient";

export default function EditEngineeringProjectPage() {
  const params = useParams<{ id: string }>();
  return <EngineeringProjectFormClient projectId={String(params.id ?? "")} />;
}
