import { OperationsTerminalClient } from "../../../components/operations/OperationsTerminalClient";
import type { Viewport } from "next";

export const viewport: Viewport = {
  themeColor: "#071926"
};

export default function OperationsTerminalPage() {
  return <OperationsTerminalClient />;
}
