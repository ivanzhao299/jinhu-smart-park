import { InspectTasksPageClient } from "../inspect-tasks/InspectTasksPageClient";
import type { Viewport } from "next";

export const viewport: Viewport = {
  themeColor: "#071926"
};

export default function SafetyMyInspectTasksPage() {
  return <InspectTasksPageClient mode="mine" />;
}
