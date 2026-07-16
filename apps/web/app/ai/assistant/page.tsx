import { Suspense } from "react";
import { AiWorkPlannerClient } from "./AiWorkPlannerClient";

export default function AiAssistantPage() {
  return (
    <Suspense fallback={<main style={{ padding: 24 }}>正在加载 AI 工作安排...</main>}>
      <AiWorkPlannerClient />
    </Suspense>
  );
}
