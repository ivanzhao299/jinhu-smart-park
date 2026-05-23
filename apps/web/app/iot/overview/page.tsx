import { redirect } from "next/navigation";

export default function IotOverviewRedirect() {
  redirect("/iot/dashboard");
}
