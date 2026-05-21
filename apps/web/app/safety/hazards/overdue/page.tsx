import { redirect } from "next/navigation";

export default function SafetyHazardsOverduePage() {
  redirect("/safety/hazards?overdue_only=true");
}
