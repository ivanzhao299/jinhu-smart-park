import type { Viewport } from "next";
import { EngineeringMobileTerminalClient } from "./EngineeringMobileTerminalClient";

export const viewport: Viewport = {
  themeColor: "#071926"
};

export default function EngineeringTerminalPage() {
  return <EngineeringMobileTerminalClient />;
}
