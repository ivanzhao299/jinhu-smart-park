"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ForbiddenState } from "../../components/auth/ForbiddenState";

export default function ForbiddenPage() {
  return (
    <Suspense fallback={<ForbiddenContent isModuleDenied={false} />}>
      <ForbiddenContentWithReason />
    </Suspense>
  );
}

function ForbiddenContentWithReason() {
  const searchParams = useSearchParams();
  const isModuleDenied = searchParams.get("reason") === "module";
  return <ForbiddenContent isModuleDenied={isModuleDenied} />;
}

function ForbiddenContent({ isModuleDenied }: { isModuleDenied: boolean }) {
  return <ForbiddenState reason={isModuleDenied ? "module" : "permission"} variant="page" />;
}
